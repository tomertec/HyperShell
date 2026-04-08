import type { createLayoutStore } from "./layoutStore";

type LayoutStore = ReturnType<typeof createLayoutStore>;

export function handlePaneShortcut(store: LayoutStore, e: KeyboardEvent): boolean {
  if (!(e.ctrlKey || e.metaKey) || !e.shiftKey) return false;

  const state = store.getState();

  switch (e.key) {
    case "D": {
      const sessionId = state.activeSessionId;
      if (sessionId) state.splitPane(sessionId, "horizontal");
      return true;
    }
    case "E": {
      const sessionId = state.activeSessionId;
      if (sessionId) state.splitPane(sessionId, "vertical");
      return true;
    }
    case "W": {
      if (state.panes.length > 1) {
        state.closePane(state.activePaneId);
      }
      return true;
    }
    case "[": {
      const idx = state.panes.findIndex((p) => p.paneId === state.activePaneId);
      if (idx > 0) state.activatePane(state.panes[idx - 1].paneId);
      return true;
    }
    case "]": {
      const idx = state.panes.findIndex((p) => p.paneId === state.activePaneId);
      if (idx < state.panes.length - 1) state.activatePane(state.panes[idx + 1].paneId);
      return true;
    }
    default:
      return false;
  }
}
