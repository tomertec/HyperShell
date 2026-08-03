import { describe, expect, it } from "vitest";

import { createLayoutStore, resolveTabTitle } from "./layoutStore";

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

  it("splitPane stores direction and default sizes", () => {
    const store = createLayoutStore();
    store.getState().splitPane("sess-1", "horizontal");
    const state = store.getState();
    expect(state.panes).toHaveLength(2);
    expect(state.splitDirection).toBe("horizontal");
    expect(state.paneSizes).toEqual([50, 50]);
  });

  it("splitPane vertical creates vertical split", () => {
    const store = createLayoutStore();
    store.getState().splitPane("sess-1", "vertical");
    expect(store.getState().splitDirection).toBe("vertical");
  });

  it("setPaneSizes updates sizes array", () => {
    const store = createLayoutStore();
    store.getState().splitPane("sess-1", "horizontal");
    store.getState().setPaneSizes([30, 70]);
    expect(store.getState().paneSizes).toEqual([30, 70]);
  });

  it("closePane resets to single pane sizes", () => {
    const store = createLayoutStore();
    store.getState().splitPane("sess-1", "horizontal");
    expect(store.getState().panes).toHaveLength(2);
    store.getState().closePane("pane-2");
    expect(store.getState().panes).toHaveLength(1);
    expect(store.getState().paneSizes).toEqual([100]);
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

  describe("setTabDynamicTitle", () => {
    it("sets the dynamic title without touching the base title", () => {
      const store = createLayoutStore();
      store.getState().openTab({ sessionId: "s1", title: "PowerShell" });
      store.getState().setTabDynamicTitle("s1", "pwsh in hypershell");
      const tab = store.getState().tabs.find((t) => t.sessionId === "s1");
      expect(tab?.dynamicTitle).toBe("pwsh in hypershell");
      expect(tab?.title).toBe("PowerShell");
    });

    it("clears the dynamic title with null", () => {
      const store = createLayoutStore();
      store.getState().openTab({ sessionId: "s1", title: "PowerShell" });
      store.getState().setTabDynamicTitle("s1", "cd C:\\repos");
      store.getState().setTabDynamicTitle("s1", null);
      const tab = store.getState().tabs.find((t) => t.sessionId === "s1");
      expect(tab?.dynamicTitle).toBeUndefined();
    });

    it("is a no-op for unknown sessions", () => {
      const store = createLayoutStore();
      store.getState().openTab({ sessionId: "s1", title: "PowerShell" });
      const before = store.getState().tabs;
      store.getState().setTabDynamicTitle("nope", "x");
      expect(store.getState().tabs).toBe(before);
    });

    it("survives replaceSessionId", () => {
      const store = createLayoutStore();
      store.getState().openTab({ sessionId: "s1", title: "hermes" });
      store.getState().setTabDynamicTitle("s1", "htop");
      store.getState().replaceSessionId("s1", "s2");
      const tab = store.getState().tabs.find((t) => t.sessionId === "s2");
      expect(tab?.dynamicTitle).toBe("htop");
    });
  });

  describe("process titles", () => {
    it("sets the process title without touching base or dynamic titles", () => {
      const store = createLayoutStore();
      store.getState().openTab({ sessionId: "s1", title: "PowerShell" });
      store.getState().setTabDynamicTitle("s1", "pwsh in hypershell");
      store.getState().setTabProcessTitle("s1", "llmtop");

      const tab = store.getState().tabs.find((t) => t.sessionId === "s1");
      expect(tab?.processTitle).toBe("llmtop");
      expect(tab?.dynamicTitle).toBe("pwsh in hypershell");
      expect(tab?.title).toBe("PowerShell");
    });

    it("clears the process title with null", () => {
      const store = createLayoutStore();
      store.getState().openTab({ sessionId: "s1", title: "PowerShell" });
      store.getState().setTabProcessTitle("s1", "llmtop");
      store.getState().setTabProcessTitle("s1", null);

      expect(store.getState().tabs.find((t) => t.sessionId === "s1")?.processTitle).toBeUndefined();
    });

    it("resolves process over dynamic over base", () => {
      expect(resolveTabTitle({ sessionId: "s1", title: "base" })).toBe("base");
      expect(resolveTabTitle({ sessionId: "s1", title: "base", dynamicTitle: "osc" })).toBe("osc");
      expect(
        resolveTabTitle({ sessionId: "s1", title: "base", dynamicTitle: "osc", processTitle: "llmtop" })
      ).toBe("llmtop");
    });
  });
});
