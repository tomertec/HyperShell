# Getting Started

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 22+ | [nodejs.org](https://nodejs.org) |
| pnpm | 10.8+ | `npm install -g pnpm` |
| Git | 2.40+ | [git-scm.com](https://git-scm.com) |
| Python | 3.x | Required by node-gyp for native modules |
| Visual Studio Build Tools | 2022 | Required for `better-sqlite3`, `node-pty`, `serialport` on Windows |

## Quick Start

```bash
# Clone and install
git clone <repo-url> hypershell
cd hypershell
pnpm install

# Rebuild native modules for Electron
pnpm --filter @hypershell/desktop rebuild:native

# Start development (terminal 1: Vite dev server)
pnpm --filter @hypershell/ui dev

# Start development (terminal 2: Electron)
pnpm --filter @hypershell/desktop dev
```

The Electron app opens and loads the UI from `http://localhost:5173` (Vite dev server with HMR).

## Verify It Works

1. The HyperShell window should open with the animated logo welcome screen
2. Press `Ctrl+K` to open Quick Connect — confirms the UI renders
3. Double-click a host in the sidebar (or add one) to open an SSH session
4. The terminal should connect and show a shell prompt

## Build Commands

```bash
pnpm build          # Build all workspaces (shared → session-core → db → ui → desktop)
pnpm test           # Run all Vitest unit tests
pnpm lint           # Lint all workspaces

# Per-workspace
pnpm --filter @hypershell/ui test
pnpm --filter @hypershell/ui test:e2e
pnpm --filter @hypershell/desktop test
pnpm --filter @hypershell/session-core test
pnpm --filter @hypershell/db test
```

## Project Layout

```
hypershell/
├── apps/desktop/     # Electron main + preload
├── apps/ui/          # React renderer (Vite)
├── packages/shared/  # IPC contracts (Zod schemas)
├── packages/session-core/  # Transport layer (SSH, serial, SFTP)
├── packages/db/      # SQLite database + repositories
└── docs/             # This documentation
```

See [Project Structure](./project-structure.md) for detailed breakdown.

## Development Workflow

1. **UI changes** — Edit files in `apps/ui/src/`. Vite HMR updates the renderer instantly.
2. **Main process changes** — Edit files in `apps/desktop/src/main/`. Rebuild with `pnpm --filter @hypershell/desktop build`, then restart Electron.
3. **Preload changes** — Edit `apps/desktop/src/preload/`. Same rebuild + restart as main process.
4. **Shared/session-core/db changes** — Rebuild the package, then rebuild desktop: `pnpm build`.
5. **IPC contract changes** — Update schemas in `packages/shared/src/ipc/`, then update both preload (desktop) and UI consumers.

## Common Tasks

### Add a new IPC channel

1. Define the channel name in `packages/shared/src/ipc/channels.ts`
2. Add Zod request/response schemas in `packages/shared/src/ipc/schemas.ts` (or `sftpSchemas.ts`)
3. Add the handler in the appropriate `apps/desktop/src/main/ipc/*Ipc.ts` file
4. Register the channel in `registerIpc.ts`
5. Expose the method in `apps/desktop/src/preload/desktopApi.ts`
6. Add the method to `apps/ui/src/types/global.d.ts` (`window.hypershell`)
7. Call it from the UI

### Add a database migration

1. Create a new migration file in `packages/db/src/migrations/` (numbered sequentially)
2. Migrations run automatically on database open via `openDatabase()`
3. Use `column already exists` guards for idempotent migrations

### Add a new UI feature

1. Create a directory under `apps/ui/src/features/<feature-name>/`
2. Create components, stores (Zustand), and hooks
3. Wire into `App.tsx` or the relevant parent component
4. Add any needed IPC calls through `window.hypershell`
