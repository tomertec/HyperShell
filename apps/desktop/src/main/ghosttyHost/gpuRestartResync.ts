/**
 * Re-asserts the native terminal surfaces' place in the parent window's child
 * z-order after Chromium rebuilds its own compositor child windows.
 *
 * A ghostty surface is a child HWND of the Electron window, sharing that
 * window's child list with Chromium's `Chrome_RenderWidgetHostHWND` and
 * `Intermediate D3D Window` — each covering the whole client area. The host
 * keeps the surface first in that list (HWND_TOP on create, on every
 * `opSetBounds`, on `setVisible(true)`, and from its own `WM_WINDOWPOSCHANGED`
 * handler), but that last recovery only fires when the reorder is addressed to
 * our leaf. When the GPU process restarts, Chromium recreates its compositor
 * windows and they reclaim the top of the list without Windows telling our
 * child window anything: the terminal still renders, and is painted over.
 *
 * Nothing else would fix it on its own. Recovery would wait for the next
 * bounds or visibility traffic, and a user sitting in one maximized tab typing
 * at a shell produces none — the terminal's content is painted natively, so
 * there is no ResizeObserver tick, no scroll, no tab switch, no overlay. The
 * terminal would go blank and stay blank.
 *
 * Electron announces the restart, so this needs no polling and no timer: a
 * bounds re-sync on the process-gone event lands on the host's existing
 * `opSetBounds` re-assert.
 */

/** The `details` payload of Electron's `child-process-gone`. */
export interface ChildProcessGoneDetails {
  type: string;
}

/** The slice of Electron's `app` this needs. */
export interface ProcessGoneEmitter {
  on(event: "child-process-gone", listener: (event: unknown, details: ChildProcessGoneDetails) => void): unknown;
  on(event: "render-process-gone", listener: (...args: unknown[]) => void): unknown;
  removeListener(event: string, listener: (...args: never[]) => void): unknown;
}

/** Electron's name for the GPU child process in `child-process-gone` details.
 *  Utility and network-service children own no window in our hierarchy, so
 *  only this one is worth re-syncing for. */
const GPU_PROCESS_TYPE = "GPU";

/**
 * Calls `resync` whenever a process whose death recreates Chromium's child
 * windows goes away. Returns an unsubscribe — `app` outlives any single IPC
 * registration, so without it a re-registration would stack listeners.
 */
export function watchGpuRestart(app: ProcessGoneEmitter, resync: () => void): () => void {
  const safeResync = (): void => {
    try {
      resync();
    } catch (error) {
      // A dead ghostty host has its own recovery path (onHostDead → per-pane
      // retry); failing out of an Electron event handler would only take the
      // main process down with it.
      console.error("[ghostty] surface z-order re-sync failed", error);
    }
  };

  const onChildProcessGone = (_event: unknown, details: ChildProcessGoneDetails): void => {
    if (details?.type !== GPU_PROCESS_TYPE) {
      return;
    }
    safeResync();
  };
  const onRenderProcessGone = (): void => {
    safeResync();
  };

  app.on("child-process-gone", onChildProcessGone);
  app.on("render-process-gone", onRenderProcessGone);

  return () => {
    app.removeListener("child-process-gone", onChildProcessGone as (...args: never[]) => void);
    app.removeListener("render-process-gone", onRenderProcessGone as (...args: never[]) => void);
  };
}
