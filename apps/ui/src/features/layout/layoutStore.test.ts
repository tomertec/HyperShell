import { describe, expect, it } from "vitest";

import { createLayoutStore } from "./layoutStore";

describe("layoutStore", () => {
  it("opens a tab for a new session", () => {
    const store = createLayoutStore();

    store.getState().openTab({ sessionId: "s1", title: "server-1" });

    expect(store.getState().tabs).toHaveLength(1);
    expect(store.getState().tabs[0]?.tabKey).toBe("s1");
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
});
