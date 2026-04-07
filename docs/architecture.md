# Architecture

## Three-Layer Electron Model

HyperShell follows Electron's recommended security model with strict process isolation:

```
┌─────────────────────────────────────────────────────────┐
│                     Main Process                         │
│                                                         │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ SessionMgr  │  │  SQLite DB   │  │  Host Monitor  │  │
│  │             │  │              │  │                │  │
│  │ SSH PTY     │  │  hosts       │  │  TCP probes    │  │
│  │ Serial      │  │  groups      │  │  per host      │  │
│  │ SFTP (ssh2) │  │  serial_prof │  └───────────────┘  │
│  │             │  │  sftp_bookm  │                      │
│  └──────┬──────┘  │  workspaces  │  ┌───────────────┐  │
│         │         │  settings    │  │  System Tray   │  │
│         │         └──────────────┘  └───────────────┘  │
│         │                                               │
│  ───────┼── IPC Handlers (Zod-validated) ──────────────│
│         │                                               │
├─────────┼───────────────────────────────────────────────┤
│         │        Preload Bridge                         │
│         │        window.sshterm = { ... }               │
│         │        (contextBridge.exposeInMainWorld)       │
├─────────┼───────────────────────────────────────────────┤
│         ▼        Renderer Process                       │
│                                                         │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ TerminalPane│  │  SftpDualPane│  │  Zustand       │  │
│  │ (xterm.js)  │  │  (FileList)  │  │  Stores        │  │
│  │             │  │  RemoteEditor│  │                │  │
│  │ TabBar      │  │  Transfers   │  │  layoutStore   │  │
│  │ Panes       │  │  Bookmarks   │  │  settingsStore │  │
│  │ Sidebar     │  │  Sync        │  │  broadcastStore│  │
│  └─────────────┘  └──────────────┘  └───────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Main Process (`apps/desktop/src/main/`)

Owns all system resources: network connections, file system, database, native modules. Entry point is `main.ts` which bootstraps `mainLifecycle.ts`.

Key responsibilities:
- **Session management** — Creates and manages SSH, serial, and SFTP transports via `SessionManager`
- **IPC handlers** — 40+ channels registered in `registerIpc.ts`, each validated with Zod
- **Database** — SQLite opened once, shared across all handlers
- **Host monitoring** — Background TCP probes for host availability
- **Tray** — System tray icon with quick actions

### Preload Bridge (`apps/desktop/src/preload/`)

The security boundary. Exposes a typed `window.sshterm` API to the renderer using `contextBridge.exposeInMainWorld`. Every method:
1. Validates the request with Zod (`schema.parse(request)`)
2. Calls `ipcRenderer.invoke(channel, parsed)`
3. Validates the response with Zod before returning

The renderer never accesses `ipcRenderer` directly.

### Renderer (`apps/ui/`)

React SPA loaded by Electron. In dev mode, served by Vite at `localhost:5173` with HMR. In production, loaded from bundled HTML in `apps/desktop/dist/renderer/`.

State management uses Zustand stores. No Redux. Stores are vanilla (created with `createStore` from `zustand/vanilla` for session-core interop) or React-bound.

## Session Transport Architecture

```
SessionManager
  ├── open(request) → creates transport based on request.transport
  │     ├── "ssh"    → SshPtyTransport (node-pty + system ssh binary)
  │     ├── "serial" → SerialTransport (serialport npm)
  │     └── "sftp"   → SftpTransport   (ssh2 npm)
  │
  ├── write(sessionId, data) → transport.write()
  ├── resize(sessionId, cols, rows) → transport.resize()
  ├── close(sessionId) → transport.close()
  └── onEvent(listener) → normalized events from all transports
```

### SSH Transport

Spawns the **system `ssh` binary** in a pseudo-terminal via `node-pty`. This is deliberate — the system ssh handles:
- SSH agent integration (OpenSSH agent, Pageant, 1Password)
- ProxyJump chains
- Host key verification
- Kerberos/GSSAPI auth
- `~/.ssh/config` parsing

The trade-off: less programmatic control vs. full compatibility with any SSH setup.

### SFTP Transport

Uses the **ssh2 npm library** for programmatic SFTP access. This is separate from the SSH terminal because SFTP needs:
- Multiplexed file operations (list, stat, read, write concurrently)
- Stream-based transfers with progress tracking
- Transfer queue management

The SFTP transport handles multi-key authentication (tries all candidate keys sequentially) and strips Windows domain prefixes from usernames.

### Serial Transport

Uses the **serialport npm library**. Supports configurable baud rate, data bits, stop bits, parity, flow control, and hardware signals (DTR/RTS).

## IPC Contract Pattern

All IPC communication follows this pattern:

```
1. Define channel name        → packages/shared/src/ipc/channels.ts
2. Define Zod schemas         → packages/shared/src/ipc/schemas.ts
3. Register handler           → apps/desktop/src/main/ipc/*Ipc.ts
4. Expose in preload          → apps/desktop/src/preload/desktopApi.ts
5. Declare in renderer types  → apps/ui/src/types/global.d.ts
6. Call from UI               → window.sshterm.methodName(request)
```

Both sides validate. The preload validates outgoing requests AND incoming responses. The main process validates incoming requests. Types are inferred from Zod schemas via `z.infer<>`.

## State Management

| Store | Location | Purpose |
|-------|----------|---------|
| `layoutStore` | `ui/features/layout/` | Tabs, panes, active session, split direction |
| `settingsStore` | `ui/features/settings/` | User preferences, terminal theme |
| `broadcastStore` | `ui/features/broadcast/` | Broadcast mode state, target sessions |
| `sessionRecoveryStore` | `ui/features/sessions/` | Session metadata for crash recovery |
| `sftpStore` (per session) | `ui/features/sftp/` | SFTP pane state, entries, selection, sort |
| `transferStore` | `ui/features/sftp/` | Active transfer jobs and progress |

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| SSH execution | System `ssh` in PTY | Full agent/config/proxy compatibility without reimplementing SSH |
| SFTP library | ssh2 (not system sftp) | Programmatic control needed for transfers, progress, multiplexing |
| Database | SQLite (better-sqlite3) | Self-contained, no external service, synchronous reads |
| Validation | Zod on both sides of IPC | Type-safe contracts, runtime validation at trust boundary |
| State | Zustand (not Redux) | Minimal boilerplate, excellent TypeScript support, vanilla store option |
| Styling | Tailwind CSS v4 | Rapid iteration, dark theme built-in, no CSS modules needed |
| Terminal | xterm.js + node-pty | Industry standard pairing for web-based terminal emulation |
| Packaging | NSIS (Windows) | Native Windows installer experience |
