import { useStore } from "zustand";
import type { EditorState } from "../stores/editorStore";
import type { StoreApi } from "zustand/vanilla";

interface EditorTabBarProps {
  store: StoreApi<EditorState>;
  onCloseTab: (tabId: string) => void;
}

export function EditorTabBar({ store, onCloseTab }: EditorTabBarProps) {
  const tabs = useStore(store, (s) => s.tabs);
  const activeTabId = useStore(store, (s) => s.activeTabId);
  const setActiveTab = useStore(store, (s) => s.setActiveTab);

  return (
    <div className="flex items-center overflow-x-auto border-b border-base-700 bg-base-800">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`group flex items-center gap-2 border-r border-base-700 px-3 py-2 text-sm transition-colors ${
            tab.id === activeTabId
              ? "bg-base-900 text-text-primary"
              : "text-text-secondary hover:bg-base-700/50 hover:text-text-primary"
          }`}
          onClick={() => setActiveTab(tab.id)}
        >
          <span className="max-w-[160px] truncate font-mono text-xs">
            {tab.fileName}
          </span>
          {tab.dirty && (
            <span className="h-2 w-2 rounded-full bg-yellow-400" title="Modified" />
          )}
          <button
            type="button"
            className="ml-1 opacity-0 group-hover:opacity-100 hover:text-red-400"
            onClick={(e) => {
              e.stopPropagation();
              onCloseTab(tab.id);
            }}
            title="Close"
          >
            &times;
          </button>
        </button>
      ))}
    </div>
  );
}
