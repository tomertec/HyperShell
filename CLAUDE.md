# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

HyperShell (package name: hypershell) — a Windows-first desktop SSH and serial terminal with integrated SFTP file browser, built with Electron + React + xterm.js, packaged as a pnpm monorepo.

Full documentation: [`docs/INDEX.md`](docs/INDEX.md)

## Build & Dev Commands

```bash
pnpm build                  # Build all workspaces
pnpm test                   # Run all Vitest unit tests
pnpm lint                   # Lint all workspaces

# Per-workspace
pnpm --filter @hypershell/ui test
pnpm --filter @hypershell/desktop test

# E2E (Playwright, headless Chromium)
pnpm --filter @hypershell/ui test:e2e
pnpm --filter @hypershell/ui test:e2e:headed

# CI pipelines
pnpm ci:build
pnpm ci:test
pnpm ci:test:e2e

# Windows release (unsigned)
pnpm release:windows:unsigned
```

**Important:** After changing main process or preload code, you must `pnpm --filter @hypershell/desktop build` and restart Electron. UI changes are picked up by Vite HMR automatically — unless Electron is loading the bundled renderer (delete `apps/desktop/dist/renderer/` to force Vite dev server in development).

## Monorepo Structure

Five pnpm workspaces with clear dependency flow:

```
apps/desktop    → Electron main + preload (IPC boundary, window mgmt, tray, secure storage)
apps/ui         → React workbench (xterm.js terminals, host browser, tabs/panes, Zustand state)
packages/shared → IPC channel names, Zod request/response schemas, auth/transport enums
packages/session-core → Transport abstraction (SSH via PTY, serial, SFTP via ssh2), session lifecycle, connection pool, network monitor, tmux probe
packages/db     → SQLite via better-sqlite3, migrations (001-016), repositories
```

Dependency direction: `desktop` → `shared`, `session-core`, `db`; `ui` → `shared`; `session-core` → `shared`.

## Architecture

**Three-layer Electron model:**
1. **Main process** (`apps/desktop/src/main/`) — bootstraps app lifecycle, registers 40+ IPC handlers, manages sessions, tray, windows. Entry: `main.ts`.
2. **Preload bridge** (`apps/desktop/src/preload/`) — exposes `window.hypershell` API to renderer with Zod-validated typed IPC methods. Both request and response are validated.
3. **Renderer** (`apps/ui/`) — React SPA loaded by Electron. Vite dev server on port 5173.

**IPC contract pattern:** All IPC channels and payloads are defined in `packages/shared/src/ipc/` using Zod schemas. Both preload and main validate against the same schemas. Types are inferred via `z.infer`. See [`docs/ipc-reference.md`](docs/ipc-reference.md) for the full channel list.

**Session transports:** `session-core` provides a `SessionManager` that creates transport instances:
- **SSH** — spawns system `ssh` binary in node-pty (full agent/config/proxy compatibility)
- **Serial** — opens via `serialport` npm with configurable baud/parity/flow
- **Local** — spawns a local shell (PowerShell, cmd.exe, WSL, Git Bash) in node-pty via the shared `ptyProcess` core. Profiles are auto-detected on startup and stored in `local_profiles`; the renderer may only pass a `profileId`, never an executable.
- **SFTP** — programmatic ssh2 library (separate from SSH terminal, handles transfers/streams)

The SFTP transport tries all candidate key files sequentially (like system ssh) and strips Windows domain prefixes from usernames. When an `Ssh2ConnectionPool` is provided, SFTP reuses pooled connections instead of creating new ones.

**Connection pooling:** `session-core` provides an `Ssh2ConnectionPool` that manages shared ssh2 connections keyed by `host:port:user`. SFTP sessions and programmatic port forwards acquire from the pool; connections are ref-counted and idle-close after 30s with no consumers.

**Network-aware auto-reconnect:** `SessionManager` integrates with a `NetworkMonitor` that probes DNS every 10s. On disconnect, if the network is down, sessions enter `waiting_for_network` state (no reconnect attempts burned). When connectivity returns, attempts reset and reconnection starts immediately. Per-host config: `autoReconnect`, `reconnectMaxAttempts`, `reconnectBaseInterval`.

**Tmux session detection:** Per-host opt-in (`tmuxDetect` on host record). Before connecting, spawns a one-shot `ssh host 'tmux ls -F ...'` via `child_process.execFile` (reuses `buildSshArgs()` for identical auth). Parses output into session list, shows a `TmuxSessionPicker` modal. On attach, sends `tmux attach -t '<name>'` as terminal input after SSH connects. Requires key-based auth — password-only hosts are skipped. All probe failures silently fall back to normal connection. Key files: `session-core/tmux/tmuxProbe.ts`, `desktop/ipc/tmuxIpc.ts`, `ui/features/tmux/TmuxSessionPicker.tsx`.

**Active-process tab titles:** Local tabs get their title from the pty's process
tree — `SessionManager` runs a 1s poller (`session-core/processTitle/`) over
`@vscode/windows-process-tree`, takes the deepest descendant, and emits a
`process-title` session event. The Windows adapter requests command lines and
uses a cached package-metadata resolver (`processTitle/nodeCliName.ts`) to map a
Node entry script to its exact npm `bin` name, so apps such as Claude and Pi do
not both collapse to `node`; unresolved scripts safely retain the executable
name. Raw command lines never leave `session-core`. `pickForegroundName`
returns `null` (deferring to the OSC title) for two different reasons, kept as
separate name sets: the deepest process is a shell/wrapper
(`SHELL_AND_WRAPPER_NAMES` — nothing is running), or
it's a remote/relay client like `ssh`/`mosh`/`plink`/`telnet`
(`PASSTHROUGH_NAMES` — something is running, but only the far end knows its
name, e.g. `pwsh → ssh` masking a remote `llmtop`). SSH tabs instead receive a
one-line shell hook
(`session-core/shellIntegration/bootstrap.ts`) typed into the pty on every
`connected` transition (including reconnects, since each is a fresh remote
shell), which emits ordinary OSC titles per command; it is skipped for
tmux-attach sessions and for password-authenticated hosts (the bootstrap write
would race `sshPtyTransport`'s password-prompt watcher on the same pty).
Injection is a handshake, because typing into a tty mid-init lands in both the
login tty's canonical buffer and the line editor's redraw (echoed twice), or
answers an interactive question like oh-my-zsh's "update? [Y/n]": after 500ms
of quiet (`SHELL_INTEGRATION_QUIET_MS`) *and* a prompt-shaped output tail
(`looksLikePrompt` — last visible output doesn't end in a newline), a one-row
self-erasing probe is typed; only when its OSC 777 marker's control bytes come
back (echo can't fake them — it shows literal backslashes) is the real
bootstrap written, retried up to 3 probes then given up. User input during a
pending handshake also gives up (`SessionManager.write`): their text is in the
remote line buffer, anything injected after it would merge into one broken
command, and no later quiet window can prove the buffer emptied again. Both probe and
bootstrap erase their own echo: each ends with a `printf` of cursor-up +
erase-to-end, the bootstrap's sized from the pty width at write time (biased a
row or two high, since the remote prompt length is unknown), so the snippet
vanishes and the prompt redraws in place, MOTD intact. Display order is
`processTitle ?? dynamicTitle ?? title`
(`resolveTabTitle`), read at four sites — tab label, tab tooltip, status bar,
broadcast bar. Per-host opt-out via the `shellIntegration` column (default on);
global display toggle via `general.showActiveProcess` (default on), which gates
only the process title — an OSC shell title still shows when it's off.

**State management:** UI uses Zustand stores — `layoutStore` (tabs/panes, drag-and-drop reorder), `settingsStore`, `sessionRecoveryStore`, `broadcastStore`, `sftpStore` (per SFTP session), `transferStore`, `tunnelStore` (port forward manager), `snippetStore` (snippets panel).

**Session logging:** `loggingIpc.ts` provides a `createSessionLogger()` that intercepts terminal data events in `registerIpc.ts`, strips ANSI escape sequences, and writes to user-chosen files. Controlled per-session via recording button in TerminalPane (visibility controlled by `general.showRecordingButton` setting).

**Toast notifications:** Uses `sonner` library. `<Toaster>` is mounted in App.tsx. Import `toast` from `sonner` to show notifications.

**Keyboard shortcuts:** Global shortcuts registered in App.tsx keydown handler: `Ctrl+Shift+S` (snippets panel), `Ctrl+Shift+D` (split horizontal), `Ctrl+Shift+E` (split vertical), `Ctrl+Shift+W` (close pane), `Ctrl+Shift+[/]` (navigate panes). Handler logic in `paneShortcuts.ts`.

**Database:** SQLite with foreign keys enabled. 16 migrations in `packages/db/src/migrations/`. Repositories pattern for data access. See [`docs/data-model.md`](docs/data-model.md).

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
4. Call backend via `window.hypershell.<method>()`

## Testing

- **Unit tests:** Vitest 3.1 — test files live next to source as `*.test.ts(x)`. Root `vitest.config.ts` runs all workspaces.
- **Browser E2E:** Playwright in `apps/ui/tests/` — headless Chromium, 30s timeout, auto-starts Vite dev server. Fast feedback on renderer behaviour and accessibility (`accessibility.spec.ts` runs axe). It cannot see anything below the renderer.
- **Electron E2E:** Playwright in `apps/desktop/tests/` via `playwright.electron.config.ts` — boots the real shell to cover what Chromium cannot: preload bridge availability, IPC schema enforcement, native modules, renderer/Node isolation, SQLite persistence across restarts, editor-window creation, and a full session lifecycle against a local TCP echo server.
  ```bash
  pnpm --filter @hypershell/desktop run build:bundle   # dist/main + dist/preload + dist/renderer
  pnpm --filter @hypershell/desktop rebuild:native     # better-sqlite3 etc. against Electron's ABI
  pnpm ci:test:e2e:electron
  ```
  Every test runs against a fresh temp directory via `HYPERSHELL_DATA_DIR` (see `apps/desktop/src/main/appDataDir.ts`). That override exists because the database lives under `appData/HyperShell`, which Electron's `--user-data-dir` switch does **not** move — without it a test run would mutate your real hosts.
- **CI:** GitHub Actions (`.github/workflows/pr-gates.yml`) gates PRs on build + unit + browser Playwright + a Windows `electron-e2e` job.

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
- **Native module version mismatch** — After Node.js updates, run `pnpm --filter @hypershell/desktop rebuild:native`.
- **Auto-reconnect not triggering** — Check that `autoReconnect` is enabled on the host record (DB) and that the network monitor hasn't paused reconnection (`waiting_for_network` state). The connection pool ref-counts connections, so closing one consumer doesn't necessarily close the underlying ssh2 client.
- **A local shell ignores your PowerShell profile** — the profile row has non-empty `args`. Detected profiles must launch bare (`args = []`); `-NoProfile`/`-Command`/`-File` all skip `$PROFILE`.
- **WSL distros missing from the Local section** — `wsl.exe -l -q` emits UTF-16LE. Decoding it as UTF-8 yields NUL-interleaved names that match nothing.
- **Blank terminal with the WebGL renderer** — never set a CSS/inline `background-color` on the canvases inside `.xterm-screen`. The WebGL addon stacks a transparent `.xterm-link-layer` canvas above the text canvas; painting it opaque hides every glyph. Paint the container, `.xterm` root, and `.xterm-viewport` instead (the theme background covers the cells).
