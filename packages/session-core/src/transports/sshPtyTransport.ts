import type {
  OpenSessionRequest,
  SessionTransportEvent,
  TransportHandle
} from "./transportEvents";
import { existsSync } from "node:fs";
import path from "node:path";

export interface SshConnectionProfile {
  hostname: string;
  username?: string;
  port?: number;
  identityFile?: string;
  password?: string;
  proxyJump?: string;
  keepAliveSeconds?: number;
  requestTty?: boolean;
  extraArgs?: string[];
}

export interface SshPtyCommand {
  command: string;
  args: string[];
}

export interface SshPtySpawnOptions {
  name?: string;
  cols: number;
  rows: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export interface DisposableLike {
  dispose(): void;
}

export interface SshPtyExitEvent {
  exitCode: number;
  signal?: number;
}

export interface SshPtyProcess {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
  onData(listener: (data: string) => void): DisposableLike;
  onExit(listener: (event: SshPtyExitEvent) => void): DisposableLike;
}

export type SshPtySpawn = (
  file: string,
  args: string[],
  options: SshPtySpawnOptions
) => SshPtyProcess;

export interface CreateSshPtyTransportDeps {
  spawnPty?: SshPtySpawn;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  termName?: string;
}

// node-pty is loaded via require() at runtime (provided by esbuild banner's createRequire)
declare const require: (id: string) => unknown;

export function buildSshArgs(profile: SshConnectionProfile): string[] {
  const args: string[] = [];

  if (profile.port != null) {
    args.push("-p", String(profile.port));
  }

  if (profile.identityFile) {
    args.push("-i", profile.identityFile);
  }

  if (profile.proxyJump) {
    args.push("-J", profile.proxyJump);
  }

  if (profile.keepAliveSeconds != null) {
    args.push("-o", `ServerAliveInterval=${profile.keepAliveSeconds}`);
    args.push("-o", "ServerAliveCountMax=3");
  }

  if (profile.requestTty !== false) {
    args.push("-tt");
  }

  if (profile.extraArgs?.length) {
    args.push(...profile.extraArgs);
  }

  const destination = profile.username
    ? `${profile.username}@${profile.hostname}`
    : profile.hostname;

  args.push(destination);
  return args;
}

export function buildSshPtyCommand(profile: SshConnectionProfile): SshPtyCommand {
  let command = "ssh";
  if (process.platform === "win32") {
    const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
    if (systemRoot) {
      const bundledWindowsSshPath = path.join(
        systemRoot,
        "System32",
        "OpenSSH",
        "ssh.exe"
      );
      if (existsSync(bundledWindowsSshPath)) {
        command = bundledWindowsSshPath;
      }
    }
  }

  return {
    command,
    args: buildSshArgs(profile)
  };
}

export interface SshPtyTransport extends TransportHandle {
  command: SshPtyCommand;
  request: OpenSessionRequest;
}

function getDefaultSpawnPty(): SshPtySpawn {
  const loaded = require("node-pty") as {
    spawn?: SshPtySpawn;
  };

  if (!loaded.spawn) {
    throw new Error("node-pty did not provide a spawn function");
  }

  return loaded.spawn;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.length > 0) {
    return error;
  }

  return "Unknown PTY error";
}

export function createSshPtyTransport(
  request: OpenSessionRequest,
  profile: SshConnectionProfile,
  deps: CreateSshPtyTransportDeps = {}
): SshPtyTransport {
  const listeners = new Set<(event: SessionTransportEvent) => void>();
  const command = buildSshPtyCommand(profile);
  const spawnPty = deps.spawnPty ?? getDefaultSpawnPty();
  let pty: SshPtyProcess | null = null;
  let dataSubscription: DisposableLike | null = null;
  let exitSubscription: DisposableLike | null = null;
  let isClosed = false;
  let hasExited = false;
  let authSecretSent = false;
  let promptBuffer = "";

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

    emit({
      type: "exit",
      sessionId: request.sessionId,
      exitCode
    });
  };

  try {
    pty = spawnPty(command.command, command.args, {
      name: deps.termName ?? "xterm-256color",
      cols: request.cols,
      rows: request.rows,
      cwd: deps.cwd,
      env: deps.env ?? process.env
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
    dataSubscription = pty.onData((data) => {
      if (hasExited || isClosed) {
        return;
      }

      if (!authSecretSent && profile.password) {
        promptBuffer = `${promptBuffer}${data}`.slice(-512);
        if (/(pass(word|phrase)|verification code|otp).*:\s*$/im.test(promptBuffer)) {
          authSecretSent = true;
          try {
            pty?.write(`${profile.password}\r`);
          } catch {
            // Ignore write failures and let normal SSH auth continue.
          }
        }
      }

      emit({
        type: "data",
        sessionId: request.sessionId,
        data
      });
    });

    exitSubscription = pty.onExit((event) => {
      emitExit(event.exitCode ?? null);
    });

    queueMicrotask(() => {
      if (isClosed || hasExited) {
        return;
      }

      emit({
        type: "status",
        sessionId: request.sessionId,
        state: "connected"
      });
    });
  }

  return {
    command,
    request,
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
