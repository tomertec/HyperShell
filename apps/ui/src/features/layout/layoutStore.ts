import { createStore } from "zustand/vanilla";

export type LayoutTab = {
  tabKey?: string;
  sessionId: string;
  title: string;
  transport?: "ssh" | "serial";
  profileId?: string;
  preopened?: boolean;
};

export type Pane = {
  paneId: string;
  sessionId: string | null;
};

export type LayoutState = {
  tabs: LayoutTab[];
  activeSessionId: string | null;
  panes: Pane[];
  activePaneId: string;
  openTab: (tab: LayoutTab) => void;
  activateTab: (sessionId: string) => void;
  replaceSessionId: (oldSessionId: string, nextSessionId: string) => void;
  splitPane: (sessionId: string) => void;
  closePane: (paneId: string) => void;
  activatePane: (paneId: string) => void;
};

export function createLayoutStore() {
  let paneCounter = 1;

  return createStore<LayoutState>()((set) => ({
    tabs: [],
    activeSessionId: null,
    panes: [{ paneId: "pane-1", sessionId: null }],
    activePaneId: "pane-1",

    openTab: (tab) =>
      set((state) => {
        const tabs = state.tabs.some((t) => t.sessionId === tab.sessionId)
          ? state.tabs
          : [...state.tabs, { ...tab, tabKey: tab.tabKey ?? tab.sessionId }];
        const panes = state.panes.map((p) =>
          p.paneId === state.activePaneId ? { ...p, sessionId: tab.sessionId } : p
        );
        return { tabs, activeSessionId: tab.sessionId, panes };
      }),

    activateTab: (sessionId) =>
      set(() => ({
        activeSessionId: sessionId
      })),

    replaceSessionId: (oldSessionId, nextSessionId) =>
      set((state) => {
        if (oldSessionId === nextSessionId) {
          return state;
        }

        const tabs = state.tabs.map((tab) =>
          tab.sessionId === oldSessionId
            ? {
                ...tab,
                tabKey: tab.tabKey ?? tab.sessionId,
                sessionId: nextSessionId,
                preopened: true
              }
            : tab
        );

        const dedupedTabs: LayoutTab[] = [];
        const seen = new Set<string>();
        for (const tab of tabs) {
          if (seen.has(tab.sessionId)) {
            continue;
          }

          seen.add(tab.sessionId);
          dedupedTabs.push(tab);
        }

        const panes = state.panes.map((p) =>
          p.sessionId === oldSessionId ? { ...p, sessionId: nextSessionId } : p
        );

        return {
          tabs: dedupedTabs,
          panes,
          activeSessionId:
            state.activeSessionId === oldSessionId
              ? nextSessionId
              : state.activeSessionId
        };
      }),

    splitPane: (sessionId) =>
      set((state) => {
        paneCounter++;
        const newPaneId = `pane-${paneCounter}`;
        return {
          panes: [...state.panes, { paneId: newPaneId, sessionId }],
          activePaneId: newPaneId
        };
      }),

    closePane: (paneId) =>
      set((state) => {
        if (state.panes.length <= 1) return state;
        const nextPanes = state.panes.filter((p) => p.paneId !== paneId);
        return {
          panes: nextPanes,
          activePaneId:
            state.activePaneId === paneId
              ? nextPanes[nextPanes.length - 1].paneId
              : state.activePaneId
        };
      }),

    activatePane: (paneId) =>
      set({ activePaneId: paneId })
  }));
}

export const layoutStore = createLayoutStore();
