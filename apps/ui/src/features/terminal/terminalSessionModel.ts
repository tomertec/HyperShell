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
      clearSessionId: true
    };
  }

  return {
    handled: true,
    state: "failed",
    errorMessage: event.message
  };
}
