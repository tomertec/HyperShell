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
  /** Claude Code conversation running in this tab, for resume after restart. */
  claudeSessionId?: string;
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
  focusSession: (sessionId: string) => void;
  setPaneSizes: (sizes: number[]) => void;
  moveTab: (fromIndex: number, toIndex: number) => void;
  setTabDynamicTitle: (sessionId: string, title: string | null) => void;
  setTabProcessTitle: (sessionId: string, name: string | null) => void;
  setTabFontSize: (sessionId: string, fontSize: number) => void;
  setTabClaudeSessionId: (
    sessionId: string,
    claudeSessionId: string | null
  ) => void;
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

    // What a click on a pane would do, driven from the terminal's own focus
    // instead: a native surface swallows the click that Workspace's onClick
    // handler is waiting for, so clicking a terminal in a split never made its
    // pane active. Focus events repeat and can arrive for a session no pane
    // holds any more, so this acts only on a session a pane currently shows,
    // and returns the same state when that pane is already the active one.
    focusSession: (sessionId) =>
      set((state) => {
        const pane = state.panes.find((p) => p.sessionId === sessionId);
        if (!pane) {
          return state;
        }
        if (state.activePaneId === pane.paneId && state.activeSessionId === sessionId) {
          return state;
        }
        return { activePaneId: pane.paneId, activeSessionId: sessionId };
      }),

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

    // Null clears the tab's conversation: Claude is no longer running there,
    // so a restore must bring back a plain shell.
    setTabClaudeSessionId: (sessionId, claudeSessionId) =>
      set((state) => {
        const next = claudeSessionId ?? undefined;
        const index = state.tabs.findIndex((tab) => tab.sessionId === sessionId);
        if (index === -1 || state.tabs[index].claudeSessionId === next) {
          return state;
        }

        const tabs = [...state.tabs];
        tabs[index] = { ...tabs[index], claudeSessionId: next };
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
  // SFTP tabs are dropped: the session behind one is a live ssh2 connection
  // owned by the main process that dies with the app, and an SFTP tab carries
  // no profileId — the `?? tab.sessionId` fallback below would persist the
  // synthetic `sftp-tab-<id>` string, which restore then hands to the SSH
  // transport as a hostname.
  const sftpSessionIds = new Set(
    state.tabs.filter((tab) => tab.type === "sftp").map((tab) => tab.sessionId)
  );

  // Panes go with their tabs: a pane hosting a dropped SFTP tab is not counted,
  // or paneSizes would describe panes the restored layout doesn't have — a
  // single surviving pane rendered at its old 50% width, half the workspace
  // blank. When any pane is dropped the remaining sizes no longer sum to 100,
  // so they are re-derived rather than partially kept.
  const keptPaneCount = Math.max(
    1,
    state.panes.filter(
      (pane) => pane.sessionId === null || !sftpSessionIds.has(pane.sessionId)
    ).length
  );

  return {
    tabs: state.tabs
      .filter((tab) => tab.type !== "sftp")
      .map((tab) => ({
        transport: tab.transport ?? "ssh",
        profileId: tab.profileId ?? tab.sessionId,
        title: tab.title,
        type: tab.type,
        hostId: tab.hostId,
        fontSize: tab.fontSize,
        claudeSessionId: tab.claudeSessionId,
      })),
    splitDirection: state.splitDirection,
    paneSizes:
      keptPaneCount === state.panes.length
        ? state.paneSizes
        : equalPaneSizes(keptPaneCount),
    paneCount: keptPaneCount,
  };
}

/**
 * Filters a saved layout down to the tabs that can actually be reopened.
 *
 * Workspaces saved before SFTP tabs were excluded still carry them, with
 * `profileId` holding the synthetic `sftp-tab-<id>` string. Restoring one
 * produced an SSH tab that dialled that string as a hostname, so old rows are
 * dropped here, on the read side, where legacy data has to be handled.
 */
export function restorableWorkspaceTabs(tabs: WorkspaceTab[]): WorkspaceTab[] {
  return tabs.filter((tab) => tab.type !== "sftp");
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
    claudeSessionId: tab.claudeSessionId,
  };
}

/**
 * Processes that keep their own OSC title current (e.g. Claude Code emits the
 * session topic). For these the generic process name would mask a better
 * title, so the dynamic title wins when present.
 */
const SELF_TITLED_PROCESSES = new Set(["claude"]);

/** Single source of truth for what a tab is called. */
export function resolveTabTitle(tab: LayoutTab): string {
  if (tab.processTitle && SELF_TITLED_PROCESSES.has(tab.processTitle) && tab.dynamicTitle) {
    return tab.dynamicTitle;
  }
  return tab.processTitle ?? tab.dynamicTitle ?? tab.title;
}
