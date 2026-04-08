import { createStore } from "zustand/vanilla";

export interface EditorTab {
  id: string;
  remotePath: string;
  fileName: string;
  content: string;
  originalContent: string;
  dirty: boolean;
  loading: boolean;
  error: string | null;
  cursorLine: number;
  cursorCol: number;
  language: string;
}

export interface EditorSettings {
  wordWrap: boolean;
  fontSize: number;
  indentSize: number;
  indentWithTabs: boolean;
}

export interface EditorState {
  sftpSessionId: string;
  tabs: EditorTab[];
  activeTabId: string | null;
  sessionDisconnected: boolean;
  settings: EditorSettings;

  addTab: (tab: Omit<EditorTab, "cursorLine" | "cursorCol">) => void;
  removeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateTab: (tabId: string, patch: Partial<EditorTab>) => void;
  setSessionDisconnected: () => void;
  updateSettings: (patch: Partial<EditorSettings>) => void;
}

export function createEditorStore(sftpSessionId: string) {
  return createStore<EditorState>((set) => ({
    sftpSessionId,
    tabs: [],
    activeTabId: null,
    sessionDisconnected: false,
    settings: {
      wordWrap: false,
      fontSize: 14,
      indentSize: 2,
      indentWithTabs: false,
    },

    addTab: (tab) =>
      set((state) => {
        const existing = state.tabs.find((t) => t.remotePath === tab.remotePath);
        if (existing) {
          return { activeTabId: existing.id };
        }
        return {
          tabs: [...state.tabs, { ...tab, cursorLine: 1, cursorCol: 1 }],
          activeTabId: tab.id,
        };
      }),

    removeTab: (tabId) =>
      set((state) => {
        const idx = state.tabs.findIndex((t) => t.id === tabId);
        const newTabs = state.tabs.filter((t) => t.id !== tabId);
        let newActive = state.activeTabId;
        if (state.activeTabId === tabId) {
          const nextIdx = Math.min(idx, newTabs.length - 1);
          newActive = newTabs[nextIdx]?.id ?? null;
        }
        return { tabs: newTabs, activeTabId: newActive };
      }),

    setActiveTab: (tabId) => set({ activeTabId: tabId }),

    updateTab: (tabId, patch) =>
      set((state) => ({
        tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, ...patch } : t)),
      })),

    setSessionDisconnected: () => set({ sessionDisconnected: true }),

    updateSettings: (patch) =>
      set((state) => ({
        settings: { ...state.settings, ...patch },
      })),
  }));
}
