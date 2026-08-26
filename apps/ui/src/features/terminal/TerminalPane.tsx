import { useCallback, useEffect, useState, type DragEvent } from "react";
import { useStore } from "zustand";

import { extractDroppedPaths, formatPathsForTerminal } from "../../lib/droppedFilePaths";
import { getShell } from "../../lib/shell";
import { useTerminalSession } from "./useTerminalSession";
import { useGhosttySurface } from "./useGhosttySurface";
import { GhosttyPane } from "./GhosttyPane";
import { terminalOverlayCoversSurface } from "./TerminalReconnectOverlay";
import { LoggingButton } from "./LoggingButton";
import { ClaudeResumePrompt } from "./ClaudeResumePrompt";
import { settingsStore } from "../settings/settingsStore";
import { layoutStore } from "../layout/layoutStore";
import { handlePaneShortcut } from "../layout/paneShortcuts";
import { useSnippetStore } from "../snippets/snippetStore";

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

// The full ctrl+shift+<letter> chord allowlist that maps 1:1 onto
// paneShortcuts.ts's KeyboardEvent-keyed switch (split/close/navigate).
// ctrl+shift+s (snippets) and the font-size chords are handled separately
// below — paneShortcuts.ts has no case for them.
const CHORD_PANE_KEY_MAP: Record<string, string> = {
  "ctrl+shift+d": "D",
  "ctrl+shift+e": "E",
  "ctrl+shift+w": "W",
  "ctrl+shift+[": "[",
  "ctrl+shift+]": "]",
};

// The font-size chords move the persisted per-tab size; useGhosttySurface
// watches that value and pushes the change to the live surface over
// ghostty:surface-config.
//
// Chords arrive one per key event, so holding a chord down repeats it. Zoom
// wants that; splitting and closing panes do not — a held ctrl+shift+d used to
// spray panes across the workspace — so those are rate-limited.
const DESTRUCTIVE_CHORD_COOLDOWN_MS = 300;
const DESTRUCTIVE_CHORDS = new Set(["ctrl+shift+d", "ctrl+shift+e", "ctrl+shift+w"]);
const lastDestructiveChordAt = new Map<string, number>();

/** Exported for tests; module-level state is deliberate — the guard spans the
 *  chord's whole hold, across renders and panes. */
export function isChordRepeat(chord: string, now: number): boolean {
  if (!DESTRUCTIVE_CHORDS.has(chord)) return false;
  const previous = lastDestructiveChordAt.get(chord);
  if (previous !== undefined && now - previous < DESTRUCTIVE_CHORD_COOLDOWN_MS) {
    return true;
  }
  lastDestructiveChordAt.set(chord, now);
  return false;
}

function dispatchGhosttyChord(
  chord: string,
  fontSizeActions: {
    increaseFontSize: () => void;
    decreaseFontSize: () => void;
    resetFontSize: () => void;
  }
): void {
  if (isChordRepeat(chord, Date.now())) {
    return;
  }

  switch (chord) {
    case "ctrl+shift+s":
      useSnippetStore.getState().toggle();
      return;
    case "ctrl+=":
      fontSizeActions.increaseFontSize();
      return;
    case "ctrl+-":
      fontSizeActions.decreaseFontSize();
      return;
    case "ctrl+0":
      fontSizeActions.resetFontSize();
      return;
    default: {
      const key = CHORD_PANE_KEY_MAP[chord];
      if (!key) return;
      handlePaneShortcut(layoutStore, {
        ctrlKey: true,
        metaKey: false,
        shiftKey: true,
        key
      } as KeyboardEvent);
    }
  }
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
  const [grid, setGrid] = useState<{ cols: number; rows: number } | null>(null);
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

  const handleGrid = useCallback(
    (cols: number, rows: number) => {
      session.reportGridSize(cols, rows);
      setGrid({ cols, rows });
    },
    [session.reportGridSize]
  );

  const handleChord = useCallback(
    (chord: string) => {
      dispatchGhosttyChord(chord, session);
    },
    [session]
  );

  // A native surface always paints above the web contents, so the reconnect /
  // offline / failed overlay would sit under a live terminal. Hiding the
  // surface for exactly the states that overlay covers puts it — and its Retry
  // button — back on top.
  const ghostty = useGhosttySurface({
    sessionId: session.sessionId,
    fontSize,
    visible: isVisible && !terminalOverlayCoversSurface(session.state),
    onGrid: handleGrid,
    onChord: handleChord
  });

  useEffect(() => {
    if (isVisible) {
      ghostty.focusSurface();
    }
    // session.sessionId is a dependency (not just read through the stable
    // focusSurface callback) so a session opening while this pane is already
    // visible still focuses it — otherwise a newly opened tab never gets
    // focus, since focusSurface() no-ops at mount when sessionId is still null.
  }, [ghostty.focusSurface, isVisible, session.sessionId]);

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
    // Ignore the dragleave fired when crossing into the surface container's
    // own child nodes.
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
    ghostty.focusSurface();
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
                  void getShell().setSessionSignals({
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
        <GhosttyPane
          containerRef={ghostty.containerRef}
          state={session.state}
          onRetry={() => { void session.connect(); }}
          surfaceError={ghostty.surfaceError}
          onRetrySurface={ghostty.retrySurface}
        />
        {resumeChoice === "pending" && claudeResumeSessionId && (
          <ClaudeResumePrompt
            claudeSessionId={claudeResumeSessionId}
            onResume={chooseResume}
            onFresh={chooseFresh}
          />
        )}
        {session.sessionId && session.state === "connected" && (
          <div className="absolute top-2 right-2 z-20 flex items-center gap-1 bg-base-800/80 rounded px-1.5 py-0.5 backdrop-blur-sm border border-border/30">
            <button
              onClick={() =>
                void getShell().ghosttySurfaceCommand({
                  sessionId: session.sessionId!,
                  command: "toggle_search"
                })
              }
              className="p-1 rounded transition-colors text-text-muted hover:text-text-primary"
              title="Search"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.4" />
                <path d="M10 10l-2.5-2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
            {showRecordingButton && (
              <LoggingButton
                sessionId={session.sessionId}
                hostId={transport === "ssh" ? profileId : null}
                title={`${transport.toUpperCase()} ${profileId}`}
                width={grid?.cols}
                height={grid?.rows}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
