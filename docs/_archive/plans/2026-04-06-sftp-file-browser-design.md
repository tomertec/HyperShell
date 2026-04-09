# SFTP File Browser — Design Document

**Date:** 2026-04-06
**Status:** Approved

## Overview

A dual-pane SFTP file browser for HyperShell, providing side-by-side local and remote file management, drag-and-drop transfers, a remote file editor, and per-host bookmarks. Integrates as a new transport type within the existing session-core architecture using the `ssh2` npm package.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| SSH library | `ssh2` npm package | Programmatic SFTP subsystem access required for file ops, progress tracking, and multiplexed transfers |
| Session relationship | Both standalone + linked to terminal | Opens from host list independently, or via "Open SFTP" on an active SSH terminal tab |
| Remote editor | CodeMirror 6 | Good syntax highlighting, small footprint (~200KB), right balance for quick config edits |
| Local pane | Custom file browser + Explorer drag-in | True dual-pane UX with external drag-and-drop support from Windows Explorer |
| Transfer management | Transfer queue with panel | Dedicated queue UI with concurrent transfers, pause/cancel, retry |
| Bookmarks | Per-host remote paths | Scoped to specific hosts, natural mental model for multi-server management |

## Architecture

### Approach: SFTP as a New Transport in session-core

`SftpTransport` sits alongside `SshPtyTransport` and `SerialTransport`. The `ssh2` package is added to session-core. SFTP sessions get their own session IDs in the SessionManager, with new IPC channels following the existing contract pattern.

This keeps the architecture unified — both terminal and file browser sessions participate in the same lifecycle (reconnection, recovery, credential resolution).

## Connection & Transport Layer

### New Files in session-core

```
packages/session-core/src/
  transports/
    sshPtyTransport.ts    (existing)
    serialTransport.ts    (existing)
    sftpTransport.ts      (NEW)
  sftpOperations.ts       (NEW - file op methods wrapping ssh2 SFTP)
  sessionManager.ts       (extended - add "sftp" to TransportType)
```

### SftpTransport Responsibilities

- Connect via ssh2 using credentials from auth profiles (password, key file, agent)
- Open SFTP subsystem on the ssh2 connection
- Expose file operations: `list`, `stat`, `read`, `write`, `mkdir`, `rename`, `delete`, `rmdir`
- Emit connection status events (same `connecting | connected | reconnecting | disconnected | failed` states)
- Support reconnection using existing exponential backoff strategy
- Provide `readStream` / `writeStream` for transfers with progress callbacks

### Transport Abstraction

The existing `TransportEvent` type stays as-is for PTY transports. SFTP transports don't emit `data` events (no terminal stream) — they respond to method calls instead. The SessionManager distinguishes transport types via the `TransportType` discriminator, extended with `"sftp"`.

### Credential Reuse

When the user clicks "Open SFTP" on an active SSH terminal tab, the SessionManager looks up that session's `profileId`, resolves the same auth profile, and creates an `SftpTransport` to the same host without re-prompting.

## IPC Contract

### New Channels

Following the existing `{feature}:{action}` pattern:

**SFTP connection & file operations:**
```
sftp:connect              → open SFTP connection to a host
sftp:disconnect           → close SFTP connection
sftp:list                 → list directory contents
sftp:stat                 → stat a single path
sftp:mkdir                → create directory
sftp:rename               → rename/move file or directory
sftp:delete               → delete file(s) or directory (recursive)
sftp:read-file            → read small file content (for editor, <10MB)
sftp:write-file           → write file content back (from editor)
```

**Transfer management:**
```
sftp:transfer:start       → start a file/folder transfer (upload or download)
sftp:transfer:cancel      → cancel an in-progress transfer
sftp:transfer:list        → get current transfer queue state
sftp:transfer:resolve-conflict → respond to overwrite/skip prompt
sftp:event                → subscription channel for progress + status events
```

**Local filesystem (renderer has no fs access):**
```
fs:list                   → list local directory
fs:stat                   → stat local path
fs:get-home               → get user's home directory
fs:get-drives             → list Windows drive letters
```

**Bookmarks:**
```
sftp:bookmarks:list       → list bookmarks for a host
sftp:bookmarks:upsert     → create or update bookmark
sftp:bookmarks:remove     → delete bookmark
sftp:bookmarks:reorder    → reorder bookmarks
```

### Key Schemas (Zod)

- `SftpConnectRequest` — `{ hostId: string }` or `{ sessionId: string }` (reuse from terminal)
- `SftpConnectResponse` — `{ sftpSessionId: string }`
- `SftpListRequest` — `{ sftpSessionId: string, path: string }`
- `SftpListResponse` — `{ entries: SftpEntry[] }` where `SftpEntry` = `{ name, path, size, modifiedAt, isDirectory, permissions, owner, group }`
- `SftpTransferStartRequest` — `{ sftpSessionId: string, operations: TransferOp[] }` where `TransferOp` = `{ type: "upload" | "download", localPath: string, remotePath: string, isDirectory: boolean }`
- `SftpEvent` — discriminated union: `transfer-progress` (transferId, bytesTransferred, totalBytes, speed, status) | `status` (sftpSessionId, state)

## Transfer Queue System

### TransferManager (Main Process)

Located in `apps/desktop/src/main/sftp/`. Consumes `SftpTransport` instances, owns queuing logic.

**Behavior:**
- Ordered queue of `TransferJob` objects
- Up to 3 concurrent transfers per SFTP connection (ssh2 supports multiplexed SFTP requests)
- Each job tracks: `transferId`, `type` (upload/download), `localPath`, `remotePath`, `status` (queued | active | paused | completed | failed), `bytesTransferred`, `totalBytes`, `speed`
- Directory transfers: recursively enumerate contents, one `TransferJob` per file, grouped under a `TransferGroup` for folder-level progress

**Transfer lifecycle:**
1. UI calls `sftp:transfer:start` with `TransferOp`s
2. TransferManager creates jobs, calculates total sizes via `stat`, queues them
3. Active jobs use ssh2's `fastGet`/`fastPut` for large files, `readFile`/`writeFile` for small files (<1MB)
4. Progress emitted via `sftp:event` at ~200ms throttle
5. On completion/failure, final status event emitted
6. Cancel via `sftp:transfer:cancel` aborts the ssh2 stream mid-transfer

**Conflict handling:**
- Destination file exists → emit event, UI prompts (overwrite / skip / rename / apply to all)
- Transfer pauses until UI responds via `sftp:transfer:resolve-conflict`

**Retry:** Failed transfers stay in queue with `failed` status. User retries from the transfer panel, which re-queues the job.

## UI Components & Layout

### Tab Integration

SFTP browser opens as a new tab type in `layoutStore`. Tab variant: `type: "sftp"` with `sftpSessionId`.

### Component Tree

```
SftpTab
├── SftpToolbar            (path breadcrumbs, back/forward/up, view toggle, bookmarks)
├── SftpDualPane
│   ├── LocalPane
│   │   ├── DriveSelector   (Windows drive letters dropdown)
│   │   ├── PathBreadcrumb
│   │   └── FileList        (sortable table: name, size, date, permissions)
│   ├── ResizeHandle        (draggable divider)
│   └── RemotePane
│       ├── PathBreadcrumb
│       └── FileList        (same component, remote data source)
├── TransferPanel           (bottom drawer, collapsible)
│   ├── TransferQueue       (list of active/queued/completed transfers)
│   └── TransferSummary     (overall progress bar, speed, ETA)
└── RemoteEditor            (modal overlay with CodeMirror 6)
```

### FileList Component (Shared)

- Sortable columns: icon, name, size, modified date, permissions
- Multi-select with Ctrl/Shift click
- Right-click context menu: Open, Edit (files only), Download/Upload, Rename, Delete, Copy Path, New Folder
- Double-click: navigate into directories, open editor for files
- Drag source and drop target for transfers

### Drag-and-Drop

- **Internal:** drag from local FileList → drop on remote FileList (and vice versa) starts a transfer
- **External:** drag from Windows Explorer → drop on remote pane triggers upload via Electron drop events
- **Visual feedback:** drop zone highlight, ghost preview of dragged items

### Remote Editor

- Modal overlay within the SFTP tab (keeps context)
- CodeMirror 6 with language detection from file extension
- Toolbar: Save (writes back to remote), Save As, Close, file path display
- Save: writes to temp local file first, then uploads — no lost edits on network failure
- Warns on unsaved changes when closing

### Layout Behavior

- Dual pane default split: 50/50 with draggable resize handle
- Minimum pane width: 250px
- Transfer panel: collapsed by default, auto-opens when transfers start, stays open until manually collapsed

## State Management

### sftpStore (Per-Tab Instance)

```typescript
{
  sftpSessionId: string
  localPath: string
  remotePath: string
  localEntries: FileEntry[]
  remoteEntries: FileEntry[]
  localSelection: Set<string>
  remoteSelection: Set<string>
  localSortBy: { column, direction }
  remoteSortBy: { column, direction }
  localHistory: string[]
  remoteHistory: string[]
  isLoading: { local: boolean, remote: boolean }
  error: { local: string | null, remote: string | null }
}
```

One store instance per open SFTP tab, stored in a `Map<sftpSessionId, SftpStore>`. Created on tab open, disposed on close.

### transferStore (Global Singleton)

```typescript
{
  transfers: TransferJob[]
  activeCount: number
  panelOpen: boolean
  filter: "all" | "active" | "completed" | "failed"
}
```

Read-only projection of main process state, updated via `sftp:event` listener. User actions (cancel, retry) go through IPC.

### Data Flow Example

```
User double-clicks folder in RemotePane
  → sftpStore.navigateTo(path)
  → isLoading.remote = true
  → window.hypershell.sftpList({ sftpSessionId, path })
  → Main: SftpTransport.list(path) via ssh2
  → Response: FileEntry[]
  → Store: remoteEntries updated, remotePath set, history pushed
  → FileList re-renders

User drags files from LocalPane to RemotePane
  → Drop handler reads localSelection paths
  → window.hypershell.sftpTransferStart({ sftpSessionId, operations })
  → Main: TransferManager queues jobs
  → sftp:event → transferStore → TransferPanel re-renders
  → On completion: auto-refresh remoteEntries
```

**No directory caching** — always fetched fresh. Remote filesystems change externally, and SFTP `readdir` latency is typically <100ms.

## Database & Bookmarks

### Migration: 002_sftp_bookmarks.sql

```sql
CREATE TABLE sftp_bookmarks (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  host_id     TEXT NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  remote_path TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_sftp_bookmarks_host ON sftp_bookmarks(host_id);
```

### Repository

`SftpBookmarksRepository` in `packages/db/src/repositories/` — `list(hostId)`, `upsert(input)`, `remove(id)`, `reorder(ids)`.

### UI Integration

- Bookmarks dropdown in `SftpToolbar` on the remote pane side
- Right-click folder → "Add to Bookmarks"
- Star icon, sorted by `sort_order`, drag-reorderable
- Default bookmark auto-created on first connection: home directory (`~`)

## Security

**Credentials:**
- ssh2 connections reuse auth profiles — passwords/keys resolved through DPAPI secure storage
- No credentials held in memory beyond connection lifetime
- Private key passphrases: prompt via IPC dialog, never cached

**File access:**
- All remote paths validated server-side by ssh2
- Local file access only through main process IPC — renderer never gets direct `fs` access
- Temp files for editor written to `app.getPath('temp')`, cleaned up on editor close / app exit

**Transfer safety:**
- Large transfers write to `.part` temp file, rename on completion
- Never silent overwrite — conflict resolution flow required

## Error Handling

**Connection errors:**
- Auth failure → actionable UI message ("Authentication failed — check credentials in host settings")
- Network timeout → reconnection via existing backoff strategy
- Host key verification → prompt on first connect, store in known_hosts

**File operations:**
- Permission denied → inline error on specific file entry, other operations continue
- Disk full → pause transfer queue, notify user
- File not found → refresh directory listing, toast notification

**Editor:**
- Save failure → keep editor open with unsaved changes, show error, offer retry
- External change during edit → warn before save, offer reload or overwrite
