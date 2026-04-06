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
});
