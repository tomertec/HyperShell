import { createStore } from "zustand/vanilla";
import type { WorkspaceLayout, WorkspaceTab } from "@hypershell/shared";
import {
  normalizeTerminalFontSize,
  settingsStore,
} from "../settings/settingsStore";

export type LayoutTab = {
  tabKey?: string;
  sessionId: string;
  title: string;
  dynamicTitle?: string;
  /** Foreground program reported by the main-process poller. Local tabs only. */
  processTitle?: string;
  transport?: "ssh" | "serial" | "sftp" | "telnet" | "local";
  telnetOptions?: { hostname: string; port: number; mode: "telnet" | "raw"; terminalType?: string };
  profileId?: string;
  preopened?: boolean;
  type?: "terminal" | "sftp";
  sftpSessionId?: string;
  hostId?: string;
  tmuxAttachTarget?: string;
  fontSize?: number;
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
  setTabDynamicTitle: (sessionId: string, title: string | null) => void;
  setTabProcessTitle: (sessionId: string, name: string | null) => void;
  setTabFontSize: (sessionId: string, fontSize: number) => void;
};

function equalPaneSizes(count: number): number[] {
  const equalSize = Math.round(100 / count);
  return Array.from({ length: count }, (_, i) =>
    i < count - 1 ? equalSize : 100 - equalSize * (count - 1)
  );
}

export function createLayoutStore(
  getDefaultTerminalFontSize: () => number = () =>
    settingsStore.getState().settings.terminal.fontSize
) {
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
        const nextTab =
          tab.type === "sftp"
            ? tab
            : {
                ...tab,
                fontSize: normalizeTerminalFontSize(
                  tab.fontSize ?? getDefaultTerminalFontSize()
                ),
              };
        const tabs = state.tabs.some((t) => t.sessionId === tab.sessionId)
          ? state.tabs
          : [...state.tabs, { ...nextTab, tabKey: tab.tabKey ?? tab.sessionId }];
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
        const sizes = equalPaneSizes(nextPanes.length);
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
        const sizes = equalPaneSizes(nextPanes.length);
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

    setTabDynamicTitle: (sessionId, title) =>
      set((state) => {
        const index = state.tabs.findIndex((t) => t.sessionId === sessionId);
        if (index === -1) {
          return state;
        }
        const current = state.tabs[index];
        if ((current.dynamicTitle ?? null) === title) {
          return state;
        }
        const tabs = state.tabs.slice();
        if (title === null) {
          const { dynamicTitle: _cleared, ...rest } = current;
          tabs[index] = rest;
        } else {
          tabs[index] = { ...current, dynamicTitle: title };
        }
        return { tabs };
      }),

    setTabProcessTitle: (sessionId, name) =>
      set((state) => {
        const index = state.tabs.findIndex((tab) => tab.sessionId === sessionId);
        if (index === -1) {
          return state;
        }

        const current = state.tabs[index];
        if ((current.processTitle ?? null) === name) {
          return state;
        }

        const tabs = [...state.tabs];
        if (name === null) {
          const { processTitle: _cleared, ...rest } = current;
          tabs[index] = rest;
        } else {
          tabs[index] = { ...current, processTitle: name };
        }

        return { tabs };
      }),

    setTabFontSize: (sessionId, fontSize) =>
      set((state) => {
        const index = state.tabs.findIndex((tab) => tab.sessionId === sessionId);
        if (index === -1 || state.tabs[index].type === "sftp") {
          return state;
        }

        const normalizedFontSize = normalizeTerminalFontSize(fontSize);
        if (state.tabs[index].fontSize === normalizedFontSize) {
          return state;
        }

        const tabs = [...state.tabs];
        tabs[index] = { ...tabs[index], fontSize: normalizedFontSize };
        return { tabs };
      }),
  }));
}

export const layoutStore = createLayoutStore();

export function serializeWorkspaceLayout(
  state: Pick<
    LayoutState,
    "tabs" | "splitDirection" | "paneSizes" | "panes"
  >
): WorkspaceLayout {
  return {
    tabs: state.tabs.map((tab) => ({
      transport: tab.transport ?? "ssh",
      profileId: tab.profileId ?? tab.sessionId,
      title: tab.title,
      type: tab.type,
      hostId: tab.hostId,
      fontSize: tab.fontSize,
    })),
    splitDirection: state.splitDirection,
    paneSizes: state.paneSizes,
    paneCount: state.panes.length,
  };
}

export function workspaceTabToLayoutTab(
  tab: WorkspaceTab,
  sessionId: string
): LayoutTab {
  return {
    sessionId,
    title: tab.title,
    transport: tab.transport,
    profileId: tab.profileId,
    type: tab.type ?? "terminal",
    hostId: tab.hostId,
    fontSize: tab.fontSize,
  };
}

/** Single source of truth for what a tab is called. */
export function resolveTabTitle(tab: LayoutTab): string {
  return tab.processTitle ?? tab.dynamicTitle ?? tab.title;
}
