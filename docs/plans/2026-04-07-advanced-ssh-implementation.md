# Advanced SSH Features — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add port forwarding (host-linked + auto-start), jump host picker, visual tunnel manager, ssh2 connection pool, network-aware auto-reconnect, and per-host keep-alive to HyperShell.

**Architecture:** Incremental extension — each feature is a vertical slice through DB → shared schemas → session-core → desktop IPC → preload → UI. No transport layer rewrite. See `docs/plans/2026-04-07-advanced-ssh-design.md` for full design.

**Tech Stack:** SQLite (better-sqlite3), Zod, ssh2, node-pty, Electron IPC, React, Zustand, Tailwind CSS, Vitest

---

## Task 1: Database Migration 006 — Advanced SSH Host Fields

**Files:**
- Create: `packages/db/src/migrations/006_advanced_ssh.sql`

**Step 1: Write the migration**

```sql
-- 006_advanced_ssh.sql
-- Adds jump host, keep-alive, auto-reconnect fields to hosts table
-- and creates host_port_forwards table for host-linked port forwards

-- Jump host chain
ALTER TABLE hosts ADD COLUMN proxy_jump TEXT;
ALTER TABLE hosts ADD COLUMN proxy_jump_host_ids TEXT;

-- Keep-alive
ALTER TABLE hosts ADD COLUMN keep_alive_interval INTEGER;

-- Auto-reconnect
ALTER TABLE hosts ADD COLUMN auto_reconnect INTEGER DEFAULT 0;
ALTER TABLE hosts ADD COLUMN reconnect_max_attempts INTEGER DEFAULT 5;
ALTER TABLE hosts ADD COLUMN reconnect_base_interval INTEGER DEFAULT 1;

-- Host-linked port forwards
CREATE TABLE IF NOT EXISTS host_port_forwards (
  id TEXT PRIMARY KEY,
  host_id TEXT NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  protocol TEXT NOT NULL CHECK(protocol IN ('local', 'remote', 'dynamic')),
  local_address TEXT DEFAULT '127.0.0.1',
  local_port INTEGER NOT NULL,
  remote_host TEXT DEFAULT '',
  remote_port INTEGER DEFAULT 0,
  auto_start INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_host_port_forwards_host ON host_port_forwards(host_id);
```

**Step 2: Verify migration loads**

Run: `pnpm --filter @hypershell/db test`
Expected: Existing tests still pass (migration is auto-applied by `openDatabase`)

**Step 3: Commit**

```bash
git add packages/db/src/migrations/006_advanced_ssh.sql
git commit -m "feat(db): add migration 006 for advanced SSH host fields and host_port_forwards table"
```

---

## Task 2: Update HostRecord Types and Repository

**Files:**
- Modify: `packages/db/src/repositories/hostsRepository.ts`

**Step 1: Write tests for new host fields**

Add to existing test file `packages/db/src/repositories/hostsRepository.test.ts`:

```typescript
it("stores and retrieves advanced SSH fields", () => {
  const repo = createHostsRepository(":memory:");
  const host = repo.create({
    id: "h1",
    name: "bastion",
    hostname: "bastion.example.com",
    proxyJump: "jump@gateway:22",
    proxyJumpHostIds: JSON.stringify(["gw-1"]),
    keepAliveInterval: 60,
    autoReconnect: true,
    reconnectMaxAttempts: 10,
    reconnectBaseInterval: 2,
  });

  expect(host.proxyJump).toBe("jump@gateway:22");
  expect(host.proxyJumpHostIds).toBe(JSON.stringify(["gw-1"]));
  expect(host.keepAliveInterval).toBe(60);
  expect(host.autoReconnect).toBe(true);
  expect(host.reconnectMaxAttempts).toBe(10);
  expect(host.reconnectBaseInterval).toBe(2);
});

it("defaults advanced SSH fields when not provided", () => {
  const repo = createHostsRepository(":memory:");
  const host = repo.create({
    id: "h2",
    name: "simple",
    hostname: "simple.example.com",
  });

  expect(host.proxyJump).toBeNull();
  expect(host.proxyJumpHostIds).toBeNull();
  expect(host.keepAliveInterval).toBeNull();
  expect(host.autoReconnect).toBe(false);
  expect(host.reconnectMaxAttempts).toBe(5);
  expect(host.reconnectBaseInterval).toBe(1);
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @hypershell/db test`
Expected: FAIL — `proxyJump` property does not exist on HostRecord

**Step 3: Update HostRecord, HostInput, HostRow types**

In `packages/db/src/repositories/hostsRepository.ts`:

Add to `HostRecord` type (after line 19, before closing `}`):
```typescript
  proxyJump: string | null;
  proxyJumpHostIds: string | null;
  keepAliveInterval: number | null;
  autoReconnect: boolean;
  reconnectMaxAttempts: number;
  reconnectBaseInterval: number;
```

Add to `HostInput` type (after line 37, before closing `}`):
```typescript
  proxyJump?: string | null;
  proxyJumpHostIds?: string | null;
  keepAliveInterval?: number | null;
  autoReconnect?: boolean;
  reconnectMaxAttempts?: number;
  reconnectBaseInterval?: number;
```

Add to `HostRow` type (after line 55, before closing `}`):
```typescript
  proxy_jump: string | null;
  proxy_jump_host_ids: string | null;
  keep_alive_interval: number | null;
  auto_reconnect: number;
  reconnect_max_attempts: number;
  reconnect_base_interval: number;
```

**Step 4: Update mapRow function**

In `mapRow()` (after line 74, before closing `}`):
```typescript
    proxyJump: row.proxy_jump ?? null,
    proxyJumpHostIds: row.proxy_jump_host_ids ?? null,
    keepAliveInterval: row.keep_alive_interval ?? null,
    autoReconnect: Boolean(row.auto_reconnect),
    reconnectMaxAttempts: row.reconnect_max_attempts ?? 5,
    reconnectBaseInterval: row.reconnect_base_interval ?? 1,
```

**Step 5: Update SQL statements**

Update `insertHost` prepared statement (line 91) — add new columns to INSERT and ON CONFLICT:

Column list addition:
```sql
proxy_jump, proxy_jump_host_ids, keep_alive_interval,
auto_reconnect, reconnect_max_attempts, reconnect_base_interval
```

VALUES addition:
```sql
@proxyJump, @proxyJumpHostIds, @keepAliveInterval,
@autoReconnect, @reconnectMaxAttempts, @reconnectBaseInterval
```

ON CONFLICT addition:
```sql
proxy_jump = excluded.proxy_jump,
proxy_jump_host_ids = excluded.proxy_jump_host_ids,
keep_alive_interval = excluded.keep_alive_interval,
auto_reconnect = excluded.auto_reconnect,
reconnect_max_attempts = excluded.reconnect_max_attempts,
reconnect_base_interval = excluded.reconnect_base_interval,
```

Update `listHosts` and `getHostById` SELECT statements to include the 6 new columns.

**Step 6: Update `create()` normalization**

In `create()` method (after line 156):
```typescript
proxyJump: input.proxyJump ?? null,
proxyJumpHostIds: input.proxyJumpHostIds ?? null,
keepAliveInterval: input.keepAliveInterval ?? null,
autoReconnect: input.autoReconnect ? 1 : 0,
reconnectMaxAttempts: input.reconnectMaxAttempts ?? 5,
reconnectBaseInterval: input.reconnectBaseInterval ?? 1,
```

**Step 7: Update in-memory fallback**

Update `createInMemoryHostsRepository()` — add default values for new fields in the `create()` method's `HostRecord` construction.

**Step 8: Run tests**

Run: `pnpm --filter @hypershell/db test`
Expected: All tests PASS

**Step 9: Commit**

```bash
git add packages/db/src/repositories/hostsRepository.ts packages/db/src/repositories/hostsRepository.test.ts
git commit -m "feat(db): add advanced SSH fields to HostRecord and repository"
```

---

## Task 3: Host Port Forwards Repository

**Files:**
- Create: `packages/db/src/repositories/hostPortForwardsRepository.ts`
- Create: `packages/db/src/repositories/hostPortForwardsRepository.test.ts`
- Modify: `packages/db/src/repositories/index.ts`

**Step 1: Write tests**

```typescript
import { describe, expect, it } from "vitest";
import { createHostPortForwardsRepository } from "./hostPortForwardsRepository";
import { createHostsRepository } from "./hostsRepository";
import { openDatabase } from "../index";

describe("hostPortForwardsRepository", () => {
  function setup() {
    const db = openDatabase(":memory:");
    const hosts = createHostsRepository(":memory:"); // won't work — need shared db
    // Actually: use createHostsRepositoryFromDatabase and createHostPortForwardsRepositoryFromDatabase
    // with the same db instance
  }

  it("creates and lists port forwards for a host", () => {
    const db = openDatabase(":memory:");
    const hostsRepo = createHostsRepositoryFromDatabase(db);
    const repo = createHostPortForwardsRepositoryFromDatabase(db);

    hostsRepo.create({ id: "h1", name: "web", hostname: "web.example.com" });
    const fwd = repo.create({
      id: "pf1",
      hostId: "h1",
      name: "DB tunnel",
      protocol: "local",
      localPort: 5432,
      remoteHost: "db.internal",
      remotePort: 5432,
      autoStart: true,
    });

    expect(fwd.name).toBe("DB tunnel");
    expect(fwd.protocol).toBe("local");
    expect(fwd.autoStart).toBe(true);
    expect(repo.listForHost("h1")).toHaveLength(1);
  });

  it("deletes forwards when host is deleted (CASCADE)", () => {
    const db = openDatabase(":memory:");
    const hostsRepo = createHostsRepositoryFromDatabase(db);
    const repo = createHostPortForwardsRepositoryFromDatabase(db);

    hostsRepo.create({ id: "h1", name: "web", hostname: "web.example.com" });
    repo.create({ id: "pf1", hostId: "h1", name: "tunnel", protocol: "local", localPort: 8080, remoteHost: "localhost", remotePort: 80 });
    hostsRepo.remove("h1");

    expect(repo.listForHost("h1")).toHaveLength(0);
  });

  it("updates a port forward", () => {
    const db = openDatabase(":memory:");
    const hostsRepo = createHostsRepositoryFromDatabase(db);
    const repo = createHostPortForwardsRepositoryFromDatabase(db);

    hostsRepo.create({ id: "h1", name: "web", hostname: "web.example.com" });
    repo.create({ id: "pf1", hostId: "h1", name: "old", protocol: "local", localPort: 8080, remoteHost: "localhost", remotePort: 80 });
    const updated = repo.update({ id: "pf1", hostId: "h1", name: "new", protocol: "dynamic", localPort: 1080 });

    expect(updated.name).toBe("new");
    expect(updated.protocol).toBe("dynamic");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @hypershell/db test`
Expected: FAIL — module not found

**Step 3: Implement the repository**

Create `packages/db/src/repositories/hostPortForwardsRepository.ts`:

```typescript
import type { SqliteDatabase } from "../index";

export type HostPortForwardRecord = {
  id: string;
  hostId: string;
  name: string;
  protocol: "local" | "remote" | "dynamic";
  localAddress: string;
  localPort: number;
  remoteHost: string;
  remotePort: number;
  autoStart: boolean;
  sortOrder: number;
};

export type HostPortForwardInput = {
  id: string;
  hostId: string;
  name: string;
  protocol: "local" | "remote" | "dynamic";
  localAddress?: string;
  localPort: number;
  remoteHost?: string;
  remotePort?: number;
  autoStart?: boolean;
  sortOrder?: number;
};

type HostPortForwardRow = {
  id: string;
  host_id: string;
  name: string;
  protocol: string;
  local_address: string;
  local_port: number;
  remote_host: string;
  remote_port: number;
  auto_start: number;
  sort_order: number;
};

function mapRow(row: HostPortForwardRow): HostPortForwardRecord {
  return {
    id: row.id,
    hostId: row.host_id,
    name: row.name,
    protocol: row.protocol as "local" | "remote" | "dynamic",
    localAddress: row.local_address,
    localPort: row.local_port,
    remoteHost: row.remote_host,
    remotePort: row.remote_port,
    autoStart: Boolean(row.auto_start),
    sortOrder: row.sort_order,
  };
}

export function createHostPortForwardsRepositoryFromDatabase(db: SqliteDatabase) {
  const insert = db.prepare(`
    INSERT INTO host_port_forwards (
      id, host_id, name, protocol, local_address, local_port,
      remote_host, remote_port, auto_start, sort_order
    ) VALUES (
      @id, @hostId, @name, @protocol, @localAddress, @localPort,
      @remoteHost, @remotePort, @autoStart, @sortOrder
    )
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      protocol = excluded.protocol,
      local_address = excluded.local_address,
      local_port = excluded.local_port,
      remote_host = excluded.remote_host,
      remote_port = excluded.remote_port,
      auto_start = excluded.auto_start,
      sort_order = excluded.sort_order,
      updated_at = CURRENT_TIMESTAMP
  `);

  const listForHost = db.prepare(`
    SELECT id, host_id, name, protocol, local_address, local_port,
           remote_host, remote_port, auto_start, sort_order
    FROM host_port_forwards
    WHERE host_id = ?
    ORDER BY sort_order ASC, name COLLATE NOCASE ASC
  `);

  const getById = db.prepare(`
    SELECT id, host_id, name, protocol, local_address, local_port,
           remote_host, remote_port, auto_start, sort_order
    FROM host_port_forwards WHERE id = ?
  `);

  const deleteById = db.prepare(`DELETE FROM host_port_forwards WHERE id = ?`);

  const updateSortOrder = db.prepare(`
    UPDATE host_port_forwards SET sort_order = @sortOrder, updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `);

  return {
    create(input: HostPortForwardInput): HostPortForwardRecord {
      const normalized = {
        ...input,
        localAddress: input.localAddress ?? "127.0.0.1",
        remoteHost: input.remoteHost ?? "",
        remotePort: input.remotePort ?? 0,
        autoStart: input.autoStart ? 1 : 0,
        sortOrder: input.sortOrder ?? 0,
      };
      insert.run(normalized);
      const row = getById.get(input.id) as HostPortForwardRow;
      return mapRow(row);
    },

    update(input: HostPortForwardInput): HostPortForwardRecord {
      return this.create(input); // upsert via ON CONFLICT
    },

    listForHost(hostId: string): HostPortForwardRecord[] {
      return (listForHost.all(hostId) as HostPortForwardRow[]).map(mapRow);
    },

    remove(id: string): boolean {
      return deleteById.run(id).changes > 0;
    },

    updateSortOrders(items: Array<{ id: string; sortOrder: number }>): void {
      const tx = db.transaction(() => {
        for (const item of items) {
          updateSortOrder.run({ id: item.id, sortOrder: item.sortOrder });
        }
      });
      tx();
    },
  };
}
```

**Step 4: Export from index**

In `packages/db/src/repositories/index.ts`, add:
```typescript
export * from "./hostPortForwardsRepository";
```

**Step 5: Run tests**

Run: `pnpm --filter @hypershell/db test`
Expected: All PASS

**Step 6: Commit**

```bash
git add packages/db/src/repositories/hostPortForwardsRepository.ts packages/db/src/repositories/hostPortForwardsRepository.test.ts packages/db/src/repositories/index.ts
git commit -m "feat(db): add hostPortForwardsRepository with CRUD and cascade delete"
```

---

## Task 4: Update Shared IPC Schemas and Channels

**Files:**
- Modify: `packages/shared/src/ipc/schemas.ts`
- Modify: `packages/shared/src/ipc/channels.ts`

**Step 1: Add new fields to host schemas**

In `packages/shared/src/ipc/schemas.ts`:

Add to `hostRecordSchema` (after `color` field, line 87):
```typescript
  proxyJump: z.string().nullable().optional(),
  proxyJumpHostIds: z.string().nullable().optional(),
  keepAliveInterval: z.number().int().nullable().optional(),
  autoReconnect: z.boolean().optional(),
  reconnectMaxAttempts: z.number().int().optional(),
  reconnectBaseInterval: z.number().int().optional(),
```

Add to `upsertHostRequestSchema` (after `color` field, line 105):
```typescript
  proxyJump: z.string().nullable().optional(),
  proxyJumpHostIds: z.string().nullable().optional(),
  keepAliveInterval: z.number().int().min(0).nullable().optional(),
  autoReconnect: z.boolean().optional(),
  reconnectMaxAttempts: z.number().int().min(1).max(50).optional(),
  reconnectBaseInterval: z.number().int().min(1).max(60).optional(),
```

**Step 2: Add reconnect fields to openSessionRequestSchema**

In `openSessionRequestSchema` (line 13), add after `rows`:
```typescript
  autoReconnect: z.boolean().optional(),
  reconnectMaxAttempts: z.number().int().min(1).optional(),
  reconnectBaseInterval: z.number().int().min(1).optional(),
```

**Step 3: Add `waiting_for_network` to session state**

Update `sessionStateSchema` (line 5):
```typescript
export const sessionStateSchema = z.enum([
  "connecting",
  "connected",
  "reconnecting",
  "waiting_for_network",
  "disconnected",
  "failed"
]);
```

**Step 4: Add host port forward schemas**

Add new schemas after the port forward section (after line 169):

```typescript
// --- Host port forward schemas ---

export const hostPortForwardRecordSchema = z.object({
  id: z.string().min(1),
  hostId: z.string().min(1),
  name: z.string().min(1),
  protocol: z.enum(["local", "remote", "dynamic"]),
  localAddress: z.string(),
  localPort: z.number().int().min(1).max(65535),
  remoteHost: z.string(),
  remotePort: z.number().int().min(0).max(65535),
  autoStart: z.boolean(),
  sortOrder: z.number().int(),
});

export const upsertHostPortForwardRequestSchema = z.object({
  id: z.string().min(1),
  hostId: z.string().min(1),
  name: z.string().min(1),
  protocol: z.enum(["local", "remote", "dynamic"]),
  localAddress: z.string().default("127.0.0.1"),
  localPort: z.number().int().min(1).max(65535),
  remoteHost: z.string().default(""),
  remotePort: z.number().int().min(0).max(65535).default(0),
  autoStart: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

export const listHostPortForwardsRequestSchema = z.object({
  hostId: z.string().min(1),
});

export const removeHostPortForwardRequestSchema = z.object({
  id: z.string().min(1),
});

export const reorderHostPortForwardsRequestSchema = z.object({
  items: z.array(z.object({
    id: z.string().min(1),
    sortOrder: z.number().int(),
  })),
});

export type HostPortForwardRecord = z.infer<typeof hostPortForwardRecordSchema>;
export type UpsertHostPortForwardRequest = z.infer<typeof upsertHostPortForwardRequestSchema>;
export type ListHostPortForwardsRequest = z.infer<typeof listHostPortForwardsRequestSchema>;
export type RemoveHostPortForwardRequest = z.infer<typeof removeHostPortForwardRequestSchema>;
export type ReorderHostPortForwardsRequest = z.infer<typeof reorderHostPortForwardsRequestSchema>;
```

**Step 5: Add connection pool stats schema**

```typescript
// --- Connection pool schemas ---

export const connectionPoolStatsSchema = z.object({
  connectionId: z.string(),
  hostname: z.string(),
  port: z.number(),
  username: z.string(),
  consumerCount: z.number().int(),
  createdAt: z.string(),
});

export type ConnectionPoolStats = z.infer<typeof connectionPoolStatsSchema>;
```

**Step 6: Add new IPC channels**

In `packages/shared/src/ipc/channels.ts`, add before `ipcChannels` export (line 99):

```typescript
export const hostPortForwardChannels = {
  list: "host-port-forward:list",
  upsert: "host-port-forward:upsert",
  remove: "host-port-forward:remove",
  reorder: "host-port-forward:reorder",
} as const;

export const connectionPoolChannels = {
  stats: "connection-pool:stats",
} as const;

export const networkChannels = {
  status: "network:status",
} as const;
```

Add to `ipcChannels` object:
```typescript
  hostPortForward: hostPortForwardChannels,
  connectionPool: connectionPoolChannels,
  network: networkChannels,
```

**Step 7: Run build to verify types**

Run: `pnpm --filter @hypershell/shared build`
Expected: Build succeeds with no type errors

**Step 8: Commit**

```bash
git add packages/shared/src/ipc/schemas.ts packages/shared/src/ipc/channels.ts
git commit -m "feat(shared): add IPC schemas and channels for advanced SSH features"
```

---

## Task 5: Update SessionState in session-core

**Files:**
- Modify: `packages/session-core/src/transports/transportEvents.ts`
- Modify: `packages/session-core/src/sessionManager.ts`

**Step 1: Add `waiting_for_network` state**

In `packages/session-core/src/transports/transportEvents.ts`, update `SessionState` type (line 3):
```typescript
export type SessionState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "waiting_for_network"
  | "disconnected"
  | "failed";
```

**Step 2: Add reconnect config to OpenSessionInput**

In `packages/session-core/src/sessionManager.ts`, update `OpenSessionInput` (line 29):
```typescript
export interface OpenSessionInput {
  transport: SessionTransportKind;
  profileId: string;
  cols: number;
  rows: number;
  sshOptions?: SshConnectionOptions;
  serialOptions?: SerialConnectionOptions;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectBaseInterval?: number; // NEW — base delay in seconds
}
```

**Step 3: Update SessionSnapshot**

Add to `SessionSnapshot` interface (after `reconnectAttempts`, line 21):
```typescript
  reconnectBaseInterval: number;
```

**Step 4: Update backoff calculation**

In `handleEvent()` (line 174), replace the delay formula:
```typescript
// Old:
const delay = Math.min(1000 * Math.pow(2, snapshot.reconnectAttempts - 1), 30000);
// New:
const baseMs = (snapshot.reconnectBaseInterval ?? 1) * 1000;
const delay = Math.min(baseMs * Math.pow(2, snapshot.reconnectAttempts - 1), 30000);
```

**Step 5: Update `open()` to use reconnectBaseInterval**

In `open()` method (line 217), add to snapshot construction:
```typescript
reconnectBaseInterval: input.reconnectBaseInterval ?? 1,
```

**Step 6: Run tests**

Run: `pnpm --filter @hypershell/session-core test`
Expected: All PASS (existing tests use defaults)

**Step 7: Write test for configurable base interval**

In `packages/session-core/src/sessionManager.test.ts`, add:

```typescript
it("uses configurable reconnect base interval", async () => {
  // Create mock transport that exits immediately
  // Open session with reconnectBaseInterval: 3
  // Verify delay is 3000ms on first attempt (not 1000ms)
});
```

**Step 8: Run tests**

Run: `pnpm --filter @hypershell/session-core test`
Expected: All PASS

**Step 9: Commit**

```bash
git add packages/session-core/src/transports/transportEvents.ts packages/session-core/src/sessionManager.ts packages/session-core/src/sessionManager.test.ts
git commit -m "feat(session-core): add waiting_for_network state and configurable reconnect interval"
```

---

## Task 6: Network Monitor

**Files:**
- Create: `packages/session-core/src/networkMonitor.ts`
- Create: `packages/session-core/src/networkMonitor.test.ts`
- Modify: `packages/session-core/src/index.ts`

**Step 1: Write tests**

```typescript
import { describe, expect, it, vi } from "vitest";
import { createNetworkMonitor } from "./networkMonitor";

describe("networkMonitor", () => {
  it("starts online by default", () => {
    const monitor = createNetworkMonitor();
    expect(monitor.isOnline()).toBe(true);
    monitor.dispose();
  });

  it("notifies on offline transition", () => {
    const monitor = createNetworkMonitor();
    const cb = vi.fn();
    monitor.onOffline(cb);

    monitor._setOnline(false); // internal test helper

    expect(cb).toHaveBeenCalledTimes(1);
    monitor.dispose();
  });

  it("notifies on online transition", () => {
    const monitor = createNetworkMonitor();
    const cb = vi.fn();
    monitor.onOnline(cb);

    monitor._setOnline(false);
    monitor._setOnline(true);

    expect(cb).toHaveBeenCalledTimes(1);
    monitor.dispose();
  });

  it("does not notify if state unchanged", () => {
    const monitor = createNetworkMonitor();
    const offCb = vi.fn();
    monitor.onOffline(offCb);

    monitor._setOnline(true); // already online
    expect(offCb).not.toHaveBeenCalled();
    monitor.dispose();
  });

  it("unsubscribe removes listener", () => {
    const monitor = createNetworkMonitor();
    const cb = vi.fn();
    const unsub = monitor.onOffline(cb);
    unsub();

    monitor._setOnline(false);
    expect(cb).not.toHaveBeenCalled();
    monitor.dispose();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @hypershell/session-core test`
Expected: FAIL — module not found

**Step 3: Implement NetworkMonitor**

Create `packages/session-core/src/networkMonitor.ts`:

```typescript
import dns from "node:dns/promises";

export interface NetworkMonitor {
  isOnline(): boolean;
  onOnline(cb: () => void): () => void;
  onOffline(cb: () => void): () => void;
  dispose(): void;
  /** @internal test helper — do not use in production */
  _setOnline(online: boolean): void;
}

export interface NetworkMonitorOptions {
  /** Hostname to probe for connectivity checks. Default: "dns.google" */
  probeHostname?: string;
  /** Probe interval in ms. Default: 10000 (10s). Set 0 to disable probing. */
  probeIntervalMs?: number;
}

export function createNetworkMonitor(
  options: NetworkMonitorOptions = {}
): NetworkMonitor {
  const { probeHostname = "dns.google", probeIntervalMs = 10000 } = options;

  let online = true;
  const onlineListeners = new Set<() => void>();
  const offlineListeners = new Set<() => void>();
  let probeTimer: ReturnType<typeof setInterval> | null = null;

  function setOnline(value: boolean): void {
    if (value === online) return;
    online = value;
    const listeners = value ? onlineListeners : offlineListeners;
    for (const cb of listeners) {
      cb();
    }
  }

  async function probe(): Promise<void> {
    try {
      await dns.resolve(probeHostname);
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }

  // Start periodic probing if interval > 0
  if (probeIntervalMs > 0) {
    probeTimer = setInterval(probe, probeIntervalMs);
  }

  return {
    isOnline() {
      return online;
    },

    onOnline(cb) {
      onlineListeners.add(cb);
      return () => { onlineListeners.delete(cb); };
    },

    onOffline(cb) {
      offlineListeners.add(cb);
      return () => { offlineListeners.delete(cb); };
    },

    dispose() {
      if (probeTimer) {
        clearInterval(probeTimer);
        probeTimer = null;
      }
      onlineListeners.clear();
      offlineListeners.clear();
    },

    _setOnline(value: boolean) {
      setOnline(value);
    },
  };
}
```

**Step 4: Export from index**

In `packages/session-core/src/index.ts`, add:
```typescript
export { createNetworkMonitor, type NetworkMonitor, type NetworkMonitorOptions } from "./networkMonitor";
```

**Step 5: Run tests**

Run: `pnpm --filter @hypershell/session-core test`
Expected: All PASS

**Step 6: Commit**

```bash
git add packages/session-core/src/networkMonitor.ts packages/session-core/src/networkMonitor.test.ts packages/session-core/src/index.ts
git commit -m "feat(session-core): add NetworkMonitor with DNS probing and event system"
```

---

## Task 7: Integrate Network Monitor into Session Manager

**Files:**
- Modify: `packages/session-core/src/sessionManager.ts`

**Step 1: Write tests**

In `packages/session-core/src/sessionManager.test.ts`, add:

```typescript
describe("network-aware reconnect", () => {
  it("enters waiting_for_network when offline at disconnect", () => {
    const monitor = createNetworkMonitor({ probeIntervalMs: 0 });
    monitor._setOnline(false);

    const manager = createSessionManager({
      createTransport: () => mockTransport(),
      networkMonitor: monitor,
    });

    const { sessionId } = manager.open({
      transport: "ssh",
      profileId: "test",
      cols: 80,
      rows: 24,
      autoReconnect: true,
    });

    // Simulate transport exit
    triggerTransportExit(sessionId);

    const session = manager.getSession(sessionId);
    expect(session?.state).toBe("waiting_for_network");
    monitor.dispose();
  });

  it("resumes reconnection when network comes back online", async () => {
    const monitor = createNetworkMonitor({ probeIntervalMs: 0 });
    monitor._setOnline(false);

    const manager = createSessionManager({
      createTransport: () => mockTransport(),
      networkMonitor: monitor,
    });

    const { sessionId } = manager.open({
      transport: "ssh",
      profileId: "test",
      cols: 80,
      rows: 24,
      autoReconnect: true,
    });

    triggerTransportExit(sessionId);
    expect(manager.getSession(sessionId)?.state).toBe("waiting_for_network");

    monitor._setOnline(true);
    // Should now be in "reconnecting" or "connecting"
    expect(manager.getSession(sessionId)?.state).toBe("reconnecting");
    monitor.dispose();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @hypershell/session-core test`
Expected: FAIL — `networkMonitor` not accepted by createSessionManager

**Step 3: Integrate into SessionManager**

In `packages/session-core/src/sessionManager.ts`:

Add to `SessionManagerDeps` (line 24):
```typescript
  networkMonitor?: NetworkMonitor;
```

Add import:
```typescript
import type { NetworkMonitor } from "./networkMonitor";
```

In `handleEvent()`, modify the exit handler (line 159-204). When `autoReconnect` is true and transport exits:

1. Check `networkMonitor?.isOnline() ?? true`
2. If offline: set state to `"waiting_for_network"`, emit status event, register `onOnline` listener that triggers reconnection
3. If online: proceed with existing backoff logic
4. On `onOnline` callback: reset `reconnectAttempts` to 0, start reconnection

**Step 4: Run tests**

Run: `pnpm --filter @hypershell/session-core test`
Expected: All PASS

**Step 5: Commit**

```bash
git add packages/session-core/src/sessionManager.ts packages/session-core/src/sessionManager.test.ts
git commit -m "feat(session-core): integrate NetworkMonitor for network-aware auto-reconnect"
```

---

## Task 8: SSH2 Connection Pool

**Files:**
- Create: `packages/session-core/src/ssh2ConnectionPool.ts`
- Create: `packages/session-core/src/ssh2ConnectionPool.test.ts`
- Modify: `packages/session-core/src/index.ts`

**Step 1: Write tests**

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createSsh2ConnectionPool } from "./ssh2ConnectionPool";

// Mock ssh2 Client
vi.mock("ssh2", () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: vi.fn(),
    on: vi.fn(),
    end: vi.fn(),
    sftp: vi.fn(),
    removeAllListeners: vi.fn(),
  })),
}));

describe("ssh2ConnectionPool", () => {
  it("creates a new connection on first acquire", async () => {
    const pool = createSsh2ConnectionPool();
    // Will need a mock connect helper
    // Test: acquire returns a PooledConnection with unique consumerId
  });

  it("reuses connection for same host:port:user", async () => {
    const pool = createSsh2ConnectionPool();
    // Acquire twice with same target
    // Verify same connectionId, different consumerIds
  });

  it("creates separate connections for different targets", async () => {
    const pool = createSsh2ConnectionPool();
    // Acquire with two different hostnames
    // Verify different connectionIds
  });

  it("keeps connection alive while consumers remain", () => {
    // Acquire, release one consumer — connection stays
  });

  it("closes connection after idle timeout when all consumers release", async () => {
    // Acquire, release all consumers
    // Advance timers past 30s
    // Verify client.end() called
  });

  it("getStats returns active connection info", () => {
    // Acquire connection
    // Verify getStats returns entry with consumerCount=1
  });

  it("destroyAll closes everything", () => {
    // Acquire multiple connections
    // destroyAll
    // Verify all clients ended
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @hypershell/session-core test`
Expected: FAIL — module not found

**Step 3: Implement connection pool**

Create `packages/session-core/src/ssh2ConnectionPool.ts`:

```typescript
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
  errorListeners: Set<(err: Error) => void>;
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

      client.on("ready", () => resolve(client));
      client.on("error", (err) => reject(err));

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
    try { entry.client.end(); } catch {}
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
        // Cancel idle timer if running
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

      // Create new connection
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
        errorListeners: new Set(),
      };

      // Listen for connection errors/close
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
        // Start idle timeout
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
```

**Step 4: Export from index**

In `packages/session-core/src/index.ts`, add:
```typescript
export { createSsh2ConnectionPool, type Ssh2ConnectionPool, type Ssh2PoolTarget, type PooledConnection, type PoolStats, type ResolvedAuth } from "./ssh2ConnectionPool";
```

**Step 5: Run tests**

Run: `pnpm --filter @hypershell/session-core test`
Expected: All PASS

**Step 6: Commit**

```bash
git add packages/session-core/src/ssh2ConnectionPool.ts packages/session-core/src/ssh2ConnectionPool.test.ts packages/session-core/src/index.ts
git commit -m "feat(session-core): add Ssh2ConnectionPool with ref counting and idle timeout"
```

---

## Task 9: Refactor SFTP Transport to Use Connection Pool

**Files:**
- Modify: `packages/session-core/src/transports/sftpTransport.ts`

**Step 1: Write test for pool integration**

In SFTP transport tests, add a test that verifies when a pool is provided, the transport uses the pooled client instead of creating a new one.

**Step 2: Add optional pool parameter**

Add `pool?: Ssh2ConnectionPool` to the SFTP transport factory function. When provided:
- Call `pool.acquire()` instead of `new Client()`
- On close, call `pool.release()` instead of `client.end()`
- Store `connectionId` and `consumerId` for release

When `pool` is not provided, behavior is unchanged (backward compatible).

**Step 3: Run tests**

Run: `pnpm --filter @hypershell/session-core test`
Expected: All PASS (existing tests don't pass pool, so behavior unchanged)

**Step 4: Commit**

```bash
git add packages/session-core/src/transports/sftpTransport.ts
git commit -m "feat(session-core): allow SFTP transport to use Ssh2ConnectionPool"
```

---

## Task 10: Desktop IPC — Host Port Forwards

**Files:**
- Create: `apps/desktop/src/main/ipc/hostPortForwardIpc.ts`
- Modify: `apps/desktop/src/main/ipc/registerIpc.ts`

**Step 1: Create hostPortForwardIpc handler**

Follow the same pattern as `portForwardIpc.ts`. The handler needs:
- Access to `hostPortForwardsRepository` (from Task 3)
- Handlers for `list`, `upsert`, `remove`, `reorder` channels
- Zod validation of all requests

```typescript
import { ipcChannels } from "@hypershell/shared";
import {
  listHostPortForwardsRequestSchema,
  upsertHostPortForwardRequestSchema,
  removeHostPortForwardRequestSchema,
  reorderHostPortForwardsRequestSchema,
} from "@hypershell/shared";
import type { IpcMainLike } from "./registerIpc";

export function registerHostPortForwardIpc(
  ipcMain: IpcMainLike,
  getRepo: () => ReturnType<typeof createHostPortForwardsRepositoryFromDatabase>
) {
  ipcMain.handle(ipcChannels.hostPortForward.list, (_event, request) => {
    const { hostId } = listHostPortForwardsRequestSchema.parse(request);
    return getRepo().listForHost(hostId);
  });

  ipcMain.handle(ipcChannels.hostPortForward.upsert, (_event, request) => {
    const parsed = upsertHostPortForwardRequestSchema.parse(request);
    return getRepo().create(parsed);
  });

  ipcMain.handle(ipcChannels.hostPortForward.remove, (_event, request) => {
    const { id } = removeHostPortForwardRequestSchema.parse(request);
    return getRepo().remove(id);
  });

  ipcMain.handle(ipcChannels.hostPortForward.reorder, (_event, request) => {
    const { items } = reorderHostPortForwardsRequestSchema.parse(request);
    return getRepo().updateSortOrders(items);
  });
}
```

**Step 2: Register in registerIpc.ts**

Add the new handler registration in `registerIpc()` alongside existing handlers. Wire up repository access following the same pattern as hosts repository.

**Step 3: Update session open handler for auto-start forwards**

In `registerIpc.ts`, in the `openSession` handler (around line 128): after successfully opening a session, query `hostPortForwardsRepository.listForHost(hostId)` for forwards with `autoStart === true`, and start each one via the existing port forward mechanism.

**Step 4: Build and verify**

Run: `pnpm --filter @hypershell/desktop build`
Expected: Builds without errors

**Step 5: Commit**

```bash
git add apps/desktop/src/main/ipc/hostPortForwardIpc.ts apps/desktop/src/main/ipc/registerIpc.ts
git commit -m "feat(desktop): add IPC handlers for host port forwards with auto-start on connect"
```

---

## Task 11: Desktop IPC — Connection Pool Stats & Network Status

**Files:**
- Modify: `apps/desktop/src/main/ipc/registerIpc.ts`

**Step 1: Add pool stats handler**

In `registerIpc.ts`, add handler for `ipcChannels.connectionPool.stats` that returns `pool.getStats()` from the shared pool instance.

**Step 2: Add network status event forwarding**

Create a mechanism to forward `NetworkMonitor` online/offline events to the renderer via `ipcMain` event emission. Register `networkMonitor.onOnline()` and `onOffline()` callbacks that send events to all renderer windows.

**Step 3: Wire up reconnect config passthrough**

In the `openSession` handler, when resolving host profile from DB, read the new fields (`autoReconnect`, `reconnectMaxAttempts`, `reconnectBaseInterval`, `keepAliveInterval`, `proxyJump`) and pass them through to `sessionManager.open()` and `SshConnectionOptions`.

**Step 4: Build and verify**

Run: `pnpm --filter @hypershell/desktop build`
Expected: Builds without errors

**Step 5: Commit**

```bash
git add apps/desktop/src/main/ipc/registerIpc.ts
git commit -m "feat(desktop): add connection pool stats, network status, and reconnect config passthrough"
```

---

## Task 12: Preload API Updates

**Files:**
- Modify: `apps/desktop/src/preload/desktopApi.ts`
- Modify: `apps/ui/src/types/global.d.ts`

**Step 1: Add host port forward methods to preload**

Following the existing pattern (parse request with schema, invoke channel, parse response):

```typescript
hostPortForwardList(hostId: string): Promise<HostPortForwardRecord[]>
hostPortForwardUpsert(request: UpsertHostPortForwardRequest): Promise<HostPortForwardRecord>
hostPortForwardRemove(id: string): Promise<boolean>
hostPortForwardReorder(items: { id: string; sortOrder: number }[]): Promise<void>
```

**Step 2: Add pool stats method**

```typescript
connectionPoolStats(): Promise<ConnectionPoolStats[]>
```

**Step 3: Add network status event subscription**

```typescript
onNetworkStatus(listener: (online: boolean) => void): () => void
```

**Step 4: Update global.d.ts**

Add all new methods to the `window.hypershell` type declaration, marked as optional (`?:`).

**Step 5: Build and verify**

Run: `pnpm build`
Expected: Full build succeeds

**Step 6: Commit**

```bash
git add apps/desktop/src/preload/desktopApi.ts apps/ui/src/types/global.d.ts
git commit -m "feat(desktop): expose host port forwards, pool stats, and network status in preload API"
```

---

## Task 13: UI — Host Form Updates (Jump Host, Keep-Alive, Reconnect)

**Files:**
- Modify: `apps/ui/src/features/hosts/HostForm.tsx`

**Step 1: Extend HostFormValue type**

Add new fields:
```typescript
proxyJump: string;
proxyJumpHostIds: string; // JSON array
keepAliveInterval: string; // text input, parsed to number
autoReconnect: boolean;
reconnectMaxAttempts: number;
reconnectBaseInterval: number;
```

**Step 2: Add Connection section**

After existing fields, add a "Connection" section with:

- **Jump Hosts**: A multi-select component that lists saved hosts as selectable chips. Use existing host list from `window.hypershell?.listHosts()`. Each selected host resolves to `user@hostname:port`. Reorderable via drag. Raw text override field below.
- **Keep-Alive Interval**: Number input, placeholder "Default: 30", suffix "seconds"

**Step 3: Add Reliability section**

- **Auto-Reconnect**: Toggle switch (checkbox styled as toggle)
- **Max Attempts**: Number input, min 1 max 50, shown only when autoReconnect is on
- **Base Interval**: Number input, min 1 max 60, suffix "seconds", shown only when autoReconnect is on

**Step 4: Wire up form submission**

Ensure new fields are included in the `onSubmit` payload mapping to `upsertHostRequest`.

**Step 5: Verify in dev**

Run: `pnpm dev` (if available) or `pnpm --filter @hypershell/ui dev`
Expected: Form renders with new sections, no console errors

**Step 6: Commit**

```bash
git add apps/ui/src/features/hosts/HostForm.tsx
git commit -m "feat(ui): add jump host picker, keep-alive, and auto-reconnect fields to host form"
```

---

## Task 14: UI — Host Port Forwards Section in Host Form

**Files:**
- Create: `apps/ui/src/features/hosts/HostPortForwardList.tsx`
- Modify: `apps/ui/src/features/hosts/HostForm.tsx`

**Step 1: Create HostPortForwardList component**

A self-contained component that:
- Takes `hostId` prop
- Fetches forwards via `window.hypershell?.hostPortForwardList(hostId)`
- Renders a table: name, type badge (L/R/D), local port → remote host:port, auto-start toggle
- Add button opens inline form row
- Edit/delete via row actions
- Calls `window.hypershell?.hostPortForwardUpsert()` and `hostPortForwardRemove()`

**Step 2: Integrate into HostForm**

Add `<HostPortForwardList hostId={hostId} />` section at bottom of form (only shown when editing existing host, not creating new).

**Step 3: Verify in dev**

Expected: Port forwards section appears on edit, CRUD works

**Step 4: Commit**

```bash
git add apps/ui/src/features/hosts/HostPortForwardList.tsx apps/ui/src/features/hosts/HostForm.tsx
git commit -m "feat(ui): add host port forwards CRUD section to host form"
```

---

## Task 15: UI — Terminal Reconnect Overlay

**Files:**
- Create: `apps/ui/src/features/terminal/TerminalReconnectOverlay.tsx`
- Modify: `apps/ui/src/features/terminal/useTerminalSession.ts` (or parent component)

**Step 1: Create overlay component**

```typescript
interface TerminalReconnectOverlayProps {
  state: SessionState;
  reconnectAttempt?: number;
  maxAttempts?: number;
  onRetry?: () => void;
}
```

Renders based on state:
- `waiting_for_network` → "Offline — waiting for network..." with wifi-off icon
- `reconnecting` → "Reconnecting (attempt N/M)..." with spinner
- `failed` → "Connection lost" with "Retry" button calling `onRetry`
- Other states → render nothing (null)

Styled: absolute positioned over terminal container, semi-transparent dark backdrop, centered text.

**Step 2: Integrate with terminal container**

In the component that wraps the terminal (wherever `useTerminalSession` is consumed), render `<TerminalReconnectOverlay>` as a sibling inside the terminal container div, positioned absolutely.

**Step 3: Verify visually**

Expected: Overlay appears on disconnect, shows appropriate message

**Step 4: Commit**

```bash
git add apps/ui/src/features/terminal/TerminalReconnectOverlay.tsx
git commit -m "feat(ui): add terminal reconnect overlay with network-aware states"
```

---

## Task 16: UI — Tab Status Badges

**Files:**
- Modify: The tab component in `apps/ui/src/features/` (find the tab bar/tab item component)

**Step 1: Add status dot to tab**

Add a small colored circle (8px) to each tab, positioned left of the title:
- Green (`#22c55e`) → `connected`
- Yellow (`#eab308`) → `reconnecting`
- Orange (`#f97316`) → `waiting_for_network`
- Gray (`#6b7280`) → `disconnected`
- Red (`#ef4444`) → `failed`
- No dot → `connecting` (show spinner instead)

**Step 2: Wire session state to tabs**

Use the session state from `sessionStateStore` to determine the color per tab.

**Step 3: Commit**

```bash
git commit -m "feat(ui): add session status badge dots to tabs"
```

---

## Task 17: UI — Tunnel Manager Panel

**Files:**
- Create: `apps/ui/src/features/tunnels/tunnelStore.ts`
- Create: `apps/ui/src/features/tunnels/TunnelManagerPanel.tsx`
- Create: `apps/ui/src/features/tunnels/TunnelList.tsx`
- Create: `apps/ui/src/features/tunnels/TunnelForm.tsx`
- Create: `apps/ui/src/features/tunnels/TunnelTopology.tsx`

**Step 1: Create tunnel store**

Zustand store tracking:
```typescript
interface TunnelState {
  activeForwards: ActiveForward[]; // from port forward IPC list
  poolStats: PoolStats[];          // from connection pool stats
  selectedForwardId: string | null;
  hostFilter: string | null;       // filter by hostId or null for all

  refresh(): Promise<void>;
  startForward(request: StartPortForwardRequest): Promise<void>;
  stopForward(id: string): Promise<void>;
  selectForward(id: string | null): void;
  setHostFilter(hostId: string | null): void;
}
```

**Step 2: Create TunnelList component**

Table showing all active and configured port forwards:
- Columns: Name, Type (L/R/D badge), Local (address:port), Remote (host:port), Host, Status, Actions
- Start/stop button per row
- Status: green dot = active, gray = stopped
- Host filter dropdown at top
- "+ Add Forward" button

**Step 3: Create TunnelForm component**

Modal or inline form for adding/editing a forward:
- Fields: Name, Protocol (dropdown), Local Address, Local Port, Remote Host, Remote Port
- For standalone: also Host (hostname, username, port)
- For host-linked: hostId is pre-set
- Save calls appropriate IPC (standalone `startPortForward` or host-linked `hostPortForwardUpsert`)

**Step 4: Create TunnelTopology component**

Auto-generated SVG diagram:
- Parse active forwards into a node graph: localhost → (optional jump hosts) → remote targets
- Render left-to-right: rounded rect nodes with hostname, edges with port labels
- Color edges by status (green/red/yellow)
- Use `<svg>` with manual layout (no external library)
- Click node → select corresponding row in TunnelList

Layout algorithm:
1. Collect unique nodes: localhost (always leftmost), intermediate hosts, remote targets (rightmost)
2. Arrange in columns by hop distance
3. Draw edges with arrowheads and port labels

**Step 5: Create TunnelManagerPanel**

Compose the panel:
```tsx
<div className="flex flex-col h-full">
  <TunnelTopology />
  <TunnelList />
</div>
```

**Step 6: Wire into app navigation**

Add a sidebar entry or menu item to open the Tunnel Manager panel. Follow existing sidebar pattern.

**Step 7: Verify in dev**

Expected: Panel opens, shows topology and list, CRUD works

**Step 8: Commit**

```bash
git add apps/ui/src/features/tunnels/
git commit -m "feat(ui): add Tunnel Manager panel with topology diagram and forward list"
```

---

## Task 18: Integration Testing and Polish

**Step 1: Run full test suite**

Run: `pnpm test`
Expected: All unit tests pass

**Step 2: Run build**

Run: `pnpm build`
Expected: All workspaces build without errors

**Step 3: Run lint**

Run: `pnpm lint`
Expected: No lint errors

**Step 4: Run E2E tests**

Run: `pnpm --filter @hypershell/ui test:e2e`
Expected: Existing E2E tests still pass

**Step 5: Fix any issues found**

Address type errors, missing imports, styling issues, etc.

**Step 6: Final commit**

```bash
git commit -m "chore: fix integration issues from advanced SSH features"
```

---

## Summary

| Task | Scope | Key Files |
|------|-------|-----------|
| 1 | DB migration 006 | `packages/db/src/migrations/006_advanced_ssh.sql` |
| 2 | HostRecord types + repo | `packages/db/src/repositories/hostsRepository.ts` |
| 3 | Port forwards repo | `packages/db/src/repositories/hostPortForwardsRepository.ts` |
| 4 | IPC schemas + channels | `packages/shared/src/ipc/schemas.ts`, `channels.ts` |
| 5 | SessionState + reconnect config | `packages/session-core/src/transportEvents.ts`, `sessionManager.ts` |
| 6 | NetworkMonitor | `packages/session-core/src/networkMonitor.ts` |
| 7 | NetworkMonitor ↔ SessionManager | `packages/session-core/src/sessionManager.ts` |
| 8 | Ssh2ConnectionPool | `packages/session-core/src/ssh2ConnectionPool.ts` |
| 9 | SFTP pool integration | `packages/session-core/src/transports/sftpTransport.ts` |
| 10 | Desktop IPC: host port forwards | `apps/desktop/src/main/ipc/hostPortForwardIpc.ts` |
| 11 | Desktop IPC: pool + network | `apps/desktop/src/main/ipc/registerIpc.ts` |
| 12 | Preload + global types | `apps/desktop/src/preload/desktopApi.ts`, `global.d.ts` |
| 13 | UI: host form (jump/keepalive/reconnect) | `apps/ui/src/features/hosts/HostForm.tsx` |
| 14 | UI: host port forwards section | `apps/ui/src/features/hosts/HostPortForwardList.tsx` |
| 15 | UI: reconnect overlay | `apps/ui/src/features/terminal/TerminalReconnectOverlay.tsx` |
| 16 | UI: tab status badges | Tab component |
| 17 | UI: tunnel manager panel | `apps/ui/src/features/tunnels/` |
| 18 | Integration testing | All |

**Dependency order:** Tasks 1-4 (data layer) → 5-9 (session-core) → 10-12 (desktop) → 13-17 (UI) → 18 (integration). Within each layer, tasks are mostly sequential but some can be parallelized (e.g., Tasks 6 and 8 are independent).
