import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, mkdirSync, renameSync, statSync } from "node:fs";
import { dirname } from "node:path";

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
  list(): TransferJob[];
  onEvent(listener: TransferEventListener): () => void;
}

export function createTransferManager(
  options: TransferManagerOptions = {}
): TransferManager {
  const maxConcurrent = options.maxConcurrent ?? 3;
  const autoStart = options.autoStart ?? false;
  const maxJobHistory = options.maxJobHistory ?? 100;
  const jobs = new Map<string, ManagedTransferJob>();
  const transports = new Map<string, SftpTransportHandle>();
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
          nextJob.abortController = null;
          activeCount -= 1;
          pruneCompletedJobs();
          scheduleDrain();
        });
    }
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
        return;
      }

      const localStream = createReadStream(job.localPath);
      const remoteStream = transport.createWriteStream(job.remotePath);

      let bytesTransferred = 0;
      let lastEmit = Date.now();
      const startedAt = Date.now();

      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          localStream.removeAllListeners();
          remoteStream.removeAllListeners();
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
          cleanup();
          localStream.destroy(new Error("Cancelled by user"));
          remoteStream.destroy(new Error("Cancelled by user"));
          reject(new Error("Cancelled by user"));
        };

        job.abortController?.signal.addEventListener("abort", abortHandler, { once: true });

        remoteStream.on("close", () => {
          job.abortController?.signal.removeEventListener("abort", abortHandler);
          cleanup();
          resolve();
        });
        remoteStream.on("error", (error) => {
          job.abortController?.signal.removeEventListener("abort", abortHandler);
          cleanup();
          reject(error);
        });
        localStream.on("error", (error) => {
          job.abortController?.signal.removeEventListener("abort", abortHandler);
          cleanup();
          reject(error);
        });

        localStream.pipe(remoteStream);
      });

      return;
    }

    const remoteStat = await transport.stat(job.remotePath);
    job.totalBytes = remoteStat.size;

    if (job.isDirectory) {
      mkdirSync(job.localPath, { recursive: true });
      return;
    }

    mkdirSync(dirname(job.localPath), { recursive: true });
    const partPath = `${job.localPath}.part`;
    const remoteStream = transport.createReadStream(job.remotePath);
    const localStream = createWriteStream(partPath);

    let bytesTransferred = 0;
    let lastEmit = Date.now();
    const startedAt = Date.now();

    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        remoteStream.removeAllListeners();
        localStream.removeAllListeners();
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
        cleanup();
        remoteStream.destroy(new Error("Cancelled by user"));
        localStream.destroy(new Error("Cancelled by user"));
        reject(new Error("Cancelled by user"));
      };

      job.abortController?.signal.addEventListener("abort", abortHandler, { once: true });

      localStream.on("close", () => {
        job.abortController?.signal.removeEventListener("abort", abortHandler);
        cleanup();
        renameSync(partPath, job.localPath);
        resolve();
      });
      localStream.on("error", (error) => {
        job.abortController?.signal.removeEventListener("abort", abortHandler);
        cleanup();
        reject(error);
      });
      remoteStream.on("error", (error) => {
        job.abortController?.signal.removeEventListener("abort", abortHandler);
        cleanup();
        reject(error);
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

    // For active jobs, abort triggers promise rejection which emits transfer-complete.
    job.abortController?.abort();
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
    list,
    onEvent
  };
}
