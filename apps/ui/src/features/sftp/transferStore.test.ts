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

  it("filters by status", () => {
    const store = createTransferStore();

    store.getState().setFilter("failed");

    expect(store.getState().filter).toBe("failed");
  });
});
