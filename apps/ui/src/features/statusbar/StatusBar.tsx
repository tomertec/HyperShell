import { useStore } from "zustand";
import { layoutStore } from "../layout/layoutStore";
import { sessionStateStore } from "../sessions/sessionStateStore";
import { useSessionStats, formatDuration } from "./useSessionStats";

function ClockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M6 3.5V6L7.5 7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M1 9L4 6L6.5 8L10 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChipIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <rect x="3" y="3" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4.5 1.5V3M7.5 1.5V3M4.5 9V10.5M7.5 9V10.5M1.5 4.5H3M1.5 7.5H3M9 4.5H10.5M9 7.5H10.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function RamIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <rect x="1" y="3.5" width="10" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3 3.5V2.5M5 3.5V2.5M7 3.5V2.5M9 3.5V2.5M3 8.5V9.5M9 8.5V9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M3 6H4.5M6 6H7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function DatabaseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <ellipse cx="6" cy="3.5" rx="4" ry="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2 3.5V8.5C2 9.33 3.79 10 6 10C8.21 10 10 9.33 10 8.5V3.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2 6C2 6.83 3.79 7.5 6 7.5C8.21 7.5 10 6.83 10 6" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export function StatusBar() {
  const tabs = useStore(layoutStore, (s) => s.tabs);
  const activeSessionId = useStore(layoutStore, (s) => s.activeSessionId);

  const activeTab = tabs.find((t) => t.sessionId === activeSessionId) ?? null;

  const sessions = useStore(sessionStateStore, (s) => s.sessions);
  const sessionState = activeSessionId ? sessions[activeSessionId]?.state ?? null : null;

  const stats = useSessionStats(activeSessionId, sessionState);

  return (
    <div
      className="relative z-10 flex items-center justify-between h-6 px-3 shrink-0 select-none bg-surface"
    >
      {/* Left side */}
      <div className="flex items-center gap-2 text-[11px] overflow-hidden">
        {activeTab ? (
          <>
            {/* Status dot + title */}
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className={[
                  "w-1.5 h-1.5 rounded-full shrink-0",
                  sessionState === "connected"
                    ? "bg-success"
                    : sessionState === "connecting" || sessionState === "reconnecting"
                      ? "bg-warning"
                      : sessionState === "failed"
                        ? "bg-danger"
                        : "bg-text-muted/50"
                ].join(" ")}
              />
              <span className="text-text-primary truncate max-w-[160px]">{activeTab.title}</span>
            </div>

            {/* Transport badge */}
            {activeTab.transport && (
              <span className="px-1.5 py-px rounded text-[10px] uppercase tracking-wide text-text-secondary bg-base-700/60">
                {activeTab.transport}
              </span>
            )}

            {/* Connection time */}
            {stats.connectionTime !== null && (
              <span className="flex items-center gap-1 text-accent">
                <ClockIcon />
                {formatDuration(stats.connectionTime)}
              </span>
            )}

            {/* Latency */}
            {stats.latency !== null && (
              <span className="flex items-center gap-1 text-success">
                <ChartIcon />
                {stats.latency}ms
              </span>
            )}

            {/* CPU */}
            {stats.cpuUsage !== null && (
              <span className="flex items-center gap-1 text-warning">
                <ChipIcon />
                {stats.cpuUsage}
              </span>
            )}

            {/* Memory */}
            {stats.memUsage !== null && (
              <span className="flex items-center gap-1 text-info">
                <RamIcon />
                {stats.memUsage}
              </span>
            )}

            {/* Disk */}
            {stats.diskUsage !== null && (
              <span className="flex items-center gap-1 text-cyan-400">
                <DatabaseIcon />
                {stats.diskUsage}
              </span>
            )}

            {/* Uptime */}
            {stats.uptime !== null && (
              <span className="flex items-center gap-1 text-success">
                <ClockIcon />
                {stats.uptime}
              </span>
            )}
          </>
        ) : (
          <span className="text-text-muted">No active session</span>
        )}
      </div>

      {/* Right side */}
      <div className="flex items-center shrink-0 ml-2">
        <span className="text-[11px] text-text-muted">
          {tabs.length} session{tabs.length !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}
