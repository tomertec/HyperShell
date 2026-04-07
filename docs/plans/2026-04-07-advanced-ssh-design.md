# Advanced SSH Features — Design Document

**Date:** 2026-04-07
**Status:** Approved
**Approach:** Incremental Extension (no transport layer rewrite)

## Scope

| Feature | Approach |
|---|---|
| Port Forwarding | Standalone + host-linked with auto-start on connect |
| Jump Hosts | Per-host picker from saved hosts + raw text fallback |
| Visual Tunnel Builder | Visual port forward manager with topology preview (v1) |
| Connection Pooling | Hybrid — ssh2 pool for SFTP + port forwards, system ssh for terminal |
| Auto-Reconnect | Per-host config + network awareness (pause offline, retry on reconnect) |
| Per-Host Keep-Alive | ServerAliveInterval field per host |

**Dropped:** X11 Forwarding

---

## 1. Database Schema Changes

### Migration 006 — Advanced SSH Host Fields

```sql
-- Jump host chain
ALTER TABLE hosts ADD COLUMN proxy_jump TEXT;
ALTER TABLE hosts ADD COLUMN proxy_jump_host_ids TEXT; -- JSON array of host IDs for UI picker

-- Keep-alive
ALTER TABLE hosts ADD COLUMN keep_alive_interval INTEGER; -- NULL = app default (30s), 0 = disabled

-- Auto-reconnect
ALTER TABLE hosts ADD COLUMN auto_reconnect INTEGER DEFAULT 0;
ALTER TABLE hosts ADD COLUMN reconnect_max_attempts INTEGER DEFAULT 5;
ALTER TABLE hosts ADD COLUMN reconnect_base_interval INTEGER DEFAULT 1;
```

### New Table — Host-Linked Port Forwards

```sql
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

**Key decisions:**
- `proxy_jump` stores resolved `-J` value; `proxy_jump_host_ids` stores UI state (host picker selections)
- `keep_alive_interval` nullable: NULL = use default, 0 = disabled
- Host-linked forwards are separate from standalone `port_forward_profiles`
- `auto_start` controls whether forwards activate on host connect

---

## 2. Connection Pooling (Ssh2ConnectionPool)

**New module:** `packages/session-core/src/ssh2ConnectionPool.ts`

### Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│ SFTP Session │────>│                  │────>│             │
├─────────────┤     │  Ssh2Connection  │     │  Remote SSH │
│ Port Forward │────>│      Pool        │────>│   Server    │
├─────────────┤     │                  │     │             │
│ Port Forward │────>│  (keyed by       │     └─────────────┘
└─────────────┘     │   host:port:user)│
                    └──────────────────┘
```

### Interface

```typescript
interface Ssh2ConnectionPool {
  acquire(opts: Ssh2PoolTarget): Promise<PooledConnection>;
  release(connectionId: string, consumerId: string): void;
  destroy(connectionId: string): void;
  destroyAll(): void;
  getStats(): PoolStats[];
}

interface Ssh2PoolTarget {
  hostname: string;
  port: number;
  username: string;
  auth: ResolvedAuth; // Auth resolved before pool access
}

interface PooledConnection {
  connectionId: string;
  consumerId: string;
  client: ssh2.Client;
}
```

### Lifecycle Rules

- **Reference counting:** acquire() increments, release() decrements consumer count
- **Idle timeout:** 30s grace period after last consumer releases before closing
- **Error propagation:** ssh2.Client errors notify all consumers; pool entry removed
- **Auth resolution outside pool:** callers resolve credentials first, pass ResolvedAuth

### Integration Points

- `sftpTransport.ts` — refactored to accept PooledConnection instead of creating own ssh2.Client
- `portForwarding.ts` — new path using `client.forwardOut()`/`client.forwardIn()` when pool connection exists
- Standalone port forwards continue using SSH binary approach

---

## 3. Auto-Reconnect with Network Awareness

### Network Monitor

**New module:** `packages/session-core/src/networkMonitor.ts`

```typescript
interface NetworkMonitor {
  isOnline(): boolean;
  onOnline(cb: () => void): () => void;
  onOffline(cb: () => void): () => void;
  dispose(): void;
}
```

**Implementation:** Electron `powerMonitor` for sleep/wake + periodic DNS probe of target hostname. Falls back to Node `dns.resolve`.

### Reconnection State Machine

```
connected ──(disconnect)──> waiting_for_network
                                   │
                      ┌────────────┼────────────┐
                      v            │             │
                  [offline]    [online]          │
                  (pause)     (resume)           │
                      │            │             │
                      │            v             │
                      │     reconnecting ──(fail)─> backoff
                      │            │             │
                      │        (success)    (max attempts)
                      │            │             │
                      │            v             v
                      │       connected       failed
                      │                    (notify user)
                      └──(online)──> reconnecting
```

### Key Behaviors

- On disconnect: check network first. If offline → `waiting_for_network` (no attempt burned)
- Network restored → reset attempt counter, reconnect immediately
- While online: exponential backoff (configurable base interval × 2^n, capped 30s)
- Sleep/wake treated as network transitions
- Granular states emitted for UI: `waiting_for_network`, `reconnecting`, `failed`

### Per-Host Config

- `auto_reconnect` (boolean) — enables/disables
- `reconnect_max_attempts` (int) — overrides default 5
- `reconnect_base_interval` (int seconds) — overrides default 1s

---

## 4. Per-Host Keep-Alive

**Flow:** DB `keep_alive_interval` → IPC → `SshConnectionProfile.keepAliveSeconds` → `-o ServerAliveInterval=N`

- NULL in DB = app default (30s), explicit 0 = disabled
- SFTP transport: maps to `ssh2.Client` `keepaliveInterval` option
- Connection pool inherits keep-alive from first consumer's config for that host
- Plumbing exists in both transports; this adds persistence and UI only

---

## 5. Jump Host Picker

### UI Component

Multi-select host picker with reorderable chips + raw text override:

```
┌─ Jump Hosts ──────────────────────────────┐
│ [bastion-prod ×] [gateway-eu ×]  [+ Add]  │
│                                            │
│ Raw override: ________________________     │
│ (overrides picker if set)                  │
└────────────────────────────────────────────┘
```

### Behavior

- User picks from saved hosts in order (drag to reorder chain)
- HyperShell resolves each host's `username@hostname:port` → builds `-J` chain
- Raw text field as override for non-saved hosts
- Stored: `proxy_jump` = resolved `-J` string, `proxy_jump_host_ids` = JSON array of host IDs
- If `proxy_jump` is manually edited, `proxy_jump_host_ids` is cleared

---

## 6. Port Forwarding & Visual Tunnel Manager

### Two Categories

1. **Standalone forwards** — existing `port_forward_profiles`, launched on demand
2. **Host-linked forwards** — new `host_port_forwards` table, optionally auto-start on connect

### Auto-Start Flow

```
Host connect (openSession IPC)
  → SessionManager creates SSH transport
  → Query host_port_forwards WHERE host_id = X AND auto_start = 1
  → Start each forward via connection pool (ssh2) or SSH binary
  → Track forward lifecycle alongside session
  → On session close: tear down all auto-started forwards
```

### Visual Tunnel Manager (v1)

**Location:** `apps/ui/src/features/tunnels/`

Two-section panel: topology preview + forward list.

**Topology preview:**
- Auto-generated SVG, left-to-right layout
- Nodes: rounded rects with hostname labels
- Edges: lines with port labels and directional arrows
- Status colors: green (active), red (stopped), yellow (connecting)
- Clicking a node selects the corresponding row

**Forward list:**
- CRUD table for all forwards (standalone + host-linked)
- Start/stop toggle, status indicator, error tooltip
- Filter by host or show all

**Not in v1:** No drag-and-drop node editing, no bandwidth stats. Diagram is read-only, auto-laid-out.

---

## 7. IPC & Schema Changes

### Updated Zod Schemas

**`upsertHostRequestSchema`** — new fields:
```typescript
proxyJump: z.string().nullable().optional()
proxyJumpHostIds: z.string().nullable().optional()
keepAliveInterval: z.number().int().min(0).nullable().optional()
autoReconnect: z.boolean().optional()
reconnectMaxAttempts: z.number().int().min(1).max(50).optional()
reconnectBaseInterval: z.number().int().min(1).max(60).optional()
```

**`hostRecordSchema`** — mirror same fields.

**`openSessionRequestSchema`** — add reconnect config:
```typescript
autoReconnect: z.boolean().optional()
reconnectMaxAttempts: z.number().int().optional()
reconnectBaseInterval: z.number().int().optional()
```

**New `hostPortForwardSchema`:**
```typescript
{
  id: z.string(),
  hostId: z.string(),
  name: z.string().min(1),
  protocol: z.enum(["local", "remote", "dynamic"]),
  localAddress: z.string().default("127.0.0.1"),
  localPort: z.number().int().min(1).max(65535),
  remoteHost: z.string().default(""),
  remotePort: z.number().int().min(0).max(65535).default(0),
  autoStart: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
}
```

**Extended session state:** Add `"waiting_for_network"` to session state enum.

### New IPC Channels

```typescript
hostPortForward: {
  list:    "host-port-forward:list",
  create:  "host-port-forward:create",
  update:  "host-port-forward:update",
  delete:  "host-port-forward:delete",
  reorder: "host-port-forward:reorder",
}

connectionPool: {
  stats: "connection-pool:stats",
}

network: {
  status: "network:status",
}
```

### Preload API Additions

```typescript
hostPortForwardList(hostId: string): Promise<HostPortForward[]>
hostPortForwardCreate(forward: HostPortForwardInput): Promise<HostPortForward>
hostPortForwardUpdate(forward: HostPortForwardInput): Promise<HostPortForward>
hostPortForwardDelete(id: string): Promise<void>
hostPortForwardReorder(items: {id, sortOrder}[]): Promise<void>
connectionPoolStats(): Promise<PoolStats[]>
onNetworkStatus(cb: (online: boolean) => void): () => void
```

---

## 8. UI Components

### Host Form Updates

**Connection section:**
- Jump Hosts — multi-select host picker (reorderable chips) + raw text override
- Keep-Alive — numeric input, placeholder "Default: 30"

**Reliability section:**
- Auto-Reconnect — toggle switch
- Max Attempts — numeric input (visible when auto-reconnect on), default 5
- Base Interval — numeric input in seconds (visible when auto-reconnect on), default 1

**Port Forwards section:**
- Inline table of host-linked forwards with add/edit/delete
- Each row: name, type badge (L/R/D), local port, remote target, auto-start toggle

### Tunnel Manager Panel

**Files:** `apps/ui/src/features/tunnels/`
- `TunnelManagerPanel.tsx` — main panel
- `TunnelTopology.tsx` — SVG topology diagram
- `TunnelList.tsx` — forward list with CRUD and status
- `TunnelForm.tsx` — add/edit forward form
- `tunnelStore.ts` — Zustand store for active forwards and pool stats

### Reconnection Overlay

**`TerminalReconnectOverlay.tsx`** — renders over terminal when disconnected:
- `waiting_for_network` → "Offline — waiting for network..."
- `reconnecting` → "Reconnecting (attempt 2/5)..." with progress
- `failed` → "Connection lost" with manual Retry button
- Semi-transparent backdrop, terminal content visible underneath

### Tab Status Badges

Colored dot on tab: green (connected), yellow (reconnecting), gray (disconnected), orange (waiting for network)
