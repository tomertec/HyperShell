import type { RefObject } from "react";
import type { TerminalSessionState } from "./terminalSessionModel";
import { TerminalReconnectOverlay } from "./TerminalReconnectOverlay";

export interface GhosttyPaneProps {
  containerRef: RefObject<HTMLDivElement | null>;
  state: TerminalSessionState;
  onRetry: () => void;
  /** Set when the native surface itself died (see useGhosttySurface). It
   *  outranks the session overlay: the session may still be perfectly healthy,
   *  but there is nothing left to draw it with. */
  surfaceError?: string | null;
  onRetrySurface?: () => void;
}

/**
 * Presentational: the native ghostty surface renders into the plain div
 * below (see useGhosttySurface.ts, which the caller drives — this component
 * doesn't call it itself, matching how TerminalPane already owns
 * useTerminalSession directly). The status overlays stay in the DOM: they
 * show when the surface is hidden or hasn't been created yet.
 */
export function GhosttyPane({
  containerRef,
  state,
  onRetry,
  surfaceError = null,
  onRetrySurface
}: GhosttyPaneProps) {
  return (
    <>
      <div ref={containerRef} className="h-full w-full" data-testid="ghostty-pane" />
      {surfaceError ? (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          data-testid="ghostty-surface-error"
        >
          <div className="flex flex-col items-center text-center p-6">
            <svg
              className="w-8 h-8 text-red-400 mb-3"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="text-sm font-medium text-text-primary">Terminal renderer stopped</div>
            <div className="text-xs text-text-muted mt-1 max-w-xs break-words">{surfaceError}</div>
            {onRetrySurface && (
              <button
                onClick={onRetrySurface}
                className="mt-3 px-4 py-1.5 text-xs font-medium rounded-lg bg-accent/15 border border-accent/30 text-accent hover:bg-accent/25 transition-colors"
              >
                Retry
              </button>
            )}
          </div>
        </div>
      ) : (
        <TerminalReconnectOverlay state={state} onRetry={onRetry} />
      )}
    </>
  );
}
