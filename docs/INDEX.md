# HyperShell Documentation

> Windows-first desktop SSH and serial terminal with SFTP file management, built on Electron + React + xterm.js.

## Quick Links

| I want to... | Go to |
|---|---|
| Set up the project locally | [Getting Started](./getting-started.md) |
| Understand the system design | [Architecture](./architecture.md) |
| Find where code lives | [Project Structure](./project-structure.md) |
| Configure the application | [Configuration](./configuration.md) |
| Look up an IPC channel | [IPC Reference](./ipc-reference.md) |
| Understand the database | [Data Model](./data-model.md) |
| Run or write tests | [Testing](./testing.md) |
| Build a release | [Build & Release](./build-and-release.md) |
| Fix a problem | [Troubleshooting](./troubleshooting.md) |

## Overview

HyperShell is a tabbed terminal workbench that connects to remote machines over SSH and local devices over serial ports. It includes an integrated SFTP dual-pane file browser with transfer queue, remote file editing, bookmarks, and sync. The application is packaged as a Windows NSIS installer and runs as an Electron desktop app.

The codebase is a pnpm monorepo with five workspaces. The main process manages sessions, IPC, and native integrations. The renderer is a React SPA with Zustand state management. All IPC traffic is validated with Zod schemas at both ends of the preload bridge.

## Architecture at a Glance

```
+--------------------------------------------------+
|                   Electron Shell                  |
|                                                   |
|  +--------------------+  +---------------------+ |
|  |   Main Process     |  |    Renderer (React)  | |
|  |                    |  |                      | |
|  |  SessionManager    |  |  Zustand Stores      | |
|  |   SSH PTY ---------|--|-> TerminalPane       | |
|  |   Serial    -------|--|-> TerminalPane       | |
|  |   SFTP      -------|--|-> SftpDualPane       | |
|  |                    |  |                      | |
|  |  SQLite DB         |  |  TabBar / Panes     | |
|  |  Host Monitor      |  |  Quick Connect      | |
|  |  Tray Integration  |  |  Settings Panel     | |
|  +--------+-----------+  +----------+----------+ |
|           |       Preload (Zod IPC)  |            |
|           +----------<window.sshterm>+            |
+--------------------------------------------------+
```

## Documentation Map

### For New Developers
1. [Getting Started](./getting-started.md) — Clone, install, run in 5 minutes
2. [Project Structure](./project-structure.md) — Where things live and why
3. [Architecture](./architecture.md) — System design, data flow, key decisions
4. [Testing](./testing.md) — Run and write tests

### For Working on Features
- [IPC Reference](./ipc-reference.md) — All channels, schemas, and preload methods
- [Data Model](./data-model.md) — Database schema, migrations, repositories
- [Configuration](./configuration.md) — Environment variables and app settings

### For DevOps / Releases
- [Build & Release](./build-and-release.md) — Build commands, packaging, CI/CD
- [Troubleshooting](./troubleshooting.md) — Common issues and fixes

## Feature Matrix

| Feature | Status | Key Files |
|---------|--------|-----------|
| SSH terminal (PTY) | Complete | `session-core/transports/sshPtyTransport.ts` |
| Serial terminal | Complete | `session-core/transports/serialTransport.ts` |
| Tabs and split panes | Complete | `ui/features/layout/` |
| Host management (CRUD) | Complete | `ui/features/hosts/`, `db/repositories/hostsRepository.ts` |
| Groups and color tags | Complete | `db/repositories/groupsRepository.ts` |
| Drag-and-drop host reorder | Complete | `ui/features/sidebar/SidebarHostList.tsx` |
| SSH config import | Complete | `session-core/ssh/parseSshConfig.ts` |
| Quick Connect (Ctrl+K) | Complete | `ui/features/quick-connect/` |
| Welcome screen + animated logo | Complete | `ui/features/welcome/` |
| SFTP dual-pane file browser | Complete | `ui/features/sftp/` |
| SFTP transfer queue | Complete | `desktop/main/sftp/transferManager.ts` |
| SFTP remote file editor | Complete | `ui/features/sftp/components/RemoteEditor.tsx` |
| SFTP bookmarks | Complete | `db/repositories/sftpBookmarksRepository.ts` |
| SFTP sync engine | Complete | `session-core/sftp/syncEngine.ts` |
| Broadcast mode | Complete | `ui/features/broadcast/` |
| Port forwarding (standalone) | Complete | `session-core/portForwarding.ts` |
| Port forwarding (host-linked) | Complete | `db/repositories/hostPortForwardsRepository.ts`, `desktop/ipc/hostPortForwardIpc.ts` |
| Visual Tunnel Manager | Complete | `ui/features/tunnels/` |
| Jump host (ProxyJump) per host | Complete | `session-core/transports/sshPtyTransport.ts` |
| SSH2 connection pool | Complete | `session-core/ssh2ConnectionPool.ts` |
| Network-aware auto-reconnect | Complete | `session-core/networkMonitor.ts`, `sessionManager.ts` |
| Per-host keep-alive | Complete | Host record `keep_alive_interval` → `sshPtyTransport.ts` |
| Terminal reconnect overlay | Complete | `ui/features/terminal/TerminalReconnectOverlay.tsx` |
| Tab status badges | Complete | `ui/features/layout/TabBar.tsx` |
| Session recovery | Complete | `ui/features/sessions/` |
| Workspace save/restore | Complete | `db/repositories/workspaceRepository.ts` |
| Settings and themes | Complete | `ui/features/settings/` |
| System tray | Complete | `desktop/main/tray/` |
| Host status monitoring | Complete | `desktop/main/monitoring/hostMonitor.ts` |
| 1Password references | Complete | `desktop/main/security/opResolver.ts` |
| Status bar | Complete | `ui/features/statusbar/` |
| Snippets manager | Complete | `ui/features/snippets/`, `db/repositories/snippetsRepository.ts` |
| Session logging | Complete | `desktop/ipc/loggingIpc.ts`, `ui/features/terminal/LoggingButton.tsx` |
| Tab drag-and-drop reorder | Complete | `ui/features/layout/TabBar.tsx` (dnd-kit) |
| Split pane shortcuts | Complete | `ui/features/layout/paneShortcuts.ts` |
| Host export (JSON/CSV) | Complete | `desktop/ipc/hostsIpc.ts` (exportHostsToJson/Csv) |
| Toast notifications | Complete | sonner `<Toaster>` in App.tsx |
| General settings panel | Complete | `ui/features/settings/SettingsPanel.tsx` (General section) |
| SSH key manager | Partial | `ui/features/ssh-keys/` (UI only) |

## Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Desktop framework | Electron | 34.0.0 |
| UI framework | React | 19.1.0 |
| Terminal emulator | xterm.js | 6.0.0 |
| Language | TypeScript (strict) | 5.8.3 |
| SSH/SFTP client | ssh2 | 1.17.0 |
| Serial I/O | serialport | 12.0.0 |
| Pseudo-terminal | node-pty | 1.0.0 |
| Database | SQLite (better-sqlite3) | 11.8.0 |
| State management | Zustand | 5.0.8 |
| Schema validation | Zod | 3.24.1 |
| Styling | Tailwind CSS | 4.2.2 |
| Toast notifications | sonner | 2.x |
| Animations | Framer Motion | 12.23.24 |
| Code editor | CodeMirror | 6.0.2 |
| Drag-and-drop | dnd-kit | 6.3.1 |
| Bundler (main) | esbuild | 0.25.12 |
| Bundler (UI) | Vite | 6.3.5 |
| Unit tests | Vitest | 3.1.2 |
| E2E tests | Playwright | 1.54.1 |
| Packaging | electron-builder | 26.0.12 |
| Package manager | pnpm | 10.8.1 |
