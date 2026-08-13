import { describe, expect, it } from "vitest";

import { createTransferStore } from "./transferStore";

describe("transferStore", () => {
  it("initializes empty", () => {
    const store = createTransferStore();
    const state = store.getState();

    expect(state.transfers).toEqual([]);
    expect(state.activeCount).toBe(0);
    expect(state.panelOpen).toBe(false);
  });

  it("updates transfers from event", () => {
    const store = createTransferStore();

    store.getState().setTransfers([
      {
        transferId: "tx-1",
        type: "upload",
        localPath: "C:\\file.txt",
        remotePath: "/file.txt",
        status: "active",
        bytesTransferred: 512,
        totalBytes: 1024,
        speed: 256
      }
    ]);

    expect(store.getState().transfers).toHaveLength(1);
    expect(store.getState().activeCount).toBe(1);
  });

  it("auto-opens panel when transfers start", () => {
    const store = createTransferStore();

    store.getState().setTransfers([
      {
        transferId: "tx-1",
        type: "upload",
        localPath: "C:\\file.txt",
        remotePath: "/file.txt",
        status: "active",
        bytesTransferred: 0,
        totalBytes: 1024,
        speed: 0
      }
    ]);

    expect(store.getState().panelOpen).toBe(true);
  });

  it("does not re-open the panel after a manual close during active transfers", () => {
    const store = createTransferStore();

    store.getState().setTransfers([
      {
        transferId: "tx-1",
        type: "upload",
        localPath: "C:\\file.txt",
        remotePath: "/file.txt",
        status: "active",
        bytesTransferred: 256,
        totalBytes: 1024,
        speed: 128
      }
    ]);

    store.getState().setPanelOpen(false);
    store.getState().updateTransfer("tx-1", {
      bytesTransferred: 512,
      totalBytes: 1024,
      speed: 256,
      status: "active"
    });

    expect(store.getState().panelOpen).toBe(false);
  });

  it("records completion timestamps for finished transfers", () => {
    const store = createTransferStore();

    store.getState().setTransfers([
      {
        transferId: "tx-1",
        type: "download",
        localPath: "C:\\file.txt",
        remotePath: "/file.txt",
        status: "active",
        bytesTransferred: 512,
        totalBytes: 1024,
        speed: 256
      }
    ]);

    store.getState().updateTransfer("tx-1", {
      bytesTransferred: 1024,
      totalBytes: 1024,
      speed: 256,
      status: "completed"
    });

    expect(store.getState().transfers[0]?.completedAt).toEqual(expect.any(Number));
  });

  it("filters by status", () => {
    const store = createTransferStore();

    store.getState().setFilter("failed");

    expect(store.getState().filter).toBe("failed");
  });
});

describe("attentionCount", () => {
  it("counts paused transfers so a conflict cannot strand the panel", () => {
    const store = createTransferStore();
    store.getState().setTransfers([
      { transferId: "a", sftpSessionId: "s", type: "upload", localPath: "/l", remotePath: "/r",
        bytesTransferred: 5, totalBytes: 10, speed: 0, status: "paused" } as never
    ]);

    expect(store.getState().activeCount).toBe(0);
    expect(store.getState().attentionCount).toBe(1);
  });

  it("ignores completed and failed transfers", () => {
    const store = createTransferStore();
    store.getState().setTransfers([
      { transferId: "a", sftpSessionId: "s", type: "upload", localPath: "/l", remotePath: "/r",
        bytesTransferred: 10, totalBytes: 10, speed: 0, status: "completed" } as never,
      { transferId: "b", sftpSessionId: "s", type: "upload", localPath: "/l", remotePath: "/r",
        bytesTransferred: 1, totalBytes: 10, speed: 0, status: "failed" } as never
    ]);

    expect(store.getState().attentionCount).toBe(0);
  });
});

describe("conflict tracking", () => {
  it("records and clears conflict ids", () => {
    const store = createTransferStore();

    store.getState().setConflict("a");
    expect(store.getState().conflictIds.has("a")).toBe(true);

    store.getState().clearConflict("a");
    expect(store.getState().conflictIds.has("a")).toBe(false);
  });

  it("keeps the same Set reference when clearing an unknown id", () => {
    const store = createTransferStore();
    const before = store.getState().conflictIds;

    store.getState().clearConflict("missing");

    expect(store.getState().conflictIds).toBe(before);
  });
});
