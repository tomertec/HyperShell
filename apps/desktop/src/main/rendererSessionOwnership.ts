/**
 * Ties every open session to the renderer that asked for it, so a renderer
 * that goes away takes its sessions with it.
 *
 * A session leaves `SessionManager` only when the renderer calls `close` —
 * which the terminal pane does from its unmount cleanup. A page reload (Vite's
 * HMR full reload, View → Reload, a renderer crash) runs no React cleanup, so
 * without this the pty outlives its tab: still spawned, still polled, owned by
 * nothing, and still listed by the session-recovery snapshot, which enumerates
 * live sessions rather than tabs. That is where the recovery dialog's identical
 * duplicate rows come from.
 */

export interface NavigationDetails {
  isMainFrame: boolean;
  isSameDocument: boolean;
}

/** The slice of Electron's `WebContents` this needs. */
export interface ReapableRenderer {
  readonly id: number;
  isDestroyed(): boolean;
  on(event: "did-start-navigation", listener: (details: NavigationDetails) => void): unknown;
  on(event: "render-process-gone", listener: () => void): unknown;
  on(event: "destroyed", listener: () => void): unknown;
}

export interface RendererSessionOwnership {
  /** Records that `rendererId` opened `sessionId`. */
  remember(rendererId: number, sessionId: string): void;
  /** Drops a session that closed or exited on its own. */
  forget(sessionId: string): void;
  /** Closes every session still owned by `rendererId`. */
  reap(rendererId: number): void;
  /** Reaps whenever this renderer reloads, crashes, or is destroyed. */
  watch(renderer: ReapableRenderer): void;
}

export function createRendererSessionOwnership(
  closeSession: (sessionId: string) => void
): RendererSessionOwnership {
  const sessionsByRenderer = new Map<number, Set<string>>();
  const watchedRenderers = new Set<number>();

  const ownership: RendererSessionOwnership = {
    remember(rendererId, sessionId) {
      const owned = sessionsByRenderer.get(rendererId) ?? new Set<string>();
      owned.add(sessionId);
      sessionsByRenderer.set(rendererId, owned);
    },

    forget(sessionId) {
      for (const owned of sessionsByRenderer.values()) {
        owned.delete(sessionId);
      }
    },

    reap(rendererId) {
      const owned = sessionsByRenderer.get(rendererId);
      if (!owned) {
        return;
      }

      sessionsByRenderer.delete(rendererId);
      for (const sessionId of owned) {
        closeSession(sessionId);
      }
    },

    watch(renderer) {
      // Every open re-offers its sender; subscribing per open would stack
      // listeners on one renderer until Node warns about a leak.
      if (watchedRenderers.has(renderer.id)) {
        return;
      }
      watchedRenderers.add(renderer.id);

      renderer.on("did-start-navigation", (details) => {
        // Fragment jumps and history.pushState keep the same JS context — and
        // with it every session the page still owns.
        if (details.isMainFrame && !details.isSameDocument) {
          ownership.reap(renderer.id);
        }
      });
      renderer.on("render-process-gone", () => ownership.reap(renderer.id));
      renderer.on("destroyed", () => {
        ownership.reap(renderer.id);
        // A destroyed WebContents never comes back, so keeping its id would
        // only grow the set for the life of the app. The listeners themselves
        // die with the WebContents; if a second ownership instance is ever
        // created (registerIpc re-registration), the old instance's listeners
        // keep reaping only the old instance's map — closing a session twice
        // is a SessionManager no-op, so they are harmless.
        watchedRenderers.delete(renderer.id);
      });
    },
  };

  return ownership;
}
