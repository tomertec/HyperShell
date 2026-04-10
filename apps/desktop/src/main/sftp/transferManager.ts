import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { basename, dirname, extname, join, posix } from "node:path";

import type { SftpTransportHandle } from "@hypershell/session-core";
import type { TransferJob, TransferOp } from "@hypershell/shared";

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
  batchId: string;
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
  pause(transferId: string): void;
  resume(transferId: string): void;
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
  const cancelledByUser = new Set<string>();
  const pausedByUser = new Set<string>();
  let activeCount = 0;
  let drainScheduled = false;

  function emitCancelledComplete(job: ManagedTransferJob): void {
    job.status = "failed";
    job.error = "Cancelled by user";
    emit({
      kind: "transfer-complete",
      transferId: job.transferId,
      status: "failed",
      error: job.error
    });
  }

  function emit(event: TransferEvent): void {
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (error) {
        console.warn("[sftp] Transfer event listener failed", error);
      }
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
    const { sftpSessionId, abortController, isDirectory, batchId, ...rest } = job;
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

  function isLocalPathWithin(rootPath: string, candidatePath: string): boolean {
    const nr = process.platform === "win32" ? rootPath.toLowerCase() : rootPath;
    const nc = process.platform === "win32" ? candidatePath.toLowerCase() : candidatePath;
    return (
      nc === nr
      || nc.startsWith(`${nr}\\`)
      || nc.startsWith(`${nr}/`)
    );
  }

  function isRemotePathWithin(rootPath: string, candidatePath: string): boolean {
    const normalizedRoot = rootPath.endsWith("/") ? rootPath.slice(0, -1) : rootPath;
    return (
      candidatePath === normalizedRoot
      || candidatePath.startsWith(`${normalizedRoot}/`)
    );
  }

  function throwIfCancelled(job: ManagedTransferJob): void {
    if (job.abortController?.signal.aborted) {
      throw new Error("Cancelled by user");
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
          if (cancelledByUser.has(nextJob.transferId)) {
            emitCancelledComplete(nextJob);
            return;
          }

          nextJob.status = "completed";
          emit({
            kind: "transfer-complete",
            transferId: nextJob.transferId,
            status: "completed"
          });
        })
        .catch((error: unknown) => {
          if (cancelledByUser.has(nextJob.transferId)) {
            emitCancelledComplete(nextJob);
            return;
          }

          if (pausedByUser.has(nextJob.transferId)) {
            nextJob.status = "paused";
            nextJob.error = "Paused by user";
            nextJob.speed = 0;
            emit({
              kind: "transfer-progress",
              transferId: nextJob.transferId,
              bytesTransferred: nextJob.bytesTransferred,
              totalBytes: nextJob.totalBytes,
              speed: nextJob.speed,
              status: "paused"
            });
            return;
          }

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
          cancelledByUser.delete(nextJob.transferId);
          if (nextJob.status !== "paused") {
            pausedByUser.delete(nextJob.transferId);
          }
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
    throwIfCancelled(job);

    if (job.type === "upload") {
      const localStat = statSync(job.localPath);
      job.totalBytes = localStat.size;

      if (job.isDirectory) {
        await transport.mkdir(job.remotePath);
        throwIfCancelled(job);
        const childOps = collectLocalDirectoryOps(job.localPath, job.remotePath);
        if (childOps.length > 0) {
          enqueue(job.sftpSessionId, transport, childOps, job.batchId);
        }
        return;
      }

      if (await remotePathExists(transport, job.remotePath)) {
        throwIfCancelled(job);
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
      const emitProgress = (status: "active" | "paused" = "active") => {
        emit({
          kind: "transfer-progress",
          transferId: job.transferId,
          bytesTransferred,
          totalBytes: job.totalBytes,
          speed: job.speed,
          status
        });
      };

      emitProgress();

      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const signal = job.abortController?.signal;
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
            emitProgress();
          }
        });

        const abortHandler = () => {
          settle(() => {
            // Break the pipe first to prevent further writes into a destroyed stream.
            localStream.unpipe(remoteStream);
            // Swallow expected stream teardown errors after cancellation.
            localStream.once("error", () => {});
            remoteStream.once("error", () => {});
            localStream.destroy();
            remoteStream.destroy();
            cleanup();
            reject(new Error("Cancelled by user"));
          });
        };

        if (signal?.aborted) {
          abortHandler();
          return;
        }
        signal?.addEventListener("abort", abortHandler, { once: true });

        remoteStream.on("close", () => {
          signal?.removeEventListener("abort", abortHandler);
          if (signal?.aborted) {
            settle(() => {
              cleanup();
              reject(new Error("Cancelled by user"));
            });
            return;
          }
          settle(() => {
            bytesTransferred = job.totalBytes;
            job.bytesTransferred = job.totalBytes;
            emitProgress();
            cleanup();
            resolve();
          });
        });
        remoteStream.on("error", (error) => {
          signal?.removeEventListener("abort", abortHandler);
          settle(() => { cleanup(); reject(error); });
        });
        localStream.on("error", (error) => {
          signal?.removeEventListener("abort", abortHandler);
          settle(() => { cleanup(); reject(error); });
        });

        localStream.pipe(remoteStream);
      });

      return;
    }

    const remoteStat = await transport.stat(job.remotePath);
    job.totalBytes = remoteStat.size;
    throwIfCancelled(job);

    if (job.isDirectory) {
      mkdirSync(job.localPath, { recursive: true });
      const entries = await transport.list(job.remotePath);
      throwIfCancelled(job);
      const childOps: TransferOp[] = entries.map((entry) => ({
        type: "download" as const,
        localPath: join(job.localPath, entry.name),
        remotePath: entry.path,
        isDirectory: entry.isDirectory
      }));
      if (childOps.length > 0) {
        enqueue(job.sftpSessionId, transport, childOps, job.batchId);
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
    const emitProgress = (status: "active" | "paused" = "active") => {
      emit({
        kind: "transfer-progress",
        transferId: job.transferId,
        bytesTransferred,
        totalBytes: job.totalBytes,
        speed: job.speed,
        status
      });
    };

    emitProgress();

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const signal = job.abortController?.signal;
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
          emitProgress();
        }
      });

      const abortHandler = () => {
        settle(() => {
          // Break the pipe first to prevent further writes into a destroyed stream.
          remoteStream.unpipe(localStream);
          // Swallow expected stream teardown errors after cancellation.
          remoteStream.once("error", () => {});
          localStream.once("error", () => {});
          remoteStream.destroy();
          localStream.destroy();
          cleanup();
          reject(new Error("Cancelled by user"));
        });
      };

      if (signal?.aborted) {
        abortHandler();
        return;
      }
      signal?.addEventListener("abort", abortHandler, { once: true });

      localStream.on("close", () => {
        signal?.removeEventListener("abort", abortHandler);
        if (signal?.aborted) {
          settle(() => {
            cleanup();
            reject(new Error("Cancelled by user"));
          });
          return;
        }
        settle(() => {
          bytesTransferred = job.totalBytes;
          job.bytesTransferred = job.totalBytes;
          emitProgress();
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
        signal?.removeEventListener("abort", abortHandler);
        settle(() => { cleanup(); reject(error); });
      });
      remoteStream.on("error", (error) => {
        signal?.removeEventListener("abort", abortHandler);
        settle(() => { cleanup(); reject(error); });
      });

      remoteStream.pipe(localStream);
    });
  }

  function enqueue(
    sftpSessionId: string,
    transport: SftpTransportHandle,
    operations: TransferOp[],
    batchId = `batch-${randomUUID().replace(/-/g, "")}`
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
        isDirectory: operation.isDirectory,
        batchId
      };

      jobs.set(transferId, job);
      createdJobs.push(snapshot(job));
    }

    scheduleDrain();
    return createdJobs;
  }

  function collectRelatedTargets(job: ManagedTransferJob): ManagedTransferJob[] {
    const targetsById = new Map<string, ManagedTransferJob>();
    targetsById.set(job.transferId, job);

    for (const candidate of jobs.values()) {
      if (candidate.transferId === job.transferId) {
        continue;
      }
      if (candidate.batchId !== job.batchId) {
        continue;
      }
      if (candidate.status === "completed" || candidate.status === "failed") {
        continue;
      }
      targetsById.set(candidate.transferId, candidate);
    }

    if (job.isDirectory) {
      for (const candidate of jobs.values()) {
        if (candidate.transferId === job.transferId) {
          continue;
        }
        if (candidate.sftpSessionId !== job.sftpSessionId || candidate.type !== job.type) {
          continue;
        }
        if (
          !isLocalPathWithin(job.localPath, candidate.localPath)
          || !isRemotePathWithin(job.remotePath, candidate.remotePath)
        ) {
          continue;
        }
        if (candidate.status === "completed" || candidate.status === "failed") {
          continue;
        }
        targetsById.set(candidate.transferId, candidate);
      }
    }

    return [...targetsById.values()];
  }

  function cancel(transferId: string): void {
    const job = jobs.get(transferId);
    if (!job) {
      console.warn(`[sftp] Cancel requested for unknown transfer ${transferId}`);
      return;
    }

    const finalTargets = collectRelatedTargets(job);

    for (const target of finalTargets) {
      const targetId = target.transferId;

      // For queued jobs that haven't started, emit directly since no promise will reject.
      if (target.status === "queued") {
        cancelledByUser.add(targetId);
        pausedByUser.delete(targetId);
        target.status = "failed";
        target.error = "Cancelled by user";
        emit({
          kind: "transfer-complete",
          transferId: targetId,
          status: "failed",
          error: target.error
        });
        cancelledByUser.delete(targetId);
        continue;
      }

      if (target.status === "paused") {
        cancelledByUser.add(targetId);
        pausedByUser.delete(targetId);
        const pending = pendingConflicts.get(targetId);
        pendingConflicts.delete(targetId);
        pending?.reject(new Error("Cancelled by user"));
        target.status = "failed";
        target.error = "Cancelled by user";
        emit({
          kind: "transfer-complete",
          transferId: targetId,
          status: "failed",
          error: target.error
        });
        cancelledByUser.delete(targetId);
        continue;
      }

      // For active jobs, abort triggers promise rejection which emits transfer-complete.
      try {
        cancelledByUser.add(targetId);
        pausedByUser.delete(targetId);
        target.abortController?.abort();
      } catch {
        // Abort may fire after the job has already settled — ignore.
        if (target.status !== "completed" && target.status !== "failed") {
          target.status = "failed";
          target.error = "Cancelled by user";
          emit({
            kind: "transfer-complete",
            transferId: targetId,
            status: "failed",
            error: target.error
          });
        }
      }
    }

    pruneCompletedJobs();
  }

  function pause(transferId: string): void {
    const job = jobs.get(transferId);
    if (!job) {
      console.warn(`[sftp] Pause requested for unknown transfer ${transferId}`);
      return;
    }

    const targets = collectRelatedTargets(job);

    for (const target of targets) {
      const targetId = target.transferId;

      if (target.status === "completed" || target.status === "failed") {
        continue;
      }

      if (target.status === "queued") {
        pausedByUser.add(targetId);
        target.status = "paused";
        target.error = "Paused by user";
        target.speed = 0;
        emit({
          kind: "transfer-progress",
          transferId: targetId,
          bytesTransferred: target.bytesTransferred,
          totalBytes: target.totalBytes,
          speed: target.speed,
          status: "paused"
        });
        continue;
      }

      if (target.status === "paused") {
        if (!pendingConflicts.has(targetId)) {
          pausedByUser.add(targetId);
          target.error = "Paused by user";
          target.speed = 0;
        }
        continue;
      }

      pausedByUser.add(targetId);
      target.error = "Paused by user";
      target.abortController?.abort();
      // abort() fires the signal synchronously, but the promise .catch() handler
      // that sets the job to "paused" runs as a microtask — after pause() returns.
      // Set the status immediately so callers (and IPC list responses) see the
      // paused state right away.
      target.status = "paused";
      target.speed = 0;
      emit({
        kind: "transfer-progress",
        transferId: targetId,
        bytesTransferred: target.bytesTransferred,
        totalBytes: target.totalBytes,
        speed: target.speed,
        status: "paused"
      });
    }
  }

  function resume(transferId: string): void {
    const job = jobs.get(transferId);
    if (!job) {
      console.warn(`[sftp] Resume requested for unknown transfer ${transferId}`);
      return;
    }

    const targets = collectRelatedTargets(job);
    let resumedAny = false;

    for (const target of targets) {
      const targetId = target.transferId;
      if (target.status !== "paused") {
        continue;
      }

      if (!pausedByUser.has(targetId)) {
        continue;
      }

      resumedAny = true;
      pausedByUser.delete(targetId);
      target.status = "queued";
      target.speed = 0;
      delete target.error;
      emit({
        kind: "transfer-progress",
        transferId: targetId,
        bytesTransferred: target.bytesTransferred,
        totalBytes: target.totalBytes,
        speed: target.speed,
        status: "queued"
      });
    }

    if (!resumedAny && targetIsWaitingForConflict(job.transferId)) {
      throw new Error("Transfer is waiting for conflict resolution");
    }

    if (resumedAny) {
      scheduleDrain();
    }
  }

  function targetIsWaitingForConflict(transferId: string): boolean {
    return pendingConflicts.has(transferId);
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
    pause,
    resume,
    resolveConflict,
    list,
    onEvent
  };
}
