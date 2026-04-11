# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/) and this project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
