import { useMemo } from "react";
import { useStore } from "zustand";
import { broadcastStore } from "./broadcastStore";
import { layoutStore } from "../layout/layoutStore";

/** Icon button for the top-right toolbar — toggles broadcast on/off */
export function BroadcastButton() {
  const enabled = useStore(broadcastStore, (s) => s.enabled);
  const toggle = useStore(broadcastStore, (s) => s.toggle);

  return (
    <button
      onClick={toggle}
      className={`p-1.5 rounded transition-colors ${
        enabled
          ? "text-warning hover:bg-warning/20"
          : "text-text-muted hover:text-text-primary hover:bg-base-700/60"
      }`}
      title={enabled ? "Stop broadcast" : "Broadcast to all sessions"}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
        <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.4" />
        <circle cx="12" cy="12" r="2" />
        <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.4" />
        <path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1" />
      </svg>
    </button>
  );
}

/** Active broadcast bar — renders above tabs when broadcast is enabled */
export function BroadcastBar() {
  const enabled = useStore(broadcastStore, (s) => s.enabled);
  const targets = useStore(broadcastStore, (s) => s.targetSessionIds);
  const toggle = useStore(broadcastStore, (s) => s.toggle);
  const setTargets = useStore(broadcastStore, (s) => s.setTargets);
  const tabs = useStore(layoutStore, (s) => s.tabs);

  const activeSessionIds = useMemo(
    () => new Set(tabs.map((t) => t.sessionId)),
    [tabs]
  );
  const activeTargets = useMemo(
    () => targets.filter((id) => activeSessionIds.has(id)),
    [targets, activeSessionIds]
  );

  if (!enabled) return null;

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
        Input sent to {activeTargets.length} session{activeTargets.length !== 1 ? "s" : ""}
      </span>

      <div className="flex gap-1 ml-2">
        {tabs.map((tab) => {
          const isTarget = activeTargets.includes(tab.sessionId);
          return (
            <button
              key={tab.sessionId}
              onClick={() => {
                const next = isTarget
                  ? activeTargets.filter((id) => id !== tab.sessionId)
                  : [...activeTargets, tab.sessionId];
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
