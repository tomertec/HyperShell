import type {
  OpenSessionRequest,
  SessionState,
  SessionTransportEvent,
  SessionTransportKind,
  SshConnectionOptions,
  SerialConnectionOptions,
  TelnetConnectionOptions,
  TransportHandle
} from "./transports/transportEvents";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createSerialTransport } from "./transports/serialTransport";
import { createSshPtyTransport, buildSshPtyCommand } from "./transports/sshPtyTransport";
import { createTelnetTransport } from "./transports/telnetTransport";
import type { NetworkMonitor } from "./networkMonitor";

const execFileAsync = promisify(execFile);

export interface SessionSnapshot {
  sessionId: string;
  transport: SessionTransportKind;
  profileId: string;
  cols: number;
  rows: number;
  state: SessionState;
  autoReconnect: boolean;
  reconnectAttempts: number;
  reconnectBaseInterval: number;
}

export interface SessionManagerDeps {
  createTransport?: (request: OpenSessionRequest) => TransportHandle;
  sessionIdFactory?: () => string;
  networkMonitor?: NetworkMonitor;
}

export interface OpenSessionInput {
  transport: SessionTransportKind;
  profileId: string;
  cols: number;
  rows: number;
  sshOptions?: SshConnectionOptions;
  serialOptions?: SerialConnectionOptions;
  telnetOptions?: TelnetConnectionOptions;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectBaseInterval?: number;
}

export interface OpenSessionResult {
  sessionId: string;
  state: SessionState;
}

export interface ExecCommandOptions {
  timeoutMs?: number;
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
  execCommand(sessionId: string, command: string, options?: ExecCommandOptions): Promise<string>;
}

interface ManagedSession {
  snapshot: SessionSnapshot;
  transport: TransportHandle;
  unsubscribe: () => void;
  input: OpenSessionInput;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  networkOnlineUnsub: (() => void) | null;
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
      password: opts.password,
      proxyJump: opts.proxyJump,
      keepAliveSeconds: opts.keepAliveSeconds,
      envVars: opts.envVars
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

  if (request.transport === "telnet") {
    const opts = request.telnetOptions ?? { hostname: request.profileId, port: 23, mode: "telnet" as const };
    return createTelnetTransport(request, {
      hostname: opts.hostname,
      port: opts.port,
      mode: opts.mode,
      terminalType: opts.terminalType,
    });
  }

  return createNoopTransport(request.sessionId);
}

export function createSessionManager(
  deps: SessionManagerDeps = {}
): SessionManager {
  const sessions = new Map<string, ManagedSession>();
  const listeners = new Set<(event: SessionTransportEvent) => void>();
  let nextSessionId = 1;
  const sessionIdFactory =
    deps.sessionIdFactory ?? (() => `session-${nextSessionId++}`);
  const createTransport = deps.createTransport ?? createDefaultTransport;
  const networkMonitor = deps.networkMonitor;

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
        if (event.state === "connected") {
          session.snapshot.reconnectAttempts = 0;
        }
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
          session.unsubscribe();

          // Check network status before attempting reconnect
          if (networkMonitor && !networkMonitor.isOnline()) {
            // Network is down — enter waiting_for_network state (don't burn an attempt)
            snapshot.state = "waiting_for_network";
            for (const listener of listeners) {
              listener({ type: "status", sessionId, state: "waiting_for_network" });
            }

            // When network comes back, reset attempts and start reconnecting
            session.networkOnlineUnsub = networkMonitor.onOnline(() => {
              const current = sessions.get(sessionId);
              if (!current) return;

              if (current.networkOnlineUnsub) {
                current.networkOnlineUnsub();
                current.networkOnlineUnsub = null;
              }

              current.snapshot.reconnectAttempts = 0;
              current.snapshot.state = "reconnecting";
              for (const listener of listeners) {
                listener({ type: "status", sessionId, state: "reconnecting" });
              }

              // Start reconnection immediately (no delay on first attempt after network restore)
              attemptReconnect(sessionId);
            });
          } else {
            // Network is up (or no monitor) — normal reconnect with backoff
            snapshot.reconnectAttempts += 1;
            snapshot.state = "reconnecting";

            for (const listener of listeners) {
              listener({ type: "status", sessionId, state: "reconnecting" });
            }

            const baseMs = (snapshot.reconnectBaseInterval ?? 1) * 1000;
            const delay = Math.min(baseMs * Math.pow(2, snapshot.reconnectAttempts - 1), 30000);
            session.reconnectTimer = setTimeout(() => {
              attemptReconnect(sessionId);
            }, delay);
          }
        } else {
          session.snapshot.state = "disconnected";
          session.unsubscribe();
          sessions.delete(sessionId);
        }
      }
    }
  }

  function attemptReconnect(sessionId: string): void {
    const current = sessions.get(sessionId);
    if (!current) return;

    const { input } = current;
    const newTransport = createTransport({
      sessionId,
      transport: input.transport,
      profileId: input.profileId,
      cols: current.snapshot.cols,
      rows: current.snapshot.rows,
      sshOptions: input.sshOptions,
      serialOptions: input.serialOptions,
      telnetOptions: input.telnetOptions,
    });

    const newUnsubscribe = newTransport.onEvent((e) => {
      handleEvent(sessionId, e);
    });

    current.transport = newTransport;
    current.unsubscribe = newUnsubscribe;
    current.reconnectTimer = null;
    current.snapshot.state = "connecting";
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
        reconnectAttempts: 0,
        reconnectBaseInterval: input.reconnectBaseInterval ?? 1
      };

      const transport = createTransport({
        sessionId,
        transport: input.transport,
        profileId: input.profileId,
        cols: input.cols,
        rows: input.rows,
        sshOptions: input.sshOptions,
        serialOptions: input.serialOptions,
        telnetOptions: input.telnetOptions
      });

      const unsubscribe = transport.onEvent((event) => {
        handleEvent(sessionId, event);
      });

      sessions.set(sessionId, {
        snapshot,
        transport,
        unsubscribe,
        input,
        reconnectTimer: null,
        networkOnlineUnsub: null
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
      if (session.networkOnlineUnsub) {
        session.networkOnlineUnsub();
        session.networkOnlineUnsub = null;
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
        if (session.networkOnlineUnsub) {
          session.networkOnlineUnsub();
          session.networkOnlineUnsub = null;
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
      const session = sessions.get(sessionId);
      if (!session) return undefined;
      // Return a copy with credentials stripped
      const { sshOptions, ...rest } = session.input;
      if (!sshOptions) return rest;
      const { password: _pw, ...safeSshOptions } = sshOptions;
      return { ...rest, sshOptions: safeSshOptions };
    },

    execCommand(sessionId: string, command: string, options: ExecCommandOptions = {}): Promise<string> {
      const session = sessions.get(sessionId);
      if (!session) return Promise.reject(new Error("Session not found"));
      const opts = session.input.sshOptions;
      if (!opts) return Promise.reject(new Error("Not an SSH session"));

      const { command: sshBin, args } = buildSshPtyCommand({
        hostname: opts.hostname,
        username: opts.username,
        port: opts.port,
        identityFile: opts.identityFile,
        proxyJump: opts.proxyJump,
        keepAliveSeconds: opts.keepAliveSeconds,
        requestTty: false,
        extraArgs: ["-o", "BatchMode=yes"]
      });
      args.push(command);

      const timeoutMs = options.timeoutMs ?? 10_000;
      return execFileAsync(sshBin, args, { timeout: timeoutMs, windowsHide: true })
        .then(({ stdout }) => stdout);
    }
  };
}
