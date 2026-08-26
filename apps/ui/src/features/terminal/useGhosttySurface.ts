import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { GhosttyBounds } from "@hypershell/shared";
import { getShell, hasShell } from "../../lib/shell";
import { layoutStore } from "../layout/layoutStore";
import { sanitizeTitle } from "./titleSanitizer";
import {
  TERMINAL_FOCUS_REQUEST_EVENT,
  shouldHandleTerminalFocusRequest,
  type TerminalFocusRequestDetail
} from "./terminalFocus";

export interface UseGhosttySurfaceInput {
  sessionId: string | null;
  fontSize: number;
  /** Whether this pane is the one currently shown to the user. Prop-driven,
   * not geometry-derived: this app stacks every tab `absolute inset-0` and
   * hides inactive ones with `visibility: hidden` (Workspace.tsx), which
   * IntersectionObserver cannot see — it computes from layout geometry only,
   * and a `visibility: hidden` box still occupies its full layout rect and
   * reports as intersecting. A native HWND has no CSS visibility concept of
   * its own, so it needs telling explicitly. */
  visible: boolean;
  onGrid?: (cols: number, rows: number) => void;
  onChord?: (chord: string) => void;
}

export interface UseGhosttySurfaceResult {
  containerRef: RefObject<HTMLDivElement | null>;
  focused: boolean;
  focusSurface: () => void;
  /** Set when the native surface died under this pane (a surface crash, or the
   *  host process giving up); null while it is healthy. */
  surfaceError: string | null;
  /** Clears the error and asks for the surface again. The create call revives a
   *  dead host process before it lands. */
  retrySurface: () => void;
}

const SURFACE_CRASH_MESSAGE = "The terminal renderer stopped.";
const SURFACE_CREATE_FAILED_MESSAGE = "terminal surface could not be created";

function logAsyncError(context: string, error: unknown): void {
  console.warn(`[hypershell] ${context}`, error);
}

function createErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return SURFACE_CREATE_FAILED_MESSAGE;
}

/**
 * Owns the lifecycle of one native ghostty surface: creates it once the
 * container has a real rect and a session to render, keeps its bounds in
 * sync with the DOM and its visibility in sync with the caller's `visible`
 * prop, destroys it on unmount, and relays `ghostty:event`s addressed to
 * this session (grid size, chords, focus, titles) back into the app.
 */
export function useGhosttySurface(input: UseGhosttySurfaceInput): UseGhosttySurfaceResult {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [focused, setFocused] = useState(false);
  const [surfaceError, setSurfaceError] = useState<string | null>(null);

  const sessionIdRef = useRef(input.sessionId);
  const fontSizeRef = useRef(input.fontSize);
  const onGridRef = useRef(input.onGrid);
  const onChordRef = useRef(input.onChord);
  sessionIdRef.current = input.sessionId;
  fontSizeRef.current = input.fontSize;
  onGridRef.current = input.onGrid;
  onChordRef.current = input.onChord;

  // The session a surface currently exists for, main-side. null when none.
  const surfaceSessionIdRef = useRef<string | null>(null);
  // The font size that surface was created with, so a later change pushes a
  // per-surface config update and an unchanged one pushes nothing.
  const surfaceFontSizeRef = useRef<number | null>(null);

  const computeBounds = useCallback((): GhosttyBounds | null => {
    const el = containerRef.current;
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
  }, []);

  // Reconciles the main-side surface with the current sessionId + container
  // rect: creates on a null->id transition once a rect exists, tears down and
  // recreates on an id->different-id transition, sends bounds updates once a
  // surface already exists for the current session, and destroys when the
  // session goes away. Called both on sessionId changes and on every
  // ResizeObserver/scroll tick (debounced — see the effect below).
  const syncSurface = useCallback((): void => {
    if (!hasShell()) return;
    const sessionId = sessionIdRef.current;
    const existing = surfaceSessionIdRef.current;

    if (existing && existing !== sessionId) {
      surfaceSessionIdRef.current = null;
      void getShell()
        .ghosttySurfaceDestroy({ sessionId: existing })
        .catch((error) => logAsyncError("ghosttySurfaceDestroy failed", error));
    }

    if (!sessionId) {
      return;
    }

    const bounds = computeBounds();
    if (!bounds) {
      // No rect yet — the next ResizeObserver tick (or sessionId change)
      // retries.
      return;
    }

    if (surfaceSessionIdRef.current === sessionId) {
      void getShell()
        .ghosttySurfaceBounds({ sessionId, bounds })
        .catch((error) => logAsyncError("ghosttySurfaceBounds failed", error));
      return;
    }

    surfaceSessionIdRef.current = sessionId;
    surfaceFontSizeRef.current = fontSizeRef.current;
    void getShell()
      .ghosttySurfaceCreate({ sessionId, bounds, fontSize: fontSizeRef.current })
      .then(() => {
        // A stale settle: a later syncSurface call already moved the ref to a
        // different (or no) session — e.g. sessionId changed while this call
        // was in flight. That call owns surfaceError now; this one must not
        // wipe a legitimate error (including a `crashed` event) out from
        // under it.
        if (surfaceSessionIdRef.current !== sessionId) return;
        setSurfaceError(null);
      })
      .catch((error) => {
        logAsyncError("ghosttySurfaceCreate failed", error);
        // Same stale-settle guard as above: don't clear refs or set an error
        // for a session this call no longer owns.
        if (surfaceSessionIdRef.current !== sessionId) return;
        // Allow a later sync (resize, or the caller retrying) to try again.
        surfaceSessionIdRef.current = null;
        surfaceFontSizeRef.current = null;
        setSurfaceError(createErrorMessage(error));
      });
  }, [computeBounds]);

  // (a): react to sessionId transitions immediately, independent of any resize.
  useEffect(() => {
    syncSurface();
  }, [input.sessionId, syncSurface]);

  // (b): container size/scroll changes. Set up once for the container's
  // lifetime — sessionId/fontSize are read through refs above so this
  // doesn't need to be torn down and rebuilt on every prop change.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let rafId: number | null = null;
    const scheduleSync = (): void => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        syncSurface();
      });
    };

    const resizeObserver = new ResizeObserver(scheduleSync);
    resizeObserver.observe(el);

    const onScroll = (): void => scheduleSync();
    window.addEventListener("scroll", onScroll, true);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("scroll", onScroll, true);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [syncSurface]);

  // (h): visibility, driven by the caller's prop (see UseGhosttySurfaceInput
  // doc comment for why this can't be geometry-derived). Runs on mount too —
  // main starts assuming a surface is visible, so an initially-hidden pane
  // must say so right away, not wait for the first prop flip.
  useEffect(() => {
    if (!input.sessionId || !hasShell()) return;
    void getShell()
      .ghosttySurfaceVisible({ sessionId: input.sessionId, visible: input.visible })
      .catch((error) => logAsyncError("ghosttySurfaceVisible failed", error));
  }, [input.sessionId, input.visible]);

  // Per-tab font size. The size a surface is born with rides along on the
  // create call; every later change (the ctrl+= / ctrl+- / ctrl+0 chords, which
  // only moved the persisted number before) needs its own push, since a
  // surface's config is not re-read on its own.
  useEffect(() => {
    const sessionId = input.sessionId;
    if (!sessionId || !hasShell()) return;
    if (surfaceSessionIdRef.current !== sessionId) return;
    if (surfaceFontSizeRef.current === input.fontSize) return;

    surfaceFontSizeRef.current = input.fontSize;
    void getShell()
      .ghosttySurfaceConfig({ sessionId, config: `font-size = ${input.fontSize}` })
      .catch((error) => logAsyncError("ghosttySurfaceConfig failed", error));
  }, [input.sessionId, input.fontSize]);

  // (c): destroy on unmount. Kept in its own empty-deps effect so a sessionId
  // change (handled above by syncSurface's create/destroy-old logic) never
  // trips this cleanup.
  useEffect(() => {
    return () => {
      const existing = surfaceSessionIdRef.current;
      if (!existing || !hasShell()) return;
      surfaceSessionIdRef.current = null;
      void getShell()
        .ghosttySurfaceDestroy({ sessionId: existing })
        .catch((error) => logAsyncError("ghosttySurfaceDestroy failed", error));
    };
  }, []);

  // (d)/(e)/(f) + title flow: ghostty:event, filtered to this session.
  useEffect(() => {
    if (!hasShell()) return;

    const unsubscribe = getShell().onGhosttyEvent((event) => {
      if (event.sessionId !== sessionIdRef.current) return;

      switch (event.kind) {
        case "grid":
          onGridRef.current?.(event.cols, event.rows);
          break;
        case "chord":
          onChordRef.current?.(event.chord);
          break;
        case "focusGained":
          setFocused(true);
          // The click that focused this surface never reached the DOM — the
          // child HWND ate it — so pane activation has to be driven from here.
          layoutStore.getState().focusSession(event.sessionId);
          break;
        case "focusLost":
          setFocused(false);
          break;
        case "title":
          layoutStore.getState().setTabDynamicTitle(event.sessionId, sanitizeTitle(event.title));
          break;
        case "crashed":
          // The surface is gone main-side; forgetting it here lets a retry
          // (or the next resize tick) create a replacement rather than sending
          // bounds updates into the void.
          surfaceSessionIdRef.current = null;
          surfaceFontSizeRef.current = null;
          setSurfaceError(event.error ?? SURFACE_CRASH_MESSAGE);
          break;
        default:
          break;
      }
    });

    return unsubscribe;
  }, []);

  // (g): a global request to focus whichever pane currently owns this session.
  useEffect(() => {
    const onFocusRequest = (event: Event): void => {
      const detail = (event as CustomEvent<TerminalFocusRequestDetail>).detail;
      if (!shouldHandleTerminalFocusRequest(detail?.sessionId, sessionIdRef.current)) return;
      const sessionId = sessionIdRef.current;
      if (!sessionId || !hasShell()) return;
      void getShell()
        .ghosttySurfaceFocus({ sessionId })
        .catch((error) => logAsyncError("ghosttySurfaceFocus failed", error));
    };

    window.addEventListener(TERMINAL_FOCUS_REQUEST_EVENT, onFocusRequest);
    return () => {
      window.removeEventListener(TERMINAL_FOCUS_REQUEST_EVENT, onFocusRequest);
    };
  }, []);

  const focusSurface = useCallback((): void => {
    const sessionId = sessionIdRef.current;
    if (!sessionId || !hasShell()) return;
    void getShell()
      .ghosttySurfaceFocus({ sessionId })
      .catch((error) => logAsyncError("ghosttySurfaceFocus failed", error));
  }, []);

  const retrySurface = useCallback((): void => {
    setSurfaceError(null);
    syncSurface();
  }, [syncSurface]);

  return { containerRef, focused, focusSurface, surfaceError, retrySurface };
}
