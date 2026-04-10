import { createStore } from "zustand/vanilla";

export type LayoutTab = {
  tabKey?: string;
  sessionId: string;
  title: string;
  transport?: "ssh" | "serial" | "sftp" | "telnet";
  telnetOptions?: { hostname: string; port: number; mode: "telnet" | "raw"; terminalType?: string };
  profileId?: string;
  preopened?: boolean;
  type?: "terminal" | "sftp";
  sftpSessionId?: string;
  hostId?: string;
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
  splitDirection: "horizontal" | "vertical";
  paneSizes: number[];
  openTab: (tab: LayoutTab) => void;
  activateTab: (sessionId: string) => void;
  replaceSessionId: (oldSessionId: string, nextSessionId: string) => void;
  splitPane: (sessionId: string, direction?: "horizontal" | "vertical") => void;
  closePane: (paneId: string) => void;
  activatePane: (paneId: string) => void;
  setPaneSizes: (sizes: number[]) => void;
  moveTab: (fromIndex: number, toIndex: number) => void;
};

export function createLayoutStore() {
  let paneCounter = 1;

  return createStore<LayoutState>()((set) => ({
    tabs: [],
    activeSessionId: null,
    panes: [{ paneId: "pane-1", sessionId: null }],
    activePaneId: "pane-1",
    splitDirection: "horizontal" as const,
    paneSizes: [100],

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
      set((state) => ({
        activeSessionId: sessionId,
        panes: state.panes.map((p) =>
          p.paneId === state.activePaneId ? { ...p, sessionId } : p
        )
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
        const removedTabKeys: string[] = [];
        for (const tab of tabs) {
          if (seen.has(tab.sessionId)) {
            removedTabKeys.push(tab.tabKey ?? tab.sessionId);
            continue;
          }

          seen.add(tab.sessionId);
          dedupedTabs.push(tab);
        }

        if (removedTabKeys.length > 0) {
          console.warn(
            `[layoutStore] replaceSessionId removed duplicate tabs: ${removedTabKeys.join(", ")}`
          );
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

    splitPane: (sessionId, direction) =>
      set((state) => {
        paneCounter++;
        const newPaneId = `pane-${paneCounter}`;
        const nextPanes = [...state.panes, { paneId: newPaneId, sessionId }];
        const equalSize = Math.round(100 / nextPanes.length);
        const sizes = nextPanes.map((_, i) =>
          i < nextPanes.length - 1 ? equalSize : 100 - equalSize * (nextPanes.length - 1)
        );
        return {
          panes: nextPanes,
          activePaneId: newPaneId,
          splitDirection: direction ?? state.splitDirection,
          paneSizes: sizes,
        };
      }),

    closePane: (paneId) =>
      set((state) => {
        if (state.panes.length <= 1) return state;
        const nextPanes = state.panes.filter((p) => p.paneId !== paneId);
        const equalSize = Math.round(100 / nextPanes.length);
        const sizes = nextPanes.map((_, i) =>
          i < nextPanes.length - 1 ? equalSize : 100 - equalSize * (nextPanes.length - 1)
        );
        return {
          panes: nextPanes,
          activePaneId:
            state.activePaneId === paneId
              ? nextPanes[nextPanes.length - 1].paneId
              : state.activePaneId,
          paneSizes: sizes,
        };
      }),

    activatePane: (paneId) =>
      set({ activePaneId: paneId }),

    setPaneSizes: (sizes) => set({ paneSizes: sizes }),

    moveTab: (fromIndex, toIndex) =>
      set((state) => {
        if (fromIndex === toIndex) return state;
        const tabs = [...state.tabs];
        const [moved] = tabs.splice(fromIndex, 1);
        tabs.splice(toIndex, 0, moved);
        return { tabs };
      }),
  }));
}

export const layoutStore = createLayoutStore();
