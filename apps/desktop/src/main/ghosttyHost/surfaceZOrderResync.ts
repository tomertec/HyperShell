/**
 * Re-asserts the native terminal surfaces' place in the parent window's child
 * z-order after something rebuilds Chromium's own compositor child windows.
 *
 * A ghostty surface is a child HWND of the Electron window, sharing that
 * window's child list with Chromium's `Chrome_RenderWidgetHostHWND` and
 * `Intermediate D3D Window` — each covering the whole client area. The host
 * keeps the surface first in that list (HWND_TOP on create, on every
 * `opSetBounds`, on `setVisible(true)`, and from its own `WM_WINDOWPOSCHANGED`
 * handler), but that last recovery only fires when the reorder is addressed to
 * our leaf. When Chromium reorders *its own* children — a GPU-process restart
 * recreates the compositor windows — Windows tells our sibling nothing: the
 * terminal still renders, and is painted over.
 *
 * Nothing else would fix it on its own. Recovery would wait for the next
 * bounds or visibility traffic, and a user sitting in one maximized tab typing
 * at a shell produces none — the terminal's content is painted natively, so
 * there is no ResizeObserver tick, no scroll, no tab switch, no overlay. The
 * failure mode is "blank and stays blank".
 *
 * Electron announces the events that cause this, so this needs no polling: a
 * bounds re-sync lands on the host's existing `opSetBounds` re-assert. Two
 * details are deliberate:
 *
 *  - **Follow-ups, not a single shot.** The replacement compositor window may
 *    not exist yet when the event fires, and re-raising above a window that
 *    has not been created is a no-op. The delays also cover a re-sync that
 *    arrives while the ghostty host is itself respawning, when every frame is
 *    dropped at the transport (`GhosttyHostProcess.send` returns early when the
 *    socket is down). Bounded and event-triggered — never a poll.
 *  - **Display and power triggers, not just process death.** Monitor hot-plug,
 *    a DPI change and sleep/wake churn the compositor without any process
 *    dying, and are far likelier in practice than a GPU crash. This is also the
 *    path that covers an RDP reconnect: Electron does not surface
 *    WTS_REMOTE_CONNECT, but the remote display geometry changes, which does
 *    reach `display-metrics-changed`.
 *
 * A re-sync cannot reveal a surface the overlay guard is hiding: the host's
 * `opSetBounds` passes `SWP_NOACTIVATE` with no `SWP_SHOWWINDOW`
 * (`win32_extra.zig:500`, `Host.zig:1415-1423`), so a hidden surface stays
 * hidden.
 */

/** One non-overloaded listener shape, used by both `on` and `removeListener`
 *  so a handler can be passed to either without a cast. Electron's own `App`,
 *  `PowerMonitor` and `Screen` types declare an overload per event, with
 *  concrete payload types; `unknown` parameters are what all of them accept,
 *  so the handlers below take their arguments untyped and narrow. */
type ResyncListener = (...args: unknown[]) => void;

/** Electron's event payloads arrive through the `unknown`-typed slice above. */
function detailsOf(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

/** The slice of an Electron event emitter this needs. */
export interface ResyncEventSource {
  on(event: string, listener: ResyncListener): unknown;
  removeListener(event: string, listener: ResyncListener): unknown;
}

export interface ResyncEventSources {
  /** Electron's `app` — process death. */
  app: ResyncEventSource;
  /** Electron's `powerMonitor` — sleep/wake and session lock. */
  powerMonitor: ResyncEventSource;
  /** Electron's `screen` — monitor hot-plug and DPI/resolution changes. Only
   *  reachable after the app is ready, which every caller already is. */
  screen: ResyncEventSource;
}

/** Electron's name for the GPU child process in `child-process-gone` details.
 *  Utility and network-service children own no window in our hierarchy, so
 *  only this one is worth re-syncing for. */
const GPU_PROCESS_TYPE = "GPU";

/** A renderer that exited cleanly is app teardown, not a compositor rebuild. */
const CLEAN_EXIT_REASON = "clean-exit";

/** Re-sync again at these delays after each trigger. Small and finite: long
 *  enough to outlast the compositor window's recreation and one ghostty-host
 *  respawn backoff (500ms base), short enough that a user never sees the gap. */
const FOLLOW_UP_DELAYS_MS = [250, 1_000, 3_000];

/**
 * Calls `resync` whenever something may have restacked the parent window's
 * children, plus a bounded set of follow-ups. Returns an unsubscribe that
 * drops every listener and cancels any pending follow-up — `app`,
 * `powerMonitor` and `screen` all outlive any single IPC registration, so
 * without it a re-registration would stack listeners.
 */
export function watchSurfaceZOrder(sources: ResyncEventSources, resync: () => void): () => void {
  let pendingFollowUps: ReturnType<typeof setTimeout>[] = [];

  function cancelFollowUps(): void {
    for (const timer of pendingFollowUps) {
      clearTimeout(timer);
    }
    pendingFollowUps = [];
  }

  function safeResync(): void {
    try {
      resync();
    } catch (error) {
      // A dead ghostty host has its own recovery path (onHostDead → per-pane
      // retry); failing out of an Electron event handler would only take the
      // main process down with it.
      console.error("[ghostty] surface z-order re-sync failed", error);
    }
  }

  function trigger(): void {
    // A fresh trigger restarts the schedule rather than stacking onto it, so
    // a burst of display events cannot accumulate timers.
    cancelFollowUps();
    safeResync();
    for (const delay of FOLLOW_UP_DELAYS_MS) {
      const timer = setTimeout(() => {
        safeResync();
      }, delay);
      // A pending re-sync must never be the reason the process stays alive at
      // quit.
      timer.unref();
      pendingFollowUps.push(timer);
    }
  }

  const onChildProcessGone = (_event: unknown, details: unknown): void => {
    if (detailsOf(details)?.type !== GPU_PROCESS_TYPE) {
      return;
    }
    trigger();
  };
  const onRenderProcessGone = (_event: unknown, _webContents: unknown, details: unknown): void => {
    if (detailsOf(details)?.reason === CLEAN_EXIT_REASON) {
      return;
    }
    trigger();
  };
  const onDisplayOrPowerChange = (): void => {
    trigger();
  };

  const subscriptions: Array<[ResyncEventSource, string, ResyncListener]> = [
    [sources.app, "child-process-gone", onChildProcessGone],
    [sources.app, "render-process-gone", onRenderProcessGone],
    [sources.powerMonitor, "resume", onDisplayOrPowerChange],
    [sources.powerMonitor, "unlock-screen", onDisplayOrPowerChange],
    // `display-metrics-changed` covers a DPI or resolution change on a display
    // that is already there; add/remove is a separate event pair, and monitor
    // hot-plug is the case that motivated this.
    [sources.screen, "display-metrics-changed", onDisplayOrPowerChange],
    [sources.screen, "display-added", onDisplayOrPowerChange],
    [sources.screen, "display-removed", onDisplayOrPowerChange]
  ];

  for (const [source, event, listener] of subscriptions) {
    source.on(event, listener);
  }

  return () => {
    for (const [source, event, listener] of subscriptions) {
      source.removeListener(event, listener);
    }
    cancelFollowUps();
  };
}
