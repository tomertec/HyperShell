# Project Structure

## Monorepo Layout

```
hypershell/
├── apps/
│   ├── desktop/                    # Electron app (main + preload)
│   │   ├── src/
│   │   │   ├── main/
│   │   │   │   ├── main.ts                  # Entry point — bootstraps lifecycle
│   │   │   │   ├── mainLifecycle.ts         # App lifecycle (window, tray, IPC, cleanup)
│   │   │   │   ├── ipc/
│   │   │   │   │   ├── registerIpc.ts       # Central IPC registry (40+ channels)
│   │   │   │   │   ├── hostsIpc.ts          # Host CRUD + SSH config import
│   │   │   │   │   ├── sftpIpc.ts           # SFTP file ops + transfers + bookmarks
│   │   │   │   │   ├── fsIpc.ts             # Local filesystem access
│   │   │   │   │   ├── serialProfilesIpc.ts # Serial profile CRUD + port enum
│   │   │   │   │   ├── settingsIpc.ts       # App preferences
│   │   │   │   │   ├── groupsIpc.ts         # Host grouping
│   │   │   │   │   ├── portForwardIpc.ts    # Standalone SSH port forwarding
│   │   │   │   │   ├── hostPortForwardIpc.ts # Host-linked port forward CRUD
│   │   │   │   │   ├── sshConfigIpc.ts      # ~/.ssh/config parsing
│   │   │   │   │   ├── sshKeysIpc.ts        # SSH key management
│   │   │   │   │   ├── workspaceIpc.ts      # Workspace save/restore
│   │   │   │   │   ├── snippetsIpc.ts       # Snippet CRUD
│   │   │   │   │   ├── loggingIpc.ts        # Session logging (ANSI-stripped file write)
│   │   │   │   │   └── editorIpc.ts         # SFTP file editor windows
│   │   │   │   ├── sftp/
│   │   │   │   │   ├── sftpSessionManager.ts  # SFTP session pool
│   │   │   │   │   └── transferManager.ts     # Transfer queue (3 concurrent/session)
│   │   │   │   ├── monitoring/
│   │   │   │   │   └── hostMonitor.ts       # Background TCP host probes
│   │   │   │   ├── security/
│   │   │   │   │   └── opResolver.ts        # 1Password op:// reference resolver
│   │   │   │   ├── tray/
│   │   │   │   │   └── createTray.ts        # System tray icon + menu
│   │   │   │   └── windows/
│   │   │   │       └── createMainWindow.ts  # BrowserWindow factory
│   │   │   └── preload/
│   │   │       ├── index.ts                 # Preload entry
│   │   │       └── desktopApi.ts            # window.hypershell API (Zod-validated)
│   │   ├── esbuild.config.mjs              # Main/preload bundler config
│   │   ├── electron-builder.yml            # NSIS installer config
│   │   └── tsconfig.json
│   │
│   └── ui/                         # React renderer (Vite SPA)
│       ├── src/
│       │   ├── main.tsx                     # React entry point
│       │   ├── index.css                    # Tailwind theme + global styles
│       │   ├── app/
│       │   │   └── App.tsx                  # Root component (dialogs, routing, stores)
│       │   ├── types/
│       │   │   └── global.d.ts              # window.hypershell type declarations
│       │   ├── lib/
│       │   │   └── formStyles.ts            # Shared input/badge CSS classes
│       │   ├── components/
│       │   │   └── ContextMenu.tsx          # Reusable context menu
│       │   └── features/
│       │       ├── layout/                  # AppShell, Workspace, TabBar, Panes
│       │       ├── terminal/                # TerminalPane, useTerminalSession, reconnect overlay, LoggingButton
│       │       ├── tunnels/                 # Tunnel Manager (topology, list, form, store)
│       │       ├── sftp/                    # Dual-pane browser, transfers, editor
│       │       │   ├── components/          # FileList, RemotePane, LocalPane, etc.
│       │       │   ├── hooks/               # useFileKeyboard
│       │       │   ├── utils/               # fileUtils, sortEntries
│       │       │   ├── sftpStore.ts         # Per-session SFTP state
│       │       │   └── transferStore.ts     # Transfer queue state
│       │       ├── hosts/                   # HostsView, HostForm, SshConfigImport
│       │       ├── sidebar/                 # SidebarHostList, SidebarSerialList
│       │       ├── serial/                  # SerialProfilesView, SerialProfileForm
│       │       ├── sessions/                # sessionStateStore, sessionRecoveryStore
│       │       ├── broadcast/               # BroadcastBar, broadcastStore
│       │       ├── settings/                # SettingsPanel, ThemeEditor, settingsStore
│       │       ├── quick-connect/           # QuickConnectDialog, searchIndex (fuse.js)
│       │       ├── welcome/                 # AnimatedLogo, QuickConnectForm, WelcomeScreen
│       │       ├── workspace/               # WorkspaceMenu (save/restore)
│       │       ├── port-forwarding/         # PortForwardProfileForm
│       │       ├── snippets/                # SnippetsPanel, snippetStore (Ctrl+Shift+S)
│       │       ├── ssh-keys/                # SshKeyManager
│       │       └── statusbar/               # StatusBar, useSessionStats
│       ├── tests/                           # Playwright E2E tests
│       ├── index.html                       # HTML shell
│       ├── vite.config.ts
│       └── playwright.config.ts
│
├── packages/
│   ├── shared/                     # IPC contracts
│   │   └── src/ipc/
│   │       ├── channels.ts                  # Channel name constants
│   │       ├── schemas.ts                   # Session/host/settings Zod schemas
│   │       ├── sftpSchemas.ts               # SFTP/filesystem Zod schemas
│   │       ├── contracts.ts                 # TypeScript interface aggregation
│   │       └── index.ts                     # Public exports
│   │
│   ├── session-core/               # Transport abstraction layer
│   │   └── src/
│   │       ├── sessionManager.ts            # Session lifecycle + network-aware reconnection
│   │       ├── networkMonitor.ts           # DNS-based network status probing
│   │       ├── ssh2ConnectionPool.ts       # Shared ssh2 connections (ref counting, idle timeout)
│   │       ├── transports/
│   │       │   ├── sshPtyTransport.ts       # System SSH via node-pty
│   │       │   ├── serialTransport.ts       # Serial port via serialport
│   │       │   ├── sftpTransport.ts         # SFTP via ssh2
│   │       │   └── transportEvents.ts       # Shared types + SftpConnectionOptions
│   │       ├── sftp/
│   │       │   └── syncEngine.ts            # Bidirectional file sync
│   │       ├── ssh/
│   │       │   └── parseSshConfig.ts        # ~/.ssh/config parser
│   │       ├── portForwarding.ts            # SSH tunnel management
│   │       └── index.ts
│   │
│   └── db/                         # SQLite persistence
│       └── src/
│           ├── index.ts                     # openDatabase(), migration runner
│           ├── migrations/
│           │   ├── 001_init.sql             # Base schema (hosts, groups, serial, etc.)
│           │   ├── 002_sftp_bookmarks.sql   # SFTP bookmarks table
│           │   ├── 003_host_auth.ts         # Identity file + auth fields
│           │   ├── 004_favorites.ts         # Host favorites
│           │   ├── 005_host_enhancements.ts # Sort order, color, 1Password ref
│           │   └── 006_advanced_ssh.sql    # Jump host, keep-alive, auto-reconnect, host_port_forwards
│           └── repositories/
│               ├── hostsRepository.ts       # Host CRUD + reorder
│               ├── groupsRepository.ts      # Group CRUD
│               ├── serialProfilesRepository.ts
│               ├── sftpBookmarksRepository.ts
│               ├── hostPortForwardsRepository.ts
│               └── workspaceRepository.ts
│
├── .github/workflows/
│   ├── pr-gates.yml                # CI: build + test + e2e on PR
│   └── windows-release.yml         # Release: package + sign + upload
├── .tools/                         # Build/release utility scripts
├── docs/                           # This documentation
├── CLAUDE.md                       # AI assistant guidance
├── CHANGELOG.md                    # Version history
├── package.json                    # Root workspace config
├── pnpm-workspace.yaml             # Workspace definitions
├── tsconfig.base.json              # Shared TypeScript config (strict, ES2022)
└── vitest.config.ts                # Workspace-mode test config
```

## Dependency Flow

```
desktop ──→ shared
         ──→ session-core ──→ shared
         ──→ db

ui ──→ shared

session-core ──→ shared

db (standalone, no internal deps)
```

The renderer (`ui`) only depends on `shared` for types. It accesses all backend functionality through `window.hypershell` (the preload bridge). It never imports `session-core` or `db` directly.

## Where to Put New Code

| What you're adding | Where it goes |
|-------------------|---------------|
| New IPC channel/schema | `packages/shared/src/ipc/` |
| New transport type | `packages/session-core/src/transports/` |
| New database table | `packages/db/src/migrations/` + new repository |
| New IPC handler | `apps/desktop/src/main/ipc/` |
| New preload method | `apps/desktop/src/preload/desktopApi.ts` |
| New UI feature | `apps/ui/src/features/<feature-name>/` |
| New reusable UI component | `apps/ui/src/components/` |
| New Zustand store | Inside the relevant feature directory |
