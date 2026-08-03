import type {
  OpenSessionRequest,
  SessionTransportEvent,
  TransportHandle
} from "./transportEvents";
import { toErrorMessage as toSharedErrorMessage } from "@hypershell/shared";

export interface PtySpawnOptions {
  name?: string;
  cols: number;
  rows: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export interface DisposableLike {
  dispose(): void;
}

export interface PtyExitEvent {
  exitCode: number;
  signal?: number;
}

export interface PtyProcessLike {
  readonly pid?: number;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
  onData(listener: (data: string) => void): DisposableLike;
  onExit(listener: (event: PtyExitEvent) => void): DisposableLike;
}

export type PtySpawn = (
  file: string,
  args: string[],
  options: PtySpawnOptions
) => PtyProcessLike;

export interface PtyProcessConfig {
  command: string;
  args: string[];
  cols: number;
  rows: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  termName?: string;
}

export interface PtyProcessDeps {
  spawnPty?: PtySpawn;
  /** Runs for each chunk before it is emitted. `pty.write` feeds data back in. */
  onData?: (data: string, pty: { write(data: string): void }) => void;
}

// node-pty is loaded via require() at runtime (provided by esbuild banner's createRequire)
declare const require: (id: string) => unknown;

/** Variables Electron injects that would change how tools behave inside a shell. */
const STRIPPED_ENV_KEYS = new Set(["NODE_OPTIONS"]);

export function sanitizePtyEnv(baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};

  for (const [key, value] of Object.entries(baseEnv)) {
    if (key.startsWith("ELECTRON_") || STRIPPED_ENV_KEYS.has(key)) {
      continue;
    }
    result[key] = value;
  }

  return result;
}

export function getDefaultSpawnPty(): PtySpawn {
  const loaded = require("node-pty") as { spawn?: PtySpawn };

  if (!loaded.spawn) {
    throw new Error("node-pty did not provide a spawn function");
  }

  return loaded.spawn;
}

function toErrorMessage(error: unknown): string {
  return toSharedErrorMessage(error, "Unknown PTY error");
}

export function createPtyProcess(
  request: OpenSessionRequest,
  config: PtyProcessConfig,
  deps: PtyProcessDeps = {}
): TransportHandle {
  const listeners = new Set<(event: SessionTransportEvent) => void>();
  const spawnPty = deps.spawnPty ?? getDefaultSpawnPty();
  let pty: PtyProcessLike | null = null;
  let dataSubscription: DisposableLike | null = null;
  let exitSubscription: DisposableLike | null = null;
  let isClosed = false;
  let hasExited = false;

  const emit = (event: SessionTransportEvent): void => {
    for (const listener of listeners) {
      listener(event);
    }
  };

  const cleanup = (): void => {
    dataSubscription?.dispose();
    exitSubscription?.dispose();
    dataSubscription = null;
    exitSubscription = null;
  };

  const emitExit = (exitCode: number | null): void => {
    if (hasExited) {
      return;
    }

    hasExited = true;
    cleanup();

    emit({ type: "exit", sessionId: request.sessionId, exitCode });
  };

  try {
    pty = spawnPty(config.command, config.args, {
      name: config.termName ?? "xterm-256color",
      cols: config.cols,
      rows: config.rows,
      cwd: config.cwd,
      env: config.env
    });
  } catch (error) {
    queueMicrotask(() => {
      emit({
        type: "error",
        sessionId: request.sessionId,
        message: toErrorMessage(error)
      });
      emitExit(null);
    });
  }

  if (pty) {
    const activePty = pty;

    dataSubscription = activePty.onData((data) => {
      if (hasExited || isClosed) {
        return;
      }

      if (deps.onData) {
        deps.onData(data, {
          write(value: string) {
            try {
              activePty.write(value);
            } catch {
              // Ignore write failures; the caller's flow continues.
            }
          }
        });
      }

      emit({ type: "data", sessionId: request.sessionId, data });
    });

    exitSubscription = activePty.onExit((event) => {
      emitExit(event.exitCode ?? null);
    });

    queueMicrotask(() => {
      if (isClosed || hasExited) {
        return;
      }

      emit({ type: "status", sessionId: request.sessionId, state: "connected" });
    });
  }

  return {
    pid: pty?.pid,
    write(data: string) {
      if (!pty || hasExited || isClosed) {
        return;
      }

      try {
        pty.write(data);
      } catch (error) {
        emit({
          type: "error",
          sessionId: request.sessionId,
          message: toErrorMessage(error)
        });
      }
    },
    resize(cols: number, rows: number) {
      if (!pty || hasExited || isClosed) {
        return;
      }

      try {
        pty.resize(cols, rows);
      } catch (error) {
        emit({
          type: "error",
          sessionId: request.sessionId,
          message: toErrorMessage(error)
        });
      }
    },
    close() {
      if (isClosed || hasExited) {
        return;
      }

      isClosed = true;

      if (!pty) {
        emitExit(null);
        return;
      }

      try {
        pty.kill();
      } catch (error) {
        emit({
          type: "error",
          sessionId: request.sessionId,
          message: toErrorMessage(error)
        });

        emitExit(null);
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
