# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

SSHTerm — a Windows-first desktop SSH and serial terminal built with Electron + React + xterm.js, packaged as a pnpm monorepo.

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

## Monorepo Structure

Five pnpm workspaces with clear dependency flow:

```
apps/desktop    → Electron main + preload (IPC boundary, window mgmt, tray, secure storage)
apps/ui         → React workbench (xterm.js terminals, host browser, tabs/panes, Zustand state)
packages/shared → IPC channel names, Zod request/response schemas, auth/transport enums
packages/session-core → Transport abstraction (SSH via PTY, serial), session lifecycle, reconnection
packages/db     → SQLite via better-sqlite3, migrations, host/serial-profile repositories
```

Dependency direction: `desktop` → `shared`, `session-core`, `db`; `ui` → `shared`; `session-core` → `shared`.

## Architecture

**Three-layer Electron model:**
1. **Main process** (`apps/desktop/src/main/`) — bootstraps app lifecycle, registers IPC handlers, manages sessions, tray, windows. Entry: `main.ts`.
2. **Preload bridge** (`apps/desktop/src/preload/`) — exposes `DesktopApi` to renderer with Zod-validated typed IPC methods.
3. **Renderer** (`apps/ui/`) — React SPA loaded by Electron. Vite dev server on port 5173.

**IPC contract pattern:** All IPC channels and payloads are defined in `packages/shared/src/ipc/` using Zod schemas. Both preload and main validate against the same schemas. Types are inferred via `z.infer`.

**Session transport:** `session-core` provides a `SessionManager` that creates transport instances (SSH spawns system `ssh` in a node-pty, serial opens via `serialport`). Events are normalized to data/resize/status/exit regardless of transport type.

**State management:** UI uses Zustand stores — `layoutStore` (tabs/panes), `sessionRecoveryStore`, `broadcastStore`.

**Database:** SQLite with foreign keys enabled. Schema in `packages/db/src/migrations/001_init.sql`. Repositories pattern for data access.

## Testing

- **Unit tests:** Vitest 3.1 — test files live next to source as `*.test.ts(x)`. Root `vitest.workspace.ts` runs all workspaces.
- **E2E tests:** Playwright in `apps/ui/tests/` — headless Chromium, 30s timeout, auto-starts Vite dev server.
- **CI:** GitHub Actions (`.github/workflows/pr-gates.yml`) gates PRs on build + unit + Playwright.

## Key Conventions

- TypeScript strict mode everywhere (`tsconfig.base.json`), target ES2022
- Zod for all IPC validation — never pass unvalidated data across the preload bridge
- `session-core` has zero renderer dependencies — it runs only in main process
- Windows-first: NSIS installer config in `apps/desktop/electron-builder.yml`, DPAPI for secure storage
