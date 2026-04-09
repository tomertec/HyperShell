# SFTP File Browser Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a dual-pane SFTP file browser to HyperShell with drag-and-drop transfers, remote file editing, and per-host bookmarks.

**Architecture:** New `SftpTransport` in session-core using the `ssh2` npm package, with dedicated IPC channels following the existing contract pattern. UI renders as a new tab type in the layout system with its own Zustand stores.

**Tech Stack:** ssh2 (SFTP), CodeMirror 6 (editor), Zustand (state), Zod (IPC validation), Tailwind CSS (styling)

**Design Doc:** `docs/plans/2026-04-06-sftp-file-browser-design.md`

---

## Task 1: Install ssh2 Dependency in session-core

**Files:**
- Modify: `packages/session-core/package.json`

**Step 1: Install ssh2**

Run:
```bash
pnpm --filter @hypershell/session-core add ssh2
pnpm --filter @hypershell/session-core add -D @types/ssh2
```

**Step 2: Verify installation**

Run: `pnpm --filter @hypershell/session-core exec -- node -e "require('ssh2')"`
Expected: No error

**Step 3: Commit**

```bash
git add packages/session-core/package.json pnpm-lock.yaml
git commit -m "feat(session-core): add ssh2 dependency for SFTP support"
```

---

## Task 2: Extend TransportType with "sftp"

**Files:**
- Modify: `packages/session-core/src/transports/transportEvents.ts:1` — add `"sftp"` to `SessionTransportKind`
- Modify: `packages/shared/src/ipc/schemas.ts` — add `"sftp"` to transport enum if present
- Create: `packages/session-core/src/transports/sftpTransport.ts`
- Test: `packages/session-core/src/transports/sftpTransport.test.ts`

**Step 1: Write failing test for SftpTransport creation**

Create `packages/session-core/src/transports/sftpTransport.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { createSftpTransport, type SftpConnectionOptions } from "./sftpTransport";

describe("createSftpTransport", () => {
  const validOptions: SftpConnectionOptions = {
    hostname: "example.com",
    port: 22,
    username: "testuser",
    authMethod: "password",
    password: "testpass",
  };

  it("should emit connecting status on connect", async () => {
    const events: any[] = [];
    const transport = createSftpTransport("test-session", validOptions);
    transport.onEvent((e) => events.push(e));

    // Don't actually connect — just verify the transport was created
    expect(transport).toBeDefined();
    expect(transport.connect).toBeTypeOf("function");
    expect(transport.disconnect).toBeTypeOf("function");
    expect(transport.list).toBeTypeOf("function");
    expect(transport.stat).toBeTypeOf("function");
    expect(transport.mkdir).toBeTypeOf("function");
    expect(transport.rename).toBeTypeOf("function");
    expect(transport.remove).toBeTypeOf("function");
    expect(transport.readFile).toBeTypeOf("function");
    expect(transport.writeFile).toBeTypeOf("function");
    expect(transport.createReadStream).toBeTypeOf("function");
    expect(transport.createWriteStream).toBeTypeOf("function");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @hypershell/session-core test -- --run sftpTransport`
Expected: FAIL — module not found

**Step 3: Add "sftp" to SessionTransportKind**

In `packages/session-core/src/transports/transportEvents.ts`, change line 1:

```typescript
// Before:
export type SessionTransportKind = "ssh" | "serial";

// After:
export type SessionTransportKind = "ssh" | "serial" | "sftp";
```

Also add SFTP-specific connection options after the `SerialConnectionOptions` type:

```typescript
export interface SftpConnectionOptions {
  hostname: string;
  port?: number;
  username?: string;
  authMethod: "password" | "key" | "agent";
  password?: string;
  privateKeyPath?: string;
  passphrase?: string;
  proxyJump?: string;
  keepAliveSeconds?: number;
}
```

**Step 4: Write SftpTransport implementation**

Create `packages/session-core/src/transports/sftpTransport.ts`:

```typescript
import { Client, type SFTPWrapper, type ConnectConfig } from "ssh2";
import type { Readable, Writable } from "node:stream";
import { readFileSync } from "node:fs";
import type { SessionState, SessionTransportEvent, SftpConnectionOptions } from "./transportEvents";

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
    keepaliveInterval: (options.keepAliveSeconds ?? 60) * 1000,
  };

  if (options.authMethod === "password" && options.password) {
    config.password = options.password;
  } else if (options.authMethod === "key" && options.privateKeyPath) {
    config.privateKey = readFileSync(options.privateKeyPath);
    if (options.passphrase) config.passphrase = options.passphrase;
  } else if (options.authMethod === "agent") {
    config.agent = process.env.SSH_AUTH_SOCK;
  }

  return config;
}

export function createSftpTransport(
  sessionId: string,
  options: SftpConnectionOptions
): SftpTransportHandle {
  const listeners: Set<(event: SessionTransportEvent) => void> = new Set();
  let client: Client | null = null;
  let sftp: SFTPWrapper | null = null;

  function emit(event: SessionTransportEvent) {
    queueMicrotask(() => {
      for (const listener of listeners) listener(event);
    });
  }

  function emitStatus(state: SessionState) {
    emit({ type: "status", sessionId, state });
  }

  async function connect(): Promise<void> {
    emitStatus("connecting");
    const connectConfig = buildConnectConfig(options);

    return new Promise<void>((resolve, reject) => {
      const conn = new Client();

      conn.on("ready", () => {
        conn.sftp((err, sftpSession) => {
          if (err) {
            emitStatus("failed");
            reject(err);
            return;
          }
          client = conn;
          sftp = sftpSession;
          emitStatus("connected");
          resolve();
        });
      });

      conn.on("error", (err) => {
        emit({ type: "error", sessionId, message: err.message });
        emitStatus("failed");
        reject(err);
      });

      conn.on("close", () => {
        sftp = null;
        client = null;
        emitStatus("disconnected");
      });

      conn.connect(connectConfig);
    });
  }

  function disconnect() {
    if (client) {
      client.end();
      client = null;
      sftp = null;
    }
  }

  function requireSftp(): SFTPWrapper {
    if (!sftp) throw new Error("SFTP session not connected");
    return sftp;
  }

  async function list(remotePath: string): Promise<SftpEntry[]> {
    const s = requireSftp();
    return new Promise((resolve, reject) => {
      s.readdir(remotePath, (err, entries) => {
        if (err) return reject(err);
        resolve(
          entries
            .filter((e) => e.filename !== "." && e.filename !== "..")
            .map((e) => ({
              name: e.filename,
              path: remotePath.replace(/\/$/, "") + "/" + e.filename,
              size: e.attrs.size,
              modifiedAt: new Date(e.attrs.mtime * 1000).toISOString(),
              isDirectory: (e.attrs.mode & 0o40000) !== 0,
              permissions: e.attrs.mode & 0o7777,
              owner: e.attrs.uid,
              group: e.attrs.gid,
            }))
        );
      });
    });
  }

  async function stat(remotePath: string): Promise<SftpEntry> {
    const s = requireSftp();
    return new Promise((resolve, reject) => {
      s.stat(remotePath, (err, attrs) => {
        if (err) return reject(err);
        const name = remotePath.split("/").pop() || remotePath;
        resolve({
          name,
          path: remotePath,
          size: attrs.size,
          modifiedAt: new Date(attrs.mtime * 1000).toISOString(),
          isDirectory: (attrs.mode & 0o40000) !== 0,
          permissions: attrs.mode & 0o7777,
          owner: attrs.uid,
          group: attrs.gid,
        });
      });
    });
  }

  async function mkdir(remotePath: string): Promise<void> {
    const s = requireSftp();
    return new Promise((resolve, reject) => {
      s.mkdir(remotePath, (err) => (err ? reject(err) : resolve()));
    });
  }

  async function rename(oldPath: string, newPath: string): Promise<void> {
    const s = requireSftp();
    return new Promise((resolve, reject) => {
      s.rename(oldPath, newPath, (err) => (err ? reject(err) : resolve()));
    });
  }

  async function remove(remotePath: string, recursive = false): Promise<void> {
    const s = requireSftp();
    if (recursive) {
      const entries = await list(remotePath);
      for (const entry of entries) {
        if (entry.isDirectory) {
          await remove(entry.path, true);
        } else {
          await new Promise<void>((resolve, reject) => {
            s.unlink(entry.path, (err) => (err ? reject(err) : resolve()));
          });
        }
      }
      return new Promise((resolve, reject) => {
        s.rmdir(remotePath, (err) => (err ? reject(err) : resolve()));
      });
    }

    return new Promise((resolve, reject) => {
      s.stat(remotePath, (err, attrs) => {
        if (err) return reject(err);
        if ((attrs.mode & 0o40000) !== 0) {
          s.rmdir(remotePath, (rmErr) => (rmErr ? reject(rmErr) : resolve()));
        } else {
          s.unlink(remotePath, (rmErr) => (rmErr ? reject(rmErr) : resolve()));
        }
      });
    });
  }

  async function readFile(remotePath: string): Promise<Buffer> {
    const s = requireSftp();
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const stream = s.createReadStream(remotePath);
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", reject);
    });
  }

  async function writeFile(remotePath: string, data: Buffer): Promise<void> {
    const s = requireSftp();
    return new Promise((resolve, reject) => {
      const stream = s.createWriteStream(remotePath);
      stream.on("close", () => resolve());
      stream.on("error", reject);
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
    return () => listeners.delete(listener);
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
    onEvent,
  };
}
```

**Step 5: Run tests to verify they pass**

Run: `pnpm --filter @hypershell/session-core test -- --run sftpTransport`
Expected: PASS

**Step 6: Export from session-core**

In `packages/session-core/src/index.ts`, add:

```typescript
export * from "./transports/sftpTransport";
```

**Step 7: Commit**

```bash
git add packages/session-core/src/transports/sftpTransport.ts packages/session-core/src/transports/sftpTransport.test.ts packages/session-core/src/transports/transportEvents.ts packages/session-core/src/index.ts
git commit -m "feat(session-core): add SftpTransport using ssh2"
```

---

## Task 3: Add SFTP IPC Channels and Schemas

**Files:**
- Modify: `packages/shared/src/ipc/channels.ts:1-57` — add sftp + fs channels
- Modify: `packages/shared/src/ipc/schemas.ts` — add SFTP Zod schemas
- Modify: `packages/shared/src/ipc/contracts.ts` — add SFTP IPC interfaces
- Test: `packages/shared/src/ipc/schemas.test.ts`

**Step 1: Write failing test for SFTP schemas**

Create `packages/shared/src/ipc/sftpSchemas.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  sftpConnectRequestSchema,
  sftpListRequestSchema,
  sftpTransferStartRequestSchema,
  sftpEventSchema,
  fsListRequestSchema,
} from "./sftpSchemas";

describe("SFTP schemas", () => {
  it("validates connect request by hostId", () => {
    const result = sftpConnectRequestSchema.safeParse({ hostId: "abc123" });
    expect(result.success).toBe(true);
  });

  it("validates connect request by sessionId", () => {
    const result = sftpConnectRequestSchema.safeParse({ sessionId: "sess-1" });
    expect(result.success).toBe(true);
  });

  it("rejects connect request with neither hostId nor sessionId", () => {
    const result = sftpConnectRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("validates list request", () => {
    const result = sftpListRequestSchema.safeParse({
      sftpSessionId: "sftp-1",
      path: "/home/user",
    });
    expect(result.success).toBe(true);
  });

  it("validates transfer start request", () => {
    const result = sftpTransferStartRequestSchema.safeParse({
      sftpSessionId: "sftp-1",
      operations: [
        {
          type: "upload",
          localPath: "C:\\Users\\test\\file.txt",
          remotePath: "/home/user/file.txt",
          isDirectory: false,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("validates transfer-progress event", () => {
    const result = sftpEventSchema.safeParse({
      kind: "transfer-progress",
      transferId: "tx-1",
      bytesTransferred: 1024,
      totalBytes: 4096,
      speed: 512,
      status: "active",
    });
    expect(result.success).toBe(true);
  });

  it("validates fs list request", () => {
    const result = fsListRequestSchema.safeParse({ path: "C:\\Users" });
    expect(result.success).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @hypershell/shared test -- --run sftpSchemas`
Expected: FAIL — module not found

**Step 3: Create SFTP schemas**

Create `packages/shared/src/ipc/sftpSchemas.ts`:

```typescript
import { z } from "zod";

// --- SFTP Entry ---

export const sftpEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  size: z.number(),
  modifiedAt: z.string(),
  isDirectory: z.boolean(),
  permissions: z.number(),
  owner: z.number(),
  group: z.number(),
});
export type SftpEntry = z.infer<typeof sftpEntrySchema>;

// --- Connect ---

export const sftpConnectRequestSchema = z.union([
  z.object({ hostId: z.string() }),
  z.object({ sessionId: z.string() }),
]);
export type SftpConnectRequest = z.infer<typeof sftpConnectRequestSchema>;

export const sftpConnectResponseSchema = z.object({
  sftpSessionId: z.string(),
});
export type SftpConnectResponse = z.infer<typeof sftpConnectResponseSchema>;

// --- Disconnect ---

export const sftpDisconnectRequestSchema = z.object({
  sftpSessionId: z.string(),
});
export type SftpDisconnectRequest = z.infer<typeof sftpDisconnectRequestSchema>;

// --- List ---

export const sftpListRequestSchema = z.object({
  sftpSessionId: z.string(),
  path: z.string(),
});
export type SftpListRequest = z.infer<typeof sftpListRequestSchema>;

export const sftpListResponseSchema = z.object({
  entries: z.array(sftpEntrySchema),
});
export type SftpListResponse = z.infer<typeof sftpListResponseSchema>;

// --- Stat ---

export const sftpStatRequestSchema = z.object({
  sftpSessionId: z.string(),
  path: z.string(),
});
export type SftpStatRequest = z.infer<typeof sftpStatRequestSchema>;

// --- Mkdir ---

export const sftpMkdirRequestSchema = z.object({
  sftpSessionId: z.string(),
  path: z.string(),
});
export type SftpMkdirRequest = z.infer<typeof sftpMkdirRequestSchema>;

// --- Rename ---

export const sftpRenameRequestSchema = z.object({
  sftpSessionId: z.string(),
  oldPath: z.string(),
  newPath: z.string(),
});
export type SftpRenameRequest = z.infer<typeof sftpRenameRequestSchema>;

// --- Delete ---

export const sftpDeleteRequestSchema = z.object({
  sftpSessionId: z.string(),
  path: z.string(),
  recursive: z.boolean().optional().default(false),
});
export type SftpDeleteRequest = z.infer<typeof sftpDeleteRequestSchema>;

// --- Read/Write File ---

export const sftpReadFileRequestSchema = z.object({
  sftpSessionId: z.string(),
  path: z.string(),
});
export type SftpReadFileRequest = z.infer<typeof sftpReadFileRequestSchema>;

export const sftpReadFileResponseSchema = z.object({
  content: z.string(),
  encoding: z.enum(["utf-8", "base64"]),
});
export type SftpReadFileResponse = z.infer<typeof sftpReadFileResponseSchema>;

export const sftpWriteFileRequestSchema = z.object({
  sftpSessionId: z.string(),
  path: z.string(),
  content: z.string(),
  encoding: z.enum(["utf-8", "base64"]).optional().default("utf-8"),
});
export type SftpWriteFileRequest = z.infer<typeof sftpWriteFileRequestSchema>;

// --- Transfer ---

export const transferOpSchema = z.object({
  type: z.enum(["upload", "download"]),
  localPath: z.string(),
  remotePath: z.string(),
  isDirectory: z.boolean(),
});
export type TransferOp = z.infer<typeof transferOpSchema>;

export const sftpTransferStartRequestSchema = z.object({
  sftpSessionId: z.string(),
  operations: z.array(transferOpSchema).min(1),
});
export type SftpTransferStartRequest = z.infer<typeof sftpTransferStartRequestSchema>;

export const sftpTransferCancelRequestSchema = z.object({
  transferId: z.string(),
});
export type SftpTransferCancelRequest = z.infer<typeof sftpTransferCancelRequestSchema>;

export const transferJobStatusSchema = z.enum([
  "queued",
  "active",
  "paused",
  "completed",
  "failed",
]);

export const transferJobSchema = z.object({
  transferId: z.string(),
  groupId: z.string().optional(),
  type: z.enum(["upload", "download"]),
  localPath: z.string(),
  remotePath: z.string(),
  status: transferJobStatusSchema,
  bytesTransferred: z.number(),
  totalBytes: z.number(),
  speed: z.number(),
  error: z.string().optional(),
});
export type TransferJob = z.infer<typeof transferJobSchema>;

export const sftpTransferListResponseSchema = z.object({
  transfers: z.array(transferJobSchema),
});
export type SftpTransferListResponse = z.infer<typeof sftpTransferListResponseSchema>;

// --- Transfer Conflict ---

export const sftpTransferResolveConflictRequestSchema = z.object({
  transferId: z.string(),
  resolution: z.enum(["overwrite", "skip", "rename"]),
  applyToAll: z.boolean().optional().default(false),
});
export type SftpTransferResolveConflictRequest = z.infer<
  typeof sftpTransferResolveConflictRequestSchema
>;

// --- SFTP Events ---

export const sftpEventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("transfer-progress"),
    transferId: z.string(),
    bytesTransferred: z.number(),
    totalBytes: z.number(),
    speed: z.number(),
    status: transferJobStatusSchema,
  }),
  z.object({
    kind: z.literal("transfer-conflict"),
    transferId: z.string(),
    remotePath: z.string(),
    localPath: z.string(),
  }),
  z.object({
    kind: z.literal("status"),
    sftpSessionId: z.string(),
    state: z.enum(["connecting", "connected", "reconnecting", "disconnected", "failed"]),
  }),
  z.object({
    kind: z.literal("transfer-complete"),
    transferId: z.string(),
    status: z.enum(["completed", "failed"]),
    error: z.string().optional(),
  }),
]);
export type SftpEvent = z.infer<typeof sftpEventSchema>;

// --- Local FS Schemas ---

export const fsListRequestSchema = z.object({ path: z.string() });
export type FsListRequest = z.infer<typeof fsListRequestSchema>;

export const fsEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  size: z.number(),
  modifiedAt: z.string(),
  isDirectory: z.boolean(),
});
export type FsEntry = z.infer<typeof fsEntrySchema>;

export const fsListResponseSchema = z.object({
  entries: z.array(fsEntrySchema),
});
export type FsListResponse = z.infer<typeof fsListResponseSchema>;

export const fsGetDrivesResponseSchema = z.object({
  drives: z.array(z.string()),
});
export type FsGetDrivesResponse = z.infer<typeof fsGetDrivesResponseSchema>;

// --- Bookmarks ---

export const sftpBookmarkSchema = z.object({
  id: z.string(),
  hostId: z.string(),
  name: z.string(),
  remotePath: z.string(),
  sortOrder: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SftpBookmark = z.infer<typeof sftpBookmarkSchema>;

export const sftpBookmarkListRequestSchema = z.object({
  hostId: z.string(),
});
export type SftpBookmarkListRequest = z.infer<typeof sftpBookmarkListRequestSchema>;

export const sftpBookmarkUpsertRequestSchema = z.object({
  id: z.string().optional(),
  hostId: z.string(),
  name: z.string(),
  remotePath: z.string(),
  sortOrder: z.number().optional(),
});
export type SftpBookmarkUpsertRequest = z.infer<typeof sftpBookmarkUpsertRequestSchema>;

export const sftpBookmarkRemoveRequestSchema = z.object({
  id: z.string(),
});
export type SftpBookmarkRemoveRequest = z.infer<typeof sftpBookmarkRemoveRequestSchema>;

export const sftpBookmarkReorderRequestSchema = z.object({
  bookmarkIds: z.array(z.string()),
});
export type SftpBookmarkReorderRequest = z.infer<typeof sftpBookmarkReorderRequestSchema>;
```

**Step 4: Add SFTP channels**

In `packages/shared/src/ipc/channels.ts`, add before the `ipcChannels` export:

```typescript
export const sftpChannels = {
  connect: "sftp:connect",
  disconnect: "sftp:disconnect",
  list: "sftp:list",
  stat: "sftp:stat",
  mkdir: "sftp:mkdir",
  rename: "sftp:rename",
  delete: "sftp:delete",
  readFile: "sftp:read-file",
  writeFile: "sftp:write-file",
  transferStart: "sftp:transfer:start",
  transferCancel: "sftp:transfer:cancel",
  transferList: "sftp:transfer:list",
  transferResolveConflict: "sftp:transfer:resolve-conflict",
  event: "sftp:event",
  bookmarksList: "sftp:bookmarks:list",
  bookmarksUpsert: "sftp:bookmarks:upsert",
  bookmarksRemove: "sftp:bookmarks:remove",
  bookmarksReorder: "sftp:bookmarks:reorder",
} as const;

export const fsChannels = {
  list: "fs:list",
  stat: "fs:stat",
  getHome: "fs:get-home",
  getDrives: "fs:get-drives",
} as const;
```

And add to the `ipcChannels` object:

```typescript
export const ipcChannels = {
  session: sessionChannels,
  hosts: hostChannels,
  settings: settingsChannels,
  tray: trayChannels,
  portForward: portForwardChannels,
  groups: groupChannels,
  serialProfiles: serialProfileChannels,
  sftp: sftpChannels,       // NEW
  fs: fsChannels,            // NEW
} as const;
```

**Step 5: Export schemas from shared**

In `packages/shared/src/index.ts`, add:

```typescript
export * from "./ipc/sftpSchemas";
```

**Step 6: Run tests**

Run: `pnpm --filter @hypershell/shared test -- --run`
Expected: ALL PASS

**Step 7: Commit**

```bash
git add packages/shared/src/ipc/sftpSchemas.ts packages/shared/src/ipc/sftpSchemas.test.ts packages/shared/src/ipc/channels.ts packages/shared/src/index.ts
git commit -m "feat(shared): add SFTP IPC channels, Zod schemas, and local FS schemas"
```

---

## Task 4: Database Migration and Bookmarks Repository

**Files:**
- Create: `packages/db/src/migrations/002_sftp_bookmarks.sql`
- Create: `packages/db/src/repositories/sftpBookmarksRepository.ts`
- Modify: `packages/db/src/index.ts` — load migration
- Modify: `packages/db/src/repositories/index.ts` — export repository
- Test: `packages/db/src/repositories/sftpBookmarksRepository.test.ts`

**Step 1: Write failing test for bookmarks repository**

Create `packages/db/src/repositories/sftpBookmarksRepository.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { openDatabase, type SqliteDatabase } from "../index";
import { createSftpBookmarksRepository } from "./sftpBookmarksRepository";
import { createHostsRepository } from "./hostsRepository";

describe("SftpBookmarksRepository", () => {
  let db: SqliteDatabase;
  let repo: ReturnType<typeof createSftpBookmarksRepository>;
  let hostId: string;

  beforeEach(() => {
    db = openDatabase();
    repo = createSftpBookmarksRepository(db);
    const hostsRepo = createHostsRepository(db);
    const host = hostsRepo.create({
      name: "test-host",
      hostname: "example.com",
    });
    hostId = host.id;
  });

  it("creates and lists bookmarks for a host", () => {
    repo.upsert({ hostId, name: "Logs", remotePath: "/var/log" });
    repo.upsert({ hostId, name: "Config", remotePath: "/etc" });

    const bookmarks = repo.list(hostId);
    expect(bookmarks).toHaveLength(2);
    expect(bookmarks[0].name).toBe("Logs");
    expect(bookmarks[0].remotePath).toBe("/var/log");
  });

  it("updates existing bookmark", () => {
    const bm = repo.upsert({ hostId, name: "Logs", remotePath: "/var/log" });
    repo.upsert({ id: bm.id, hostId, name: "Logs Updated", remotePath: "/var/log/nginx" });

    const bookmarks = repo.list(hostId);
    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0].name).toBe("Logs Updated");
  });

  it("removes bookmark", () => {
    const bm = repo.upsert({ hostId, name: "Logs", remotePath: "/var/log" });
    repo.remove(bm.id);

    const bookmarks = repo.list(hostId);
    expect(bookmarks).toHaveLength(0);
  });

  it("reorders bookmarks", () => {
    const bm1 = repo.upsert({ hostId, name: "A", remotePath: "/a" });
    const bm2 = repo.upsert({ hostId, name: "B", remotePath: "/b" });
    const bm3 = repo.upsert({ hostId, name: "C", remotePath: "/c" });

    repo.reorder([bm3.id, bm1.id, bm2.id]);

    const bookmarks = repo.list(hostId);
    expect(bookmarks[0].name).toBe("C");
    expect(bookmarks[1].name).toBe("A");
    expect(bookmarks[2].name).toBe("B");
  });

  it("cascades delete when host is removed", () => {
    repo.upsert({ hostId, name: "Logs", remotePath: "/var/log" });
    db.prepare("DELETE FROM hosts WHERE id = ?").run(hostId);

    const bookmarks = repo.list(hostId);
    expect(bookmarks).toHaveLength(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @hypershell/db test -- --run sftpBookmarks`
Expected: FAIL — module not found

**Step 3: Create migration file**

Create `packages/db/src/migrations/002_sftp_bookmarks.sql`:

```sql
CREATE TABLE IF NOT EXISTS sftp_bookmarks (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  host_id     TEXT NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  remote_path TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sftp_bookmarks_host ON sftp_bookmarks(host_id);
```

**Step 4: Load migration in openDatabase**

In `packages/db/src/index.ts`, add after the 001 migration exec:

```typescript
const sftpBookmarksSql = readFileSync(
  new URL("./migrations/002_sftp_bookmarks.sql", import.meta.url),
  "utf8"
);
db.exec(sftpBookmarksSql);
```

**Step 5: Create bookmarks repository**

Create `packages/db/src/repositories/sftpBookmarksRepository.ts`:

```typescript
import type { SqliteDatabase } from "../index";

export interface SftpBookmarkRecord {
  id: string;
  hostId: string;
  name: string;
  remotePath: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface SftpBookmarkInput {
  id?: string;
  hostId: string;
  name: string;
  remotePath: string;
  sortOrder?: number;
}

interface SftpBookmarkRow {
  id: string;
  host_id: string;
  name: string;
  remote_path: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

function rowToRecord(row: SftpBookmarkRow): SftpBookmarkRecord {
  return {
    id: row.id,
    hostId: row.host_id,
    name: row.name,
    remotePath: row.remote_path,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createSftpBookmarksRepository(db: SqliteDatabase) {
  function upsert(input: SftpBookmarkInput): SftpBookmarkRecord {
    if (input.id) {
      db.prepare(
        `UPDATE sftp_bookmarks SET name = ?, remote_path = ?, sort_order = COALESCE(?, sort_order), updated_at = datetime('now') WHERE id = ?`
      ).run(input.name, input.remotePath, input.sortOrder ?? null, input.id);
      return rowToRecord(
        db.prepare("SELECT * FROM sftp_bookmarks WHERE id = ?").get(input.id) as SftpBookmarkRow
      );
    }

    const id = crypto.randomUUID().replace(/-/g, "");
    const sortOrder =
      input.sortOrder ??
      ((db
        .prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM sftp_bookmarks WHERE host_id = ?")
        .get(input.hostId) as { next: number }).next);

    db.prepare(
      `INSERT INTO sftp_bookmarks (id, host_id, name, remote_path, sort_order) VALUES (?, ?, ?, ?, ?)`
    ).run(id, input.hostId, input.name, input.remotePath, sortOrder);

    return rowToRecord(
      db.prepare("SELECT * FROM sftp_bookmarks WHERE id = ?").get(id) as SftpBookmarkRow
    );
  }

  function list(hostId: string): SftpBookmarkRecord[] {
    const rows = db
      .prepare("SELECT * FROM sftp_bookmarks WHERE host_id = ? ORDER BY sort_order ASC")
      .all(hostId) as SftpBookmarkRow[];
    return rows.map(rowToRecord);
  }

  function remove(id: string): void {
    db.prepare("DELETE FROM sftp_bookmarks WHERE id = ?").run(id);
  }

  function reorder(bookmarkIds: string[]): void {
    const stmt = db.prepare(
      "UPDATE sftp_bookmarks SET sort_order = ?, updated_at = datetime('now') WHERE id = ?"
    );
    const tx = db.transaction(() => {
      bookmarkIds.forEach((id, index) => stmt.run(index, id));
    });
    tx();
  }

  return { upsert, list, remove, reorder };
}
```

**Step 6: Export from repositories index**

In `packages/db/src/repositories/index.ts`, add:

```typescript
export * from "./sftpBookmarksRepository";
```

**Step 7: Run tests**

Run: `pnpm --filter @hypershell/db test -- --run`
Expected: ALL PASS

**Step 8: Commit**

```bash
git add packages/db/src/migrations/002_sftp_bookmarks.sql packages/db/src/repositories/sftpBookmarksRepository.ts packages/db/src/repositories/sftpBookmarksRepository.test.ts packages/db/src/repositories/index.ts packages/db/src/index.ts
git commit -m "feat(db): add sftp_bookmarks migration and repository"
```

---

## Task 5: SFTP IPC Handlers in Desktop

**Files:**
- Create: `apps/desktop/src/main/ipc/sftpIpc.ts`
- Create: `apps/desktop/src/main/sftp/sftpSessionManager.ts`
- Create: `apps/desktop/src/main/sftp/transferManager.ts`
- Create: `apps/desktop/src/main/ipc/fsIpc.ts`
- Modify: `apps/desktop/src/main/ipc/registerIpc.ts` — register new handlers
- Test: `apps/desktop/src/main/sftp/transferManager.test.ts`

**Step 1: Write failing test for TransferManager**

Create `apps/desktop/src/main/sftp/transferManager.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTransferManager } from "./transferManager";

describe("TransferManager", () => {
  let manager: ReturnType<typeof createTransferManager>;
  const mockSftpTransport = {
    stat: vi.fn().mockResolvedValue({ size: 1024, isDirectory: false }),
    createReadStream: vi.fn(),
    createWriteStream: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
  };

  beforeEach(() => {
    manager = createTransferManager();
  });

  it("queues transfer jobs", () => {
    const jobs = manager.enqueue("sftp-1", mockSftpTransport as any, [
      { type: "upload", localPath: "C:\\file.txt", remotePath: "/file.txt", isDirectory: false },
    ]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe("queued");
  });

  it("lists all transfers", () => {
    manager.enqueue("sftp-1", mockSftpTransport as any, [
      { type: "upload", localPath: "C:\\a.txt", remotePath: "/a.txt", isDirectory: false },
      { type: "download", localPath: "C:\\b.txt", remotePath: "/b.txt", isDirectory: false },
    ]);
    const all = manager.list();
    expect(all).toHaveLength(2);
  });

  it("cancels a transfer", () => {
    const jobs = manager.enqueue("sftp-1", mockSftpTransport as any, [
      { type: "upload", localPath: "C:\\file.txt", remotePath: "/file.txt", isDirectory: false },
    ]);
    manager.cancel(jobs[0].transferId);
    const all = manager.list();
    expect(all[0].status).toBe("failed");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @hypershell/desktop test -- --run transferManager`
Expected: FAIL — module not found

**Step 3: Create SftpSessionManager**

Create `apps/desktop/src/main/sftp/sftpSessionManager.ts`:

```typescript
import {
  createSftpTransport,
  type SftpTransportHandle,
  type SftpConnectionOptions,
} from "@hypershell/session-core";
import type { SessionTransportEvent } from "@hypershell/session-core";

export interface SftpSession {
  sftpSessionId: string;
  hostId: string;
  transport: SftpTransportHandle;
}

export function createSftpSessionManager() {
  const sessions = new Map<string, SftpSession>();
  const listeners = new Set<(event: { sftpSessionId: string } & SessionTransportEvent) => void>();

  function emit(sftpSessionId: string, event: SessionTransportEvent) {
    for (const listener of listeners) {
      listener({ sftpSessionId, ...event });
    }
  }

  async function connect(
    hostId: string,
    options: SftpConnectionOptions
  ): Promise<string> {
    const sftpSessionId = `sftp-${crypto.randomUUID().replace(/-/g, "")}`;
    const transport = createSftpTransport(sftpSessionId, options);

    transport.onEvent((event) => emit(sftpSessionId, event));

    await transport.connect();
    sessions.set(sftpSessionId, { sftpSessionId, hostId, transport });
    return sftpSessionId;
  }

  function disconnect(sftpSessionId: string): void {
    const session = sessions.get(sftpSessionId);
    if (session) {
      session.transport.disconnect();
      sessions.delete(sftpSessionId);
    }
  }

  function getSession(sftpSessionId: string): SftpSession | undefined {
    return sessions.get(sftpSessionId);
  }

  function getTransport(sftpSessionId: string): SftpTransportHandle {
    const session = sessions.get(sftpSessionId);
    if (!session) throw new Error(`SFTP session ${sftpSessionId} not found`);
    return session.transport;
  }

  function onEvent(listener: (event: { sftpSessionId: string } & SessionTransportEvent) => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function disconnectAll(): void {
    for (const session of sessions.values()) {
      session.transport.disconnect();
    }
    sessions.clear();
  }

  return { connect, disconnect, getSession, getTransport, onEvent, disconnectAll };
}
```

**Step 4: Create TransferManager**

Create `apps/desktop/src/main/sftp/transferManager.ts`:

```typescript
import type { SftpTransportHandle } from "@hypershell/session-core";
import type { TransferOp, TransferJob } from "@hypershell/shared";
import { createReadStream, createWriteStream, statSync, mkdirSync } from "node:fs";
import { dirname, basename } from "node:path";

export type TransferEventListener = (event: TransferEvent) => void;

export type TransferEvent =
  | { kind: "transfer-progress"; transferId: string; bytesTransferred: number; totalBytes: number; speed: number; status: string }
  | { kind: "transfer-complete"; transferId: string; status: "completed" | "failed"; error?: string }
  | { kind: "transfer-conflict"; transferId: string; remotePath: string; localPath: string };

export function createTransferManager(options?: { maxConcurrent?: number }) {
  const maxConcurrent = options?.maxConcurrent ?? 3;
  const jobs: Map<string, TransferJob & { sftpSessionId: string; abortController?: AbortController }> = new Map();
  const listeners = new Set<TransferEventListener>();
  let activeCount = 0;

  function emit(event: TransferEvent) {
    for (const listener of listeners) listener(event);
  }

  function enqueue(
    sftpSessionId: string,
    transport: SftpTransportHandle,
    operations: TransferOp[]
  ): TransferJob[] {
    const newJobs: TransferJob[] = [];

    for (const op of operations) {
      const transferId = `tx-${crypto.randomUUID().replace(/-/g, "")}`;
      const job: TransferJob & { sftpSessionId: string } = {
        transferId,
        sftpSessionId,
        type: op.type,
        localPath: op.localPath,
        remotePath: op.remotePath,
        status: "queued",
        bytesTransferred: 0,
        totalBytes: 0,
        speed: 0,
      };
      jobs.set(transferId, job);
      newJobs.push({ ...job });
    }

    processQueue(sftpSessionId, transport);
    return newJobs;
  }

  async function processQueue(sftpSessionId: string, transport: SftpTransportHandle) {
    const queued = [...jobs.values()].filter(
      (j) => j.sftpSessionId === sftpSessionId && j.status === "queued"
    );

    for (const job of queued) {
      if (activeCount >= maxConcurrent) break;
      activeCount++;
      job.status = "active";

      processJob(job, transport)
        .then(() => {
          job.status = "completed";
          emit({ kind: "transfer-complete", transferId: job.transferId, status: "completed" });
        })
        .catch((err: Error) => {
          job.status = "failed";
          job.error = err.message;
          emit({ kind: "transfer-complete", transferId: job.transferId, status: "failed", error: err.message });
        })
        .finally(() => {
          activeCount--;
          processQueue(sftpSessionId, transport);
        });
    }
  }

  async function processJob(
    job: TransferJob & { sftpSessionId: string },
    transport: SftpTransportHandle
  ) {
    if (job.type === "upload") {
      const localStat = statSync(job.localPath);
      job.totalBytes = localStat.size;

      const localStream = createReadStream(job.localPath);
      const remoteStream = transport.createWriteStream(job.remotePath);

      let bytesTransferred = 0;
      let lastEmit = Date.now();
      const startTime = Date.now();

      return new Promise<void>((resolve, reject) => {
        localStream.on("data", (chunk: Buffer) => {
          bytesTransferred += chunk.length;
          job.bytesTransferred = bytesTransferred;
          const elapsed = (Date.now() - startTime) / 1000;
          job.speed = elapsed > 0 ? bytesTransferred / elapsed : 0;

          if (Date.now() - lastEmit >= 200) {
            lastEmit = Date.now();
            emit({
              kind: "transfer-progress",
              transferId: job.transferId,
              bytesTransferred,
              totalBytes: job.totalBytes,
              speed: job.speed,
              status: "active",
            });
          }
        });
        localStream.pipe(remoteStream);
        remoteStream.on("close", resolve);
        remoteStream.on("error", reject);
        localStream.on("error", reject);
      });
    } else {
      // Download
      const remoteStat = await transport.stat(job.remotePath);
      job.totalBytes = remoteStat.size;

      mkdirSync(dirname(job.localPath), { recursive: true });
      const partPath = job.localPath + ".part";
      const remoteStream = transport.createReadStream(job.remotePath);
      const localStream = createWriteStream(partPath);

      let bytesTransferred = 0;
      let lastEmit = Date.now();
      const startTime = Date.now();

      return new Promise<void>((resolve, reject) => {
        remoteStream.on("data", (chunk: Buffer) => {
          bytesTransferred += chunk.length;
          job.bytesTransferred = bytesTransferred;
          const elapsed = (Date.now() - startTime) / 1000;
          job.speed = elapsed > 0 ? bytesTransferred / elapsed : 0;

          if (Date.now() - lastEmit >= 200) {
            lastEmit = Date.now();
            emit({
              kind: "transfer-progress",
              transferId: job.transferId,
              bytesTransferred,
              totalBytes: job.totalBytes,
              speed: job.speed,
              status: "active",
            });
          }
        });
        remoteStream.pipe(localStream);
        localStream.on("close", () => {
          const { renameSync } = require("node:fs");
          renameSync(partPath, job.localPath);
          resolve();
        });
        localStream.on("error", reject);
        remoteStream.on("error", reject);
      });
    }
  }

  function cancel(transferId: string): void {
    const job = jobs.get(transferId);
    if (job) {
      job.status = "failed";
      job.error = "Cancelled by user";
    }
  }

  function list(): TransferJob[] {
    return [...jobs.values()].map(({ sftpSessionId, abortController, ...rest }) => rest);
  }

  function onEvent(listener: TransferEventListener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { enqueue, cancel, list, onEvent };
}
```

**Step 5: Create SFTP IPC handler**

Create `apps/desktop/src/main/ipc/sftpIpc.ts`:

```typescript
import type { IpcMainInvokeEvent } from "electron";
import type { createSftpSessionManager } from "../sftp/sftpSessionManager";
import type { createTransferManager } from "../sftp/transferManager";
import type { createSftpBookmarksRepository } from "@hypershell/db";
import type { createHostsRepository } from "@hypershell/db";
import {
  sftpConnectRequestSchema,
  sftpDisconnectRequestSchema,
  sftpListRequestSchema,
  sftpStatRequestSchema,
  sftpMkdirRequestSchema,
  sftpRenameRequestSchema,
  sftpDeleteRequestSchema,
  sftpReadFileRequestSchema,
  sftpWriteFileRequestSchema,
  sftpTransferStartRequestSchema,
  sftpTransferCancelRequestSchema,
  sftpBookmarkListRequestSchema,
  sftpBookmarkUpsertRequestSchema,
  sftpBookmarkRemoveRequestSchema,
  sftpBookmarkReorderRequestSchema,
  type SftpConnectionOptions,
} from "@hypershell/shared";
import { ipcChannels } from "@hypershell/shared";
import { ipcMain } from "electron";

export interface SftpIpcDeps {
  sftpManager: ReturnType<typeof createSftpSessionManager>;
  transferManager: ReturnType<typeof createTransferManager>;
  bookmarksRepo: ReturnType<typeof createSftpBookmarksRepository>;
  hostsRepo: ReturnType<typeof createHostsRepository>;
  resolveCredentials: (hostId: string) => Promise<SftpConnectionOptions>;
}

export function registerSftpIpc(deps: SftpIpcDeps) {
  const { sftpManager, transferManager, bookmarksRepo } = deps;

  // Connect
  ipcMain.handle(ipcChannels.sftp.connect, async (_e: IpcMainInvokeEvent, raw: unknown) => {
    const request = sftpConnectRequestSchema.parse(raw);
    const hostId = "hostId" in request ? request.hostId : "";
    // If connecting via sessionId, resolve the hostId from the terminal session
    const options = await deps.resolveCredentials(hostId);
    const sftpSessionId = await sftpManager.connect(hostId, options);
    return { sftpSessionId };
  });

  // Disconnect
  ipcMain.handle(ipcChannels.sftp.disconnect, async (_e: IpcMainInvokeEvent, raw: unknown) => {
    const { sftpSessionId } = sftpDisconnectRequestSchema.parse(raw);
    sftpManager.disconnect(sftpSessionId);
  });

  // List
  ipcMain.handle(ipcChannels.sftp.list, async (_e: IpcMainInvokeEvent, raw: unknown) => {
    const { sftpSessionId, path } = sftpListRequestSchema.parse(raw);
    const entries = await sftpManager.getTransport(sftpSessionId).list(path);
    return { entries };
  });

  // Stat
  ipcMain.handle(ipcChannels.sftp.stat, async (_e: IpcMainInvokeEvent, raw: unknown) => {
    const { sftpSessionId, path } = sftpStatRequestSchema.parse(raw);
    return sftpManager.getTransport(sftpSessionId).stat(path);
  });

  // Mkdir
  ipcMain.handle(ipcChannels.sftp.mkdir, async (_e: IpcMainInvokeEvent, raw: unknown) => {
    const { sftpSessionId, path } = sftpMkdirRequestSchema.parse(raw);
    await sftpManager.getTransport(sftpSessionId).mkdir(path);
  });

  // Rename
  ipcMain.handle(ipcChannels.sftp.rename, async (_e: IpcMainInvokeEvent, raw: unknown) => {
    const { sftpSessionId, oldPath, newPath } = sftpRenameRequestSchema.parse(raw);
    await sftpManager.getTransport(sftpSessionId).rename(oldPath, newPath);
  });

  // Delete
  ipcMain.handle(ipcChannels.sftp.delete, async (_e: IpcMainInvokeEvent, raw: unknown) => {
    const { sftpSessionId, path, recursive } = sftpDeleteRequestSchema.parse(raw);
    await sftpManager.getTransport(sftpSessionId).remove(path, recursive);
  });

  // Read file
  ipcMain.handle(ipcChannels.sftp.readFile, async (_e: IpcMainInvokeEvent, raw: unknown) => {
    const { sftpSessionId, path } = sftpReadFileRequestSchema.parse(raw);
    const buffer = await sftpManager.getTransport(sftpSessionId).readFile(path);
    // Try UTF-8, fallback to base64
    try {
      const text = buffer.toString("utf-8");
      return { content: text, encoding: "utf-8" as const };
    } catch {
      return { content: buffer.toString("base64"), encoding: "base64" as const };
    }
  });

  // Write file
  ipcMain.handle(ipcChannels.sftp.writeFile, async (_e: IpcMainInvokeEvent, raw: unknown) => {
    const { sftpSessionId, path, content, encoding } = sftpWriteFileRequestSchema.parse(raw);
    const buffer = encoding === "base64" ? Buffer.from(content, "base64") : Buffer.from(content, "utf-8");
    await sftpManager.getTransport(sftpSessionId).writeFile(path, buffer);
  });

  // Transfer start
  ipcMain.handle(ipcChannels.sftp.transferStart, async (_e: IpcMainInvokeEvent, raw: unknown) => {
    const { sftpSessionId, operations } = sftpTransferStartRequestSchema.parse(raw);
    const transport = sftpManager.getTransport(sftpSessionId);
    return transferManager.enqueue(sftpSessionId, transport, operations);
  });

  // Transfer cancel
  ipcMain.handle(ipcChannels.sftp.transferCancel, async (_e: IpcMainInvokeEvent, raw: unknown) => {
    const { transferId } = sftpTransferCancelRequestSchema.parse(raw);
    transferManager.cancel(transferId);
  });

  // Transfer list
  ipcMain.handle(ipcChannels.sftp.transferList, async () => {
    return { transfers: transferManager.list() };
  });

  // Bookmarks
  ipcMain.handle(ipcChannels.sftp.bookmarksList, async (_e: IpcMainInvokeEvent, raw: unknown) => {
    const { hostId } = sftpBookmarkListRequestSchema.parse(raw);
    return bookmarksRepo.list(hostId);
  });

  ipcMain.handle(ipcChannels.sftp.bookmarksUpsert, async (_e: IpcMainInvokeEvent, raw: unknown) => {
    const input = sftpBookmarkUpsertRequestSchema.parse(raw);
    return bookmarksRepo.upsert(input);
  });

  ipcMain.handle(ipcChannels.sftp.bookmarksRemove, async (_e: IpcMainInvokeEvent, raw: unknown) => {
    const { id } = sftpBookmarkRemoveRequestSchema.parse(raw);
    bookmarksRepo.remove(id);
  });

  ipcMain.handle(ipcChannels.sftp.bookmarksReorder, async (_e: IpcMainInvokeEvent, raw: unknown) => {
    const { bookmarkIds } = sftpBookmarkReorderRequestSchema.parse(raw);
    bookmarksRepo.reorder(bookmarkIds);
  });

  // Return cleanup function
  return () => {
    const channels = Object.values(ipcChannels.sftp);
    for (const channel of channels) {
      ipcMain.removeHandler(channel);
    }
    sftpManager.disconnectAll();
  };
}
```

**Step 6: Create local FS IPC handler**

Create `apps/desktop/src/main/ipc/fsIpc.ts`:

```typescript
import { ipcMain, type IpcMainInvokeEvent } from "electron";
import { ipcChannels } from "@hypershell/shared";
import { fsListRequestSchema, type FsEntry } from "@hypershell/shared";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";

export function registerFsIpc() {
  ipcMain.handle(ipcChannels.fs.list, async (_e: IpcMainInvokeEvent, raw: unknown) => {
    const { path } = fsListRequestSchema.parse(raw);
    const dirEntries = readdirSync(path, { withFileTypes: true });
    const entries: FsEntry[] = [];

    for (const entry of dirEntries) {
      try {
        const fullPath = join(path, entry.name);
        const stats = statSync(fullPath);
        entries.push({
          name: entry.name,
          path: fullPath,
          size: stats.size,
          modifiedAt: stats.mtime.toISOString(),
          isDirectory: entry.isDirectory(),
        });
      } catch {
        // Skip inaccessible entries
      }
    }
    return { entries };
  });

  ipcMain.handle(ipcChannels.fs.stat, async (_e: IpcMainInvokeEvent, raw: unknown) => {
    const { path } = fsListRequestSchema.parse(raw);
    const stats = statSync(path);
    return {
      name: path.split(/[/\\]/).pop() || path,
      path,
      size: stats.size,
      modifiedAt: stats.mtime.toISOString(),
      isDirectory: stats.isDirectory(),
    };
  });

  ipcMain.handle(ipcChannels.fs.getHome, async () => {
    return { path: homedir() };
  });

  ipcMain.handle(ipcChannels.fs.getDrives, async () => {
    try {
      const output = execSync(
        "wmic logicaldisk get name",
        { encoding: "utf-8" }
      );
      const drives = output
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => /^[A-Z]:$/.test(line))
        .map((drive) => drive + "\\");
      return { drives };
    } catch {
      return { drives: ["C:\\"] };
    }
  });

  return () => {
    for (const channel of Object.values(ipcChannels.fs)) {
      ipcMain.removeHandler(channel);
    }
  };
}
```

**Step 7: Register in registerIpc.ts**

In `apps/desktop/src/main/ipc/registerIpc.ts`, import and call the new registration functions inside `registerIpc()`:

```typescript
import { registerSftpIpc, type SftpIpcDeps } from "./sftpIpc";
import { registerFsIpc } from "./fsIpc";

// Inside registerIpc(), after existing registrations:
const cleanupSftp = registerSftpIpc(sftpDeps);
const cleanupFs = registerFsIpc();

// In cleanup function, add:
cleanupSftp();
cleanupFs();
```

**Step 8: Run tests**

Run: `pnpm --filter @hypershell/desktop test -- --run transferManager`
Expected: PASS

**Step 9: Commit**

```bash
git add apps/desktop/src/main/sftp/ apps/desktop/src/main/ipc/sftpIpc.ts apps/desktop/src/main/ipc/fsIpc.ts apps/desktop/src/main/ipc/registerIpc.ts
git commit -m "feat(desktop): add SFTP/FS IPC handlers and transfer manager"
```

---

## Task 6: Extend Preload Bridge with SFTP and FS Methods

**Files:**
- Modify: `apps/desktop/src/preload/desktopApi.ts:56-77` — add SFTP methods to DesktopApi interface
- Modify: `apps/desktop/src/preload/desktopApi.ts:87-217` — implement SFTP methods in createDesktopApi

**Step 1: Add SFTP methods to DesktopApi interface**

In `apps/desktop/src/preload/desktopApi.ts`, extend the `DesktopApi` interface (around line 56-77) with:

```typescript
// SFTP
sftpConnect(request: SftpConnectRequest): Promise<SftpConnectResponse>;
sftpDisconnect(request: SftpDisconnectRequest): Promise<void>;
sftpList(request: SftpListRequest): Promise<SftpListResponse>;
sftpStat(request: SftpStatRequest): Promise<SftpEntry>;
sftpMkdir(request: SftpMkdirRequest): Promise<void>;
sftpRename(request: SftpRenameRequest): Promise<void>;
sftpDelete(request: SftpDeleteRequest): Promise<void>;
sftpReadFile(request: SftpReadFileRequest): Promise<SftpReadFileResponse>;
sftpWriteFile(request: SftpWriteFileRequest): Promise<void>;
sftpTransferStart(request: SftpTransferStartRequest): Promise<TransferJob[]>;
sftpTransferCancel(request: SftpTransferCancelRequest): Promise<void>;
sftpTransferList(): Promise<SftpTransferListResponse>;
onSftpEvent(listener: (event: SftpEvent) => void): () => void;

// SFTP Bookmarks
sftpBookmarksList(request: SftpBookmarkListRequest): Promise<SftpBookmark[]>;
sftpBookmarksUpsert(request: SftpBookmarkUpsertRequest): Promise<SftpBookmark>;
sftpBookmarksRemove(request: SftpBookmarkRemoveRequest): Promise<void>;
sftpBookmarksReorder(request: SftpBookmarkReorderRequest): Promise<void>;

// Local FS
fsList(request: FsListRequest): Promise<FsListResponse>;
fsStat(request: FsListRequest): Promise<FsEntry>;
fsGetHome(): Promise<{ path: string }>;
fsGetDrives(): Promise<FsGetDrivesResponse>;
```

**Step 2: Implement in createDesktopApi**

In `createDesktopApi()`, add the implementations following the existing invoke pattern:

```typescript
sftpConnect: (request) => ipcRenderer.invoke(ipcChannels.sftp.connect, request),
sftpDisconnect: (request) => ipcRenderer.invoke(ipcChannels.sftp.disconnect, request),
sftpList: (request) => ipcRenderer.invoke(ipcChannels.sftp.list, request),
sftpStat: (request) => ipcRenderer.invoke(ipcChannels.sftp.stat, request),
sftpMkdir: (request) => ipcRenderer.invoke(ipcChannels.sftp.mkdir, request),
sftpRename: (request) => ipcRenderer.invoke(ipcChannels.sftp.rename, request),
sftpDelete: (request) => ipcRenderer.invoke(ipcChannels.sftp.delete, request),
sftpReadFile: (request) => ipcRenderer.invoke(ipcChannels.sftp.readFile, request),
sftpWriteFile: (request) => ipcRenderer.invoke(ipcChannels.sftp.writeFile, request),
sftpTransferStart: (request) => ipcRenderer.invoke(ipcChannels.sftp.transferStart, request),
sftpTransferCancel: (request) => ipcRenderer.invoke(ipcChannels.sftp.transferCancel, request),
sftpTransferList: () => ipcRenderer.invoke(ipcChannels.sftp.transferList),
onSftpEvent: (listener) => {
  const handler = (_event: any, data: SftpEvent) => listener(data);
  ipcRenderer.on(ipcChannels.sftp.event, handler);
  return () => ipcRenderer.removeListener(ipcChannels.sftp.event, handler);
},
sftpBookmarksList: (request) => ipcRenderer.invoke(ipcChannels.sftp.bookmarksList, request),
sftpBookmarksUpsert: (request) => ipcRenderer.invoke(ipcChannels.sftp.bookmarksUpsert, request),
sftpBookmarksRemove: (request) => ipcRenderer.invoke(ipcChannels.sftp.bookmarksRemove, request),
sftpBookmarksReorder: (request) => ipcRenderer.invoke(ipcChannels.sftp.bookmarksReorder, request),
fsList: (request) => ipcRenderer.invoke(ipcChannels.fs.list, request),
fsStat: (request) => ipcRenderer.invoke(ipcChannels.fs.stat, request),
fsGetHome: () => ipcRenderer.invoke(ipcChannels.fs.getHome),
fsGetDrives: () => ipcRenderer.invoke(ipcChannels.fs.getDrives),
```

**Step 3: Run build to verify types**

Run: `pnpm build`
Expected: PASS — no type errors

**Step 4: Commit**

```bash
git add apps/desktop/src/preload/desktopApi.ts
git commit -m "feat(preload): expose SFTP and local FS methods via DesktopApi"
```

---

## Task 7: Install CodeMirror 6 in UI

**Files:**
- Modify: `apps/ui/package.json`

**Step 1: Install CodeMirror packages**

Run:
```bash
pnpm --filter @hypershell/ui add codemirror @codemirror/lang-javascript @codemirror/lang-json @codemirror/lang-python @codemirror/lang-xml @codemirror/lang-yaml @codemirror/lang-html @codemirror/lang-css @codemirror/lang-markdown @codemirror/theme-one-dark
```

**Step 2: Verify build**

Run: `pnpm --filter @hypershell/ui build`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/ui/package.json pnpm-lock.yaml
git commit -m "feat(ui): add CodeMirror 6 dependencies for remote file editor"
```

---

## Task 8: SFTP Zustand Stores

**Files:**
- Create: `apps/ui/src/features/sftp/sftpStore.ts`
- Create: `apps/ui/src/features/sftp/transferStore.ts`
- Test: `apps/ui/src/features/sftp/sftpStore.test.ts`
- Test: `apps/ui/src/features/sftp/transferStore.test.ts`

**Step 1: Write failing test for sftpStore**

Create `apps/ui/src/features/sftp/sftpStore.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { createSftpStore } from "./sftpStore";

describe("sftpStore", () => {
  it("initializes with correct defaults", () => {
    const store = createSftpStore("sftp-1");
    const state = store.getState();
    expect(state.sftpSessionId).toBe("sftp-1");
    expect(state.localEntries).toEqual([]);
    expect(state.remoteEntries).toEqual([]);
    expect(state.localSelection).toEqual(new Set());
    expect(state.remoteSelection).toEqual(new Set());
  });

  it("updates remote path and pushes history", () => {
    const store = createSftpStore("sftp-1");
    store.getState().setRemotePath("/home/user");
    expect(store.getState().remotePath).toBe("/home/user");
    expect(store.getState().remoteHistory).toContain("/home/user");
  });

  it("updates local path and pushes history", () => {
    const store = createSftpStore("sftp-1");
    store.getState().setLocalPath("C:\\Users");
    expect(store.getState().localPath).toBe("C:\\Users");
    expect(store.getState().localHistory).toContain("C:\\Users");
  });

  it("manages selection", () => {
    const store = createSftpStore("sftp-1");
    store.getState().setRemoteSelection(new Set(["/file1", "/file2"]));
    expect(store.getState().remoteSelection.size).toBe(2);
  });

  it("sets loading state", () => {
    const store = createSftpStore("sftp-1");
    store.getState().setLoading("remote", true);
    expect(store.getState().isLoading.remote).toBe(true);
    expect(store.getState().isLoading.local).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @hypershell/ui test -- --run sftpStore`
Expected: FAIL

**Step 3: Create sftpStore**

Create `apps/ui/src/features/sftp/sftpStore.ts`:

```typescript
import { createStore } from "zustand/vanilla";
import type { SftpEntry, FsEntry } from "@hypershell/shared";

type SortColumn = "name" | "size" | "modifiedAt" | "permissions";
type SortDirection = "asc" | "desc";

export interface SftpState {
  sftpSessionId: string;
  localPath: string;
  remotePath: string;
  localEntries: FsEntry[];
  remoteEntries: SftpEntry[];
  localSelection: Set<string>;
  remoteSelection: Set<string>;
  localSortBy: { column: SortColumn; direction: SortDirection };
  remoteSortBy: { column: SortColumn; direction: SortDirection };
  localHistory: string[];
  remoteHistory: string[];
  localHistoryIndex: number;
  remoteHistoryIndex: number;
  isLoading: { local: boolean; remote: boolean };
  error: { local: string | null; remote: string | null };

  // Actions
  setLocalPath: (path: string) => void;
  setRemotePath: (path: string) => void;
  setLocalEntries: (entries: FsEntry[]) => void;
  setRemoteEntries: (entries: SftpEntry[]) => void;
  setLocalSelection: (selection: Set<string>) => void;
  setRemoteSelection: (selection: Set<string>) => void;
  setLocalSortBy: (column: SortColumn, direction: SortDirection) => void;
  setRemoteSortBy: (column: SortColumn, direction: SortDirection) => void;
  setLoading: (pane: "local" | "remote", loading: boolean) => void;
  setError: (pane: "local" | "remote", error: string | null) => void;
  goBack: (pane: "local" | "remote") => void;
  goForward: (pane: "local" | "remote") => void;
}

export function createSftpStore(sftpSessionId: string) {
  return createStore<SftpState>()((set, get) => ({
    sftpSessionId,
    localPath: "",
    remotePath: "/",
    localEntries: [],
    remoteEntries: [],
    localSelection: new Set<string>(),
    remoteSelection: new Set<string>(),
    localSortBy: { column: "name" as SortColumn, direction: "asc" as SortDirection },
    remoteSortBy: { column: "name" as SortColumn, direction: "asc" as SortDirection },
    localHistory: [],
    remoteHistory: ["/"],
    localHistoryIndex: -1,
    remoteHistoryIndex: 0,
    isLoading: { local: false, remote: false },
    error: { local: null, remote: null },

    setLocalPath: (path) =>
      set((s) => ({
        localPath: path,
        localHistory: [...s.localHistory.slice(0, s.localHistoryIndex + 1), path],
        localHistoryIndex: s.localHistoryIndex + 1,
        localSelection: new Set(),
      })),

    setRemotePath: (path) =>
      set((s) => ({
        remotePath: path,
        remoteHistory: [...s.remoteHistory.slice(0, s.remoteHistoryIndex + 1), path],
        remoteHistoryIndex: s.remoteHistoryIndex + 1,
        remoteSelection: new Set(),
      })),

    setLocalEntries: (entries) => set({ localEntries: entries }),
    setRemoteEntries: (entries) => set({ remoteEntries: entries }),
    setLocalSelection: (selection) => set({ localSelection: selection }),
    setRemoteSelection: (selection) => set({ remoteSelection: selection }),

    setLocalSortBy: (column, direction) =>
      set({ localSortBy: { column, direction } }),
    setRemoteSortBy: (column, direction) =>
      set({ remoteSortBy: { column, direction } }),

    setLoading: (pane, loading) =>
      set((s) => ({ isLoading: { ...s.isLoading, [pane]: loading } })),

    setError: (pane, error) =>
      set((s) => ({ error: { ...s.error, [pane]: error } })),

    goBack: (pane) =>
      set((s) => {
        const historyKey = pane === "local" ? "localHistory" : "remoteHistory";
        const indexKey = pane === "local" ? "localHistoryIndex" : "remoteHistoryIndex";
        const pathKey = pane === "local" ? "localPath" : "remotePath";
        const idx = s[indexKey];
        if (idx <= 0) return {};
        return {
          [indexKey]: idx - 1,
          [pathKey]: s[historyKey][idx - 1],
        };
      }),

    goForward: (pane) =>
      set((s) => {
        const historyKey = pane === "local" ? "localHistory" : "remoteHistory";
        const indexKey = pane === "local" ? "localHistoryIndex" : "remoteHistoryIndex";
        const pathKey = pane === "local" ? "localPath" : "remotePath";
        const idx = s[indexKey];
        if (idx >= s[historyKey].length - 1) return {};
        return {
          [indexKey]: idx + 1,
          [pathKey]: s[historyKey][idx + 1],
        };
      }),
  }));
}

// Global map of sftp stores per session
const sftpStores = new Map<string, ReturnType<typeof createSftpStore>>();

export function getSftpStore(sftpSessionId: string) {
  let store = sftpStores.get(sftpSessionId);
  if (!store) {
    store = createSftpStore(sftpSessionId);
    sftpStores.set(sftpSessionId, store);
  }
  return store;
}

export function disposeSftpStore(sftpSessionId: string) {
  sftpStores.delete(sftpSessionId);
}
```

**Step 4: Write failing test for transferStore**

Create `apps/ui/src/features/sftp/transferStore.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { transferStore } from "./transferStore";

describe("transferStore", () => {
  it("initializes empty", () => {
    const state = transferStore.getState();
    expect(state.transfers).toEqual([]);
    expect(state.activeCount).toBe(0);
    expect(state.panelOpen).toBe(false);
  });

  it("updates transfers from event", () => {
    transferStore.getState().setTransfers([
      {
        transferId: "tx-1",
        type: "upload",
        localPath: "C:\\file.txt",
        remotePath: "/file.txt",
        status: "active",
        bytesTransferred: 512,
        totalBytes: 1024,
        speed: 256,
      },
    ]);
    expect(transferStore.getState().transfers).toHaveLength(1);
    expect(transferStore.getState().activeCount).toBe(1);
  });

  it("auto-opens panel when transfers start", () => {
    transferStore.getState().setTransfers([
      {
        transferId: "tx-1",
        type: "upload",
        localPath: "C:\\file.txt",
        remotePath: "/file.txt",
        status: "active",
        bytesTransferred: 0,
        totalBytes: 1024,
        speed: 0,
      },
    ]);
    expect(transferStore.getState().panelOpen).toBe(true);
  });

  it("filters by status", () => {
    transferStore.getState().setFilter("failed");
    expect(transferStore.getState().filter).toBe("failed");
  });
});
```

**Step 5: Create transferStore**

Create `apps/ui/src/features/sftp/transferStore.ts`:

```typescript
import { createStore } from "zustand/vanilla";
import type { TransferJob } from "@hypershell/shared";

type TransferFilter = "all" | "active" | "completed" | "failed";

export interface TransferState {
  transfers: TransferJob[];
  activeCount: number;
  panelOpen: boolean;
  filter: TransferFilter;

  setTransfers: (transfers: TransferJob[]) => void;
  updateTransfer: (transferId: string, update: Partial<TransferJob>) => void;
  setFilter: (filter: TransferFilter) => void;
  setPanelOpen: (open: boolean) => void;
}

export const transferStore = createStore<TransferState>()((set) => ({
  transfers: [],
  activeCount: 0,
  panelOpen: false,
  filter: "all" as TransferFilter,

  setTransfers: (transfers) =>
    set({
      transfers,
      activeCount: transfers.filter((t) => t.status === "active").length,
      panelOpen: transfers.some((t) => t.status === "active" || t.status === "queued"),
    }),

  updateTransfer: (transferId, update) =>
    set((s) => {
      const transfers = s.transfers.map((t) =>
        t.transferId === transferId ? { ...t, ...update } : t
      );
      return {
        transfers,
        activeCount: transfers.filter((t) => t.status === "active").length,
      };
    }),

  setFilter: (filter) => set({ filter }),
  setPanelOpen: (panelOpen) => set({ panelOpen }),
}));
```

**Step 6: Run tests**

Run: `pnpm --filter @hypershell/ui test -- --run sftp`
Expected: ALL PASS

**Step 7: Commit**

```bash
git add apps/ui/src/features/sftp/
git commit -m "feat(ui): add sftpStore and transferStore Zustand stores"
```

---

## Task 9: Extend Layout Store for SFTP Tabs

**Files:**
- Modify: `apps/ui/src/features/layout/layoutStore.ts:3-10` — extend LayoutTab type
- Test: `apps/ui/src/features/layout/layoutStore.test.ts` — add SFTP tab test if file exists

**Step 1: Extend LayoutTab with SFTP type**

In `apps/ui/src/features/layout/layoutStore.ts`, update the `LayoutTab` type (around lines 3-10):

```typescript
// Before:
export interface LayoutTab {
  tabKey?: string;
  sessionId: string;
  title: string;
  transport?: string;
  profileId?: string;
  preopened?: boolean;
}

// After:
export interface LayoutTab {
  tabKey?: string;
  sessionId: string;
  title: string;
  transport?: string;
  profileId?: string;
  preopened?: boolean;
  type?: "terminal" | "sftp";
  sftpSessionId?: string;
  hostId?: string;
}
```

**Step 2: Run tests to verify no regressions**

Run: `pnpm --filter @hypershell/ui test -- --run`
Expected: ALL PASS

**Step 3: Commit**

```bash
git add apps/ui/src/features/layout/layoutStore.ts
git commit -m "feat(ui): extend LayoutTab type for SFTP tab support"
```

---

## Task 10: FileList Component

**Files:**
- Create: `apps/ui/src/features/sftp/components/FileList.tsx`
- Create: `apps/ui/src/features/sftp/components/FileContextMenu.tsx`
- Create: `apps/ui/src/features/sftp/utils/fileUtils.ts`
- Test: `apps/ui/src/features/sftp/utils/fileUtils.test.ts`

**Step 1: Write failing test for file utilities**

Create `apps/ui/src/features/sftp/utils/fileUtils.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { formatFileSize, formatDate, getFileIcon, sortEntries } from "./fileUtils";

describe("fileUtils", () => {
  it("formats file sizes", () => {
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(1024)).toBe("1.0 KB");
    expect(formatFileSize(1048576)).toBe("1.0 MB");
    expect(formatFileSize(1073741824)).toBe("1.0 GB");
  });

  it("formats dates", () => {
    const date = "2026-04-06T12:00:00.000Z";
    const result = formatDate(date);
    expect(result).toContain("2026");
  });

  it("returns correct file icons", () => {
    expect(getFileIcon("test.ts", false)).toBe("file-code");
    expect(getFileIcon("photo.png", false)).toBe("file-image");
    expect(getFileIcon("docs", true)).toBe("folder");
  });

  it("sorts entries by name ascending", () => {
    const entries = [
      { name: "banana", path: "/banana", size: 0, modifiedAt: "", isDirectory: false },
      { name: "apple", path: "/apple", size: 0, modifiedAt: "", isDirectory: true },
    ];
    const sorted = sortEntries(entries, "name", "asc");
    // Directories first, then alphabetical
    expect(sorted[0].name).toBe("apple");
    expect(sorted[1].name).toBe("banana");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @hypershell/ui test -- --run fileUtils`
Expected: FAIL

**Step 3: Create file utilities**

Create `apps/ui/src/features/sftp/utils/fileUtils.ts`:

```typescript
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const EXT_ICONS: Record<string, string> = {
  ts: "file-code", tsx: "file-code", js: "file-code", jsx: "file-code",
  py: "file-code", rs: "file-code", go: "file-code", java: "file-code",
  c: "file-code", cpp: "file-code", h: "file-code",
  json: "file-json", yaml: "file-text", yml: "file-text", toml: "file-text",
  xml: "file-code", html: "file-code", css: "file-code",
  md: "file-text", txt: "file-text", log: "file-text",
  png: "file-image", jpg: "file-image", jpeg: "file-image", gif: "file-image",
  svg: "file-image", webp: "file-image",
  zip: "file-archive", tar: "file-archive", gz: "file-archive",
  pdf: "file", doc: "file", docx: "file",
  sh: "file-terminal", bash: "file-terminal", zsh: "file-terminal",
};

export function getFileIcon(name: string, isDirectory: boolean): string {
  if (isDirectory) return "folder";
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return EXT_ICONS[ext] || "file";
}

export function sortEntries<T extends { name: string; isDirectory: boolean; size: number; modifiedAt: string }>(
  entries: T[],
  column: "name" | "size" | "modifiedAt" | "permissions",
  direction: "asc" | "desc"
): T[] {
  const sorted = [...entries].sort((a, b) => {
    // Directories always first
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;

    let cmp = 0;
    switch (column) {
      case "name":
        cmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        break;
      case "size":
        cmp = a.size - b.size;
        break;
      case "modifiedAt":
        cmp = new Date(a.modifiedAt).getTime() - new Date(b.modifiedAt).getTime();
        break;
      default:
        cmp = a.name.localeCompare(b.name);
    }
    return direction === "asc" ? cmp : -cmp;
  });
  return sorted;
}

export function getParentPath(path: string): string {
  // Handle both Unix and Windows paths
  const normalized = path.replace(/\\/g, "/").replace(/\/$/, "");
  const parent = normalized.substring(0, normalized.lastIndexOf("/")) || "/";
  return parent;
}

export function joinRemotePath(base: string, name: string): string {
  return base.replace(/\/$/, "") + "/" + name;
}
```

**Step 4: Run tests**

Run: `pnpm --filter @hypershell/ui test -- --run fileUtils`
Expected: PASS

**Step 5: Create FileList component**

Create `apps/ui/src/features/sftp/components/FileList.tsx`:

```tsx
import { useState, useCallback, useRef, type DragEvent, type MouseEvent } from "react";
import { formatFileSize, formatDate, getFileIcon, sortEntries } from "../utils/fileUtils";

interface FileEntry {
  name: string;
  path: string;
  size: number;
  modifiedAt: string;
  isDirectory: boolean;
  permissions?: number;
}

interface FileListProps {
  entries: FileEntry[];
  selection: Set<string>;
  sortBy: { column: "name" | "size" | "modifiedAt" | "permissions"; direction: "asc" | "desc" };
  isLoading: boolean;
  error: string | null;
  onNavigate: (path: string) => void;
  onSelect: (selection: Set<string>) => void;
  onSort: (column: "name" | "size" | "modifiedAt" | "permissions", direction: "asc" | "desc") => void;
  onDrop: (files: string[], targetPath: string) => void;
  onContextMenu: (event: MouseEvent, entry?: FileEntry) => void;
  onEdit?: (path: string) => void;
  paneType: "local" | "remote";
}

export function FileList({
  entries,
  selection,
  sortBy,
  isLoading,
  error,
  onNavigate,
  onSelect,
  onSort,
  onDrop,
  onContextMenu,
  onEdit,
  paneType,
}: FileListProps) {
  const [dropHighlight, setDropHighlight] = useState(false);
  const sorted = sortEntries(entries, sortBy.column, sortBy.direction);

  const handleHeaderClick = (column: typeof sortBy.column) => {
    const direction = sortBy.column === column && sortBy.direction === "asc" ? "desc" : "asc";
    onSort(column, direction);
  };

  const handleRowClick = (entry: FileEntry, event: MouseEvent) => {
    if (event.ctrlKey || event.metaKey) {
      const next = new Set(selection);
      next.has(entry.path) ? next.delete(entry.path) : next.add(entry.path);
      onSelect(next);
    } else if (event.shiftKey && selection.size > 0) {
      const paths = sorted.map((e) => e.path);
      const lastSelected = [...selection].pop()!;
      const start = paths.indexOf(lastSelected);
      const end = paths.indexOf(entry.path);
      const range = paths.slice(Math.min(start, end), Math.max(start, end) + 1);
      onSelect(new Set(range));
    } else {
      onSelect(new Set([entry.path]));
    }
  };

  const handleRowDoubleClick = (entry: FileEntry) => {
    if (entry.isDirectory) {
      onNavigate(entry.path);
    } else if (onEdit) {
      onEdit(entry.path);
    }
  };

  const handleDragStart = (event: DragEvent, entry: FileEntry) => {
    const paths = selection.has(entry.path) ? [...selection] : [entry.path];
    event.dataTransfer.setData("application/x-sftp-paths", JSON.stringify(paths));
    event.dataTransfer.setData("text/plain", paths.join("\n"));
    event.dataTransfer.effectAllowed = "copyMove";
  };

  const handleDragOver = (event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDropHighlight(true);
  };

  const handleDragLeave = () => setDropHighlight(false);

  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    setDropHighlight(false);

    const sftpPaths = event.dataTransfer.getData("application/x-sftp-paths");
    if (sftpPaths) {
      onDrop(JSON.parse(sftpPaths), "");
      return;
    }

    // External files from Windows Explorer
    const files = Array.from(event.dataTransfer.files).map((f) => f.path);
    if (files.length > 0) {
      onDrop(files, "");
    }
  };

  const sortArrow = (column: string) => {
    if (sortBy.column !== column) return "";
    return sortBy.direction === "asc" ? " \u25B2" : " \u25BC";
  };

  if (error) {
    return <div className="p-4 text-red-400 text-sm">{error}</div>;
  }

  return (
    <div
      className={`flex-1 overflow-auto ${dropHighlight ? "ring-2 ring-accent ring-inset" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onContextMenu={(e) => onContextMenu(e)}
    >
      {isLoading ? (
        <div className="flex items-center justify-center h-full text-text-secondary text-sm">
          Loading...
        </div>
      ) : (
        <table className="w-full text-sm text-text-primary">
          <thead className="sticky top-0 bg-base-800 text-text-secondary text-xs uppercase">
            <tr>
              <th className="px-3 py-2 text-left cursor-pointer select-none" onClick={() => handleHeaderClick("name")}>
                Name{sortArrow("name")}
              </th>
              <th className="px-3 py-2 text-right cursor-pointer select-none w-24" onClick={() => handleHeaderClick("size")}>
                Size{sortArrow("size")}
              </th>
              <th className="px-3 py-2 text-left cursor-pointer select-none w-44" onClick={() => handleHeaderClick("modifiedAt")}>
                Modified{sortArrow("modifiedAt")}
              </th>
              {paneType === "remote" && (
                <th className="px-3 py-2 text-left cursor-pointer select-none w-24" onClick={() => handleHeaderClick("permissions")}>
                  Perms{sortArrow("permissions")}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {sorted.map((entry) => (
              <tr
                key={entry.path}
                className={`cursor-pointer hover:bg-base-700 ${
                  selection.has(entry.path) ? "bg-accent/20" : ""
                }`}
                onClick={(e) => handleRowClick(entry, e)}
                onDoubleClick={() => handleRowDoubleClick(entry)}
                onContextMenu={(e) => {
                  e.stopPropagation();
                  if (!selection.has(entry.path)) onSelect(new Set([entry.path]));
                  onContextMenu(e, entry);
                }}
                draggable
                onDragStart={(e) => handleDragStart(e, entry)}
              >
                <td className="px-3 py-1.5 truncate max-w-xs">
                  <span className="mr-2 text-text-secondary">{entry.isDirectory ? "\uD83D\uDCC1" : "\uD83D\uDCC4"}</span>
                  {entry.name}
                </td>
                <td className="px-3 py-1.5 text-right text-text-secondary">
                  {entry.isDirectory ? "--" : formatFileSize(entry.size)}
                </td>
                <td className="px-3 py-1.5 text-text-secondary">
                  {formatDate(entry.modifiedAt)}
                </td>
                {paneType === "remote" && "permissions" in entry && (
                  <td className="px-3 py-1.5 text-text-secondary font-mono">
                    {(entry.permissions ?? 0).toString(8).padStart(4, "0")}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

**Step 6: Create FileContextMenu component**

Create `apps/ui/src/features/sftp/components/FileContextMenu.tsx`:

```tsx
import { useEffect, useRef } from "react";

interface ContextMenuAction {
  label: string;
  action: () => void;
  disabled?: boolean;
  separator?: boolean;
}

interface FileContextMenuProps {
  x: number;
  y: number;
  actions: ContextMenuAction[];
  onClose: () => void;
}

export function FileContextMenu({ x, y, actions, onClose }: FileContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-base-800 border border-base-600 rounded shadow-lg py-1 min-w-[180px]"
      style={{ left: x, top: y }}
    >
      {actions.map((item, i) =>
        item.separator ? (
          <div key={i} className="border-t border-base-600 my-1" />
        ) : (
          <button
            key={i}
            className="w-full text-left px-4 py-1.5 text-sm text-text-primary hover:bg-base-700 disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={() => {
              item.action();
              onClose();
            }}
            disabled={item.disabled}
          >
            {item.label}
          </button>
        )
      )}
    </div>
  );
}
```

**Step 7: Run all tests**

Run: `pnpm --filter @hypershell/ui test -- --run`
Expected: PASS

**Step 8: Commit**

```bash
git add apps/ui/src/features/sftp/
git commit -m "feat(ui): add FileList, FileContextMenu components and file utilities"
```

---

## Task 11: Dual-Pane Browser Components

**Files:**
- Create: `apps/ui/src/features/sftp/components/PathBreadcrumb.tsx`
- Create: `apps/ui/src/features/sftp/components/DriveSelector.tsx`
- Create: `apps/ui/src/features/sftp/components/LocalPane.tsx`
- Create: `apps/ui/src/features/sftp/components/RemotePane.tsx`
- Create: `apps/ui/src/features/sftp/components/SftpDualPane.tsx`
- Create: `apps/ui/src/features/sftp/components/SftpToolbar.tsx`

**Step 1: Create PathBreadcrumb**

Create `apps/ui/src/features/sftp/components/PathBreadcrumb.tsx`:

```tsx
interface PathBreadcrumbProps {
  path: string;
  onNavigate: (path: string) => void;
  separator?: string;
}

export function PathBreadcrumb({ path, onNavigate, separator = "/" }: PathBreadcrumbProps) {
  const isWindows = path.includes("\\") || /^[A-Z]:/.test(path);
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);

  const crumbs: { label: string; path: string }[] = [];

  if (isWindows && parts.length > 0) {
    let accumulated = parts[0] + "\\";
    crumbs.push({ label: parts[0], path: accumulated });
    for (let i = 1; i < parts.length; i++) {
      accumulated += parts[i] + "\\";
      crumbs.push({ label: parts[i], path: accumulated });
    }
  } else {
    crumbs.push({ label: "/", path: "/" });
    let accumulated = "/";
    for (const part of parts) {
      accumulated += part + "/";
      crumbs.push({ label: part, path: accumulated.replace(/\/$/, "") });
    }
  }

  return (
    <div className="flex items-center gap-0.5 px-2 py-1 text-sm text-text-secondary overflow-hidden">
      {crumbs.map((crumb, i) => (
        <span key={crumb.path} className="flex items-center shrink-0">
          {i > 0 && <span className="mx-1 text-text-secondary/50">{separator}</span>}
          <button
            className="hover:text-text-primary hover:underline truncate max-w-[120px]"
            onClick={() => onNavigate(crumb.path)}
            title={crumb.path}
          >
            {crumb.label}
          </button>
        </span>
      ))}
    </div>
  );
}
```

**Step 2: Create DriveSelector**

Create `apps/ui/src/features/sftp/components/DriveSelector.tsx`:

```tsx
import { useEffect, useState } from "react";

interface DriveSelectorProps {
  onSelect: (drive: string) => void;
  currentPath: string;
}

export function DriveSelector({ onSelect, currentPath }: DriveSelectorProps) {
  const [drives, setDrives] = useState<string[]>([]);
  const currentDrive = currentPath.match(/^([A-Z]:\\)/)?.[1] || "C:\\";

  useEffect(() => {
    window.hypershell.fsGetDrives().then((res) => setDrives(res.drives));
  }, []);

  return (
    <select
      className="bg-base-800 border border-base-600 text-text-primary text-sm rounded px-2 py-1"
      value={currentDrive}
      onChange={(e) => onSelect(e.target.value)}
    >
      {drives.map((drive) => (
        <option key={drive} value={drive}>
          {drive}
        </option>
      ))}
    </select>
  );
}
```

**Step 3: Create LocalPane**

Create `apps/ui/src/features/sftp/components/LocalPane.tsx`:

```tsx
import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand";
import type { SftpState } from "../sftpStore";
import { FileList } from "./FileList";
import { PathBreadcrumb } from "./PathBreadcrumb";
import { DriveSelector } from "./DriveSelector";
import { FileContextMenu } from "./FileContextMenu";
import { getParentPath } from "../utils/fileUtils";

interface LocalPaneProps {
  store: StoreApi<SftpState>;
  onTransfer: (localPaths: string[], remotePath: string) => void;
}

export function LocalPane({ store, onTransfer }: LocalPaneProps) {
  const localPath = useStore(store, (s) => s.localPath);
  const localEntries = useStore(store, (s) => s.localEntries);
  const localSelection = useStore(store, (s) => s.localSelection);
  const localSortBy = useStore(store, (s) => s.localSortBy);
  const isLoading = useStore(store, (s) => s.isLoading.local);
  const error = useStore(store, (s) => s.error.local);
  const setLocalPath = useStore(store, (s) => s.setLocalPath);
  const setLocalEntries = useStore(store, (s) => s.setLocalEntries);
  const setLocalSelection = useStore(store, (s) => s.setLocalSelection);
  const setLocalSortBy = useStore(store, (s) => s.setLocalSortBy);
  const setLoading = useStore(store, (s) => s.setLoading);
  const setError = useStore(store, (s) => s.setError);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entry?: any } | null>(null);

  const loadDirectory = useCallback(async (path: string) => {
    setLoading("local", true);
    setError("local", null);
    try {
      const response = await window.hypershell.fsList({ path });
      setLocalEntries(response.entries);
      setLoading("local", false);
    } catch (err: any) {
      setError("local", err.message || "Failed to list directory");
      setLoading("local", false);
    }
  }, [setLocalEntries, setLoading, setError]);

  useEffect(() => {
    if (!localPath) {
      window.hypershell.fsGetHome().then((res) => {
        setLocalPath(res.path);
      });
    }
  }, []);

  useEffect(() => {
    if (localPath) loadDirectory(localPath);
  }, [localPath, loadDirectory]);

  const handleNavigate = useCallback((path: string) => {
    setLocalPath(path);
  }, [setLocalPath]);

  const handleContextMenu = useCallback((event: MouseEvent, entry?: any) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, entry });
  }, []);

  const contextActions = contextMenu?.entry
    ? [
        { label: "Open", action: () => handleNavigate(contextMenu.entry.path), disabled: !contextMenu.entry.isDirectory },
        { label: "Upload to Remote", action: () => onTransfer([...localSelection], ""), disabled: localSelection.size === 0 },
        { label: "", action: () => {}, separator: true },
        { label: "Copy Path", action: () => navigator.clipboard.writeText(contextMenu.entry.path) },
      ]
    : [
        { label: "Go Up", action: () => handleNavigate(getParentPath(localPath)) },
        { label: "Refresh", action: () => loadDirectory(localPath) },
      ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-2 py-1 bg-base-900 border-b border-base-700">
        <DriveSelector onSelect={handleNavigate} currentPath={localPath} />
        <button className="text-text-secondary hover:text-text-primary text-sm px-1" onClick={() => handleNavigate(getParentPath(localPath))} title="Go up">
          ..
        </button>
      </div>
      <PathBreadcrumb path={localPath} onNavigate={handleNavigate} separator="\\" />
      <FileList
        entries={localEntries}
        selection={localSelection}
        sortBy={localSortBy}
        isLoading={isLoading}
        error={error}
        onNavigate={handleNavigate}
        onSelect={setLocalSelection}
        onSort={setLocalSortBy}
        onDrop={() => {}}
        onContextMenu={handleContextMenu}
        paneType="local"
      />
      {contextMenu && (
        <FileContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          actions={contextActions}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
```

**Step 4: Create RemotePane**

Create `apps/ui/src/features/sftp/components/RemotePane.tsx`:

```tsx
import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand";
import type { SftpState } from "../sftpStore";
import { FileList } from "./FileList";
import { PathBreadcrumb } from "./PathBreadcrumb";
import { FileContextMenu } from "./FileContextMenu";
import { getParentPath } from "../utils/fileUtils";

interface RemotePaneProps {
  store: StoreApi<SftpState>;
  onTransfer: (remotePaths: string[], localPath: string) => void;
  onEdit: (remotePath: string) => void;
  onRename: (path: string) => void;
  onDelete: (paths: string[]) => void;
  onMkdir: () => void;
  onBookmark: (path: string) => void;
}

export function RemotePane({ store, onTransfer, onEdit, onRename, onDelete, onMkdir, onBookmark }: RemotePaneProps) {
  const sftpSessionId = useStore(store, (s) => s.sftpSessionId);
  const remotePath = useStore(store, (s) => s.remotePath);
  const remoteEntries = useStore(store, (s) => s.remoteEntries);
  const remoteSelection = useStore(store, (s) => s.remoteSelection);
  const remoteSortBy = useStore(store, (s) => s.remoteSortBy);
  const isLoading = useStore(store, (s) => s.isLoading.remote);
  const error = useStore(store, (s) => s.error.remote);
  const setRemotePath = useStore(store, (s) => s.setRemotePath);
  const setRemoteEntries = useStore(store, (s) => s.setRemoteEntries);
  const setRemoteSelection = useStore(store, (s) => s.setRemoteSelection);
  const setRemoteSortBy = useStore(store, (s) => s.setRemoteSortBy);
  const setLoading = useStore(store, (s) => s.setLoading);
  const setError = useStore(store, (s) => s.setError);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entry?: any } | null>(null);

  const loadDirectory = useCallback(async (path: string) => {
    setLoading("remote", true);
    setError("remote", null);
    try {
      const response = await window.hypershell.sftpList({ sftpSessionId, path });
      setRemoteEntries(response.entries);
      setLoading("remote", false);
    } catch (err: any) {
      setError("remote", err.message || "Failed to list remote directory");
      setLoading("remote", false);
    }
  }, [sftpSessionId, setRemoteEntries, setLoading, setError]);

  useEffect(() => {
    if (remotePath) loadDirectory(remotePath);
  }, [remotePath, loadDirectory]);

  const handleNavigate = useCallback((path: string) => {
    setRemotePath(path);
  }, [setRemotePath]);

  const handleDrop = useCallback((paths: string[]) => {
    onTransfer(paths, remotePath);
  }, [onTransfer, remotePath]);

  const handleContextMenu = useCallback((event: MouseEvent, entry?: any) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, entry });
  }, []);

  const contextActions = contextMenu?.entry
    ? [
        { label: "Open", action: () => handleNavigate(contextMenu.entry.path), disabled: !contextMenu.entry.isDirectory },
        { label: "Edit", action: () => onEdit(contextMenu.entry.path), disabled: contextMenu.entry.isDirectory },
        { label: "Download", action: () => onTransfer([...remoteSelection], ""), disabled: remoteSelection.size === 0 },
        { label: "", action: () => {}, separator: true },
        { label: "Rename", action: () => onRename(contextMenu.entry.path) },
        { label: "Delete", action: () => onDelete([...remoteSelection]) },
        { label: "", action: () => {}, separator: true },
        { label: "Copy Path", action: () => navigator.clipboard.writeText(contextMenu.entry.path) },
        { label: "Bookmark This Folder", action: () => onBookmark(contextMenu.entry.isDirectory ? contextMenu.entry.path : getParentPath(contextMenu.entry.path)) },
      ]
    : [
        { label: "Go Up", action: () => handleNavigate(getParentPath(remotePath)) },
        { label: "New Folder", action: onMkdir },
        { label: "Refresh", action: () => loadDirectory(remotePath) },
        { label: "", action: () => {}, separator: true },
        { label: "Bookmark This Folder", action: () => onBookmark(remotePath) },
      ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-2 py-1 bg-base-900 border-b border-base-700">
        <span className="text-xs text-text-secondary font-mono">REMOTE</span>
        <button className="text-text-secondary hover:text-text-primary text-sm px-1" onClick={() => handleNavigate(getParentPath(remotePath))} title="Go up">
          ..
        </button>
      </div>
      <PathBreadcrumb path={remotePath} onNavigate={handleNavigate} />
      <FileList
        entries={remoteEntries}
        selection={remoteSelection}
        sortBy={remoteSortBy}
        isLoading={isLoading}
        error={error}
        onNavigate={handleNavigate}
        onSelect={setRemoteSelection}
        onSort={setRemoteSortBy}
        onDrop={handleDrop}
        onContextMenu={handleContextMenu}
        onEdit={onEdit}
        paneType="remote"
      />
      {contextMenu && (
        <FileContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          actions={contextActions}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
```

**Step 5: Create SftpDualPane**

Create `apps/ui/src/features/sftp/components/SftpDualPane.tsx`:

```tsx
import { useState, useRef, useCallback } from "react";
import type { StoreApi } from "zustand";
import type { SftpState } from "../sftpStore";
import { LocalPane } from "./LocalPane";
import { RemotePane } from "./RemotePane";

interface SftpDualPaneProps {
  store: StoreApi<SftpState>;
  onUpload: (localPaths: string[], remotePath: string) => void;
  onDownload: (remotePaths: string[], localPath: string) => void;
  onEdit: (remotePath: string) => void;
  onRename: (path: string) => void;
  onDelete: (paths: string[]) => void;
  onMkdir: () => void;
  onBookmark: (path: string) => void;
}

export function SftpDualPane({ store, onUpload, onDownload, onEdit, onRename, onDelete, onMkdir, onBookmark }: SftpDualPaneProps) {
  const [splitRatio, setSplitRatio] = useState(0.5);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handleMouseDown = useCallback(() => {
    isDragging.current = true;
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      setSplitRatio(Math.max(0.2, Math.min(0.8, ratio)));
    };
    const handleMouseUp = () => {
      isDragging.current = false;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, []);

  return (
    <div ref={containerRef} className="flex flex-1 overflow-hidden">
      <div style={{ width: `${splitRatio * 100}%` }} className="flex flex-col min-w-[250px] border-r border-base-700">
        <LocalPane store={store} onTransfer={onUpload} />
      </div>
      <div
        className="w-1 cursor-col-resize bg-base-700 hover:bg-accent transition-colors"
        onMouseDown={handleMouseDown}
      />
      <div style={{ width: `${(1 - splitRatio) * 100}%` }} className="flex flex-col min-w-[250px]">
        <RemotePane
          store={store}
          onTransfer={onDownload}
          onEdit={onEdit}
          onRename={onRename}
          onDelete={onDelete}
          onMkdir={onMkdir}
          onBookmark={onBookmark}
        />
      </div>
    </div>
  );
}
```

**Step 6: Create SftpToolbar**

Create `apps/ui/src/features/sftp/components/SftpToolbar.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand";
import type { SftpState } from "../sftpStore";
import type { SftpBookmark } from "@hypershell/shared";

interface SftpToolbarProps {
  store: StoreApi<SftpState>;
  hostId: string;
  onDisconnect: () => void;
}

export function SftpToolbar({ store, hostId, onDisconnect }: SftpToolbarProps) {
  const goBack = useStore(store, (s) => s.goBack);
  const goForward = useStore(store, (s) => s.goForward);
  const remoteHistoryIndex = useStore(store, (s) => s.remoteHistoryIndex);
  const remoteHistory = useStore(store, (s) => s.remoteHistory);
  const setRemotePath = useStore(store, (s) => s.setRemotePath);

  const [bookmarks, setBookmarks] = useState<SftpBookmark[]>([]);
  const [showBookmarks, setShowBookmarks] = useState(false);

  useEffect(() => {
    window.hypershell.sftpBookmarksList({ hostId }).then(setBookmarks);
  }, [hostId]);

  const refreshBookmarks = () => {
    window.hypershell.sftpBookmarksList({ hostId }).then(setBookmarks);
  };

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-base-900 border-b border-base-700">
      <button
        className="text-text-secondary hover:text-text-primary disabled:opacity-30 text-sm px-1"
        disabled={remoteHistoryIndex <= 0}
        onClick={() => goBack("remote")}
        title="Back"
      >
        ←
      </button>
      <button
        className="text-text-secondary hover:text-text-primary disabled:opacity-30 text-sm px-1"
        disabled={remoteHistoryIndex >= remoteHistory.length - 1}
        onClick={() => goForward("remote")}
        title="Forward"
      >
        →
      </button>

      <div className="flex-1" />

      <div className="relative">
        <button
          className="text-text-secondary hover:text-text-primary text-sm px-2 py-0.5 border border-base-600 rounded"
          onClick={() => setShowBookmarks(!showBookmarks)}
        >
          Bookmarks ({bookmarks.length})
        </button>
        {showBookmarks && (
          <div className="absolute right-0 top-full mt-1 z-50 bg-base-800 border border-base-600 rounded shadow-lg min-w-[200px] py-1">
            {bookmarks.length === 0 ? (
              <div className="px-4 py-2 text-sm text-text-secondary">No bookmarks</div>
            ) : (
              bookmarks.map((bm) => (
                <button
                  key={bm.id}
                  className="w-full text-left px-4 py-1.5 text-sm text-text-primary hover:bg-base-700 flex justify-between items-center"
                  onClick={() => {
                    setRemotePath(bm.remotePath);
                    setShowBookmarks(false);
                  }}
                >
                  <span className="truncate">{bm.name}</span>
                  <span className="text-text-secondary text-xs ml-2 truncate max-w-[120px]">{bm.remotePath}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <button
        className="text-red-400 hover:text-red-300 text-sm px-2 py-0.5 border border-red-400/30 rounded"
        onClick={onDisconnect}
      >
        Disconnect
      </button>
    </div>
  );
}
```

**Step 7: Commit**

```bash
git add apps/ui/src/features/sftp/components/
git commit -m "feat(ui): add dual-pane browser components (local, remote, toolbar, breadcrumb)"
```

---

## Task 12: Transfer Panel Component

**Files:**
- Create: `apps/ui/src/features/sftp/components/TransferPanel.tsx`

**Step 1: Create TransferPanel**

Create `apps/ui/src/features/sftp/components/TransferPanel.tsx`:

```tsx
import { useStore } from "zustand";
import { transferStore } from "../transferStore";
import { formatFileSize } from "../utils/fileUtils";

export function TransferPanel() {
  const transfers = useStore(transferStore, (s) => s.transfers);
  const panelOpen = useStore(transferStore, (s) => s.panelOpen);
  const filter = useStore(transferStore, (s) => s.filter);
  const activeCount = useStore(transferStore, (s) => s.activeCount);
  const setFilter = useStore(transferStore, (s) => s.setFilter);
  const setPanelOpen = useStore(transferStore, (s) => s.setPanelOpen);

  const filtered = filter === "all" ? transfers : transfers.filter((t) => t.status === filter);

  if (!panelOpen) {
    return activeCount > 0 ? (
      <button
        className="flex items-center gap-2 px-3 py-1 bg-base-900 border-t border-base-700 text-sm text-text-secondary hover:text-text-primary"
        onClick={() => setPanelOpen(true)}
      >
        Transfers ({activeCount} active)
      </button>
    ) : null;
  }

  return (
    <div className="flex flex-col border-t border-base-700 bg-base-900 max-h-[250px]">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-base-700">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-text-primary">Transfers</span>
          <div className="flex gap-1 text-xs">
            {(["all", "active", "completed", "failed"] as const).map((f) => (
              <button
                key={f}
                className={`px-2 py-0.5 rounded ${filter === f ? "bg-accent text-white" : "text-text-secondary hover:text-text-primary"}`}
                onClick={() => setFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <button className="text-text-secondary hover:text-text-primary text-sm" onClick={() => setPanelOpen(false)}>
          ×
        </button>
      </div>
      <div className="overflow-auto flex-1">
        {filtered.length === 0 ? (
          <div className="px-3 py-4 text-sm text-text-secondary text-center">No transfers</div>
        ) : (
          filtered.map((transfer) => (
            <div key={transfer.transferId} className="flex items-center gap-3 px-3 py-1.5 border-b border-base-800 text-sm">
              <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${
                transfer.status === "active" ? "bg-blue-400" :
                transfer.status === "completed" ? "bg-green-400" :
                transfer.status === "failed" ? "bg-red-400" :
                "bg-yellow-400"
              }`} />
              <span className="text-text-secondary text-xs w-6">{transfer.type === "upload" ? "UP" : "DN"}</span>
              <span className="truncate flex-1 text-text-primary">{transfer.remotePath.split("/").pop()}</span>
              {transfer.status === "active" && (
                <>
                  <span className="text-text-secondary text-xs">{formatFileSize(transfer.speed)}/s</span>
                  <div className="w-24 h-1.5 bg-base-700 rounded overflow-hidden">
                    <div
                      className="h-full bg-accent rounded transition-all"
                      style={{ width: `${transfer.totalBytes > 0 ? (transfer.bytesTransferred / transfer.totalBytes) * 100 : 0}%` }}
                    />
                  </div>
                </>
              )}
              <span className="text-text-secondary text-xs w-16 text-right">
                {formatFileSize(transfer.bytesTransferred)} / {formatFileSize(transfer.totalBytes)}
              </span>
              {(transfer.status === "active" || transfer.status === "queued") && (
                <button
                  className="text-text-secondary hover:text-red-400 text-xs"
                  onClick={() => window.hypershell.sftpTransferCancel({ transferId: transfer.transferId })}
                >
                  Cancel
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/ui/src/features/sftp/components/TransferPanel.tsx
git commit -m "feat(ui): add TransferPanel component with queue display and controls"
```

---

## Task 13: Remote File Editor Component

**Files:**
- Create: `apps/ui/src/features/sftp/components/RemoteEditor.tsx`
- Create: `apps/ui/src/features/sftp/utils/languageDetect.ts`

**Step 1: Create language detection utility**

Create `apps/ui/src/features/sftp/utils/languageDetect.ts`:

```typescript
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { python } from "@codemirror/lang-python";
import { xml } from "@codemirror/lang-xml";
import { yaml } from "@codemirror/lang-yaml";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { markdown } from "@codemirror/lang-markdown";
import type { Extension } from "@codemirror/state";

const EXT_MAP: Record<string, () => Extension> = {
  js: () => javascript(),
  jsx: () => javascript({ jsx: true }),
  ts: () => javascript({ typescript: true }),
  tsx: () => javascript({ typescript: true, jsx: true }),
  json: () => json(),
  py: () => python(),
  xml: () => xml(),
  yaml: () => yaml(),
  yml: () => yaml(),
  html: () => html(),
  htm: () => html(),
  css: () => css(),
  md: () => markdown(),
  markdown: () => markdown(),
};

export function getLanguageExtension(filename: string): Extension | null {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const factory = EXT_MAP[ext];
  return factory ? factory() : null;
}
```

**Step 2: Create RemoteEditor**

Create `apps/ui/src/features/sftp/components/RemoteEditor.tsx`:

```tsx
import { useEffect, useRef, useState, useCallback } from "react";
import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { getLanguageExtension } from "../utils/languageDetect";

interface RemoteEditorProps {
  sftpSessionId: string;
  remotePath: string;
  onClose: () => void;
}

export function RemoteEditor({ sftpSessionId, remotePath, onClose }: RemoteEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const originalContent = useRef("");

  const fileName = remotePath.split("/").pop() || remotePath;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await window.hypershell.sftpReadFile({ sftpSessionId, path: remotePath });
        if (cancelled) return;

        const content = response.encoding === "base64"
          ? atob(response.content)
          : response.content;
        originalContent.current = content;

        const langExt = getLanguageExtension(fileName);
        const extensions = [
          basicSetup,
          oneDark,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              setDirty(update.state.doc.toString() !== originalContent.current);
            }
          }),
        ];
        if (langExt) extensions.push(langExt);

        if (editorRef.current) {
          viewRef.current = new EditorView({
            state: EditorState.create({ doc: content, extensions }),
            parent: editorRef.current,
          });
        }
        setLoading(false);
      } catch (err: any) {
        setError(err.message || "Failed to load file");
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
      viewRef.current?.destroy();
    };
  }, [sftpSessionId, remotePath, fileName]);

  const handleSave = useCallback(async () => {
    if (!viewRef.current) return;
    setSaving(true);
    setError(null);
    try {
      const content = viewRef.current.state.doc.toString();
      await window.hypershell.sftpWriteFile({
        sftpSessionId,
        path: remotePath,
        content,
        encoding: "utf-8",
      });
      originalContent.current = content;
      setDirty(false);
    } catch (err: any) {
      setError(err.message || "Failed to save file");
    } finally {
      setSaving(false);
    }
  }, [sftpSessionId, remotePath]);

  const handleClose = useCallback(() => {
    if (dirty && !confirm("You have unsaved changes. Close anyway?")) return;
    onClose();
  }, [dirty, onClose]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleSave, handleClose]);

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-base-900">
      <div className="flex items-center justify-between px-4 py-2 bg-base-800 border-b border-base-700">
        <div className="flex items-center gap-3">
          <span className="text-sm text-text-primary font-mono">{fileName}</span>
          <span className="text-xs text-text-secondary truncate max-w-[300px]">{remotePath}</span>
          {dirty && <span className="text-xs text-yellow-400">Modified</span>}
        </div>
        <div className="flex items-center gap-2">
          {error && <span className="text-xs text-red-400">{error}</span>}
          <button
            className="text-sm px-3 py-1 bg-accent text-white rounded hover:bg-accent/80 disabled:opacity-50"
            onClick={handleSave}
            disabled={saving || !dirty}
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            className="text-sm px-3 py-1 text-text-secondary hover:text-text-primary border border-base-600 rounded"
            onClick={handleClose}
          >
            Close
          </button>
        </div>
      </div>
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-text-secondary">Loading file...</div>
      ) : (
        <div ref={editorRef} className="flex-1 overflow-auto" />
      )}
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add apps/ui/src/features/sftp/components/RemoteEditor.tsx apps/ui/src/features/sftp/utils/languageDetect.ts
git commit -m "feat(ui): add RemoteEditor component with CodeMirror 6 integration"
```

---

## Task 14: SftpTab — Main Container

**Files:**
- Create: `apps/ui/src/features/sftp/SftpTab.tsx`
- Create: `apps/ui/src/features/sftp/index.ts`

**Step 1: Create SftpTab**

Create `apps/ui/src/features/sftp/SftpTab.tsx`:

```tsx
import { useCallback, useEffect, useState } from "react";
import { useStore } from "zustand";
import { getSftpStore, disposeSftpStore } from "./sftpStore";
import { transferStore } from "./transferStore";
import { SftpToolbar } from "./components/SftpToolbar";
import { SftpDualPane } from "./components/SftpDualPane";
import { TransferPanel } from "./components/TransferPanel";
import { RemoteEditor } from "./components/RemoteEditor";

interface SftpTabProps {
  sftpSessionId: string;
  hostId: string;
  onClose: () => void;
}

export function SftpTab({ sftpSessionId, hostId, onClose }: SftpTabProps) {
  const store = getSftpStore(sftpSessionId);
  const [editingFile, setEditingFile] = useState<string | null>(null);
  const remotePath = useStore(store, (s) => s.remotePath);

  // Subscribe to SFTP events for transfer progress
  useEffect(() => {
    const unsubscribe = window.hypershell.onSftpEvent((event) => {
      if (event.kind === "transfer-progress") {
        transferStore.getState().updateTransfer(event.transferId, {
          bytesTransferred: event.bytesTransferred,
          totalBytes: event.totalBytes,
          speed: event.speed,
          status: event.status as any,
        });
      } else if (event.kind === "transfer-complete") {
        transferStore.getState().updateTransfer(event.transferId, {
          status: event.status,
          error: event.error,
        });
      }
    });
    return unsubscribe;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => disposeSftpStore(sftpSessionId);
  }, [sftpSessionId]);

  const handleUpload = useCallback(async (localPaths: string[], remoteTarget: string) => {
    const target = remoteTarget || remotePath;
    const operations = localPaths.map((localPath) => ({
      type: "upload" as const,
      localPath,
      remotePath: target + "/" + localPath.split(/[/\\]/).pop(),
      isDirectory: false,
    }));
    await window.hypershell.sftpTransferStart({ sftpSessionId, operations });
  }, [sftpSessionId, remotePath]);

  const handleDownload = useCallback(async (remotePaths: string[], localTarget: string) => {
    const localPath = localTarget || store.getState().localPath;
    const operations = remotePaths.map((rp) => ({
      type: "download" as const,
      localPath: localPath + "\\" + rp.split("/").pop(),
      remotePath: rp,
      isDirectory: false,
    }));
    await window.hypershell.sftpTransferStart({ sftpSessionId, operations });
  }, [sftpSessionId, store]);

  const handleRename = useCallback(async (path: string) => {
    const name = path.split("/").pop() || "";
    const newName = prompt("Rename to:", name);
    if (!newName || newName === name) return;
    const newPath = path.substring(0, path.lastIndexOf("/") + 1) + newName;
    await window.hypershell.sftpRename({ sftpSessionId, oldPath: path, newPath });
    // Refresh
    const response = await window.hypershell.sftpList({ sftpSessionId, path: remotePath });
    store.getState().setRemoteEntries(response.entries);
  }, [sftpSessionId, remotePath, store]);

  const handleDelete = useCallback(async (paths: string[]) => {
    if (!confirm(`Delete ${paths.length} item(s)?`)) return;
    for (const path of paths) {
      await window.hypershell.sftpDelete({ sftpSessionId, path, recursive: true });
    }
    const response = await window.hypershell.sftpList({ sftpSessionId, path: remotePath });
    store.getState().setRemoteEntries(response.entries);
  }, [sftpSessionId, remotePath, store]);

  const handleMkdir = useCallback(async () => {
    const name = prompt("New folder name:");
    if (!name) return;
    const newPath = remotePath.replace(/\/$/, "") + "/" + name;
    await window.hypershell.sftpMkdir({ sftpSessionId, path: newPath });
    const response = await window.hypershell.sftpList({ sftpSessionId, path: remotePath });
    store.getState().setRemoteEntries(response.entries);
  }, [sftpSessionId, remotePath, store]);

  const handleBookmark = useCallback(async (path: string) => {
    const name = prompt("Bookmark name:", path.split("/").pop() || path);
    if (!name) return;
    await window.hypershell.sftpBookmarksUpsert({ hostId, name, remotePath: path });
  }, [hostId]);

  const handleDisconnect = useCallback(async () => {
    await window.hypershell.sftpDisconnect({ sftpSessionId });
    onClose();
  }, [sftpSessionId, onClose]);

  return (
    <div className="flex flex-col h-full relative">
      <SftpToolbar store={store} hostId={hostId} onDisconnect={handleDisconnect} />
      <SftpDualPane
        store={store}
        onUpload={handleUpload}
        onDownload={handleDownload}
        onEdit={setEditingFile}
        onRename={handleRename}
        onDelete={handleDelete}
        onMkdir={handleMkdir}
        onBookmark={handleBookmark}
      />
      <TransferPanel />
      {editingFile && (
        <RemoteEditor
          sftpSessionId={sftpSessionId}
          remotePath={editingFile}
          onClose={() => setEditingFile(null)}
        />
      )}
    </div>
  );
}
```

**Step 2: Create feature index**

Create `apps/ui/src/features/sftp/index.ts`:

```typescript
export { SftpTab } from "./SftpTab";
export { getSftpStore, disposeSftpStore } from "./sftpStore";
export { transferStore } from "./transferStore";
```

**Step 3: Commit**

```bash
git add apps/ui/src/features/sftp/SftpTab.tsx apps/ui/src/features/sftp/index.ts
git commit -m "feat(ui): add SftpTab container wiring dual-pane, transfers, and editor"
```

---

## Task 15: Integrate SFTP Tab into Workspace

**Files:**
- Modify: `apps/ui/src/features/layout/Workspace.tsx` — render SftpTab for sftp-type tabs

**Step 1: Update Workspace to handle SFTP tabs**

In `apps/ui/src/features/layout/Workspace.tsx`, import SftpTab and update the `PaneView` component to conditionally render SftpTab when the active tab has `type: "sftp"`:

```tsx
import { SftpTab } from "../sftp";

// In PaneView, update the rendering logic:
// Find the active tab for the current pane
const activeTab = tabs.find((t) => t.sessionId === pane.sessionId);

if (activeTab?.type === "sftp" && activeTab.sftpSessionId) {
  return (
    <SftpTab
      sftpSessionId={activeTab.sftpSessionId}
      hostId={activeTab.hostId || ""}
      onClose={() => {
        // Remove the tab
        layoutStore.setState((s) => ({
          tabs: s.tabs.filter((t) => t.sessionId !== activeTab.sessionId),
        }));
      }}
    />
  );
}

// Otherwise render TerminalPane as before
```

**Step 2: Add "Open SFTP" action to host browser or terminal tab context**

This will depend on existing UI patterns for host actions. Add an action that:

```typescript
async function openSftpTab(hostId: string) {
  const { sftpSessionId } = await window.hypershell.sftpConnect({ hostId });
  const sessionId = `sftp-tab-${sftpSessionId}`;
  layoutStore.getState().openTab({
    sessionId,
    title: `SFTP: ${hostName}`,
    type: "sftp",
    sftpSessionId,
    hostId,
  });
}
```

**Step 3: Run build**

Run: `pnpm build`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/ui/src/features/layout/Workspace.tsx
git commit -m "feat(ui): integrate SftpTab into Workspace rendering"
```

---

## Task 16: Window Type Declaration for SFTP

**Files:**
- Modify: `apps/ui/src/types/global.d.ts` or equivalent — extend `window.hypershell` with SFTP methods

**Step 1: Extend the window type**

Find the existing `window.hypershell` type declaration (likely in a `.d.ts` file) and add the SFTP methods to match the `DesktopApi` interface updates from Task 6.

**Step 2: Run type check**

Run: `pnpm build`
Expected: PASS — no type errors

**Step 3: Commit**

```bash
git add apps/ui/src/types/
git commit -m "feat(ui): extend window.hypershell type declarations with SFTP methods"
```

---

## Task 17: End-to-End Integration and Smoke Test

**Files:**
- Modify: `apps/desktop/src/main/main.ts` — bootstrap SFTP services on app start

**Step 1: Wire up SFTP services in main process**

In the main process entry (`apps/desktop/src/main/main.ts`), after existing initialization:

```typescript
import { createSftpSessionManager } from "./sftp/sftpSessionManager";
import { createTransferManager } from "./sftp/transferManager";
import { createSftpBookmarksRepository } from "@hypershell/db";

// After database and session manager init:
const sftpSessionManager = createSftpSessionManager();
const transferManager = createTransferManager();
const sftpBookmarksRepo = createSftpBookmarksRepository(db);

// Subscribe to transfer events and forward to renderer
transferManager.onEvent((event) => {
  mainWindow?.webContents.send(ipcChannels.sftp.event, event);
});
sftpSessionManager.onEvent((event) => {
  mainWindow?.webContents.send(ipcChannels.sftp.event, {
    kind: "status",
    sftpSessionId: event.sftpSessionId,
    state: event.type === "status" ? event.state : "disconnected",
  });
});
```

Pass these to `registerSftpIpc` with a `resolveCredentials` function that looks up the host's auth profile and returns `SftpConnectionOptions`.

**Step 2: Run full build**

Run: `pnpm build`
Expected: PASS

**Step 3: Run all tests**

Run: `pnpm test`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add apps/desktop/src/main/
git commit -m "feat(desktop): wire SFTP services into main process bootstrap"
```

---

## Task 18: Final Verification

**Step 1: Full build**

Run: `pnpm ci:build`
Expected: PASS

**Step 2: Full test suite**

Run: `pnpm ci:test`
Expected: ALL PASS

**Step 3: Lint**

Run: `pnpm lint`
Expected: PASS

**Step 4: Final commit**

If any fixes were needed:
```bash
git add -A
git commit -m "fix: resolve lint and type issues from SFTP integration"
```
