import type { SessionEvent } from "@hypershell/shared";

export type TerminalSessionState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "waiting_for_network"
  | "disconnected"
  | "failed";

export interface SessionEventEffect {
  handled: boolean;
  data?: string;
  state?: TerminalSessionState;
  clearSessionId?: boolean;
  errorMessage?: string;
  exitCode?: number | null;
}

export interface AsyncOperationGuard {
  issueToken(): number;
  isCurrent(token: number): boolean;
  invalidate(): void;
}

export function createAsyncOperationGuard(): AsyncOperationGuard {
  let token = 0;
  let invalidated = false;

  return {
    issueToken() {
      token += 1;
      return token;
    },
    isCurrent(candidateToken: number) {
      return !invalidated && candidateToken === token;
    },
    invalidate() {
      invalidated = true;
      token += 1;
    }
  };
}

export interface ConnectAttemptResult {
  sessionId: string;
  state: TerminalSessionState;
}

export interface ResolveConnectAttemptInput {
  openSession: () => Promise<ConnectAttemptResult>;
  /** True once the pane unmounted or a newer attempt superseded this one. */
  isStale: () => boolean;
  closeSession: (sessionId: string) => void;
}

/**
 * Runs one openSession() attempt and hands the result back only while the
 * caller still wants it. If the pane unmounted or a newer attempt superseded
 * this one while the promise was in flight, the main process has already
 * created a session that no UI will ever own — close it instead of leaking a
 * live SSH/serial/telnet connection with no way to control it.
 */
export async function resolveConnectAttempt(
  input: ResolveConnectAttemptInput
): Promise<ConnectAttemptResult | null> {
  const result = await input.openSession();

  if (input.isStale()) {
    input.closeSession(result.sessionId);
    return null;
  }

  return result;
}

export function mapSessionEvent(
  currentSessionId: string | null,
  event: SessionEvent
): SessionEventEffect {
  if (!currentSessionId || event.sessionId !== currentSessionId) {
    return { handled: false };
  }

  if (event.type === "data") {
    return {
      handled: true,
      data: event.data
    };
  }

  if (event.type === "status") {
    return {
      handled: true,
      state: event.state
    };
  }

  if (event.type === "exit") {
    return {
      handled: true,
      state: "disconnected",
      clearSessionId: true,
      exitCode: event.exitCode
    };
  }

  return {
    handled: true,
    state: "failed",
    errorMessage: event.message
  };
}
