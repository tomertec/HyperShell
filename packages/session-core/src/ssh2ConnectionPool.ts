import { Client } from "ssh2";
import { randomUUID } from "node:crypto";

export interface ResolvedAuth {
  type: "password" | "key" | "agent";
  password?: string;
  privateKey?: Buffer;
  passphrase?: string;
  agent?: string;
}

export interface Ssh2PoolTarget {
  hostname: string;
  port: number;
  username: string;
  auth: ResolvedAuth;
  keepAliveSeconds?: number;
}

export interface PooledConnection {
  connectionId: string;
  consumerId: string;
  client: Client;
}

export interface PoolStats {
  connectionId: string;
  hostname: string;
  port: number;
  username: string;
  consumerCount: number;
  createdAt: string;
}

export interface Ssh2ConnectionPool {
  acquire(target: Ssh2PoolTarget): Promise<PooledConnection>;
  release(connectionId: string, consumerId: string): void;
  destroy(connectionId: string): void;
  destroyAll(): void;
  getStats(): PoolStats[];
}

interface PoolEntry {
  connectionId: string;
  client: Client;
  consumers: Set<string>;
  target: Ssh2PoolTarget;
  createdAt: string;
  idleTimer: ReturnType<typeof setTimeout> | null;
}

const IDLE_TIMEOUT_MS = 30_000;

function poolKey(target: Ssh2PoolTarget): string {
  return `${target.hostname}:${target.port}:${target.username}`;
}

export function createSsh2ConnectionPool(): Ssh2ConnectionPool {
  const entries = new Map<string, PoolEntry>();
  const keyToConnectionId = new Map<string, string>();

  function connectClient(target: Ssh2PoolTarget): Promise<Client> {
    return new Promise((resolve, reject) => {
      const client = new Client();

      const onReady = () => {
        client.removeListener("error", onError);
        resolve(client);
      };

      const onError = (err: Error) => {
        client.removeListener("ready", onReady);
        reject(err);
      };

      client.once("ready", onReady);
      client.once("error", onError);

      const config: Record<string, unknown> = {
        host: target.hostname,
        port: target.port,
        username: target.username,
        keepaliveInterval: (target.keepAliveSeconds ?? 30) * 1000,
        keepaliveCountMax: 3,
      };

      if (target.auth.type === "password") {
        config.password = target.auth.password;
      } else if (target.auth.type === "key") {
        config.privateKey = target.auth.privateKey;
        if (target.auth.passphrase) config.passphrase = target.auth.passphrase;
      } else if (target.auth.type === "agent") {
        config.agent = target.auth.agent;
      }

      client.connect(config);
    });
  }

  function removeEntry(connectionId: string): void {
    const entry = entries.get(connectionId);
    if (!entry) return;

    if (entry.idleTimer) clearTimeout(entry.idleTimer);
    try { entry.client.end(); } catch (e) { console.warn("[ssh2-pool] cleanup error:", e); }
    entries.delete(connectionId);

    const key = poolKey(entry.target);
    if (keyToConnectionId.get(key) === connectionId) {
      keyToConnectionId.delete(key);
    }
  }

  return {
    async acquire(target: Ssh2PoolTarget): Promise<PooledConnection> {
      const key = poolKey(target);
      const existingId = keyToConnectionId.get(key);
      const existing = existingId ? entries.get(existingId) : undefined;

      if (existing) {
        if (existing.idleTimer) {
          clearTimeout(existing.idleTimer);
          existing.idleTimer = null;
        }
        const consumerId = randomUUID();
        existing.consumers.add(consumerId);
        return {
          connectionId: existing.connectionId,
          consumerId,
          client: existing.client,
        };
      }

      const client = await connectClient(target);
      const connectionId = randomUUID();
      const consumerId = randomUUID();

      const entry: PoolEntry = {
        connectionId,
        client,
        consumers: new Set([consumerId]),
        target,
        createdAt: new Date().toISOString(),
        idleTimer: null,
      };

      client.on("error", () => removeEntry(connectionId));
      client.on("close", () => removeEntry(connectionId));

      entries.set(connectionId, entry);
      keyToConnectionId.set(key, connectionId);

      return { connectionId, consumerId, client };
    },

    release(connectionId: string, consumerId: string): void {
      const entry = entries.get(connectionId);
      if (!entry) return;

      entry.consumers.delete(consumerId);

      if (entry.consumers.size === 0) {
        entry.idleTimer = setTimeout(() => {
          if (entry.consumers.size === 0) {
            removeEntry(connectionId);
          }
        }, IDLE_TIMEOUT_MS);
      }
    },

    destroy(connectionId: string): void {
      removeEntry(connectionId);
    },

    destroyAll(): void {
      for (const connectionId of [...entries.keys()]) {
        removeEntry(connectionId);
      }
    },

    getStats(): PoolStats[] {
      return [...entries.values()].map((e) => ({
        connectionId: e.connectionId,
        hostname: e.target.hostname,
        port: e.target.port,
        username: e.target.username,
        consumerCount: e.consumers.size,
        createdAt: e.createdAt,
      }));
    },
  };
}
