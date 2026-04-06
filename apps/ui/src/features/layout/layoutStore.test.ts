import { describe, expect, it } from "vitest";

import { createLayoutStore } from "./layoutStore";

describe("layoutStore", () => {
  it("opens a tab for a new session", () => {
    const store = createLayoutStore();

    store.getState().openTab({ sessionId: "s1", title: "server-1" });

    expect(store.getState().tabs).toHaveLength(1);
    expect(store.getState().tabs[0]?.tabKey).toBe("s1");
  });

  it("splits a pane", () => {
    const store = createLayoutStore();
    store.getState().openTab({ sessionId: "s1", title: "server-1" });
    store.getState().splitPane("s1");
    expect(store.getState().panes).toHaveLength(2);
    expect(store.getState().panes[1]?.sessionId).toBe("s1");
    expect(store.getState().activePaneId).toBe(store.getState().panes[1]?.paneId);
  });

  it("closes a pane", () => {
    const store = createLayoutStore();
    store.getState().splitPane("s1");
    const secondPaneId = store.getState().panes[1]?.paneId!;
    store.getState().closePane(secondPaneId);
    expect(store.getState().panes).toHaveLength(1);
  });

  it("does not close the last pane", () => {
    const store = createLayoutStore();
    const firstPaneId = store.getState().panes[0]?.paneId!;
    store.getState().closePane(firstPaneId);
    expect(store.getState().panes).toHaveLength(1);
  });

  it("replaces temporary session ids with backend ids", () => {
    const store = createLayoutStore();

    store.getState().openTab({
      tabKey: "tab-1",
      sessionId: "temp-1",
      title: "server-1",
      transport: "ssh",
      profileId: "host-1"
    });

    store.getState().replaceSessionId("temp-1", "session-42");

    expect(store.getState().tabs[0]?.sessionId).toBe("session-42");
    expect(store.getState().tabs[0]?.tabKey).toBe("tab-1");
    expect(store.getState().tabs[0]?.preopened).toBe(true);
    expect(store.getState().activeSessionId).toBe("session-42");
  });

  it("preserves sftp tab metadata", () => {
    const store = createLayoutStore();

    store.getState().openTab({
      sessionId: "sftp-1",
      title: "files",
      transport: "sftp",
      type: "sftp",
      sftpSessionId: "sftp-1",
      hostId: "host-1"
    });

    expect(store.getState().tabs[0]).toMatchObject({
      sessionId: "sftp-1",
      title: "files",
      transport: "sftp",
      type: "sftp",
      sftpSessionId: "sftp-1",
      hostId: "host-1",
      tabKey: "sftp-1"
    });
  });
});
