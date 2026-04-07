import { useEffect, useState } from "react";

import { useTerminalSession } from "./useTerminalSession";

export interface TerminalPaneProps {
  transport: "ssh" | "serial";
  profileId: string;
  sessionId?: string;
  autoConnect?: boolean;
  title?: string;
  onSessionOpened?: (sessionId: string) => void;
}

const stateColors: Record<string, string> = {
  connected: "bg-success",
  connecting: "bg-warning",
  disconnected: "bg-text-muted/50",
  error: "bg-danger",
};

const stateGlowColors: Record<string, string> = {
  connected: "bg-success/40",
  connecting: "bg-warning/40",
};

export function TerminalPane({
  transport,
  profileId,
  sessionId,
  autoConnect,
  title = "Terminal",
  onSessionOpened
}: TerminalPaneProps) {
  const [dtr, setDtr] = useState(true);
  const [rts, setRts] = useState(true);

  const session = useTerminalSession({
    transport,
    profileId,
    sessionId,
    autoConnect,
    onSessionOpened
  });
  const { fit } = session;

  useEffect(() => {
    fit();
  }, [fit]);

  const dotColor = stateColors[session.state] ?? stateColors.disconnected;
  const glowColor = stateGlowColors[session.state];

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between gap-4 px-4 py-1.5 border-b border-border bg-base-800">
        <div className="flex items-center gap-3 min-w-0">
          {/* Status dot */}
          <span className="relative flex items-center justify-center shrink-0">
            <span className={`w-2 h-2 rounded-full ${dotColor} transition-colors duration-300`} />
            {glowColor && (
              <span className={`absolute inset-0 w-2 h-2 rounded-full ${glowColor} blur-[3px]`} />
            )}
          </span>
          <div className="min-w-0">
            <div className="text-[13px] font-medium text-text-primary truncate leading-tight">{title}</div>
            <div className="text-[11px] text-text-muted truncate leading-tight">
              {transport.toUpperCase()} &middot; {profileId}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {transport === "serial" && session.state === "connected" && (
            <div className="flex items-center gap-1">
              {([["DTR", dtr, setDtr, "dtr"], ["RTS", rts, setRts, "rts"]] as const).map(
                ([label, value, setter, signal]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      const next = !value;
                      setter(next);
                      window.sshterm?.setSessionSignals?.({
                        sessionId: session.sessionId!,
                        signals: { [signal]: next }
                      });
                    }}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider border transition-all duration-150 ${
                      value
                        ? "bg-success/15 text-success border-success/30"
                        : "bg-base-700/60 text-text-muted border-border/40"
                    }`}
                  >
                    {label}
                  </button>
                )
              )}
            </div>
          )}
          <div className={`text-[10px] uppercase tracking-wider font-medium ${session.state === "connected" ? "text-green-400" : "text-text-muted/70"}`}>{session.state}</div>
        </div>
      </div>

      <div
        className="flex-1 min-h-0 relative"
        style={{ backgroundColor: "var(--terminal-bg, var(--color-surface))" }}
      >
        <div
          ref={session.containerRef}
          className="absolute inset-0"
        />
      </div>
    </div>
  );
}
