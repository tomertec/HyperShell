import { readFileSync } from "node:fs";
import type { Readable, Writable } from "node:stream";
import { Client, type ConnectConfig, type SFTPWrapper, type Stats } from "ssh2";

import type {
  SessionState,
  SessionTransportEvent,
  SftpConnectionOptions
} from "./transportEvents";

export type { SftpConnectionOptions } from "./transportEvents";

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
  mkdir(remotePath: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  remove(remotePath: string, recursive?: boolean): Promise<void>;
  readFile(remotePath: string): Promise<Buffer>;
  writeFile(remotePath: string, data: Buffer): Promise<void>;
  createReadStream(remotePath: string): Readable;
  createWriteStream(remotePath: string): Writable;
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

function buildConnectConfig(options: SftpConnectionOptions, keyPath?: string): ConnectConfig {
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

export function createSftpTransport(
  sessionId: string,
  options: SftpConnectionOptions
): SftpTransportHandle {
  const listeners = new Set<(event: SessionTransportEvent) => void>();
  let client: Client | null = null;
  let sftp: SFTPWrapper | null = null;

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
      conn.connect(connectConfig);
    });
  }

  async function connect(): Promise<void> {
    emitStatus("connecting");

    // Collect all candidate key paths and try each one sequentially,
    // just like the system ssh binary does.
    const keyPaths = collectKeyPaths(options);
    const attempts = keyPaths.length > 0 ? keyPaths : [undefined];

    let lastError: Error | null = null;
    for (const keyPath of attempts) {
      const config = buildConnectConfig(options, keyPath);
      if (keyPath) {
        console.log("[sftp-auth] trying key:", keyPath);
      }

      try {
        await tryConnect(config);
        console.log("[sftp-auth] CONNECTED successfully as", config.username, "to", config.host);
        emitStatus("connected");
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.log("[sftp-auth] key failed:", keyPath ?? "(no key)", lastError.message);
      }
    }

    emitError(lastError?.message ?? "All authentication methods failed");
    emitStatus("failed");
    throw lastError ?? new Error("All authentication methods failed");
  }

  function disconnect(): void {
    if (!client) {
      return;
    }

    client.end();
    client = null;
    sftp = null;
  }

  async function list(remotePath: string): Promise<SftpEntry[]> {
    console.log("[sftp] list called for:", remotePath);
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
    if (recursive) {
      const entries = await list(remotePath);
      for (const entry of entries) {
        if (entry.isDirectory) {
          await remove(entry.path, true);
          continue;
        }

        await new Promise<void>((resolve, reject) => {
          sftpSession.unlink(entry.path, (error) => {
            if (error) {
              reject(error);
              return;
            }

            resolve();
          });
        });
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
      return;
    }

    const entry = await stat(remotePath);
    await new Promise<void>((resolve, reject) => {
      if (entry.isDirectory) {
        sftpSession.rmdir(remotePath, (error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
        return;
      }

      sftpSession.unlink(remotePath, (error) => {
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

  function createReadStream(remotePath: string): Readable {
    return requireSftp().createReadStream(remotePath);
  }

  function createWriteStream(remotePath: string): Writable {
    return requireSftp().createWriteStream(remotePath);
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
