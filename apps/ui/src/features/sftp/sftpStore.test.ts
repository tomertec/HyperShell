import { describe, expect, it } from "vitest";

import { createSftpStore } from "./sftpStore";

describe("sftpStore", () => {
  it("initializes with correct defaults", () => {
    const store = createSftpStore("sftp-1");
    const state = store.getState();

    expect(state.sftpSessionId).toBe("sftp-1");
    expect(state.localEntries).toEqual([]);
    expect(state.remoteEntries).toEqual([]);
    expect(state.localSelection).toEqual(new Set());
    expect(state.remoteSelection).toEqual(new Set());
  });

  it("updates remote path and pushes history", () => {
    const store = createSftpStore("sftp-1");

    store.getState().setRemotePath("/home/user");

    expect(store.getState().remotePath).toBe("/home/user");
    expect(store.getState().remoteHistory).toContain("/home/user");
  });

  it("updates local path and pushes history", () => {
    const store = createSftpStore("sftp-1");

    store.getState().setLocalPath("C:\\Users");

    expect(store.getState().localPath).toBe("C:\\Users");
    expect(store.getState().localHistory).toContain("C:\\Users");
  });

  it("manages selection", () => {
    const store = createSftpStore("sftp-1");

    store.getState().setRemoteSelection(new Set(["/file1", "/file2"]));

    expect(store.getState().remoteSelection.size).toBe(2);
    expect(store.getState().remoteSelection.has("/file1")).toBe(true);
    expect(store.getState().remoteSelection.has("/file2")).toBe(true);
  });

  it("sets loading state", () => {
    const store = createSftpStore("sftp-1");

    store.getState().setLoading("remote", true);

    expect(store.getState().isLoading.remote).toBe(true);
    expect(store.getState().isLoading.local).toBe(false);
  });
});
