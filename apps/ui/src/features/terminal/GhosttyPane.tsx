import type { RefObject } from "react";
import type { TerminalSessionState } from "./terminalSessionModel";
import { TerminalReconnectOverlay } from "./TerminalReconnectOverlay";

export interface GhosttyPaneProps {
  containerRef: RefObject<HTMLDivElement | null>;
  state: TerminalSessionState;
  onRetry: () => void;
}

/**
 * Presentational: the native ghostty surface renders into the plain div
 * below (see useGhosttySurface.ts, which the caller drives — this component
 * doesn't call it itself, matching how TerminalPane already owns
 * useTerminalSession directly). The status overlays stay in the DOM: they
 * show when the surface is hidden or hasn't been created yet.
 */
export function GhosttyPane({ containerRef, state, onRetry }: GhosttyPaneProps) {
  return (
    <>
      <div ref={containerRef} className="h-full w-full" data-testid="ghostty-pane" />
      <TerminalReconnectOverlay state={state} onRetry={onRetry} />
    </>
  );
}
