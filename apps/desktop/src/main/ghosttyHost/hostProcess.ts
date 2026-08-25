import { randomUUID } from "node:crypto";
import { spawn as nodeSpawn, type ChildProcess } from "node:child_process";
import { createServer as nodeCreateServer, type Server, type Socket } from "node:net";
import { encodeFrame, FrameDecoder, FrameType, PROTOCOL_VERSION, type Frame } from "./protocol";

const HELLO_TIMEOUT_MS = 10_000;
const BACKOFF_BASE_MS = 500;
const BACKOFF_MAX_MS = 5_000;
const FAILURE_WINDOW_MS = 30_000;
const MAX_CONSECUTIVE_FAILURES = 3;

export interface CreateGhosttyHostProcessOptions {
  exePath: string;
  spawn?: typeof nodeSpawn;
  createServer?: typeof nodeCreateServer;
  onFrame: (frame: Frame) => void;
  onRestart: () => void;
  onDead: (reason: string) => void;
}

export interface GhosttyHostProcess {
  start(): Promise<void>;
  send(type: number, surfaceId: number, payload: Buffer | string): void;
  stop(): void;
  isAlive(): boolean;
}

function reasonFromError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function createGhosttyHostProcess(opts: CreateGhosttyHostProcessOptions): GhosttyHostProcess {
  const spawnFn = opts.spawn ?? nodeSpawn;
  const createServerFn = opts.createServer ?? nodeCreateServer;

  let server: Server | null = null;
  let socket: Socket | null = null;
  let child: ChildProcess | null = null;
  let decoder = new FrameDecoder();
  let alive = false;
  let stopped = false;
  let helloTimer: ReturnType<typeof setTimeout> | null = null;
  let respawnTimer: ReturnType<typeof setTimeout> | null = null;
  let backoffAttempt = 0;
  let failureTimestamps: number[] = [];
  let pendingSettleReject: ((err: Error) => void) | null = null;

  function clearHelloTimer(): void {
    if (helloTimer !== null) {
      clearTimeout(helloTimer);
      helloTimer = null;
    }
  }

  function clearRespawnTimer(): void {
    if (respawnTimer !== null) {
      clearTimeout(respawnTimer);
      respawnTimer = null;
    }
  }

  function teardownConnection(): void {
    clearHelloTimer();
    if (socket) {
      socket.removeAllListeners();
      socket.destroy();
      socket = null;
    }
    if (server) {
      server.removeAllListeners();
      server.close();
      server = null;
    }
    if (child) {
      child.removeAllListeners();
      child.kill();
      child = null;
    }
  }

  function backoffDelay(): number {
    return Math.min(BACKOFF_BASE_MS * 2 ** backoffAttempt, BACKOFF_MAX_MS);
  }

  /** Records a respawn failure; returns true once the process has been declared dead. */
  function recordFailure(reason: string): boolean {
    const now = Date.now();
    failureTimestamps.push(now);
    failureTimestamps = failureTimestamps.filter((t) => now - t <= FAILURE_WINDOW_MS);
    if (failureTimestamps.length >= MAX_CONSECUTIVE_FAILURES) {
      stopped = true;
      opts.onDead(reason);
      return true;
    }
    return false;
  }

  function scheduleRespawn(reason: string): void {
    if (stopped) {
      return;
    }
    alive = false;
    teardownConnection();
    if (recordFailure(reason)) {
      return;
    }
    const delay = backoffDelay();
    backoffAttempt += 1;
    respawnTimer = setTimeout(() => {
      respawnTimer = null;
      attemptConnect()
        .then(() => {
          alive = true;
          backoffAttempt = 0;
          failureTimestamps = [];
          opts.onRestart();
        })
        .catch((err: unknown) => {
          scheduleRespawn(reasonFromError(err));
        });
    }, delay);
  }

  function attemptConnect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (stopped) {
        reject(new Error("host process has been stopped"));
        return;
      }

      const pipeName = `\\\\.\\pipe\\hypershell-ghostty-${process.pid}-${randomUUID()}`;
      let settled = false;
      decoder = new FrameDecoder();

      const settleReject = (err: Error): void => {
        if (settled) {
          return;
        }
        settled = true;
        pendingSettleReject = null;
        clearHelloTimer();
        reject(err);
      };
      pendingSettleReject = settleReject;

      const srv = createServerFn((sock: Socket) => {
        socket = sock;

        helloTimer = setTimeout(() => {
          settleReject(new Error("hello handshake timed out"));
        }, HELLO_TIMEOUT_MS);

        sock.on("data", (chunk: Buffer) => {
          let frames: Frame[];
          try {
            frames = decoder.push(chunk);
          } catch (err) {
            if (!settled) {
              settleReject(err instanceof Error ? err : new Error(String(err)));
            } else {
              scheduleRespawn(reasonFromError(err));
            }
            return;
          }

          for (const frame of frames) {
            if (frame.type === FrameType.hello) {
              if (settled) {
                continue;
              }
              let version: number | undefined;
              try {
                version = (JSON.parse(frame.payload.toString()) as { v?: number }).v;
              } catch {
                version = undefined;
              }
              if (version !== PROTOCOL_VERSION) {
                settleReject(
                  new Error(`hello version mismatch: expected ${PROTOCOL_VERSION}, got ${String(version)}`)
                );
                return;
              }
              settled = true;
              pendingSettleReject = null;
              clearHelloTimer();
              resolve();
              continue;
            }
            if (settled) {
              opts.onFrame(frame);
            }
          }
        });

        sock.on("error", (err: Error) => {
          if (!settled) {
            settleReject(err);
          } else {
            scheduleRespawn(err.message);
          }
        });

        sock.on("close", () => {
          if (!settled) {
            settleReject(new Error("pipe closed before hello"));
          } else {
            scheduleRespawn("pipe closed");
          }
        });
      });

      server = srv;
      srv.on("error", (err: Error) => {
        if (!settled) {
          settleReject(err);
        } else {
          scheduleRespawn(err.message);
        }
      });

      srv.listen(pipeName, () => {
        if (stopped) {
          return;
        }
        const proc = spawnFn(opts.exePath, [`--pipe=${pipeName}`]);
        child = proc;

        proc.on("exit", (code: number | null) => {
          if (!settled) {
            settleReject(new Error(`ghostty-host exited before hello (code ${code ?? "unknown"})`));
          } else {
            scheduleRespawn(`ghostty-host exited (code ${code ?? "unknown"})`);
          }
        });

        proc.on("error", (err: Error) => {
          if (!settled) {
            settleReject(err);
          } else {
            scheduleRespawn(err.message);
          }
        });
      });
    });
  }

  return {
    start(): Promise<void> {
      return attemptConnect().then(() => {
        alive = true;
        backoffAttempt = 0;
        failureTimestamps = [];
      });
    },

    send(type: number, surfaceId: number, payload: Buffer | string): void {
      if (!socket || !alive) {
        return;
      }
      socket.write(encodeFrame(type, surfaceId, payload));
    },

    stop(): void {
      stopped = true;
      alive = false;
      clearRespawnTimer();
      if (pendingSettleReject) {
        const settlePending = pendingSettleReject;
        pendingSettleReject = null;
        settlePending(new Error("host process was stopped"));
      }
      teardownConnection();
    },

    isAlive(): boolean {
      return alive;
    }
  };
}
