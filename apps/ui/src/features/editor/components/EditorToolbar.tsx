import { useStore } from "zustand";
import type { EditorState, EditorTab } from "../stores/editorStore";
import type { StoreApi } from "zustand/vanilla";
import { FONT_SIZE_MIN, FONT_SIZE_MAX } from "./editorConstants";

interface EditorToolbarProps {
  store: StoreApi<EditorState>;
  onSave: () => void;
  saving: boolean;
  disabled: boolean;
}

function selectActiveTab(s: EditorState): EditorTab | undefined {
  return s.tabs.find((t) => t.id === s.activeTabId);
}

export function EditorToolbar({ store, onSave, saving, disabled }: EditorToolbarProps) {
  const settings = useStore(store, (s) => s.settings);
  const updateSettings = useStore(store, (s) => s.updateSettings);
  const activeTab = useStore(store, selectActiveTab);
  const canSave = activeTab?.dirty && !saving && !disabled;

  return (
    <div className="flex items-center justify-between border-b border-base-700 bg-base-800/80 px-3 py-1.5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          className={`rounded px-2 py-0.5 text-xs transition-colors ${
            settings.wordWrap
              ? "bg-accent/20 text-accent"
              : "text-text-secondary hover:text-text-primary"
          }`}
          onClick={() => updateSettings({ wordWrap: !settings.wordWrap })}
          title="Toggle word wrap"
        >
          Wrap
        </button>

        <div className="flex items-center gap-1 text-xs text-text-secondary">
          <span>Indent:</span>
          <select
            className="rounded border border-base-600 bg-base-700 px-1.5 py-0.5 text-xs text-text-primary"
            value={settings.indentSize}
            onChange={(e) => updateSettings({ indentSize: Number(e.target.value) })}
          >
            <option value={2}>2</option>
            <option value={4}>4</option>
            <option value={8}>8</option>
          </select>
        </div>

        <div className="flex items-center gap-1 text-xs text-text-secondary">
          <span>Font:</span>
          <button
            type="button"
            className="rounded border border-base-600 px-1.5 py-0.5 text-xs hover:bg-base-700"
            onClick={() => updateSettings({ fontSize: Math.max(FONT_SIZE_MIN, settings.fontSize - 1) })}
          >
            -
          </button>
          <span className="w-6 text-center text-text-primary">{settings.fontSize}</span>
          <button
            type="button"
            className="rounded border border-base-600 px-1.5 py-0.5 text-xs hover:bg-base-700"
            onClick={() => updateSettings({ fontSize: Math.min(FONT_SIZE_MAX, settings.fontSize + 1) })}
          >
            +
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {activeTab?.error && (
          <span className="text-xs text-red-400">{activeTab.error}</span>
        )}
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          className="rounded bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent/80 disabled:opacity-40"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
