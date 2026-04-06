import type {
  OpenSessionRequest,
  SessionState,
  SessionTransportEvent,
  SessionTransportKind,
  TransportHandle
} from "./transports/transportEvents";
import { createSerialTransport } from "./transports/serialTransport";
import { createSshPtyTransport } from "./transports/sshPtyTransport";

export interface SessionSnapshot {
  sessionId: string;
  transport: SessionTransportKind;
  profileId: string;
  cols: number;
  rows: number;
  state: SessionState;
}

export interface SessionManagerDeps {
  createTransport?: (request: OpenSessionRequest) => TransportHandle;
  sessionIdFactory?: () => string;
}

export interface OpenSessionInput {
  transport: SessionTransportKind;
  profileId: string;
  cols: number;
  rows: number;
}

export interface OpenSessionResult {
  sessionId: string;
  state: SessionState;
}

export interface SessionManager {
  open(input: OpenSessionInput): OpenSessionResult;
  write(sessionId: string, data: string): void;
  resize(sessionId: string, cols: number, rows: number): void;
  close(sessionId: string): void;
  getSession(sessionId: string): SessionSnapshot | undefined;
  listSessions(): SessionSnapshot[];
  onEvent(listener: (event: SessionTransportEvent) => void): () => void;
}

interface ManagedSession {
  snapshot: SessionSnapshot;
  transport: TransportHandle;
  unsubscribe: () => void;
}

function createNoopTransport(sessionId: string): TransportHandle {
  const listeners = new Set<(event: SessionTransportEvent) => void>();

  return {
    write() {},
    resize() {},
    close() {
      for (const listener of listeners) {
        listener({
          type: "exit",
          sessionId,
          exitCode: null
        });
      }
    },
    onEvent(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
}

function createDefaultTransport(request: OpenSessionRequest): TransportHandle {
  if (request.transport === "ssh") {
    return createSshPtyTransport(request, {
      hostname: request.profileId
    });
  }

  if (request.transport === "serial") {
    return createSerialTransport(request, {
      path: request.profileId
    });
  }

  return createNoopTransport(request.sessionId);
}

export function createSessionManager(
  deps: SessionManagerDeps = {}
): SessionManager {
  const sessions = new Map<string, ManagedSession>();
  const listeners = new Set<(event: SessionTransportEvent) => void>();
  const sessionIdFactory =
    deps.sessionIdFactory ?? (() => `session-${sessions.size + 1}`);
  const createTransport = deps.createTransport ?? createDefaultTransport;

  function updateSession(
    sessionId: string,
    updater: (session: ManagedSession) => void
  ): void {
    const session = sessions.get(sessionId);
    if (!session) {
      return;
    }

    updater(session);
  }

  function handleEvent(sessionId: string, event: SessionTransportEvent): void {
    if (event.type === "status") {
      updateSession(sessionId, (session) => {
        session.snapshot.state = event.state;
      });
    }

    if (event.type === "error") {
      updateSession(sessionId, (session) => {
        session.snapshot.state = "failed";
      });
    }

    for (const listener of listeners) {
      listener(event);
    }

    if (event.type === "exit") {
      updateSession(sessionId, (session) => {
        session.snapshot.state = "disconnected";
        session.unsubscribe();
      });
      sessions.delete(sessionId);
    }
  }

  return {
    open(input: OpenSessionInput): OpenSessionResult {
      const sessionId = sessionIdFactory();
      const snapshot: SessionSnapshot = {
        sessionId,
        transport: input.transport,
        profileId: input.profileId,
        cols: input.cols,
        rows: input.rows,
        state: "connecting"
      };

      const transport = createTransport({
        sessionId,
        transport: input.transport,
        profileId: input.profileId,
        cols: input.cols,
        rows: input.rows
      });

      const unsubscribe = transport.onEvent((event) => {
        handleEvent(sessionId, event);
      });

      sessions.set(sessionId, {
        snapshot,
        transport,
        unsubscribe
      });

      return {
        sessionId,
        state: snapshot.state
      };
    },

    write(sessionId: string, data: string): void {
      sessions.get(sessionId)?.transport.write(data);
    },

    resize(sessionId: string, cols: number, rows: number): void {
      const session = sessions.get(sessionId);
      if (!session) {
        return;
      }

      session.snapshot.cols = cols;
      session.snapshot.rows = rows;
      session.transport.resize(cols, rows);
    },

    close(sessionId: string): void {
      const session = sessions.get(sessionId);
      if (!session) {
        return;
      }

      session.transport.close();
      session.unsubscribe();
      session.snapshot.state = "disconnected";
      sessions.delete(sessionId);
    },

    getSession(sessionId: string): SessionSnapshot | undefined {
      return sessions.get(sessionId)?.snapshot;
    },

    listSessions(): SessionSnapshot[] {
      return Array.from(sessions.values(), (session) => session.snapshot);
    },

    onEvent(listener: (event: SessionTransportEvent) => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
}
