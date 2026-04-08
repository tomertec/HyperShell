import { useEffect, useState } from "react";

import { useTerminalSession } from "./useTerminalSession";
import { TerminalReconnectOverlay } from "./TerminalReconnectOverlay";
import { TerminalSearchBar } from "./TerminalSearchBar";

export interface TerminalPaneProps {
  transport: "ssh" | "serial";
  profileId: string;
  sessionId?: string;
  autoConnect?: boolean;
  onSessionOpened?: (sessionId: string) => void;
}

export function TerminalPane({
  transport,
  profileId,
  sessionId,
  autoConnect,
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


  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Serial signal controls — only shown for serial connections */}
      {transport === "serial" && session.state === "connected" && (
        <div className="flex items-center gap-1 px-3 py-1 border-b border-border bg-base-800">
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

      <div
        className="flex-1 min-h-0 relative"
        style={{ backgroundColor: "var(--terminal-bg, var(--color-surface))" }}
      >
        <div
          ref={session.containerRef}
          className="absolute inset-0"
        />
        {session.searchVisible && (
          <TerminalSearchBar
            searchAddon={session.searchAddon}
            onClose={() => session.setSearchVisible(false)}
            onFocusTerminal={session.focusTerminal}
          />
        )}
        <TerminalReconnectOverlay
          state={session.state}
          onRetry={() => session.connect()}
        />
      </div>
    </div>
  );
}
