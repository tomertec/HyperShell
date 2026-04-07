# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

HyperShell (package name: sshterm) — a Windows-first desktop SSH and serial terminal with integrated SFTP file browser, built with Electron + React + xterm.js, packaged as a pnpm monorepo.

Full documentation: [`docs/INDEX.md`](docs/INDEX.md)

## Build & Dev Commands

```bash
pnpm build                  # Build all workspaces
pnpm test                   # Run all Vitest unit tests
pnpm lint                   # Lint all workspaces

# Per-workspace
pnpm --filter @sshterm/ui test
pnpm --filter @sshterm/desktop test

# E2E (Playwright, headless Chromium)
pnpm --filter @sshterm/ui test:e2e
pnpm --filter @sshterm/ui test:e2e:headed

# CI pipelines
pnpm ci:build
pnpm ci:test
pnpm ci:test:e2e

# Windows release
pnpm release:windows:unsigned
pnpm release:windows:signed
```

**Important:** After changing main process or preload code, you must `pnpm --filter @sshterm/desktop build` and restart Electron. UI changes are picked up by Vite HMR automatically — unless Electron is loading the bundled renderer (delete `apps/desktop/dist/renderer/` to force Vite dev server in development).

## Monorepo Structure

Five pnpm workspaces with clear dependency flow:

```
apps/desktop    → Electron main + preload (IPC boundary, window mgmt, tray, secure storage)
apps/ui         → React workbench (xterm.js terminals, host browser, tabs/panes, Zustand state)
packages/shared → IPC channel names, Zod request/response schemas, auth/transport enums
packages/session-core → Transport abstraction (SSH via PTY, serial, SFTP via ssh2), session lifecycle, connection pool, network monitor
packages/db     → SQLite via better-sqlite3, migrations (001-006), repositories
```

Dependency direction: `desktop` → `shared`, `session-core`, `db`; `ui` → `shared`; `session-core` → `shared`.

## Architecture

**Three-layer Electron model:**
1. **Main process** (`apps/desktop/src/main/`) — bootstraps app lifecycle, registers 40+ IPC handlers, manages sessions, tray, windows. Entry: `main.ts`.
2. **Preload bridge** (`apps/desktop/src/preload/`) — exposes `window.sshterm` API to renderer with Zod-validated typed IPC methods. Both request and response are validated.
3. **Renderer** (`apps/ui/`) — React SPA loaded by Electron. Vite dev server on port 5173.

**IPC contract pattern:** All IPC channels and payloads are defined in `packages/shared/src/ipc/` using Zod schemas. Both preload and main validate against the same schemas. Types are inferred via `z.infer`. See [`docs/ipc-reference.md`](docs/ipc-reference.md) for the full channel list.

**Session transports:** `session-core` provides a `SessionManager` that creates transport instances:
- **SSH** — spawns system `ssh` binary in node-pty (full agent/config/proxy compatibility)
- **Serial** — opens via `serialport` npm with configurable baud/parity/flow
- **SFTP** — programmatic ssh2 library (separate from SSH terminal, handles transfers/streams)

The SFTP transport tries all candidate key files sequentially (like system ssh) and strips Windows domain prefixes from usernames. When an `Ssh2ConnectionPool` is provided, SFTP reuses pooled connections instead of creating new ones.

**Connection pooling:** `session-core` provides an `Ssh2ConnectionPool` that manages shared ssh2 connections keyed by `host:port:user`. SFTP sessions and programmatic port forwards acquire from the pool; connections are ref-counted and idle-close after 30s with no consumers.

**Network-aware auto-reconnect:** `SessionManager` integrates with a `NetworkMonitor` that probes DNS every 10s. On disconnect, if the network is down, sessions enter `waiting_for_network` state (no reconnect attempts burned). When connectivity returns, attempts reset and reconnection starts immediately. Per-host config: `autoReconnect`, `reconnectMaxAttempts`, `reconnectBaseInterval`.

**State management:** UI uses Zustand stores — `layoutStore` (tabs/panes), `settingsStore`, `sessionRecoveryStore`, `broadcastStore`, `sftpStore` (per SFTP session), `transferStore`, `tunnelStore` (port forward manager).

**Database:** SQLite with foreign keys enabled. 6 migrations in `packages/db/src/migrations/`. Repositories pattern for data access. See [`docs/data-model.md`](docs/data-model.md).

## Adding New Features

### New IPC channel
1. Channel name → `packages/shared/src/ipc/channels.ts`
2. Zod schemas → `packages/shared/src/ipc/schemas.ts` or `sftpSchemas.ts`
3. Handler → `apps/desktop/src/main/ipc/<feature>Ipc.ts`
4. Register → `apps/desktop/src/main/ipc/registerIpc.ts`
5. Preload method → `apps/desktop/src/preload/desktopApi.ts`
6. Type declaration → `apps/ui/src/types/global.d.ts`

### New database table
1. Create numbered migration in `packages/db/src/migrations/`
2. Use `column already exists` guards for idempotent DDL
3. Add repository in `packages/db/src/repositories/`

### New UI feature
1. Create directory: `apps/ui/src/features/<feature-name>/`
2. Components, stores (Zustand), hooks in that directory
3. Wire into `App.tsx` or relevant parent
4. Call backend via `window.sshterm.<method>()`

## Testing

- **Unit tests:** Vitest 3.1 — test files live next to source as `*.test.ts(x)`. Root `vitest.config.ts` runs all workspaces.
- **E2E tests:** Playwright in `apps/ui/tests/` — headless Chromium, 30s timeout, auto-starts Vite dev server.
- **CI:** GitHub Actions (`.github/workflows/pr-gates.yml`) gates PRs on build + unit + Playwright.

## Key Conventions

- TypeScript strict mode everywhere (`tsconfig.base.json`), target ES2022
- Zod for all IPC validation — never pass unvalidated data across the preload bridge
- `session-core` has zero renderer dependencies — it runs only in main process
- Windows-first: NSIS installer config in `apps/desktop/electron-builder.yml`, DPAPI for secure storage
- UI styling: Tailwind CSS v4 with custom theme vars in `apps/ui/src/index.css`
- Animations: Framer Motion for modals/transitions
- Terminal font: JetBrains Mono (logo), IBM Plex Mono (terminal)

## Known Gotchas

- **SFTP empty file list** — Usually a CSS height collapse, not an IPC issue. Check computed height of SFTP pane containers in DevTools. Fix: ensure `PaneView` uses `h-full` not just `flex-1`.
- **SFTP auth failure** — SSH terminal uses system `ssh` binary (full agent support), but SFTP uses ssh2 library (needs explicit credentials). They resolve auth differently.
- **Bundled vs dev renderer** — If `apps/desktop/dist/renderer/index.html` exists, Electron loads it instead of the Vite dev server. Delete that directory during development to get HMR.
- **Native module version mismatch** — After Node.js updates, run `pnpm --filter @sshterm/desktop rebuild:native`.
- **Auto-reconnect not triggering** — Check that `autoReconnect` is enabled on the host record (DB) and that the network monitor hasn't paused reconnection (`waiting_for_network` state). The connection pool ref-counts connections, so closing one consumer doesn't necessarily close the underlying ssh2 client.
