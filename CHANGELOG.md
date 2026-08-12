# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/) and this project uses [Semantic Versioning](https://semver.org/).

## [0.1.6] - 2026-04-16

- Merge feat/TF-15: GitHub integration test scaffold finalized.

## [Unreleased]

### Fixed

- **Overflowed tabs are reachable again** — past roughly seven tabs the tab strip scrolls, but its native scrollbar is hidden on purpose (it stole layout height and detached the active tab from the terminal below it), which left a mouse wheel gesture over the strip as the only way to reach a tab that had scrolled out of view. `‹` / `›` chevrons now appear at the strip's edges while it can scroll that way and page it by 80% of the visible width, and the active tab scrolls itself into view whenever it changes — so opening a tab or switching by keyboard no longer leaves the active tab clipped past the right edge.

## [0.3.1] - 2026-08-11

### Added

- **Tab title colors** — a tab can be assigned one of seven colors from its context menu, saved against the tab's title rather than the session, so every tab that ever carries that title comes up in the same color. The color tints the title, the transport icon, and the active-tab indicator, which makes a wall of similarly-named tabs scannable at a glance.
- **Per-tab terminal font size** — `Ctrl+=` / `Ctrl+-` / `Ctrl+0` now resize only the focused terminal instead of moving the global setting and every other terminal with it. Each tab starts from the global default and keeps its own size, which is stored in the saved workspace layout so a restored session comes back at the sizes you left it. The step also drops from 1px to 0.5px, since 13px to 14px is a coarse jump at terminal sizes; the settings dropdown offers the same half-point grid.

### Changed

- **xterm pinned to the 6.1 beta line** — `@xterm/xterm` 6.1.0-beta.291 and its matching addons, for the reflow and renderer fixes the terminal work depends on. Pinned exactly rather than by caret, since betas do not follow semver ranges safely.

### Fixed

- **Stale rows after a local pane gets wider** — ConPTY reflows its buffer with conhost's algorithm on every width change and then emits only the rows it believes changed. xterm.js reflows differently, so the rows ConPTY skips survived as ghosts: stale fragments of a full-screen TUI left behind after a pane or window widened. Widening now triggers a two-column narrow-and-restore round trip once the resize burst settles, which makes ConPTY and the running program redraw over every stale row.
- **Shell integration no longer corrupts the first command you type** — typing while the SSH shell-integration handshake was still pending left your text in the remote line buffer, and the hook written after it merged into one broken command whose self-erase never ran. The first keystroke now cancels the handshake outright; ordinary OSC titles still work.
- **SFTP directory entries that escape their directory are dropped** — entry names come from the remote server and callers join them into local paths for downloads and sync, so a hostile server could answer `readdir` with `../../evil` and write outside the destination. Names that are not a single path component are now rejected at the transport boundary.

## [0.3.0] - 2026-08-07

### Added

- **Local shell sessions** — a new **Local** transport opens PowerShell 7, Windows PowerShell, `cmd.exe`, Git Bash, and installed WSL distros as terminal tabs alongside SSH and serial. Profiles are auto-detected on startup and stored in the database (migration 015), then surface in a **Local** sidebar section (drag to reorder), the new-tab menu, the command palette, and the welcome screen. A profile editor covers name, icon, starting directory, and per-profile environment variables including `HOME`/`USERPROFILE` overrides. The renderer may only ever pass a `profileId`, never an executable, so the choice of program to run stays in the main process. Tabs close themselves when the shell exits cleanly.
- **Dynamic tab titles** — terminal tabs now follow the OSC title the shell emits, so a tab renames itself as you change directory or start a program instead of showing the host name forever. Titles are sanitized before display, and the full host/user/path detail moved into a richer tooltip. Tabs also gained transport icons tinted by connection state, roomier spacing, and fade truncation.
- **Active-process tab titles** — a local tab shows the program actually running in it (`vim`, `htop`, `claude`), resolved by polling the pty's process tree once a second; Node-based CLIs resolve to their npm `bin` name instead of all collapsing to `node`. SSH tabs get the same behaviour from a one-line shell hook injected on connect, which makes the remote shell emit ordinary OSC titles per command. The hook is skipped for tmux attaches and password-authenticated hosts, can be disabled per host (migration 017), and the whole display is gated by **Settings → General → Show active process**.
- **WebGL terminal rendering** — terminals load the xterm WebGL renderer when the GPU allows it and fall back silently to the DOM renderer when it does not.
- **Nerd Font glyphs and Unicode grapheme clustering** — the terminal font stack appends Nerd Font families so private-use glyphs from oh-my-posh, starship, and Terminal-Icons render instead of tofu, and the graphemes addon (pinned Unicode version) keeps emoji and combining sequences from splitting across cells.
- **Collapsible host groups** — sidebar groups collapse and expand with a host count, persisted per group. Host rows gained a hover action that opens SFTP directly, and empty lists now show actionable empty states instead of blank space.
- **Electron end-to-end tests** — a Playwright suite that boots the real shell now covers what headless Chromium cannot: preload bridge availability, IPC schema enforcement, native modules, renderer/Node isolation, SQLite persistence across restarts, editor-window creation, local shell sessions, process-title events, hosts CRUD, backup/restore, and a full session lifecycle against a local TCP echo server. Each test runs against a fresh temp data directory via `HYPERSHELL_DATA_DIR`.

### Changed

- **App-wide UI pass** — shared `Button`, `IconButton`, `Input`, `Select`, `SectionLabel`, `Kbd`, and `EmptyState` primitives now back the host form and dialogs, import dialogs, tmux picker, settings panel, theme editor, backup panel, and welcome screen, layered on new elevation, motion, and focus-ring design tokens. Modals share a size/footer API, settings rows share one anatomy, the tab bar and status bar moved to semantic state colors (latency tinted by threshold), tag filter chips only appear in filter mode, and host export/import moved into the Hosts header overflow menu.
- **Preload API split into per-feature slices** — `desktopApi.ts` is now a merger over per-feature slices (sessions, hosts, SFTP, groups/tags, host profiles, serial, filesystem, workspace, SSH keys, port forwards, recording, settings, updates, system) sharing a `createSubscription` helper, instead of one long file.
- **Dependency audit remediation** — 15 `pnpm audit` findings resolved through in-range updates.

### Fixed

- **Terminal rendering artifacts** — xterm no longer forces `convertEol`, which had been converting every line feed to CR+LF regardless of the pty's termios settings. Full-screen applications could not preserve a nonzero cursor column across a line feed, so incremental redraws updated the wrong cells and left stale text behind until the terminal was resized.
- **Blank terminal under the WebGL renderer** — the CSS that painted every canvas inside `.xterm-screen` also painted the transparent link-layer canvas the WebGL addon stacks above the text, hiding every glyph. The theme background is now painted on the container, the `.xterm` root, and the viewport only.
- **Shell-integration injection no longer lands mid-init** — typing the SSH hook into a tty that is still booting either echoed it twice or answered an interactive prompt such as oh-my-zsh's "update? [Y/n]". Injection is now a handshake: after a quiet window with a prompt-shaped output tail, a one-row self-erasing probe is typed, and the real hook is written only once the probe's control bytes come back (bounded to three attempts). Both probe and hook erase their own echo, so the prompt redraws in place with the MOTD intact.
- **Docker Desktop internal WSL distros excluded** — `docker-desktop` and its data distro no longer appear as launchable local shells.
- **Local profiles persist to the real database** — detected profiles were written to a fallback store; startup reconciliation is also now unbrickable when a detected profile conflicts with a stored one.
- **SSH config import dialog resets on reopen** — the dialog no longer reopens holding the previous import's selection and results.
- **Collapsed-group hosts excluded from the sidebar drag context** — hosts hidden inside a collapsed group are no longer registered as sortable items, which had broken drag-and-drop reordering.
- **New-tab dropdown no longer clipped**, the reopen toggle works, and local shell rows have a dedicated drag handle instead of nesting drag listeners on the connect button (an accessibility violation, and unreliable on the disabled variant).

## [0.2.6] - 2026-06-06

### Added

- **App themes** — Settings → Appearance now offers 15 full-application color themes that re-skin the entire UI chrome (sidebar, tabs, panels, dialogs), grouped into **Dark** and **Light** with a "Follow system" option. Dark: HyperShell, Catppuccin Mocha / Macchiato / Frappé, Nord, Dracula, Tokyo Night, Cherry, Ocean, Amber, Mint. Light: HyperShell Light, Latte, Rosé Pine Dawn, Gruvbox Light. Each theme defines the complete CSS-variable palette (via a `data-theme` id plus a `data-variant` light/dark attribute that drives the editor and selection styling), so light themes never inherit dark values. The terminal color scheme remains an independent picker. The previous System/Light/Dark toggle is replaced — existing `appearance.themeMode` settings migrate automatically (light → HyperShell Light, dark → HyperShell, system → Follow system).

### Changed

- **Update notification moved into the sidebar footer** — the floating bottom-center update banner is removed. The footer version label is now update-aware: when an update is available, `HyperShell>_ v{version}` morphs — via a terminal-style character-decode animation — into a clickable `Update>_ vX.Y.Z` prompt that keeps the `>_` logo motif. Clicking runs the action directly (download → `Downloading>_ NN%` with a thin accent progress underline → `Restart>_ ready` to install; manual updates open the release page). The notification is frameless and matches the logo styling; the footer Settings button is vertically centered on the same line.

## [0.2.5] - 2026-05-31

### Added

- **Editor right-click context menu** — right-clicking inside the SFTP file editor now opens a context menu with the standard editing actions: Cut, Copy, Paste, Select All, Undo, Redo, Find / Replace, Go to Line, and Save. Cut/Copy disable when there is no selection and Undo/Redo/Save disable when unavailable, reflecting editor state at the moment of the click. Clipboard failures surface as toast notifications.

## [0.2.4] - 2026-05-27

### Removed

- **Unused Windows code-signing tooling** — dropped the now-dead signed packaging scripts and the signing-environment verifier, since release builds are unsigned as of 0.2.3.

## [0.2.3] - 2026-05-27

### Changed

- **Windows installers are no longer code-signed** — release builds now ship unsigned, consistent with the macOS builds. Windows SmartScreen may show an "unknown publisher" prompt on first install; in-app auto-update is unaffected (downloads remain HTTPS-fetched and sha512-verified against `latest.yml`).

## [0.2.2] - 2026-05-27

### Fixed

- **Windows auto-update no longer stalls after download** — set `win.verifyUpdateCodeSignature: false` in the electron-builder config. With the self-signed certificate, `Get-AuthenticodeSignature` reports a non-`Valid` status (untrusted root), so electron-updater rejected the downloaded installer before reaching "Restart & install". Disabling the publisher-signature check lets the update install; downloads remain HTTPS-fetched and sha512-verified against `latest.yml`. Note: the currently-installed build still verifies, so one new build must be installed manually as a fresh bootstrap; releases after it update automatically.

## [0.2.1] - 2026-05-27

### Fixed

- **Welcome quick-connect username field visible** — SSH quick connect on the main welcome screen now lays out the port and username fields in fixed/flexible columns so the username input no longer overflows out of view.

## [0.2.0] - 2026-05-27

### Added

- **In-app auto-update via GitHub Releases** — HyperShell now checks GitHub Releases on launch and roughly every 4 hours, and can update itself. On **Windows and Linux** it updates in-app (notify + one-click): a dismissible banner offers Download → progress → **Restart & install**, backed by `electron-updater` (Authenticode publisher verification on Windows, sha512 verification of the AppImage on Linux). On **macOS** (unsigned builds) the banner instead links to the release page for a manual download. A new **Settings → Updates** section shows the current version, a manual "Check for updates" button, and the last-checked time. Release builds now publish `latest.yml` / `latest-linux.yml` + `.blockmap` metadata to each GitHub Release (uploaded after the installer to avoid a race). See [`docs/auto-update.md`](docs/auto-update.md) — note the one-time bootstrap caveat: the **first** auto-update-enabled release must be installed manually; every release after it updates automatically.

## [0.1.9] - 2026-05-02

### Changed

- **Dependency security updates** — upgraded Electron, electron-builder, Vite, and better-sqlite3, then refreshed the pnpm lockfile. Added a pnpm override for PostCSS so `pnpm audit --audit-level moderate` reports no known vulnerabilities.
- **UI build now type-checks React code** — `@hypershell/ui` build runs `tsc --noEmit` before Vite, preventing renderer TypeScript regressions from passing CI/build gates.
- **TypeScript dead-code checks enabled** — root compiler config now enables `noUnusedLocals` and `noUnusedParameters`; unused imports, stale helpers, and test-only dead code were removed across desktop, session-core, db, and UI workspaces.

### Fixed

- **Renderer URL allowlist tightened** — desktop renderer loading now allows only the exact packaged renderer file or the exact dev origin (`http://127.0.0.1:5173`), reducing preload API exposure risk.
- **SFTP preload logging removed** — `sftpList` no longer logs file names or raw response samples during normal operation or validation failures.
- **Renderer type-safety regressions fixed** — tmux detection, host import defaults, transfer event narrowing, terminal network state handling, tunnel store updates, host port-forward payloads, settings tests, and global app-version typing now pass strict UI type-checking.
- **Terminal focus restored after tab and snippet actions** — switching terminal tabs now refits and focuses the visible xterm instance, and sending a snippet returns focus to the active terminal session so pressing Enter submits to the terminal instead of the snippets panel.

## [0.1.8] - 2026-04-24

## [0.1.7] - 2026-04-24

### Added

- **Light theme** — professional light mode with muted cool-gray palette. Three-way toggle in Settings → Appearance: System (follows OS preference), Light, or Dark. Accent color adapts per mode (sky-400 dark / sky-600 light). Host tag colors shift for contrast on gray backgrounds. Native window controls update to match. Status bar spans full window width.
- **Solarized Light terminal theme** — new built-in terminal theme. Terminal theme is independent of app theme — any combination works.
- **`app:set-theme` IPC channel** — renderer notifies main process on theme change to update native title bar overlay and window background color.

### Changed

- **Host tag colors use CSS variables** — `.host-color-*` and `.color-swatch-*` classes now reference `--host-*` variables instead of hardcoded hex, enabling per-theme overrides.
- **StatusBar moved to AppShell** — status bar now renders below the sidebar + main content row, spanning full window width with a continuous top border.
- **SSH2 connection pool wired into runtime** — SFTP sessions now receive a shared main-process connection pool instance, and `connectionPool:stats` returns live pool metrics instead of a placeholder response.
- **Desktop DB bootstrap now uses shared migration runner** — main-process host DB initialization now delegates to `@hypershell/db` `openDatabase(...)`, reducing duplicate bootstrap logic and centralizing schema setup behavior.
- **Migration error handling tightened** — idempotent migration steps now ignore only known duplicate/already-exists cases and rethrow unexpected SQL errors.
- **Electron renderer sandbox enabled for main/editor windows** — both BrowserWindow instances now set `webPreferences.sandbox = true` for stronger process isolation.
- **`rebuild:sqlite:electron` script made version-agnostic** — replaced hardcoded pnpm store path with the desktop workspace native rebuild command.

### Fixed

- **Hardcoded colors in HostsView, PortForwardProfileForm, TransferPopup, StatusBar** — inline styles with hex/rgba values converted to Tailwind theme token classes so they adapt to light/dark mode.
- **CodeMirror editor respects app theme** — SFTP file editor uses default light theme when app is in light mode, oneDark when dark.
- **Title bar overlay height reduced to 34px** — prevents the native overlay from covering the separator line at non-100% DPI scaling (e.g. 115%).
- **SFTP drag-out cache filename collisions** — temp files now include a deterministic cache-key hash, preventing stale/wrong file reuse when different remote paths share the same basename.
- **Password whitespace preservation** — host password handling no longer trims leading/trailing whitespace before persistence, avoiding authentication failures for credentials where spaces are significant.
- **Reconnect attempt reset race** — reconnect counters now reset only after a stable connected window instead of immediately on optimistic status events, preventing reconnect loops from exhausting protections incorrectly.
- **`fsStat` IPC contract alignment** — preload and renderer typings now use the path request schema/type for `fsStat`, matching main-process parsing behavior.
- **SFTP host-key verification fails closed on probe errors** — when the host-key probe fails for non-verification reasons and no previously trusted fingerprints exist, the connection is now blocked instead of proceeding without verification.
- **Local filesystem rename symlink escape** — `assertPathAllowed` now resolves the parent directory for non-existent targets (e.g. rename destinations), preventing symlinked parents from escaping allowed filesystem roots. The rename handler also uses the sanitized path instead of the raw request path.
- **Restore Backup command-palette action wired up** — the "Restore Backup" command now performs the full restore flow (file dialog → confirmation → restore → toast feedback) instead of only opening the dialog.
- **Network monitor runs immediate probe on startup** — `createNetworkMonitor` now probes connectivity immediately instead of assuming online, preventing `SessionManager` from burning reconnect attempts before the first interval probe detects a down network.
- **Host-key verification extracted and tested** — `verifyHostKey` extracted from SFTP connect handler for direct unit testing. New tests cover probe-failure fail-closed, trusted-fingerprint fallback, new host detection, key-change detection, and matching trusted key. Network monitor tests cover immediate startup probe offline/online transitions. Command-palette tests verify backup restore/create commands invoke their callbacks.
- **Network-aware reconnect wired in production** — desktop main process now creates `SessionManager` with a real `NetworkMonitor`, enabling `waiting_for_network` behavior and reconnect-on-connectivity-restore outside tests.
- **Backup creation is now WAL-safe** — database backups no longer copy only the main `.db` file. Backup and auto-backup now use SQLite-consistent online backup semantics (`better-sqlite3` backup API with `VACUUM INTO` fallback) to avoid missing recent committed data in WAL mode.
- **Backup restore is rollback-safe** — restore flow now performs a safer swap (`current -> rollback`, `restore-temp -> current`) and automatically restores the original database if replacement fails mid-operation, preventing a missing primary DB on error.
- **Network probe race condition hardened** — `NetworkMonitor` now ignores stale out-of-order probe completions via a monotonic probe token so older async DNS results cannot overwrite newer connectivity state.
- **Restore Backup UI command hardened** — restore command now catches dialog-stage failures too (not only restore IPC failures) and ignores concurrent restore attempts via an in-flight guard.
- **SCP host-key verification no longer bypassed** — native `scp` transfers now use a real known-hosts file with `StrictHostKeyChecking=accept-new` instead of disabling verification (`StrictHostKeyChecking=no`, `/dev/null`).
- **Filesystem dialog IPC now fully schema-validated** — `fsShowSaveDialog` and `fsShowOpenDialog` requests/responses are validated via shared Zod schemas in both preload and main process.
- **SSH key IPC filesystem scope hardened** — `sshKeys:generate`, `sshKeys:getFingerprint`, and `sshKeys:remove` now enforce `.ssh`-scoped paths; `sshKeys:convertPpk` now requires absolute non-device `.ppk` paths within user-safe roots.
- **Backup destination policy enforced** — `backup:create` / `backup:restore` now require absolute non-device SQLite paths (`.db`/`.sqlite`/`.sqlite3`) within user-safe roots, while restore also accepts paths selected through the main-process backup open dialog.
- **Path-root boundary checks hardened** — logging and recording export now use boundary-aware root containment checks instead of naive string-prefix matching, blocking sibling-prefix bypasses.
- **CSV export formula injection mitigated** — host CSV export now neutralizes formula-leading cells (`=`, `+`, `-`, `@`) and control-character-prefixed formulas before escaping.

## [0.1.5] - 2026-04-13

### Fixed

- **Host metrics for SSH config aliases and ProxyJump hosts** — status bar metrics (CPU, memory, disk, uptime) now work for hosts defined as SSH config aliases (e.g., `ssh medalink-tunnel`) and hosts behind ProxyJump. The stats collector now uses the system SSH binary instead of the ssh2 library, matching how the terminal connection itself works.

## [0.1.4] - 2026-04-12

### Added

- **SFTP status bar** — each pane now shows a footer with folder count, file count, and total size. When items are selected, selection stats are shown on the right side.
- **SFTP mouse-drag multi-select** — click and drag across rows to select a range of files/folders. Ctrl+Click (toggle) and Shift+Click (range) continue to work. Drag-and-drop file transfer is preserved for already-selected items.
- **Local file explorer context menu** — right-click on local files now offers Open (files open with default app, directories navigate), Rename, Delete (moves to Recycle Bin), Copy Path, Show in Explorer, and Upload to Remote.
- **Auto-hide completed transfers setting** — new toggle in Settings → General → Transfers to automatically hide the SFTP transfer popup when all transfers finish.
- **Auto-refresh after transfers** — both local and remote panes now refresh automatically when a file upload or download completes.

### Fixed

- **All drives now visible in local pane** — the drive selector shows all accessible drives (D:\, E:\, etc.), not just C:\.
- **SFTP delete fails on files** — deleting a single file via the remote context menu no longer fails with "No such file". The recursive delete logic now stats the path first and uses `unlink` for files instead of attempting to list them as directories.

## [0.1.3] - 2026-04-11

### Changed

- **SFTP transfers use native SCP** — file downloads and uploads now use the system `scp` binary instead of ssh2's pure-JavaScript SFTP streams, achieving ~100 MB/s on LAN (previously ~1.5 MB/s). Falls back to ssh2 streams for password-only auth, resume transfers, or when `scp` binary is unavailable.

### Fixed

- **SFTP transfer conflict resolution UI** — downloading folders with existing local files no longer hangs on "Waiting for conflict resolution". The transfer popup now shows inline action buttons (Overwrite, Skip, Rename) when a file conflict is detected, with "Overwrite all" and "Skip all" options to batch-resolve remaining conflicts.
- **SFTP path state lost on tab switch** — navigating to folders in the SFTP pane, switching to an SSH tab, and switching back no longer resets both panes to root. SFTP tabs now stay mounted (CSS visibility) like terminal tabs instead of unmounting and disposing their store.

## [0.1.2] - 2026-04-11

### Added

- **Tmux session detection** — detect and attach to existing tmux sessions on remote hosts before connecting.
  - Per-host opt-in toggle in host settings ("Detect tmux sessions on connect").
  - Pre-connection SSH probe runs `tmux ls` to discover sessions.
  - Modal picker shows session name, window count, creation time, and attached/detached status.
  - Selecting a session sends `tmux attach -t <name>` after connecting; detaching returns to a normal shell.
  - Skipping the picker or pressing Escape connects normally.
- New IPC channel `tmux:probe` with Zod-validated request/response schemas.
- Database migration 014: `tmux_detect` column on hosts table.
- `TmuxSessionPicker` modal component following existing QuickConnect dialog patterns.
- Unit tests for `parseTmuxListOutput` tmux ls format parser.

### Fixed

- Password-only hosts are automatically skipped for tmux probing (requires key-based auth).
- Warning shown in host form when tmux detection is enabled on a password-auth host.
- Shell injection protection: tmux session names are shell-quoted before sending as terminal input.
- Tmux attach command only sent on first connect, not on auto-reconnect.
- Stale probe results discarded if user triggers another connection while probe is in-flight.

## [0.1.1]

### Added

- Telnet / Raw TCP transport — connect to network gear and raw TCP services via a quick-connect dialog. Supports Telnet protocol negotiation (NAWS window sizing, SGA, echo) and raw passthrough mode. Feature-gated behind Settings → General → "Enable Telnet / Raw TCP" (off by default).
- Linux support — AppImage and deb packaging via electron-builder, `release:linux:unsigned` script, and `linux-release.yml` CI workflow that attaches artifacts to GitHub releases on tag push.
- Linux build job added to PR gates (`pr-gates.yml`) alongside Windows and macOS.
- macOS support — app menu, DMG packaging, tray icons, and CI pipeline.
- CI release workflows attach platform installers (`.exe`, `.dmg`, `.AppImage`, `.deb`) to GitHub releases automatically.
- `/bump` skill for version bump, build, and draft GitHub release workflow.
- App icon redesign with platform-specific tray icons.

### Changed

- Renamed project from SSHTerm to HyperShell across all packages, imports, and CI workflows.

### Fixed

- Parse host key verification error from Electron IPC error wrapper.

## [0.1.0] - 2026-04-06

First release of HyperShell (formerly SSHTerm). A fully functional SSH and serial terminal with SFTP file management.

### Terminal & Sessions

- SSH terminal connections via system `ssh` binary with PTY.
- Serial port terminal with configurable baud, parity, and flow control.
- Tabs and split panes with keyboard shortcuts (`Ctrl+Shift+D/E/W/[/]`).
- Broadcast mode for sending input to multiple sessions simultaneously.
- Session logging with ANSI stripping and IPC bridge.
- Session recovery and workspace save/restore.
- Auto-reconnect with exponential backoff.
- Network-aware reconnect that pauses attempts when connectivity is down.
- Terminal reconnect overlay with network-aware status display.
- Tab status badges showing connection state.
- Tab drag-and-drop reorder.
- Terminal search.
- Confirm-on-close dialog for active sessions.

### SFTP File Browser

- Dual-pane commander-style file browser with transfer queue.
- Recursive folder upload and download.
- Remote file editing in a dedicated CodeMirror editor window (separate Electron window).
- Bookmarks and sync engine.
- Commander keyboard navigation with vim-style and F-key bindings.
- Quick filter, editable breadcrumbs, and active pane focus indicator.
- Auto-scroll to keep cursor row visible.
- VS Code-density file list with monochrome icons.
- File properties dialog with permissions display.
- Drive selector for Windows local pane.

### Host Management

- Host CRUD with groups, color tags, and custom sort order.
- Drag-and-drop host reorder in sidebar.
- SSH config import from `~/.ssh/config`.
- PuTTY session import from Windows registry (with PPK key format detection and conversion).
- SshManager database import with host, group, and snippet migration.
- 1Password vault picker for credential references.
- Per-host SSH key picker for both SSH and SFTP connections.
- Host export to JSON and CSV formats.
- Host status monitoring.

### Port Forwarding & Networking

- Local, remote, and dynamic port forwarding via `ssh -L/-R/-D`.
- Host-linked port forwards stored in database.
- Visual Tunnel Manager panel with topology diagram.
- SSH2 connection pool with ref counting and idle timeout.
- SFTP transport reuses pooled connections.
- Jump host (ProxyJump) support per host.
- Per-host keep-alive interval configuration.
- Network monitor with DNS probing and event system.

### Security

- Host key verification for SFTP connections.
- Keyboard-interactive authentication (2FA) for SFTP.
- SFTP auth reuses host's configured SSH key.
- Zod schema validation on all IPC traffic (both request and response).

### UI & UX

- Welcome screen with animated logo and Quick Connect form (`Ctrl+K`).
- Settings panel with general, appearance, and connection sections.
- Settings persistence to SQLite `app_settings` table.
- Snippets manager with send-to-terminal and `Ctrl+Shift+S` shortcut.
- Toast notifications via sonner.
- System tray integration.
- Sidebar with host list, serial list, and context menus.
- Window state persistence (size and position).
- Framer Motion animations for modals and transitions.
- Dark theme with cyan accent.

### Database

- SQLite database with 7 migrations (hosts, groups, settings, SFTP bookmarks, sort/color, advanced SSH fields, host fingerprints).
- Repositories pattern for data access.
- Database backup and restore with auto-backup on startup.

### Infrastructure

- pnpm monorepo with 5 workspaces.
- Windows NSIS installer packaging (unsigned and signed).
- macOS DMG packaging.
- PR CI gates (build, unit tests, Playwright).
- Release manifest and checksum generation.
- Desktop renderer prefers bundled `dist/renderer/index.html` when available.
