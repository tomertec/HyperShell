import { useStore } from "zustand";
import { broadcastStore } from "./broadcastStore";
import { layoutStore } from "../layout/layoutStore";

export function BroadcastBar() {
  const enabled = useStore(broadcastStore, (s) => s.enabled);
  const targets = useStore(broadcastStore, (s) => s.targetSessionIds);
  const toggle = useStore(broadcastStore, (s) => s.toggle);
  const setTargets = useStore(broadcastStore, (s) => s.setTargets);
  const tabs = useStore(layoutStore, (s) => s.tabs);

  if (!enabled) {
    return (
      <button
        onClick={toggle}
        className="px-3 py-1 text-xs text-text-muted hover:text-text-primary transition-colors"
        title="Enable broadcast mode"
      >
        Broadcast
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-warning/10 border-b border-warning/30">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-warning opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-warning" />
      </span>
      <span className="text-xs font-medium text-warning">
        BROADCAST ACTIVE
      </span>
      <span className="text-xs text-text-muted mx-1">
        Input sent to {targets.length} session{targets.length !== 1 ? "s" : ""}
      </span>

      <div className="flex gap-1 ml-2">
        {tabs.map((tab) => {
          const isTarget = targets.includes(tab.sessionId);
          return (
            <button
              key={tab.sessionId}
              onClick={() => {
                const next = isTarget
                  ? targets.filter((id) => id !== tab.sessionId)
                  : [...targets, tab.sessionId];
                setTargets(next);
              }}
              className={`px-2 py-0.5 rounded text-[11px] border transition-colors ${
                isTarget
                  ? "border-warning/40 bg-warning/15 text-warning"
                  : "border-border bg-base-800 text-text-muted hover:text-text-primary"
              }`}
            >
              {tab.title}
            </button>
          );
        })}
      </div>

      <button
        onClick={toggle}
        className="ml-auto px-2 py-0.5 rounded text-xs text-warning hover:bg-warning/20 transition-colors"
      >
        Stop
      </button>
    </div>
  );
}
