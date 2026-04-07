import { useState } from "react";
import { useTunnelStore } from "./tunnelStore";
import { TunnelTopology } from "./TunnelTopology";
import { TunnelList } from "./TunnelList";
import { TunnelForm } from "./TunnelForm";

export function TunnelManagerPanel() {
  const { showPanel, closePanel, refresh } = useTunnelStore();
  const [showForm, setShowForm] = useState(false);

  if (!showPanel) return null;

  return (
    <div className="flex flex-col h-full border-l border-border bg-base-800 w-[420px] shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-sm font-semibold text-text-primary">Tunnel Manager</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowForm(true)}
            className="text-xs px-2.5 py-1 rounded-lg bg-accent/15 border border-accent/30 text-accent hover:bg-accent/25 transition-colors"
          >
            + New
          </button>
          <button
            onClick={closePanel}
            className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-base-700/60 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 10 10" fill="none">
              <path d="M2.5 2.5L7.5 7.5M7.5 2.5L2.5 7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <TunnelTopology />

        {showForm && (
          <div className="p-3">
            <TunnelForm
              onSubmit={() => { setShowForm(false); void refresh(); }}
              onCancel={() => setShowForm(false)}
            />
          </div>
        )}

        <TunnelList />
      </div>
    </div>
  );
}
