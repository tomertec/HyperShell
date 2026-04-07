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

  it("initializes new cursor/focus/filter defaults", () => {
    const store = createSftpStore("sftp-1");
    const state = store.getState();

    expect(state.activePane).toBe("local");
    expect(state.localCursorIndex).toBe(0);
    expect(state.remoteCursorIndex).toBe(0);
    expect(state.localFilterText).toBe("");
    expect(state.remoteFilterText).toBe("");
  });

  it("switches active pane", () => {
    const store = createSftpStore("sftp-1");
    store.getState().setActivePane("remote");
    expect(store.getState().activePane).toBe("remote");
  });

  it("sets cursor index", () => {
    const store = createSftpStore("sftp-1");
    store.getState().setCursorIndex("local", 5);
    expect(store.getState().localCursorIndex).toBe(5);
    store.getState().setCursorIndex("remote", 3);
    expect(store.getState().remoteCursorIndex).toBe(3);
  });

  it("sets filter text", () => {
    const store = createSftpStore("sftp-1");
    store.getState().setFilterText("local", "src");
    expect(store.getState().localFilterText).toBe("src");
    store.getState().setFilterText("remote", "conf");
    expect(store.getState().remoteFilterText).toBe("conf");
  });

  it("resets cursor when path changes", () => {
    const store = createSftpStore("sftp-1");
    store.getState().setCursorIndex("local", 5);
    store.getState().setLocalPath("C:\\NewDir");
    expect(store.getState().localCursorIndex).toBe(0);
  });

  it("resets filter when path changes", () => {
    const store = createSftpStore("sftp-1");
    store.getState().setFilterText("remote", "test");
    store.getState().setRemotePath("/new/path");
    expect(store.getState().remoteFilterText).toBe("");
  });
});
