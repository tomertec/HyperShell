import { useStore } from "zustand";
import type { EditorState, EditorTab } from "../stores/editorStore";
import type { StoreApi } from "zustand/vanilla";

interface EditorStatusBarProps {
  store: StoreApi<EditorState>;
}

function selectActiveTab(s: EditorState): EditorTab | undefined {
  return s.tabs.find((t) => t.id === s.activeTabId);
}

export function EditorStatusBar({ store }: EditorStatusBarProps) {
  const activeTab = useStore(store, selectActiveTab);
  const settings = useStore(store, (s) => s.settings);
  const sessionDisconnected = useStore(store, (s) => s.sessionDisconnected);

  if (!activeTab) return null;

  return (
    <div className="flex items-center justify-between border-t border-base-700 bg-base-800 px-3 py-1 text-xs text-text-secondary">
      <div className="flex items-center gap-4">
        <span>Ln {activeTab.cursorLine}, Col {activeTab.cursorCol}</span>
        <span>UTF-8</span>
        <span>{activeTab.language}</span>
        <span>{settings.indentWithTabs ? "Tabs" : "Spaces"}: {settings.indentSize}</span>
        <span>LF</span>
      </div>
      <div className="flex items-center gap-3">
        {sessionDisconnected && (
          <span className="font-medium text-red-400">Disconnected</span>
        )}
        {activeTab.remotePath && (
          <span className="max-w-[300px] truncate" title={activeTab.remotePath}>
            {activeTab.remotePath}
          </span>
        )}
      </div>
    </div>
  );
}
