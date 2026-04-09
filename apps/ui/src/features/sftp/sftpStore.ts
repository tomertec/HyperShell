import { createStore, type StoreApi } from "zustand/vanilla";

import type { FsEntry, SftpEntry } from "@hypershell/shared";

export type SftpPane = "local" | "remote";
export type SftpSortColumn = "name" | "size" | "modifiedAt" | "permissions";
export type SftpSortDirection = "asc" | "desc";

export interface SftpSortState {
  column: SftpSortColumn;
  direction: SftpSortDirection;
}

export interface SftpStoreState {
  sftpSessionId: string;
  localPath: string;
  remotePath: string;
  localEntries: FsEntry[];
  remoteEntries: SftpEntry[];
  localSelection: Set<string>;
  remoteSelection: Set<string>;
  localSortBy: SftpSortState;
  remoteSortBy: SftpSortState;
  localHistory: string[];
  remoteHistory: string[];
  localHistoryIndex: number;
  remoteHistoryIndex: number;
  activePane: SftpPane;
  localCursorIndex: number;
  remoteCursorIndex: number;
  localFilterText: string;
  remoteFilterText: string;
  isLoading: { local: boolean; remote: boolean };
  error: { local: string | null; remote: string | null };
  setActivePane: (pane: SftpPane) => void;
  setCursorIndex: (pane: SftpPane, index: number) => void;
  setFilterText: (pane: SftpPane, text: string) => void;
  setLocalPath: (path: string) => void;
  setRemotePath: (path: string) => void;
  setLocalEntries: (entries: FsEntry[]) => void;
  setRemoteEntries: (entries: SftpEntry[]) => void;
  setLocalSelection: (selection: Set<string>) => void;
  setRemoteSelection: (selection: Set<string>) => void;
  setLocalSortBy: (sortBy: SftpSortState) => void;
  setRemoteSortBy: (sortBy: SftpSortState) => void;
  setLoading: (pane: SftpPane, loading: boolean) => void;
  setError: (pane: SftpPane, error: string | null) => void;
  back: (pane: SftpPane) => void;
  forward: (pane: SftpPane) => void;
}

function pushHistory(
  history: string[],
  historyIndex: number,
  nextPath: string
): { history: string[]; historyIndex: number } {
  const normalized = nextPath.trim();
  const current = history[historyIndex];
  if (current === normalized) {
    return { history, historyIndex };
  }

  const nextHistory = history.slice(0, historyIndex + 1);
  nextHistory.push(normalized);
  return {
    history: nextHistory,
    historyIndex: nextHistory.length - 1
  };
}

function moveHistory(
  history: string[],
  historyIndex: number,
  offset: number
): { path: string; historyIndex: number } | null {
  const nextIndex = historyIndex + offset;
  if (nextIndex < 0 || nextIndex >= history.length) {
    return null;
  }

  return {
    path: history[nextIndex] ?? history[historyIndex] ?? "",
    historyIndex: nextIndex
  };
}

export function createSftpStore(sftpSessionId: string): StoreApi<SftpStoreState> {
  return createStore<SftpStoreState>()((set) => ({
    sftpSessionId,
    localPath: "",
    remotePath: "/",
    localEntries: [],
    remoteEntries: [],
    localSelection: new Set<string>(),
    remoteSelection: new Set<string>(),
    localSortBy: { column: "name", direction: "asc" },
    remoteSortBy: { column: "name", direction: "asc" },
    localHistory: [],
    remoteHistory: ["/"],
    localHistoryIndex: -1,
    remoteHistoryIndex: 0,
    activePane: "local" as SftpPane,
    localCursorIndex: 0,
    remoteCursorIndex: 0,
    localFilterText: "",
    remoteFilterText: "",
    isLoading: { local: false, remote: false },
    error: { local: null, remote: null },

    setActivePane: (pane) => set({ activePane: pane }),

    setCursorIndex: (pane, index) =>
      set(pane === "local" ? { localCursorIndex: index } : { remoteCursorIndex: index }),

    setFilterText: (pane, text) =>
      set(pane === "local" ? { localFilterText: text } : { remoteFilterText: text }),

    setLocalPath: (path) =>
      set((state) => {
        const { history, historyIndex } = pushHistory(
          state.localHistory,
          state.localHistoryIndex,
          path
        );

        return {
          localPath: path.trim(),
          localHistory: history,
          localHistoryIndex: historyIndex,
          localCursorIndex: 0,
          localFilterText: ""
        };
      }),

    setRemotePath: (path) =>
      set((state) => {
        const { history, historyIndex } = pushHistory(
          state.remoteHistory,
          state.remoteHistoryIndex,
          path
        );

        return {
          remotePath: path.trim(),
          remoteHistory: history,
          remoteHistoryIndex: historyIndex,
          remoteCursorIndex: 0,
          remoteFilterText: ""
        };
      }),

    setLocalEntries: (entries) => set({ localEntries: [...entries] }),
    setRemoteEntries: (entries) => set({ remoteEntries: [...entries] }),

    setLocalSelection: (selection) =>
      set({ localSelection: new Set(selection) }),

    setRemoteSelection: (selection) =>
      set({ remoteSelection: new Set(selection) }),

    setLocalSortBy: (sortBy) => set({ localSortBy: { ...sortBy } }),
    setRemoteSortBy: (sortBy) => set({ remoteSortBy: { ...sortBy } }),

    setLoading: (pane, loading) =>
      set((state) => ({
        isLoading: { ...state.isLoading, [pane]: loading }
      })),

    setError: (pane, error) =>
      set((state) => ({
        error: { ...state.error, [pane]: error }
      })),

    back: (pane) =>
      set((state) => {
        if (pane === "local") {
          const moved = moveHistory(
            state.localHistory,
            state.localHistoryIndex,
            -1
          );
          if (!moved) {
            return state;
          }

          return {
            localPath: moved.path,
            localHistoryIndex: moved.historyIndex
          };
        }

        const moved = moveHistory(
          state.remoteHistory,
          state.remoteHistoryIndex,
          -1
        );
        if (!moved) {
          return state;
        }

        return {
          remotePath: moved.path,
          remoteHistoryIndex: moved.historyIndex
        };
      }),

    forward: (pane) =>
      set((state) => {
        if (pane === "local") {
          const moved = moveHistory(
            state.localHistory,
            state.localHistoryIndex,
            1
          );
          if (!moved) {
            return state;
          }

          return {
            localPath: moved.path,
            localHistoryIndex: moved.historyIndex
          };
        }

        const moved = moveHistory(
          state.remoteHistory,
          state.remoteHistoryIndex,
          1
        );
        if (!moved) {
          return state;
        }

        return {
          remotePath: moved.path,
          remoteHistoryIndex: moved.historyIndex
        };
      })
  }));
}

const sftpStores = new Map<string, StoreApi<SftpStoreState>>();

export function getSftpStore(sftpSessionId: string): StoreApi<SftpStoreState> {
  const existing = sftpStores.get(sftpSessionId);
  if (existing) {
    return existing;
  }

  const store = createSftpStore(sftpSessionId);
  sftpStores.set(sftpSessionId, store);
  return store;
}

export function disposeSftpStore(sftpSessionId: string): void {
  sftpStores.delete(sftpSessionId);
}
