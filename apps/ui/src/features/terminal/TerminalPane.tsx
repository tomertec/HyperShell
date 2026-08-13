import { useCallback, useEffect, useState, type DragEvent } from "react";
import { useStore } from "zustand";

import { extractDroppedPaths, formatPathsForTerminal } from "../../lib/droppedFilePaths";
import { useTerminalSession } from "./useTerminalSession";
import { TerminalReconnectOverlay } from "./TerminalReconnectOverlay";
import { TerminalSearchBar } from "./TerminalSearchBar";
import { LoggingButton } from "./LoggingButton";
import { ClaudeResumePrompt } from "./ClaudeResumePrompt";
import { settingsStore } from "../settings/settingsStore";

export interface TerminalPaneProps {
  transport: "ssh" | "serial" | "telnet" | "local";
  profileId: string;
  sessionId?: string;
  autoConnect?: boolean;
  isVisible?: boolean;
  telnetOptions?: { hostname: string; port: number; mode: "telnet" | "raw"; terminalType?: string };
  tmuxAttachTarget?: string;
  claudeResumeSessionId?: string;
  fontSize: number;
  onFontSizeChange: (fontSize: number) => void;
  onSessionOpened?: (sessionId: string) => void;
  onClaudeSessionId?: (sessionId: string, claudeSessionId: string) => void;
  onProcessExit?: (exitCode: number | null) => void;
}

export function TerminalPane({
  transport,
  profileId,
  sessionId,
  autoConnect,
  isVisible = true,
  telnetOptions,
  tmuxAttachTarget,
  claudeResumeSessionId,
  fontSize,
  onFontSizeChange,
  onSessionOpened,
  onClaudeSessionId,
  onProcessExit
}: TerminalPaneProps) {
  const [dtr, setDtr] = useState(true);
  const [rts, setRts] = useState(true);
  const [dropActive, setDropActive] = useState(false);
  // A restored tab asks before reattaching to its old Claude conversation.
  // Tabs without one skip straight to "fresh", which is just a normal launch.
  const [resumeChoice, setResumeChoice] = useState<"pending" | "resume" | "fresh">(
    claudeResumeSessionId ? "pending" : "fresh"
  );
  const chooseResume = useCallback(() => setResumeChoice("resume"), []);
  const chooseFresh = useCallback(() => setResumeChoice("fresh"), []);
  const showRecordingButton = useStore(settingsStore, (s) => s.settings.general.showRecordingButton);

  const session = useTerminalSession({
    transport,
    profileId,
    sessionId,
    // Hold the launch until the user has answered the resume prompt.
    autoConnect: resumeChoice === "pending" ? false : autoConnect,
    telnetOptions,
    tmuxAttachTarget,
    claudeResumeSessionId: resumeChoice === "resume" ? claudeResumeSessionId : undefined,
    fontSize,
    onFontSizeChange,
    onSessionOpened,
    onClaudeSessionId,
    onExit: onProcessExit
  });
  const { fit, focusTerminal, terminal } = session;

  useEffect(() => {
    fit();
  }, [fit]);

  useEffect(() => {
    if (!isVisible || !terminal) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      fit();
      focusTerminal();
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [fit, focusTerminal, isVisible, terminal]);

  // Dropping a file inserts its path as terminal input, like Windows Terminal.
  const canAcceptDrop = session.state === "connected" && Boolean(session.sessionId);

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!canAcceptDrop) {
      return;
    }

    // Required: without preventDefault here the drop event never fires.
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDropActive(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    // Ignore the dragleave fired when crossing into xterm's own child nodes.
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }

    setDropActive(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!canAcceptDrop) {
      return;
    }

    event.preventDefault();
    setDropActive(false);

    const paths = extractDroppedPaths(event.dataTransfer);
    if (paths.length === 0) {
      return;
    }

    session.write(formatPathsForTerminal(paths));
    focusTerminal();
  };

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
                  void window.hypershell?.setSessionSignals?.({
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
        className={`flex-1 min-h-0 relative ${dropActive ? "ring-2 ring-inset ring-accent/50" : ""}`}
        style={{ backgroundColor: "var(--terminal-bg, var(--color-surface))" }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
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
          onRetry={() => { void session.connect(); }}
        />
        {resumeChoice === "pending" && claudeResumeSessionId && (
          <ClaudeResumePrompt
            claudeSessionId={claudeResumeSessionId}
            onResume={chooseResume}
            onFresh={chooseFresh}
          />
        )}
        {showRecordingButton && session.sessionId && session.state === "connected" && (
          <div className="absolute top-2 right-2 z-20 flex items-center gap-1 bg-base-800/80 rounded px-1.5 py-0.5 backdrop-blur-sm border border-border/30">
            <LoggingButton
              sessionId={session.sessionId}
              hostId={transport === "ssh" ? profileId : null}
              title={`${transport.toUpperCase()} ${profileId}`}
              width={session.terminal?.cols}
              height={session.terminal?.rows}
            />
          </div>
        )}
      </div>
    </div>
  );
}
