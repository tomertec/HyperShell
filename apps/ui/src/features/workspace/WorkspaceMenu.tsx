import { useState, useEffect, useRef } from "react";
import { layoutStore } from "../layout/layoutStore";

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
    const list = await window.hypershell?.workspaceList?.();
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
    const state = layoutStore.getState();
    const layout = {
      tabs: state.tabs.map((t) => ({
        transport: t.transport ?? ("ssh" as const),
        profileId: t.profileId ?? t.sessionId,
        title: t.title,
        type: t.type,
        hostId: t.hostId,
      })),
      splitDirection: state.splitDirection,
      paneSizes: state.paneSizes,
      paneCount: state.panes.length,
    };
    await window.hypershell?.workspaceSave?.({ name: trimmed, layout });
    setNewName("");
    setSaving(false);
    await refresh();
  };

  const handleLoad = async (name: string) => {
    const result = await window.hypershell?.workspaceLoad?.({ name });
    if (!result?.layout) return;

    // Close existing tabs
    const currentTabs = layoutStore.getState().tabs;
    for (const tab of currentTabs) {
      void window.hypershell?.closeSession?.({ sessionId: tab.sessionId }).catch(() => {});
    }
    layoutStore.setState({
      tabs: [],
      activeSessionId: null,
      panes: [{ paneId: "pane-1", sessionId: null }],
    });

    // Re-open sessions from workspace
    for (const tab of result.layout.tabs) {
      layoutStore.getState().openTab({
        sessionId: `ws-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        title: tab.title,
        transport: tab.transport as "ssh" | "serial" | "sftp",
        profileId: tab.profileId,
        type: (tab.type as "terminal" | "sftp") ?? "terminal",
        hostId: tab.hostId,
      });
    }

    if (result.layout.splitDirection) {
      layoutStore.setState({ splitDirection: result.layout.splitDirection });
    }
    if (result.layout.paneSizes) {
      layoutStore.setState({ paneSizes: result.layout.paneSizes });
    }
    onClose();
  };

  const handleRemove = async (name: string) => {
    await window.hypershell?.workspaceRemove?.({ name });
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
