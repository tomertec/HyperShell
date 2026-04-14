# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/) and this project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Light theme** — professional light mode with muted cool-gray palette. Three-way toggle in Settings → Appearance: System (follows OS preference), Light, or Dark. Accent color adapts per mode (sky-400 dark / sky-600 light). Host tag colors shift for contrast on gray backgrounds. Native window controls update to match. Status bar spans full window width.
- **Solarized Light terminal theme** — new built-in terminal theme. Terminal theme is independent of app theme — any combination works.
- **`app:set-theme` IPC channel** — renderer notifies main process on theme change to update native title bar overlay and window background color.

### Changed

- **Host tag colors use CSS variables** — `.host-color-*` and `.color-swatch-*` classes now reference `--host-*` variables instead of hardcoded hex, enabling per-theme overrides.
- **StatusBar moved to AppShell** — status bar now renders below the sidebar + main content row, spanning full window width with a continuous top border.

### Fixed

- **Hardcoded colors in HostsView, PortForwardProfileForm, TransferPopup, StatusBar** — inline styles with hex/rgba values converted to Tailwind theme token classes so they adapt to light/dark mode.
- **CodeMirror editor respects app theme** — SFTP file editor uses default light theme when app is in light mode, oneDark when dark.
- **Title bar overlay height reduced to 34px** — prevents the native overlay from covering the separator line at non-100% DPI scaling (e.g. 115%).

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
