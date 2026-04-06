import { createStore } from "zustand/vanilla";

export type LayoutTab = {
  tabKey?: string;
  sessionId: string;
  title: string;
  transport?: "ssh" | "serial";
  profileId?: string;
  preopened?: boolean;
};

export type LayoutState = {
  tabs: LayoutTab[];
  activeSessionId: string | null;
  openTab: (tab: LayoutTab) => void;
  activateTab: (sessionId: string) => void;
  replaceSessionId: (oldSessionId: string, nextSessionId: string) => void;
};

export function createLayoutStore() {
  return createStore<LayoutState>()((set) => ({
    tabs: [],
    activeSessionId: null,
    openTab: (tab) =>
      set((state) => ({
        tabs: state.tabs.some((existingTab) => existingTab.sessionId === tab.sessionId)
          ? state.tabs
          : [...state.tabs, { ...tab, tabKey: tab.tabKey ?? tab.sessionId }],
        activeSessionId: tab.sessionId
      })),
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

        return {
          tabs: dedupedTabs,
          activeSessionId:
            state.activeSessionId === oldSessionId
              ? nextSessionId
              : state.activeSessionId
        };
      })
  }));
}

export const layoutStore = createLayoutStore();
