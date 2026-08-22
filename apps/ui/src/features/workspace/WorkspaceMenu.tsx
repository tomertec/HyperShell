import { useState, useEffect, useRef } from "react";
import { getShell } from "../../lib/shell";
import {
  layoutStore,
  restorableWorkspaceTabs,
  serializeWorkspaceLayout,
  workspaceTabToLayoutTab,
} from "../layout/layoutStore";

interface WorkspaceRecord {
  name: string;
  updatedAt: string;
}

export function WorkspaceMenu({ onClose }: { onClose: () => void }) {
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([]);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const refresh = async () => {
    const list = await getShell().workspaceList();
    if (list) setWorkspaces(list.filter((w: WorkspaceRecord) => w.name !== "__last__"));
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (
        target instanceof Element &&
        target.closest('[data-workspace-menu-toggle="true"]')
      ) {
        return;
      }
      if (menuRef.current?.contains(target)) return;
      onClose();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const handleSave = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setSaving(true);
    const layout = serializeWorkspaceLayout(layoutStore.getState());
    await getShell().workspaceSave({ name: trimmed, layout });
    setNewName("");
    setSaving(false);
    await refresh();
  };

  const handleLoad = async (name: string) => {
    const result = await getShell().workspaceLoad({ name });
    if (!result?.layout) return;

    // Close existing tabs
    const currentTabs = layoutStore.getState().tabs;
    for (const tab of currentTabs) {
      void getShell().closeSession({ sessionId: tab.sessionId }).catch(() => {});
    }
    layoutStore.setState({
      tabs: [],
      activeSessionId: null,
      panes: [{ paneId: "pane-1", sessionId: null }],
      // Collapsing to one pane invalidates the rest of the pane state too: a
      // stale activePaneId from a split layout would leave openTab below with
      // no matching pane (tabs restore but none shows), and stale sizes would
      // render the single pane at the old first-pane width.
      activePaneId: "pane-1",
      paneSizes: [100],
    });

    // Re-open sessions from workspace
    for (const tab of restorableWorkspaceTabs(result.layout.tabs)) {
      layoutStore.getState().openTab(
        workspaceTabToLayoutTab(
          tab,
          `ws-${Date.now()}-${Math.random().toString(36).slice(2)}`
        )
      );
    }

    if (result.layout.splitDirection) {
      layoutStore.setState({ splitDirection: result.layout.splitDirection });
    }
    // Sizes only make sense for the panes that actually exist after restore
    // (currently always the single pane reset above). Legacy layouts saved
    // with more entries — multi-pane saves, or SFTP panes serialized before
    // they were excluded — would leave that one pane at a fraction of the
    // window, with nothing beside it.
    if (result.layout.paneSizes?.length === layoutStore.getState().panes.length) {
      layoutStore.setState({ paneSizes: result.layout.paneSizes });
    }
    onClose();
  };

  const handleRemove = async (name: string) => {
    await getShell().workspaceRemove({ name });
    await refresh();
  };

  return (
    <div
      ref={menuRef}
      className="absolute top-8 right-0 z-50 w-64 rounded-lg border border-border bg-base-800 shadow-xl p-3 grid gap-3"
    >
      <div className="text-xs font-semibold text-text-primary">Workspaces</div>

      {workspaces.length > 0 && (
        <div className="grid gap-1 max-h-40 overflow-y-auto">
          {workspaces.map((ws) => (
            <div key={ws.name} className="flex items-center justify-between group">
              <button
                onClick={() => void handleLoad(ws.name)}
                className="flex-1 text-left text-xs text-text-secondary hover:text-text-primary px-2 py-1.5 rounded hover:bg-base-700 transition-colors truncate"
              >
                {ws.name}
              </button>
              <button
                onClick={() => void handleRemove(ws.name)}
                className="hidden group-hover:block px-1 text-text-muted hover:text-danger text-xs"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-1.5">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Workspace name"
          className="flex-1 rounded border border-border bg-surface/80 px-2 py-1.5 text-xs text-text-primary placeholder:text-text-muted/60 focus:outline-none focus:border-accent/40"
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleSave();
          }}
        />
        <button
          onClick={() => void handleSave()}
          disabled={!newName.trim() || saving}
          className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-40 transition-colors"
        >
          Save
        </button>
      </div>
    </div>
  );
}
