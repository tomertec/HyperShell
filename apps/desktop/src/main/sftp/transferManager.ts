import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { basename, dirname, extname, join, posix } from "node:path";

import type { SftpTransportHandle } from "@sshterm/session-core";
import type { TransferJob, TransferOp } from "@sshterm/shared";

export type TransferEventListener = (event: TransferEvent) => void;

export type TransferEvent =
  | {
      kind: "transfer-progress";
      transferId: string;
      bytesTransferred: number;
      totalBytes: number;
      speed: number;
      status: string;
    }
  | {
      kind: "transfer-complete";
      transferId: string;
      status: "completed" | "failed";
      error?: string;
    }
  | {
      kind: "transfer-conflict";
      transferId: string;
      remotePath: string;
      localPath: string;
    };

export type TransferConflictResolution = "overwrite" | "skip" | "rename";

interface ManagedTransferJob extends TransferJob {
  sftpSessionId: string;
  abortController: AbortController | null;
  isDirectory: boolean;
}

export interface TransferManagerOptions {
  maxConcurrent?: number;
  autoStart?: boolean;
  maxJobHistory?: number;
}

export interface TransferManager {
  enqueue(
    sftpSessionId: string,
    transport: SftpTransportHandle,
    operations: TransferOp[]
  ): TransferJob[];
  cancel(transferId: string): void;
  resolveConflict(
    transferId: string,
    resolution: TransferConflictResolution,
    applyToAll?: boolean
  ): void;
  list(): TransferJob[];
  onEvent(listener: TransferEventListener): () => void;
}

class TransferSkippedError extends Error {
  constructor() {
    super("Skipped by user");
    this.name = "TransferSkippedError";
  }
}

export function createTransferManager(
  options: TransferManagerOptions = {}
): TransferManager {
  const maxConcurrent = options.maxConcurrent ?? 3;
  const autoStart = options.autoStart ?? false;
  const maxJobHistory = options.maxJobHistory ?? 100;
  const jobs = new Map<string, ManagedTransferJob>();
  const transports = new Map<string, SftpTransportHandle>();
  const pendingConflicts = new Map<string, {
    type: "upload" | "download";
    resolve: (resolution: TransferConflictResolution) => void;
    reject: (error: Error) => void;
  }>();
  const conflictDefaults = new Map<"upload" | "download", TransferConflictResolution>();
  const listeners = new Set<TransferEventListener>();
  let activeCount = 0;
  let drainScheduled = false;

  function emit(event: TransferEvent): void {
    for (const listener of listeners) {
      listener(event);
    }
  }

  function pruneCompletedJobs(): void {
    const finished: string[] = [];
    for (const [id, job] of jobs) {
      if (job.status === "completed" || job.status === "failed") {
        finished.push(id);
      }
    }

    const excess = finished.length - maxJobHistory;
    if (excess > 0) {
      for (let i = 0; i < excess; i++) {
        jobs.delete(finished[i]);
      }
    }
  }

  function snapshot(job: ManagedTransferJob): TransferJob {
    const { sftpSessionId, abortController, isDirectory, ...rest } = job;
    return rest;
  }

  async function remotePathExists(
    transport: SftpTransportHandle,
    remotePath: string
  ): Promise<boolean> {
    try {
      await transport.stat(remotePath);
      return true;
    } catch {
      return false;
    }
  }

  function resolveLocalRenamePath(localPath: string): string {
    const baseDir = dirname(localPath);
    const extension = extname(localPath);
    const stem = basename(localPath, extension);

    let attempt = 1;
    while (true) {
      const candidate = join(baseDir, `${stem} (${attempt})${extension}`);
      if (!existsSync(candidate)) {
        return candidate;
      }
      attempt += 1;
    }
  }

  async function resolveRemoteRenamePath(
    transport: SftpTransportHandle,
    remotePath: string
  ): Promise<string> {
    const baseDir = posix.dirname(remotePath);
    const extension = posix.extname(remotePath);
    const stem = posix.basename(remotePath, extension);

    let attempt = 1;
    while (true) {
      const candidateName = `${stem} (${attempt})${extension}`;
      const candidate = baseDir === "/" ? `/${candidateName}` : `${baseDir}/${candidateName}`;
      if (!(await remotePathExists(transport, candidate))) {
        return candidate;
      }
      attempt += 1;
    }
  }

  async function resolveConflictForJob(
    job: ManagedTransferJob
  ): Promise<TransferConflictResolution> {
    const preconfigured = conflictDefaults.get(job.type);
    if (preconfigured) {
      return preconfigured;
    }

    job.status = "paused";
    emit({
      kind: "transfer-progress",
      transferId: job.transferId,
      bytesTransferred: job.bytesTransferred,
      totalBytes: job.totalBytes,
      speed: job.speed,
      status: "paused"
    });
    emit({
      kind: "transfer-conflict",
      transferId: job.transferId,
      remotePath: job.remotePath,
      localPath: job.localPath
    });

    return await new Promise<TransferConflictResolution>((resolve, reject) => {
      pendingConflicts.set(job.transferId, {
        type: job.type,
        resolve,
        reject
      });
    });
  }

  function scheduleDrain(): void {
    if (!autoStart || drainScheduled) {
      return;
    }

    drainScheduled = true;
    queueMicrotask(() => {
      drainScheduled = false;
      void drain();
    });
  }

  function findNextQueuedJob(): ManagedTransferJob | undefined {
    return [...jobs.values()].find((job) => job.status === "queued");
  }

  async function drain(): Promise<void> {
    if (!autoStart) {
      return;
    }

    while (activeCount < maxConcurrent) {
      const nextJob = findNextQueuedJob();
      if (!nextJob) {
        return;
      }

      const transport = transports.get(nextJob.sftpSessionId);
      if (!transport) {
        nextJob.status = "failed";
        nextJob.error = "SFTP transport unavailable";
        emit({
          kind: "transfer-complete",
          transferId: nextJob.transferId,
          status: "failed",
          error: nextJob.error
        });
        pruneCompletedJobs();
        continue;
      }

      activeCount += 1;
      nextJob.status = "active";
      nextJob.abortController = new AbortController();

      void processJob(nextJob, transport)
        .then(() => {
          nextJob.status = "completed";
          emit({
            kind: "transfer-complete",
            transferId: nextJob.transferId,
            status: "completed"
          });
        })
        .catch((error: unknown) => {
          if (error instanceof TransferSkippedError) {
            nextJob.status = "completed";
            emit({
              kind: "transfer-complete",
              transferId: nextJob.transferId,
              status: "completed"
            });
            return;
          }

          nextJob.status = "failed";
          nextJob.error = error instanceof Error ? error.message : String(error);
          emit({
            kind: "transfer-complete",
            transferId: nextJob.transferId,
            status: "failed",
            error: nextJob.error
          });
        })
        .finally(() => {
          pendingConflicts.delete(nextJob.transferId);
          nextJob.abortController = null;
          activeCount -= 1;
          pruneCompletedJobs();
          scheduleDrain();
        });
    }
  }

  function collectLocalDirectoryOps(localDir: string, remoteDir: string): TransferOp[] {
    const ops: TransferOp[] = [];
    const entries = readdirSync(localDir, { withFileTypes: true });
    for (const entry of entries) {
      const localPath = join(localDir, entry.name);
      const remotePath = posix.join(remoteDir, entry.name);
      ops.push({
        type: "upload",
        localPath,
        remotePath,
        isDirectory: entry.isDirectory()
      });
    }
    return ops;
  }

  async function processJob(
    job: ManagedTransferJob,
    transport: SftpTransportHandle
  ): Promise<void> {
    if (job.abortController?.signal.aborted) {
      throw new Error("Cancelled by user");
    }

    if (job.type === "upload") {
      const localStat = statSync(job.localPath);
      job.totalBytes = localStat.size;

      if (job.isDirectory) {
        await transport.mkdir(job.remotePath);
        const childOps = collectLocalDirectoryOps(job.localPath, job.remotePath);
        if (childOps.length > 0) {
          enqueue(job.sftpSessionId, transport, childOps);
        }
        return;
      }

      if (await remotePathExists(transport, job.remotePath)) {
        const resolution = await resolveConflictForJob(job);
        if (resolution === "skip") {
          throw new TransferSkippedError();
        }
        if (resolution === "rename") {
          job.remotePath = await resolveRemoteRenamePath(transport, job.remotePath);
        }
        job.status = "active";
      }

      const localStream = createReadStream(job.localPath);
      const remoteStream = transport.createWriteStream(job.remotePath);

      let bytesTransferred = 0;
      let lastEmit = Date.now();
      const startedAt = Date.now();

      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const cleanup = () => {
          localStream.removeAllListeners();
          remoteStream.removeAllListeners();
        };
        const settle = (fn: () => void) => {
          if (settled) return;
          settled = true;
          fn();
        };

        localStream.on("data", (chunk: string | Buffer) => {
          bytesTransferred += chunk.length;
          job.bytesTransferred = bytesTransferred;
          const elapsed = (Date.now() - startedAt) / 1000;
          job.speed = elapsed > 0 ? bytesTransferred / elapsed : 0;

          if (Date.now() - lastEmit >= 200) {
            lastEmit = Date.now();
            emit({
              kind: "transfer-progress",
              transferId: job.transferId,
              bytesTransferred,
              totalBytes: job.totalBytes,
              speed: job.speed,
              status: "active"
            });
          }
        });

        const abortHandler = () => {
          settle(() => {
            cleanup();
            localStream.destroy();
            remoteStream.destroy();
            reject(new Error("Cancelled by user"));
          });
        };

        job.abortController?.signal.addEventListener("abort", abortHandler, { once: true });

        remoteStream.on("close", () => {
          job.abortController?.signal.removeEventListener("abort", abortHandler);
          settle(() => { cleanup(); resolve(); });
        });
        remoteStream.on("error", (error) => {
          job.abortController?.signal.removeEventListener("abort", abortHandler);
          settle(() => { cleanup(); reject(error); });
        });
        localStream.on("error", (error) => {
          job.abortController?.signal.removeEventListener("abort", abortHandler);
          settle(() => { cleanup(); reject(error); });
        });

        localStream.pipe(remoteStream);
      });

      return;
    }

    const remoteStat = await transport.stat(job.remotePath);
    job.totalBytes = remoteStat.size;

    if (job.isDirectory) {
      mkdirSync(job.localPath, { recursive: true });
      const entries = await transport.list(job.remotePath);
      const childOps: TransferOp[] = entries.map((entry) => ({
        type: "download" as const,
        localPath: join(job.localPath, entry.name),
        remotePath: entry.path,
        isDirectory: entry.isDirectory
      }));
      if (childOps.length > 0) {
        enqueue(job.sftpSessionId, transport, childOps);
      }
      return;
    }

    if (existsSync(job.localPath)) {
      const resolution = await resolveConflictForJob(job);
      if (resolution === "skip") {
        throw new TransferSkippedError();
      }
      if (resolution === "rename") {
        job.localPath = resolveLocalRenamePath(job.localPath);
      }
      job.status = "active";
    }

    mkdirSync(dirname(job.localPath), { recursive: true });
    const partPath = `${job.localPath}.part`;
    const remoteStream = transport.createReadStream(job.remotePath);
    const localStream = createWriteStream(partPath);

    let bytesTransferred = 0;
    let lastEmit = Date.now();
    const startedAt = Date.now();

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        remoteStream.removeAllListeners();
        localStream.removeAllListeners();
      };
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        fn();
      };

      remoteStream.on("data", (chunk: string | Buffer) => {
        bytesTransferred += chunk.length;
        job.bytesTransferred = bytesTransferred;
        const elapsed = (Date.now() - startedAt) / 1000;
        job.speed = elapsed > 0 ? bytesTransferred / elapsed : 0;

        if (Date.now() - lastEmit >= 200) {
          lastEmit = Date.now();
          emit({
            kind: "transfer-progress",
            transferId: job.transferId,
            bytesTransferred,
            totalBytes: job.totalBytes,
            speed: job.speed,
            status: "active"
          });
        }
      });

      const abortHandler = () => {
        settle(() => {
          cleanup();
          remoteStream.destroy();
          localStream.destroy();
          reject(new Error("Cancelled by user"));
        });
      };

      job.abortController?.signal.addEventListener("abort", abortHandler, { once: true });

      localStream.on("close", () => {
        job.abortController?.signal.removeEventListener("abort", abortHandler);
        settle(() => {
          cleanup();
          try {
            rmSync(job.localPath, { force: true });
          } catch {
            // Best effort; rename below will throw if destination cannot be replaced.
          }
          renameSync(partPath, job.localPath);
          resolve();
        });
      });
      localStream.on("error", (error) => {
        job.abortController?.signal.removeEventListener("abort", abortHandler);
        settle(() => { cleanup(); reject(error); });
      });
      remoteStream.on("error", (error) => {
        job.abortController?.signal.removeEventListener("abort", abortHandler);
        settle(() => { cleanup(); reject(error); });
      });

      remoteStream.pipe(localStream);
    });
  }

  function enqueue(
    sftpSessionId: string,
    transport: SftpTransportHandle,
    operations: TransferOp[]
  ): TransferJob[] {
    const createdJobs: TransferJob[] = [];
    transports.set(sftpSessionId, transport);

    for (const operation of operations) {
      const transferId = `tx-${randomUUID().replace(/-/g, "")}`;
      const job: ManagedTransferJob = {
        transferId,
        sftpSessionId,
        type: operation.type,
        localPath: operation.localPath,
        remotePath: operation.remotePath,
        status: "queued",
        bytesTransferred: 0,
        totalBytes: 0,
        speed: 0,
        abortController: null,
        isDirectory: operation.isDirectory
      };

      jobs.set(transferId, job);
      createdJobs.push(snapshot(job));
    }

    scheduleDrain();
    return createdJobs;
  }

  function cancel(transferId: string): void {
    const job = jobs.get(transferId);
    if (!job) {
      return;
    }

    // For queued jobs that haven't started, emit directly since no promise will reject.
    if (job.status === "queued") {
      job.status = "failed";
      job.error = "Cancelled by user";
      emit({
        kind: "transfer-complete",
        transferId,
        status: "failed",
        error: job.error
      });
      pruneCompletedJobs();
      return;
    }

    if (job.status === "paused") {
      const pending = pendingConflicts.get(transferId);
      pendingConflicts.delete(transferId);
      pending?.reject(new Error("Cancelled by user"));
      job.status = "failed";
      job.error = "Cancelled by user";
      emit({
        kind: "transfer-complete",
        transferId,
        status: "failed",
        error: job.error
      });
      pruneCompletedJobs();
      return;
    }

    // For active jobs, abort triggers promise rejection which emits transfer-complete.
    try {
      job.abortController?.abort();
    } catch {
      // Abort may fire after the job has already settled — ignore.
      if (job.status !== "completed" && job.status !== "failed") {
        job.status = "failed";
        job.error = "Cancelled by user";
        emit({
          kind: "transfer-complete",
          transferId,
          status: "failed",
          error: job.error
        });
      }
    }
  }

  function resolveConflict(
    transferId: string,
    resolution: TransferConflictResolution,
    applyToAll = false
  ): void {
    const pending = pendingConflicts.get(transferId);
    if (!pending) {
      return;
    }

    if (applyToAll) {
      conflictDefaults.set(pending.type, resolution);
    }

    pendingConflicts.delete(transferId);
    pending.resolve(resolution);
  }

  function list(): TransferJob[] {
    return [...jobs.values()].map(snapshot);
  }

  function onEvent(listener: TransferEventListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return {
    enqueue,
    cancel,
    resolveConflict,
    list,
    onEvent
  };
}
