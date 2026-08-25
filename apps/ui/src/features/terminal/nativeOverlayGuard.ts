import { useEffect } from "react";
import { getShell, hasShell } from "../../lib/shell";

/**
 * Collapses modal->modal transitions without flashing native surfaces back
 * into view: if a new overlay acquires the guard before a just-released one's
 * delayed hide fires, that hide is cancelled outright.
 */
const RELEASE_DELAY_MS = 50;

let activeCount = 0;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;

function clearReleaseTimer(): void {
  if (releaseTimer !== null) {
    clearTimeout(releaseTimer);
    releaseTimer = null;
  }
}

function sendOverlayGuard(hidden: boolean): void {
  if (!hasShell()) return;
  void getShell().ghosttyOverlayGuard({ hidden });
}

/**
 * Increments the module-wide overlay counter. The first acquirer (0->1)
 * hides every native ghostty surface immediately; the returned release
 * function decrements the counter, and the last release (1->0) shows them
 * again — but only after a 50ms delay, so a DOM overlay owner that closes
 * and another that opens in the same tick never produce a visible flash.
 */
export function acquireOverlayGuard(): () => void {
  clearReleaseTimer();
  activeCount += 1;
  if (activeCount === 1) {
    sendOverlayGuard(true);
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;

    activeCount = Math.max(0, activeCount - 1);
    if (activeCount === 0) {
      clearReleaseTimer();
      releaseTimer = setTimeout(() => {
        releaseTimer = null;
        sendOverlayGuard(false);
      }, RELEASE_DELAY_MS);
    }
  };
}

/** Wraps acquire/release in an effect keyed on `active` — what every DOM
 *  overlay owner (modal, context menu, drag layer, ...) calls. */
export function useOverlayGuard(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    return acquireOverlayGuard();
  }, [active]);
}
