import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTransferManager } from "./transferManager";

describe("TransferManager", () => {
  let manager: ReturnType<typeof createTransferManager>;
  const mockSftpTransport = {
    stat: vi.fn().mockResolvedValue({ size: 1024, isDirectory: false }),
    createReadStream: vi.fn(),
    createWriteStream: vi.fn(),
    list: vi.fn().mockResolvedValue([])
  };

  beforeEach(() => {
    manager = createTransferManager();
  });

  it("queues transfer jobs", () => {
    const jobs = manager.enqueue("sftp-1", mockSftpTransport as any, [
      {
        type: "upload",
        localPath: "C:\\file.txt",
        remotePath: "/file.txt",
        isDirectory: false
      }
    ]);

    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe("queued");
  });

  it("lists all transfers", () => {
    manager.enqueue("sftp-1", mockSftpTransport as any, [
      {
        type: "upload",
        localPath: "C:\\a.txt",
        remotePath: "/a.txt",
        isDirectory: false
      },
      {
        type: "download",
        localPath: "C:\\b.txt",
        remotePath: "/b.txt",
        isDirectory: false
      }
    ]);

    const all = manager.list();
    expect(all).toHaveLength(2);
  });

  it("cancels a transfer", () => {
    const jobs = manager.enqueue("sftp-1", mockSftpTransport as any, [
      {
        type: "upload",
        localPath: "C:\\file.txt",
        remotePath: "/file.txt",
        isDirectory: false
      }
    ]);

    manager.cancel(jobs[0].transferId);

    const all = manager.list();
    expect(all[0]?.status).toBe("failed");
  });

  it("pauses and resumes all jobs in a batch", () => {
    const batchJobs = manager.enqueue("sftp-1", mockSftpTransport as any, [
      {
        type: "upload",
        localPath: "C:\\batch\\a.txt",
        remotePath: "/batch/a.txt",
        isDirectory: false
      },
      {
        type: "upload",
        localPath: "C:\\batch\\b.txt",
        remotePath: "/batch/b.txt",
        isDirectory: false
      }
    ]);
    const otherBatch = manager.enqueue("sftp-1", mockSftpTransport as any, [
      {
        type: "upload",
        localPath: "C:\\other\\c.txt",
        remotePath: "/other/c.txt",
        isDirectory: false
      }
    ]);

    manager.pause(batchJobs[0].transferId);
    let all = manager.list();
    const firstPaused = all.find((job) => job.transferId === batchJobs[0].transferId);
    const secondPaused = all.find((job) => job.transferId === batchJobs[1].transferId);
    const otherQueued = all.find((job) => job.transferId === otherBatch[0].transferId);
    expect(firstPaused?.status).toBe("paused");
    expect(firstPaused?.error).toBe("Paused by user");
    expect(secondPaused?.status).toBe("paused");
    expect(secondPaused?.error).toBe("Paused by user");
    expect(otherQueued?.status).toBe("queued");

    manager.resume(batchJobs[1].transferId);
    all = manager.list();
    const firstQueued = all.find((job) => job.transferId === batchJobs[0].transferId);
    const secondQueued = all.find((job) => job.transferId === batchJobs[1].transferId);
    expect(firstQueued?.status).toBe("queued");
    expect(firstQueued?.error).toBeUndefined();
    expect(secondQueued?.status).toBe("queued");
    expect(secondQueued?.error).toBeUndefined();
  });

  it("does not throw when a transfer event listener throws", () => {
    manager.onEvent(() => {
      throw new Error("listener failure");
    });

    expect(() =>
      manager.enqueue("sftp-1", mockSftpTransport as any, [
        {
          type: "upload",
          localPath: "C:\\file.txt",
          remotePath: "/file.txt",
          isDirectory: false
        }
      ])
    ).not.toThrow();
  });

  it("cancels directory descendants that are already queued", () => {
    const jobs = manager.enqueue("sftp-1", mockSftpTransport as any, [
      {
        type: "download",
        localPath: "C:\\target\\folder",
        remotePath: "/folder",
        isDirectory: true
      },
      {
        type: "download",
        localPath: "C:\\target\\folder\\a.txt",
        remotePath: "/folder/a.txt",
        isDirectory: false
      }
    ]);
    const unrelatedJobs = manager.enqueue("sftp-1", mockSftpTransport as any, [
      {
        type: "download",
        localPath: "C:\\target\\other\\b.txt",
        remotePath: "/other/b.txt",
        isDirectory: false
      }
    ]);

    manager.cancel(jobs[0].transferId);

    const all = manager.list();
    const root = all.find((job) => job.transferId === jobs[0].transferId);
    const child = all.find((job) => job.transferId === jobs[1].transferId);
    const unrelated = all.find((job) => job.transferId === unrelatedJobs[0].transferId);

    expect(root?.status).toBe("failed");
    expect(child?.status).toBe("failed");
    expect(unrelated?.status).toBe("queued");
  });

  it("enqueues a resume job with starting offset", () => {
    const job = manager.enqueueResume("sftp-1", mockSftpTransport as any, {
      type: "download",
      localPath: "C:\\file.bin",
      remotePath: "/file.bin",
      bytesTransferred: 500_000,
      totalBytes: 1_000_000,
      batchId: "batch-1",
    });

    expect(job.status).toBe("queued");
    expect(job.bytesTransferred).toBe(500_000);
    expect(job.totalBytes).toBe(1_000_000);
  });

  it("lists resumed jobs alongside regular jobs", () => {
    manager.enqueue("sftp-1", mockSftpTransport as any, [
      { type: "upload", localPath: "C:\\a.txt", remotePath: "/a.txt", isDirectory: false },
    ]);
    manager.enqueueResume("sftp-1", mockSftpTransport as any, {
      type: "download",
      localPath: "C:\\b.bin",
      remotePath: "/b.bin",
      bytesTransferred: 100,
      totalBytes: 200,
      batchId: "batch-2",
    });

    expect(manager.list()).toHaveLength(2);
  });

  it("cancels all jobs in the same batch when cancelling one job", () => {
    const batchJobs = manager.enqueue("sftp-1", mockSftpTransport as any, [
      {
        type: "download",
        localPath: "C:\\batch\\one.txt",
        remotePath: "/batch/one.txt",
        isDirectory: false
      },
      {
        type: "download",
        localPath: "C:\\batch\\two.txt",
        remotePath: "/batch/two.txt",
        isDirectory: false
      }
    ]);
    const otherBatchJobs = manager.enqueue("sftp-1", mockSftpTransport as any, [
      {
        type: "download",
        localPath: "C:\\other\\three.txt",
        remotePath: "/other/three.txt",
        isDirectory: false
      }
    ]);

    manager.cancel(batchJobs[0].transferId);

    const all = manager.list();
    const first = all.find((job) => job.transferId === batchJobs[0].transferId);
    const second = all.find((job) => job.transferId === batchJobs[1].transferId);
    const other = all.find((job) => job.transferId === otherBatchJobs[0].transferId);

    expect(first?.status).toBe("failed");
    expect(second?.status).toBe("failed");
    expect(other?.status).toBe("queued");
  });
});
