import { describe, it, expect, beforeEach } from "vitest";
import { createLayoutStore } from "./layoutStore";
import { handlePaneShortcut } from "./paneShortcuts";

describe("paneShortcuts", () => {
  let store: ReturnType<typeof createLayoutStore>;

  beforeEach(() => {
    store = createLayoutStore();
    store.getState().openTab({ sessionId: "s1", title: "Test" });
  });

  it("splits pane horizontally on Ctrl+Shift+D", () => {
    const handled = handlePaneShortcut(store, { ctrlKey: true, shiftKey: true, key: "D" } as KeyboardEvent);
    expect(handled).toBe(true);
    expect(store.getState().panes).toHaveLength(2);
    expect(store.getState().splitDirection).toBe("horizontal");
  });

  it("splits pane vertically on Ctrl+Shift+E", () => {
    const handled = handlePaneShortcut(store, { ctrlKey: true, shiftKey: true, key: "E" } as KeyboardEvent);
    expect(handled).toBe(true);
    expect(store.getState().panes).toHaveLength(2);
    expect(store.getState().splitDirection).toBe("vertical");
  });

  it("closes active pane on Ctrl+Shift+W", () => {
    store.getState().splitPane("s1", "horizontal");
    expect(store.getState().panes).toHaveLength(2);
    const handled = handlePaneShortcut(store, { ctrlKey: true, shiftKey: true, key: "W" } as KeyboardEvent);
    expect(handled).toBe(true);
    expect(store.getState().panes).toHaveLength(1);
  });

  it("navigates to next pane on Ctrl+Shift+]", () => {
    store.getState().splitPane("s1", "horizontal");
    // After split, active pane is the new one (last). Activate first pane:
    store.getState().activatePane(store.getState().panes[0].paneId);
    const handled = handlePaneShortcut(store, { ctrlKey: true, shiftKey: true, key: "]" } as KeyboardEvent);
    expect(handled).toBe(true);
    expect(store.getState().activePaneId).toBe(store.getState().panes[1].paneId);
  });

  it("navigates to previous pane on Ctrl+Shift+[", () => {
    store.getState().splitPane("s1", "horizontal");
    // active pane is the new (last) one after split
    const handled = handlePaneShortcut(store, { ctrlKey: true, shiftKey: true, key: "[" } as KeyboardEvent);
    expect(handled).toBe(true);
    expect(store.getState().activePaneId).toBe(store.getState().panes[0].paneId);
  });

  it("returns false for unrelated keys", () => {
    const handled = handlePaneShortcut(store, { ctrlKey: false, shiftKey: false, key: "a" } as KeyboardEvent);
    expect(handled).toBe(false);
  });
});
