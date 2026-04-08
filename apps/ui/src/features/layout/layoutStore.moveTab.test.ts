import { describe, it, expect, beforeEach } from "vitest";
import { createLayoutStore } from "./layoutStore";

describe("layoutStore.moveTab", () => {
  let store: ReturnType<typeof createLayoutStore>;

  beforeEach(() => {
    store = createLayoutStore();
  });

  it("reorders tabs", () => {
    store.getState().openTab({ sessionId: "a", title: "A" });
    store.getState().openTab({ sessionId: "b", title: "B" });
    store.getState().openTab({ sessionId: "c", title: "C" });
    store.getState().moveTab(0, 2);
    const ids = store.getState().tabs.map((t) => t.sessionId);
    expect(ids).toEqual(["b", "c", "a"]);
  });

  it("handles same index (no-op)", () => {
    store.getState().openTab({ sessionId: "a", title: "A" });
    store.getState().openTab({ sessionId: "b", title: "B" });
    store.getState().moveTab(0, 0);
    const ids = store.getState().tabs.map((t) => t.sessionId);
    expect(ids).toEqual(["a", "b"]);
  });
});
