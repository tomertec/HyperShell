import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { Readable, Writable } from "node:stream";
import { Client, type ConnectConfig, type OpenMode, type SFTPWrapper, type Stats } from "ssh2";

import type {
  SessionState,
  SessionTransportEvent,
  SftpConnectionOptions,
  SftpSecurityOptions
} from "./transportEvents";
import type { Ssh2ConnectionPool, Ssh2PoolTarget, ResolvedAuth } from "../ssh2ConnectionPool";

export type { SftpConnectionOptions } from "./transportEvents";

export interface KeyboardInteractivePrompt {
  prompt: string;
  echo: boolean;
}

export type KeyboardInteractiveCallback = (
  name: string,
  instructions: string,
  prompts: KeyboardInteractivePrompt[]
) => Promise<string[]>;

export interface SftpTransportOptions extends SftpSecurityOptions {
  pool?: Ssh2ConnectionPool;
  onKeyboardInteractive?: KeyboardInteractiveCallback;
}

export interface SftpEntry {
  name: string;
  path: string;
  size: number;
  modifiedAt: string;
  isDirectory: boolean;
  permissions: number;
  owner: number;
  group: number;
}

export interface SftpTransportHandle {
  connect(): Promise<void>;
  disconnect(): void;
  list(remotePath: string): Promise<SftpEntry[]>;
  stat(remotePath: string): Promise<SftpEntry>;
  chmod(remotePath: string, permissions: number): Promise<void>;
  mkdir(remotePath: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  remove(remotePath: string, recursive?: boolean): Promise<void>;
  readFile(remotePath: string): Promise<Buffer>;
  writeFile(remotePath: string, data: Buffer): Promise<void>;
  createReadStream(remotePath: string, options?: { start?: number }): Readable;
  createWriteStream(remotePath: string, options?: { start?: number; flags?: OpenMode }): Writable;
  onEvent(listener: (event: SessionTransportEvent) => void): () => void;
}

/** Collect all candidate key file paths in priority order. */
function collectKeyPaths(options: SftpConnectionOptions): string[] {
  const paths: string[] = [];
  if (options.privateKeyPath) paths.push(options.privateKeyPath);
  if (options.fallbackKeyPaths) {
    for (const p of options.fallbackKeyPaths) {
      if (!paths.includes(p)) paths.push(p);
    }
  }
  return paths;
}

export function buildConnectConfig(
  options: SftpConnectionOptions,
  keyPath?: string,
  securityOptions?: SftpSecurityOptions
): ConnectConfig {
  // Strip Windows domain prefix (e.g. "DOMAIN\user" → "user") — SSH servers
  // don't understand Windows domain usernames.
  let sshUsername = options.username;
  if (sshUsername && sshUsername.includes("\\")) {
    sshUsername = sshUsername.split("\\").pop();
  }

  const config: ConnectConfig = {
    host: options.hostname,
    port: options.port ?? 22,
    username: sshUsername,
    keepaliveInterval: (options.keepAliveSeconds ?? 60) * 1000
  };

  if (keyPath) {
    try {
      config.privateKey = readFileSync(keyPath);
    } catch {
      // Key file unreadable — skip.
    }
  }

  if (options.passphrase) {
    config.passphrase = options.passphrase;
  }

  const agentPath = options.agentPath ?? process.env.SSH_AUTH_SOCK;
  if (agentPath) {
    config.agent = agentPath;
  }

  if (options.password) {
    config.password = options.password;
  }

  // Enable keyboard-interactive auth to support 2FA/MFA prompts
  config.tryKeyboard = true;

  const trustedFingerprints = new Set(securityOptions?.trustedHostFingerprints ?? []);
  if (trustedFingerprints.size > 0) {
    config.hostVerifier = (key: Buffer) => {
      const fingerprint = `SHA256:${createHash("sha256").update(key).digest("base64")}`;
      return trustedFingerprints.has(fingerprint);
    };
  }

  return config;
}

function buildEntry(path: string, attrs: Stats): SftpEntry {
  const name = path.split("/").filter(Boolean).at(-1) ?? path;
  const mode = attrs.mode ?? 0;
  return {
    name,
    path,
    size: attrs.size ?? 0,
    modifiedAt: new Date((attrs.mtime ?? 0) * 1000).toISOString(),
    isDirectory: (mode & 0o40000) !== 0,
    permissions: mode & 0o7777,
    owner: attrs.uid ?? 0,
    group: attrs.gid ?? 0
  };
}

function combineRemotePath(parentPath: string, name: string): string {
  const normalizedParent = parentPath.endsWith("/")
    ? parentPath.slice(0, -1)
    : parentPath;
  if (normalizedParent.length === 0) {
    return `/${name}`;
  }

  return `${normalizedParent}/${name}`;
}

function resolveAuth(options: SftpConnectionOptions): ResolvedAuth {
  if (options.authMethod === "password" && options.password) {
    return { type: "password", password: options.password };
  }
  if (options.authMethod === "agent" || options.agentPath || process.env.SSH_AUTH_SOCK) {
    return { type: "agent", agent: options.agentPath ?? process.env.SSH_AUTH_SOCK ?? "" };
  }
  if (options.privateKeyPath) {
    try {
      const privateKey = readFileSync(options.privateKeyPath);
      return { type: "key", privateKey, passphrase: options.passphrase };
    } catch {
      // Fall through
    }
  }
  // Default to password if available
  if (options.password) {
    return { type: "password", password: options.password };
  }
  return { type: "agent", agent: process.env.SSH_AUTH_SOCK ?? "" };
}

export function createSftpTransport(
  sessionId: string,
  options: SftpConnectionOptions,
  transportOptions?: SftpTransportOptions
): SftpTransportHandle {
  const listeners = new Set<(event: SessionTransportEvent) => void>();
  let client: Client | null = null;
  let sftp: SFTPWrapper | null = null;
  let poolConnectionId: string | null = null;
  let poolConsumerId: string | null = null;
  const pool = transportOptions?.pool;

  const emit = (event: SessionTransportEvent) => {
    queueMicrotask(() => {
      for (const listener of listeners) {
        listener(event);
      }
    });
  };

  const emitStatus = (state: SessionState) => {
    emit({ type: "status", sessionId, state });
  };

  const emitError = (message: string) => {
    emit({ type: "error", sessionId, message });
  };

  const requireSftp = (): SFTPWrapper => {
    if (!sftp) {
      throw new Error("SFTP session not connected");
    }

    return sftp;
  };

  function tryConnect(connectConfig: ConnectConfig): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const conn = new Client();
      let settled = false;

      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        conn.removeAllListeners();
        reject(error);
      };

      conn.on("ready", () => {
        conn.sftp((error, sftpSession) => {
          if (error) {
            fail(error);
            return;
          }
          if (settled) return;

          settled = true;
          client = conn;
          sftp = sftpSession;

          conn.on("close", () => {
            sftp = null;
            client = null;
            emitStatus("disconnected");
          });

          resolve();
        });
      });

      conn.on("error", fail);

      // Handle keyboard-interactive auth (2FA, TOTP, etc.)
      const onKbdInteractive = transportOptions?.onKeyboardInteractive;
      if (onKbdInteractive) {
        conn.on("keyboard-interactive", (name, instructions, _instructionsLang, prompts, finish) => {
          const mappedPrompts = prompts.map((p) => ({
            prompt: p.prompt,
            echo: p.echo ?? false,
          }));
          onKbdInteractive(name, instructions, mappedPrompts)
            .then((responses) => {
              finish(responses);
            })
            .catch(() => {
              // User cancelled or error — send empty responses so server rejects
              finish(prompts.map(() => ""));
            });
        });
      }

      conn.connect(connectConfig);
    });
  }

  async function connect(): Promise<void> {
    emitStatus("connecting");

    // If pool is provided, use pooled connection
    if (pool) {
      try {
        const target: Ssh2PoolTarget = {
          hostname: options.hostname,
          port: options.port ?? 22,
          username: options.username ?? "",
          auth: resolveAuth(options),
          keepAliveSeconds: options.keepAliveSeconds,
        };

        const pooled = await pool.acquire(target);
        poolConnectionId = pooled.connectionId;
        poolConsumerId = pooled.consumerId;
        client = pooled.client;

        // Get SFTP session from the pooled client
        sftp = await new Promise<SFTPWrapper>((resolve, reject) => {
          pooled.client.sftp((err, sftpSession) => {
            if (err) reject(err);
            else resolve(sftpSession);
          });
        });

        emitStatus("connected");
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        emitError(message);
        emitStatus("failed");
        throw error;
      }
    }

    // Collect all candidate key paths and try each one sequentially,
    // just like the system ssh binary does.
    const keyPaths = collectKeyPaths(options);
    const attempts = keyPaths.length > 0 ? keyPaths : [undefined];

    let lastError: Error | null = null;
    for (const keyPath of attempts) {
      const config = buildConnectConfig(options, keyPath, transportOptions);

      try {
        await tryConnect(config);
        emitStatus("connected");
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    emitError(lastError?.message ?? "All authentication methods failed");
    emitStatus("failed");
    throw lastError ?? new Error("All authentication methods failed");
  }

  function disconnect(): void {
    if (pool && poolConnectionId && poolConsumerId) {
      const activeSftp = sftp as { end?: () => void } | null;
      try {
        activeSftp?.end?.();
      } catch {
        // Best effort: the underlying pooled SSH client is still released below.
      }

      // Release back to pool — don't end the client
      pool.release(poolConnectionId, poolConsumerId);
      poolConnectionId = null;
      poolConsumerId = null;
      client = null;
      sftp = null;
      return;
    }

    if (!client) {
      return;
    }

    client.end();
    client = null;
    sftp = null;
  }

  async function list(remotePath: string): Promise<SftpEntry[]> {
    const sftpSession = requireSftp();
    return await new Promise<SftpEntry[]>((resolve, reject) => {
      sftpSession.readdir(remotePath, (error, entries) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(
          (entries ?? [])
            .filter((entry) => entry.filename !== "." && entry.filename !== "..")
            .map((entry) => {
              const path = combineRemotePath(remotePath, entry.filename);
              return {
                ...buildEntry(path, entry.attrs),
                name: entry.filename
              };
            })
        );
      });
    });
  }

  async function stat(remotePath: string): Promise<SftpEntry> {
    const sftpSession = requireSftp();
    return await new Promise<SftpEntry>((resolve, reject) => {
      sftpSession.stat(remotePath, (error, attrs) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(buildEntry(remotePath, attrs));
      });
    });
  }

  async function mkdir(remotePath: string): Promise<void> {
    const sftpSession = requireSftp();
    await new Promise<void>((resolve, reject) => {
      sftpSession.mkdir(remotePath, (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  async function chmod(remotePath: string, permissions: number): Promise<void> {
    const sftpSession = requireSftp();
    await new Promise<void>((resolve, reject) => {
      sftpSession.chmod(remotePath, permissions & 0o7777, (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  async function rename(oldPath: string, newPath: string): Promise<void> {
    const sftpSession = requireSftp();
    await new Promise<void>((resolve, reject) => {
      sftpSession.rename(oldPath, newPath, (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  async function remove(remotePath: string, recursive = false): Promise<void> {
    const sftpSession = requireSftp();
    const entry = await stat(remotePath);

    if (!entry.isDirectory) {
      await new Promise<void>((resolve, reject) => {
        sftpSession.unlink(remotePath, (error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
      return;
    }

    if (recursive) {
      const entries = await list(remotePath);
      for (const child of entries) {
        if (child.isDirectory) {
          await remove(child.path, true);
          continue;
        }

        await new Promise<void>((resolve, reject) => {
          sftpSession.unlink(child.path, (error) => {
            if (error) {
              reject(error);
              return;
            }

            resolve();
          });
        });
      }
    }

    await new Promise<void>((resolve, reject) => {
      sftpSession.rmdir(remotePath, (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  async function readFile(remotePath: string): Promise<Buffer> {
    const MAX_READ_SIZE = 10 * 1024 * 1024; // 10 MB
    const entry = await stat(remotePath);
    if (entry.size > MAX_READ_SIZE) {
      throw new Error(
        `File too large to open in editor (${(entry.size / 1024 / 1024).toFixed(1)} MB, max ${MAX_READ_SIZE / 1024 / 1024} MB)`
      );
    }

    const sftpSession = requireSftp();
    const stream = sftpSession.createReadStream(remotePath);
    return await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: string | Buffer) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      stream.on("error", reject);
      stream.on("end", () => {
        resolve(Buffer.concat(chunks));
      });
    });
  }

  async function writeFile(remotePath: string, data: Buffer): Promise<void> {
    const sftpSession = requireSftp();
    const stream = sftpSession.createWriteStream(remotePath);
    await new Promise<void>((resolve, reject) => {
      stream.on("error", reject);
      stream.on("close", () => resolve());
      stream.end(data);
    });
  }

  function createReadStream(remotePath: string, options?: { start?: number }): Readable {
    return requireSftp().createReadStream(remotePath, options);
  }

  function createWriteStream(remotePath: string, options?: { start?: number; flags?: OpenMode }): Writable {
    return requireSftp().createWriteStream(remotePath, options);
  }

  function onEvent(listener: (event: SessionTransportEvent) => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return {
    connect,
    disconnect,
    list,
    stat,
    chmod,
    mkdir,
    rename,
    remove,
    readFile,
    writeFile,
    createReadStream,
    createWriteStream,
    onEvent
  };
}
