import { useEffect, useRef, useState, type RefObject } from "react";
import type { GhosttyBounds } from "@hypershell/shared";
import { getShell, hasShell } from "../../lib/shell";
import { useOverlayGuard } from "../terminal/nativeOverlayGuard";

export interface UseReplaySurfaceResult {
  containerRef: RefObject<HTMLDivElement | null>;
  /** The main-process replay surface's synthetic id ("replay:<n>"), or null
   *  before it's open (or once closed). Playback controls need this to
   *  address ghosttyReplayControl. */
  replayId: string | null;
  error: string | null;
}

function logAsyncError(context: string, error: unknown): void {
  console.warn(`[hypershell] ${context}`, error);
}

function computeBounds(el: HTMLElement | null): GhosttyBounds | null {
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const dpr = window.devicePixelRatio || 1;
  return {
    x: Math.round(rect.left * dpr),
    y: Math.round(rect.top * dpr),
    w: Math.round(rect.width * dpr),
    h: Math.round(rect.height * dpr)
  };
}

/**
 * Owns one replay surface's lifecycle for as long as `active` (the dialog is
 * open) and `recordingId` are both set: opens it once the container has a
 * real rect (retrying via rAF until it does — mirrors useGhosttySurface.ts's
 * pattern for the same reason, just not that file, per the shared-checkout
 * split), keeps its bounds in sync via ResizeObserver, closes it on
 * deactivation/unmount, and holds the native-overlay guard open the whole
 * time a replay surface exists — a recording-playback dialog is exactly the
 * kind of DOM overlay that can visually cross other live terminal panes.
 */
export function useReplaySurface(recordingId: string | null, active: boolean): UseReplaySurfaceResult {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [replayId, setReplayId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const replayIdRef = useRef<string | null>(null);

  const engaged = active && recordingId !== null;
  useOverlayGuard(engaged);

  useEffect(() => {
    if (!engaged || !hasShell()) {
      return;
    }

    let cancelled = false;
    let rafId: number | null = null;

    const attemptOpen = (): void => {
      const bounds = computeBounds(containerRef.current);
      if (!bounds) {
        rafId = requestAnimationFrame(attemptOpen);
        return;
      }

      void getShell()
        .ghosttyReplayOpen({ recordingId, bounds })
        .then(({ replayId: id }) => {
          if (cancelled) {
            void getShell()
              .ghosttyReplayClose({ replayId: id })
              .catch((err) => logAsyncError("ghosttyReplayClose failed", err));
            return;
          }
          replayIdRef.current = id;
          setReplayId(id);
        })
        .catch((err) => {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : "Failed to open recording");
          }
        });
    };

    rafId = requestAnimationFrame(attemptOpen);

    return () => {
      cancelled = true;
      if (rafId !== null) cancelAnimationFrame(rafId);

      const id = replayIdRef.current;
      replayIdRef.current = null;
      setReplayId(null);
      setError(null);
      if (id && hasShell()) {
        void getShell()
          .ghosttyReplayClose({ replayId: id })
          .catch((err) => logAsyncError("ghosttyReplayClose failed", err));
      }
    };
  }, [engaged, recordingId]);

  // Bounds stay in sync via the same ghostty:surface-bounds channel regular
  // session surfaces use — client.setBounds() works on any registered
  // surfaceId, replay surfaces included.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !replayId) return;

    let rafId: number | null = null;
    const scheduleSync = (): void => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const bounds = computeBounds(containerRef.current);
        if (bounds && hasShell()) {
          void getShell()
            .ghosttySurfaceBounds({ sessionId: replayId, bounds })
            .catch((err) => logAsyncError("ghosttySurfaceBounds failed", err));
        }
      });
    };

    const resizeObserver = new ResizeObserver(scheduleSync);
    resizeObserver.observe(el);

    return () => {
      resizeObserver.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [replayId]);

  return { containerRef, replayId, error };
}
