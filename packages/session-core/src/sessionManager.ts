import type {
  OpenSessionRequest,
  SessionState,
  SessionTransportEvent,
  SessionTransportKind,
  SshConnectionOptions,
  SerialConnectionOptions,
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
  autoReconnect: boolean;
  reconnectAttempts: number;
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
  sshOptions?: SshConnectionOptions;
  serialOptions?: SerialConnectionOptions;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
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
  destroyAll(): void;
  getSession(sessionId: string): SessionSnapshot | undefined;
  listSessions(): SessionSnapshot[];
  onEvent(listener: (event: SessionTransportEvent) => void): () => void;
  setSignals(sessionId: string, signals: { dtr?: boolean; rts?: boolean }): void;
  getSessionInput(sessionId: string): OpenSessionInput | undefined;
}

interface ManagedSession {
  snapshot: SessionSnapshot;
  transport: TransportHandle;
  unsubscribe: () => void;
  input: OpenSessionInput;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
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
    const opts = request.sshOptions ?? { hostname: request.profileId };
    return createSshPtyTransport(request, {
      hostname: opts.hostname,
      username: opts.username,
      port: opts.port,
      identityFile: opts.identityFile,
      proxyJump: opts.proxyJump,
      keepAliveSeconds: opts.keepAliveSeconds
    });
  }

  if (request.transport === "serial") {
    const opts = request.serialOptions ?? { path: request.profileId };
    return createSerialTransport(request, {
      path: opts.path,
      baudRate: opts.baudRate,
      dataBits: opts.dataBits,
      stopBits: opts.stopBits,
      parity: opts.parity,
      flowControl: opts.flowControl,
      localEcho: opts.localEcho,
      dtr: opts.dtr,
      rts: opts.rts
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
      const session = sessions.get(sessionId);
      if (session) {
        const { snapshot, input } = session;
        const maxAttempts = input.maxReconnectAttempts ?? 5;

        if (snapshot.autoReconnect && snapshot.reconnectAttempts < maxAttempts) {
          snapshot.reconnectAttempts += 1;
          snapshot.state = "reconnecting";
          session.unsubscribe();

          for (const listener of listeners) {
            listener({ type: "status", sessionId, state: "reconnecting" });
          }

          const delay = Math.min(1000 * Math.pow(2, snapshot.reconnectAttempts - 1), 30000);
          session.reconnectTimer = setTimeout(() => {
            const current = sessions.get(sessionId);
            if (!current) return;

            const newTransport = createTransport({
              sessionId,
              transport: input.transport,
              profileId: input.profileId,
              cols: current.snapshot.cols,
              rows: current.snapshot.rows,
              sshOptions: input.sshOptions,
              serialOptions: input.serialOptions
            });

            const newUnsubscribe = newTransport.onEvent((e) => {
              handleEvent(sessionId, e);
            });

            current.transport = newTransport;
            current.unsubscribe = newUnsubscribe;
            current.reconnectTimer = null;
            current.snapshot.state = "connecting";
          }, delay);
        } else {
          session.snapshot.state = "disconnected";
          session.unsubscribe();
          sessions.delete(sessionId);
        }
      }
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
        state: "connecting",
        autoReconnect: input.autoReconnect ?? false,
        reconnectAttempts: 0
      };

      const transport = createTransport({
        sessionId,
        transport: input.transport,
        profileId: input.profileId,
        cols: input.cols,
        rows: input.rows,
        sshOptions: input.sshOptions,
        serialOptions: input.serialOptions
      });

      const unsubscribe = transport.onEvent((event) => {
        handleEvent(sessionId, event);
      });

      sessions.set(sessionId, {
        snapshot,
        transport,
        unsubscribe,
        input,
        reconnectTimer: null
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

      if (session.reconnectTimer !== null) {
        clearTimeout(session.reconnectTimer);
        session.reconnectTimer = null;
      }
      session.snapshot.autoReconnect = false;

      session.transport.close();
      session.unsubscribe();
      session.snapshot.state = "disconnected";
      sessions.delete(sessionId);
    },

    destroyAll(): void {
      for (const [sessionId, session] of sessions) {
        if (session.reconnectTimer !== null) {
          clearTimeout(session.reconnectTimer);
          session.reconnectTimer = null;
        }
        session.snapshot.autoReconnect = false;
        session.transport.close();
        session.unsubscribe();
        session.snapshot.state = "disconnected";
        sessions.delete(sessionId);
      }
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
    },

    setSignals(sessionId: string, signals: { dtr?: boolean; rts?: boolean }): void {
      sessions.get(sessionId)?.transport.setSignals?.(signals);
    },

    getSessionInput(sessionId: string): OpenSessionInput | undefined {
      return sessions.get(sessionId)?.input;
    }
  };
}
