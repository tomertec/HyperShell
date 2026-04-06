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

function buildConnectConfig(options: SftpConnectionOptions): ConnectConfig {
  const config: ConnectConfig = {
    host: options.hostname,
    port: options.port ?? 22,
    username: options.username,
    keepaliveInterval: (options.keepAliveSeconds ?? 60) * 1000
  };

  if (options.authMethod === "password" && options.password) {
    config.password = options.password;
  } else if (options.authMethod === "key" && options.privateKeyPath) {
    config.privateKey = readFileSync(options.privateKeyPath);
    if (options.passphrase) {
      config.passphrase = options.passphrase;
    }
  } else if (options.authMethod === "agent") {
    const agentPath = options.agentPath ?? process.env.SSH_AUTH_SOCK;
    if (agentPath) {
      config.agent = agentPath;
    }
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

  async function connect(): Promise<void> {
    emitStatus("connecting");

    const connectConfig = buildConnectConfig(options);

    await new Promise<void>((resolve, reject) => {
      const conn = new Client();
      let settled = false;

      const fail = (error: Error) => {
        if (settled) {
          return;
        }

        settled = true;
        emitError(error.message);
        emitStatus("failed");
        reject(error);
      };

      conn.on("ready", () => {
        conn.sftp((error, sftpSession) => {
          if (error) {
            fail(error);
            return;
          }

          if (settled) {
            return;
          }

          settled = true;
          client = conn;
          sftp = sftpSession;
          emitStatus("connected");
          resolve();
        });
      });

      conn.on("error", fail);

      conn.on("close", () => {
        sftp = null;
        client = null;
        emitStatus("disconnected");
      });

      conn.connect(connectConfig);
    });
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
