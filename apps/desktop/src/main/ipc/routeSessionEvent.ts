import type { SessionTransportEvent } from "@hypershell/session-core";

/**
 * Everything the `manager.onEvent` subscription in registerIpc.ts needs to
 * run its existing side effects, narrowed to just the methods it calls —
 * lets tests supply lightweight fakes instead of real SessionManager/
 * SessionRecordingManager/ClaudeSessionBinder instances.
 */
export interface RouteSessionEventDeps {
  /** Renderer-facing session event stream. Not called for "data" events —
   *  those are rerouted to the ghostty host client instead (see feedData). */
  emitSessionEvent: (event: SessionTransportEvent) => void;
  /** Ghostty host client's data intake — replaces the old renderer-bound
   *  "data" event forwarding. Fire-and-forget: a session with no registered
   *  ghostty surface is a safe no-op (Task 3's registry behavior). */
  feedData: (sessionId: string, data: string) => void;
  /** Ghostty host client's session-closed notification, additive to the
   *  existing "exit" handling below. */
  sessionClosed: (sessionId: string, exitCode: number | null) => void;
  sessionLogger: { onSessionData(sessionId: string, data: string): void };
  recorder: {
    onSessionData(sessionId: string, data: string): void;
    stop(request: { sessionId: string }): Promise<unknown>;
  };
  claudeSessionBinder: {
    handleProcessTitle(sessionId: string, name: string | null): void;
    forget(sessionId: string): void;
  };
  recordConnected: (sessionId: string) => void;
  recordFailedAttempt: (sessionId: string, message?: string) => void;
  markDisconnected: (sessionId: string) => void;
  sessionErrorMessages: { set(sessionId: string, message: string): void; delete(sessionId: string): void };
  recordedFailedAttemptSessions: { delete(sessionId: string): void };
  sessionHostCache: { delete(sessionId: string): void };
  rendererSessions: { forget(sessionId: string): void };
  /** True if the SessionManager still has this session (i.e. it's only
   *  reconnecting, not actually gone) — mirrors the original
   *  `manager.getSession(sessionId)` truthy check. */
  hasSession: (sessionId: string) => boolean;
}

/**
 * Routes one SessionTransportEvent to every existing side effect (recovery
 * bookkeeping, Claude session binder, session logger, recorder, renderer
 * event stream) exactly as the inline `manager.onEvent` subscription in
 * registerIpc.ts used to, with one behavioral change: "data" events no
 * longer reach `emitSessionEvent` (the renderer) — they go to the ghostty
 * host client's `feedData` instead. The session logger and recorder keep
 * tapping "data" events exactly as before. "exit" events additionally
 * notify the ghostty client via `sessionClosed`.
 */
export function routeSessionEvent(event: SessionTransportEvent, deps: RouteSessionEventDeps): void {
  if (event.type === "data") {
    deps.feedData(event.sessionId, event.data);
  } else {
    deps.emitSessionEvent(event);
  }

  switch (event.type) {
    case "data": {
      deps.sessionLogger.onSessionData(event.sessionId, event.data);
      deps.recorder.onSessionData(event.sessionId, event.data);
      break;
    }

    case "status": {
      if (event.state === "connected") {
        deps.recordConnected(event.sessionId);
      } else if (event.state === "failed") {
        deps.recordFailedAttempt(event.sessionId);
      }
      break;
    }

    case "error": {
      deps.sessionErrorMessages.set(event.sessionId, event.message);
      deps.recordFailedAttempt(event.sessionId, event.message);
      break;
    }

    case "process-title": {
      deps.claudeSessionBinder.handleProcessTitle(event.sessionId, event.name);
      break;
    }

    case "exit": {
      const sessionId = event.sessionId;
      deps.claudeSessionBinder.forget(sessionId);
      deps.markDisconnected(sessionId);
      deps.recordedFailedAttemptSessions.delete(sessionId);
      deps.sessionErrorMessages.delete(sessionId);
      deps.sessionHostCache.delete(sessionId);
      deps.sessionClosed(sessionId, event.exitCode ?? null);

      // Wait one tick to let SessionManager finalize reconnect/disconnect
      // state. A session that is only reconnecting still belongs to its
      // renderer and must stay reapable.
      setTimeout(() => {
        if (!deps.hasSession(sessionId)) {
          deps.rendererSessions.forget(sessionId);
          void deps.recorder.stop({ sessionId });
        }
      }, 0);
      break;
    }

    default:
      break;
  }
}
