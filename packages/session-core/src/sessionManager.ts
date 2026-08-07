import type {
  OpenSessionRequest,
  SessionState,
  SessionTransportEvent,
  SessionTransportKind,
  SshConnectionOptions,
  SerialConnectionOptions,
  TelnetConnectionOptions,
  LocalConnectionOptions,
  TransportHandle
} from "./transports/transportEvents";
import { DEFAULT_RECONNECT_BASE_INTERVAL } from "@hypershell/shared";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createSerialTransport } from "./transports/serialTransport";
import { createSshPtyTransport, buildSshPtyCommand } from "./transports/sshPtyTransport";
import { createTelnetTransport } from "./transports/telnetTransport";
import { createLocalShellTransport } from "./transports/localShellTransport";
import type { NetworkMonitor } from "./networkMonitor";
import type { ProcessTitlePoller } from "./processTitle/processTitlePoller";
import {
  buildShellIntegrationBootstrap,
  buildShellIntegrationProbe,
  looksLikePrompt,
  SHELL_INTEGRATION_PROBE_MARKER
} from "./shellIntegration/bootstrap";

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
  processTitlePoller?: ProcessTitlePoller;
}

export interface OpenSessionInput {
  transport: SessionTransportKind;
  profileId: string;
  cols: number;
  rows: number;
  sshOptions?: SshConnectionOptions;
  serialOptions?: SerialConnectionOptions;
  telnetOptions?: TelnetConnectionOptions;
  localOptions?: LocalConnectionOptions;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectBaseInterval?: number;
  /** True when this tab will immediately attach to tmux. Suppresses shell integration. */
  tmuxAttach?: boolean;
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

// Shell-integration injection is a handshake, because it is typing into a tty
// whose reader we cannot know: mid-init a line lands in the login tty's
// canonical buffer AND in the line editor's redraw (echoed twice), or answers
// an interactive question like oh-my-zsh's "update? [Y/n]" — and no local
// heuristic can tell those apart from a real prompt.
//   probing         quiet + prompt-shaped tail → write the one-row probe
//   awaiting-probe  the probe's marker bytes prove a shell executed it;
//                   no marker in time → retry the probe (bounded), then give up
//   injecting       shell is provably at a prompt → write the real bootstrap,
//                   whose echo is now single and whose self-erase is sized right
//   done            installed, given up, or not applicable
type BootstrapPhase = "probing" | "awaiting-probe" | "injecting" | "done";

interface ManagedSession {
  snapshot: SessionSnapshot;
  transport: TransportHandle;
  unsubscribe: () => void;
  input: OpenSessionInput;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  reconnectStabilityTimer: ReturnType<typeof setTimeout> | null;
  networkOnlineUnsub: (() => void) | null;
  bootstrapTimer: ReturnType<typeof setTimeout> | null;
  bootstrapProbeTimer: ReturnType<typeof setTimeout> | null;
  bootstrapPhase: BootstrapPhase;
  bootstrapTail: string;
  bootstrapQuietRounds: number;
  bootstrapProbeAttempts: number;
}

const RECONNECT_STABILITY_WINDOW_MS = 5_000;

// How long the session must go quiet (no "data" events) before an injection
// write. Writing immediately on "connected" races the remote login tty — MOTD
// and the prompt draw are still landing. By 500ms of silence the prompt has
// usually settled.
const SHELL_INTEGRATION_QUIET_MS = 500;

// Quiet alone is not proof of a prompt: a shell whose init pauses for longer
// than the quiet window produces silence with no prompt. A quiet window only
// writes when the output tail also looks like a prompt (looksLikePrompt);
// otherwise it re-arms, up to this many rounds before writing anyway so an
// exotic promptless shell still gets its probe.
const SHELL_INTEGRATION_MAX_QUIET_ROUNDS = 10;

// The prompt check only ever needs the last screen line or so of output.
const SHELL_INTEGRATION_TAIL_CHARS = 400;

// How long to wait for the probe's marker bytes before concluding the probe
// was eaten (interactive question, canonical-mode limbo) and trying again.
const SHELL_INTEGRATION_PROBE_TIMEOUT_MS = 2_000;

// Probes after this many silent attempts stop: the far side is not a shell
// that executes typed lines (or is drowning them), and each failed probe
// leaves a one-line scar. Giving up degrades to OSC-only titles.
const SHELL_INTEGRATION_MAX_PROBE_ATTEMPTS = 3;

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

  if (request.transport === "local") {
    // No fallback here on purpose. Every other transport can degrade to
    // "treat profileId as the target", but for local shells profileId comes
    // from the renderer and the target is a process to spawn — the main
    // process resolving it against the profile store is the whole security
    // boundary. Refuse rather than spawn an unresolved string.
    if (!request.localOptions) {
      throw new Error("local transport requires resolved localOptions");
    }

    const opts = request.localOptions;
    return createLocalShellTransport(request, {
      executable: opts.executable,
      args: opts.args,
      cwd: opts.cwd,
      envVars: opts.envVars
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
  const processTitlePoller = deps.processTitlePoller;

  processTitlePoller?.onChange((sessionId, name) => {
    // A poll can land after the session went away; don't resurrect a dead tab.
    if (!sessions.has(sessionId)) {
      return;
    }

    for (const listener of listeners) {
      listener({ type: "process-title", sessionId, name });
    }
  });

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

  function clearReconnectTimer(session: ManagedSession): void {
    if (session.reconnectTimer === null) {
      return;
    }

    clearTimeout(session.reconnectTimer);
    session.reconnectTimer = null;
  }

  function clearReconnectStabilityTimer(session: ManagedSession): void {
    if (session.reconnectStabilityTimer === null) {
      return;
    }

    clearTimeout(session.reconnectStabilityTimer);
    session.reconnectStabilityTimer = null;
  }

  function clearBootstrapTimer(session: ManagedSession): void {
    if (session.bootstrapTimer === null) {
      return;
    }

    clearTimeout(session.bootstrapTimer);
    session.bootstrapTimer = null;
  }

  function clearBootstrapProbeTimer(session: ManagedSession): void {
    if (session.bootstrapProbeTimer === null) {
      return;
    }

    clearTimeout(session.bootstrapProbeTimer);
    session.bootstrapProbeTimer = null;
  }

  function shellIntegrationApplies(session: ManagedSession): boolean {
    return (
      session.input.transport === "ssh" &&
      session.input.sshOptions?.shellIntegration !== false &&
      session.input.sshOptions?.password === undefined &&
      session.input.tmuxAttach !== true
    );
  }

  // Debounced by SHELL_INTEGRATION_QUIET_MS: (re)scheduling cancels any
  // pending write, so a burst of "data" events collapses to a single write
  // once the session goes quiet. Guard conditions are re-checked at fire
  // time — the session may have closed or its input may no longer qualify
  // by then, not just at schedule time.
  function scheduleShellIntegrationWrite(sessionId: string): void {
    const session = sessions.get(sessionId);
    if (!session) {
      return;
    }

    clearBootstrapTimer(session);
    session.bootstrapTimer = setTimeout(() => {
      const current = sessions.get(sessionId);
      if (!current) {
        return;
      }

      current.bootstrapTimer = null;

      if (!shellIntegrationApplies(current)) {
        current.bootstrapPhase = "done";
        return;
      }

      const promptReady = looksLikePrompt(current.bootstrapTail);
      if (!promptReady && current.bootstrapQuietRounds < SHELL_INTEGRATION_MAX_QUIET_ROUNDS) {
        current.bootstrapQuietRounds += 1;
        scheduleShellIntegrationWrite(sessionId);
        return;
      }

      if (current.bootstrapPhase === "probing") {
        current.bootstrapPhase = "awaiting-probe";
        current.bootstrapProbeAttempts += 1;
        current.transport.write(buildShellIntegrationProbe());
        current.bootstrapProbeTimer = setTimeout(() => {
          const still = sessions.get(sessionId);
          if (!still || still.bootstrapPhase !== "awaiting-probe") {
            return;
          }

          still.bootstrapProbeTimer = null;
          if (still.bootstrapProbeAttempts >= SHELL_INTEGRATION_MAX_PROBE_ATTEMPTS) {
            still.bootstrapPhase = "done";
            return;
          }

          still.bootstrapPhase = "probing";
          still.bootstrapQuietRounds = 0;
          scheduleShellIntegrationWrite(sessionId);
        }, SHELL_INTEGRATION_PROBE_TIMEOUT_MS);
        return;
      }

      if (current.bootstrapPhase === "injecting") {
        current.bootstrapPhase = "done";
        current.transport.write(buildShellIntegrationBootstrap(current.snapshot.cols));
      }
    }, SHELL_INTEGRATION_QUIET_MS);
  }

  function handleEvent(sessionId: string, event: SessionTransportEvent): void {
    if (event.type === "status") {
      updateSession(sessionId, (session) => {
        session.snapshot.state = event.state;
        if (event.state === "connected") {
          clearReconnectStabilityTimer(session);
          session.reconnectStabilityTimer = setTimeout(() => {
            const current = sessions.get(sessionId);
            if (!current || current.snapshot.state !== "connected") {
              return;
            }

            current.snapshot.reconnectAttempts = 0;
            current.reconnectStabilityTimer = null;
          }, RECONNECT_STABILITY_WINDOW_MS);
          return;
        }

        clearReconnectStabilityTimer(session);
      });

      if (event.state === "connected") {
        const session = sessions.get(sessionId);
        if (session && shellIntegrationApplies(session)) {
          // Fires on every connect, including reconnects — each one is a fresh
          // remote shell with no hook installed. The actual write is debounced;
          // see scheduleShellIntegrationWrite.
          clearBootstrapProbeTimer(session);
          session.bootstrapPhase = "probing";
          session.bootstrapTail = "";
          session.bootstrapQuietRounds = 0;
          session.bootstrapProbeAttempts = 0;
          scheduleShellIntegrationWrite(sessionId);
        }
      }
    }

    if (event.type === "data") {
      const session = sessions.get(sessionId);
      if (session && session.bootstrapPhase !== "done") {
        // Keep the tail so the quiet handler can tell a settled prompt from a
        // mid-init lull, and so the probe's marker can be spotted.
        session.bootstrapTail = (session.bootstrapTail + event.data).slice(
          -SHELL_INTEGRATION_TAIL_CHARS
        );

        if (
          session.bootstrapPhase === "awaiting-probe" &&
          session.bootstrapTail.includes(SHELL_INTEGRATION_PROBE_MARKER)
        ) {
          // Marker bytes prove a shell executed the probe at a prompt — the
          // real bootstrap can now be typed with a single, erasable echo.
          clearBootstrapProbeTimer(session);
          session.bootstrapPhase = "injecting";
          session.bootstrapQuietRounds = 0;
          scheduleShellIntegrationWrite(sessionId);
        } else if (session.bootstrapTimer !== null) {
          // A pending write means the session isn't quiet yet — push it out.
          scheduleShellIntegrationWrite(sessionId);
        }
      }
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
        clearReconnectStabilityTimer(session);
        clearBootstrapTimer(session);
        clearBootstrapProbeTimer(session);
        const { snapshot, input } = session;
        const maxAttempts = input.maxReconnectAttempts ?? 5;

        if (input.transport !== "local" && snapshot.autoReconnect && snapshot.reconnectAttempts < maxAttempts) {
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

            const baseMs = (snapshot.reconnectBaseInterval ?? DEFAULT_RECONNECT_BASE_INTERVAL) * 1000;
            const delay = Math.min(baseMs * Math.pow(2, snapshot.reconnectAttempts - 1), 30000);
            session.reconnectTimer = setTimeout(() => {
              attemptReconnect(sessionId);
            }, delay);
          }
        } else {
          session.snapshot.state = "disconnected";
          session.unsubscribe();
          processTitlePoller?.unregister(sessionId);
          sessions.delete(sessionId);
        }
      }
    }
  }

  function attemptReconnect(sessionId: string): void {
    const current = sessions.get(sessionId);
    if (!current) return;

    clearReconnectStabilityTimer(current);

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
        autoReconnect: input.transport === "local" ? false : (input.autoReconnect ?? false),
        reconnectAttempts: 0,
        reconnectBaseInterval: input.reconnectBaseInterval ?? DEFAULT_RECONNECT_BASE_INTERVAL
      };

      const transport = createTransport({
        sessionId,
        transport: input.transport,
        profileId: input.profileId,
        cols: input.cols,
        rows: input.rows,
        sshOptions: input.sshOptions,
        serialOptions: input.serialOptions,
        telnetOptions: input.telnetOptions,
        localOptions: input.localOptions
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
        reconnectStabilityTimer: null,
        networkOnlineUnsub: null,
        bootstrapTimer: null,
        bootstrapProbeTimer: null,
        bootstrapPhase: "done",
        bootstrapTail: "",
        bootstrapQuietRounds: 0,
        bootstrapProbeAttempts: 0
      });

      if (input.transport === "local" && transport.pid !== undefined) {
        processTitlePoller?.register(sessionId, transport.pid);
      }

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

      clearReconnectTimer(session);
      clearReconnectStabilityTimer(session);
      clearBootstrapTimer(session);
      clearBootstrapProbeTimer(session);
      if (session.networkOnlineUnsub) {
        session.networkOnlineUnsub();
        session.networkOnlineUnsub = null;
      }
      session.snapshot.autoReconnect = false;

      session.transport.close();
      session.unsubscribe();
      session.snapshot.state = "disconnected";
      processTitlePoller?.unregister(sessionId);
      sessions.delete(sessionId);
    },

    destroyAll(): void {
      for (const [sessionId, session] of sessions) {
        clearReconnectTimer(session);
        clearReconnectStabilityTimer(session);
        clearBootstrapTimer(session);
        clearBootstrapProbeTimer(session);
        if (session.networkOnlineUnsub) {
          session.networkOnlineUnsub();
          session.networkOnlineUnsub = null;
        }
        session.snapshot.autoReconnect = false;
        session.transport.close();
        session.unsubscribe();
        session.snapshot.state = "disconnected";
        processTitlePoller?.unregister(sessionId);
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
