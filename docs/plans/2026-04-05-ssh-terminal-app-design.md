# SSH Terminal App Design

**Date:** 2026-04-05
**Status:** Approved for planning
**Target:** Windows-first desktop release, with macOS and Linux following

## Goal

Build a modern desktop SSH and serial terminal application for Windows, macOS, and Linux using a shared codebase. The first release should optimize for time to market while preserving a clean architecture for later expansion into SFTP, sync, advanced SSH tooling, and broader platform parity.

## Product Direction

The application is a terminal-first operator tool. The primary user actions are:

- Find a host or serial profile quickly
- Open one or more terminal sessions
- Work across tabs and split panes
- Reconnect safely after failures
- Use existing authentication systems instead of forcing custom auth flows

The product should feel modern and desktop-native even though the UI is rendered through Electron. Performance, visual polish, and session reliability matter more than small installer size.

## Chosen Stack

- Desktop shell: Electron
- UI: React, TypeScript, Vite
- Terminal renderer: xterm.js
- PTY layer: node-pty
- SSH execution path: system OpenSSH client spawned inside PTY sessions
- Serial transport: serialport
- Local storage: SQLite via better-sqlite3
- Validation: zod
- App state: zustand
- Search: Fuse.js
- Motion and polish: Framer Motion
- Remote file editor for later SFTP work: Monaco Editor

## Why This Stack

This stack is the fastest practical path to a reliable product:

- Electron gives a mature cross-platform desktop container with strong ecosystem support.
- xterm.js plus node-pty is a proven terminal architecture used by serious desktop tools.
- Using the system ssh client avoids reimplementing complex compatibility behavior around SSH agents, ProxyJump, host key prompts, and Windows Kerberos/GSSAPI.
- serialport gives a clean path for COM and TTY device access under the same desktop shell.
- SQLite is enough for local-first host management and avoids premature service dependencies.

## Rejected Alternatives

### Tauri 2 + Rust terminal core

Tauri is attractive for size and security, but it slows initial delivery once the app needs terminal fidelity, serial support, Windows integration, and later SFTP workflows. It remains a viable future option only if the product requirements change sharply toward binary size and lower resource usage.

### Native .NET or mixed native UI

This would help a Windows-only admin tool, but it weakens the macOS/Linux story and complicates the rendering path for xterm.js-driven terminal UX. It also increases the cost of maintaining a visually consistent product across platforms.

## High-Level Architecture

The app should use three clear layers:

### 1. Electron Main Process

Responsibilities:

- Create and manage windows
- Own native integrations such as tray, shell dialogs, and secure storage
- Gate all IPC boundaries
- Start and stop session services
- Manage crash recovery and app lifecycle

### 2. Session Core Services

Responsibilities:

- Normalize session creation for SSH and serial transports
- Spawn and supervise PTY-backed SSH sessions
- Open and manage serial sessions
- Emit a common event stream for terminal data, resize, status, and exit
- Handle reconnect policy, keep-alive, and future session recording

### 3. React Renderer

Responsibilities:

- Host management UX
- Quick Connect and command palette
- Terminal workbench with tabs and split panes
- Settings, themes, and status displays
- Session indicators, reconnect banners, and broadcast safeguards

## Proposed Repo Layout

```text
apps/
  desktop/
  ui/
packages/
  shared/
  session-core/
  db/
docs/
  plans/
```

### apps/desktop

Electron main and preload processes, app shell, IPC handlers, tray integration, secure storage adapter, update wiring, and OS-specific shims.

### apps/ui

React application for the full desktop workbench, including host browser, quick connect, terminal layout, settings, and later file workflows.

### packages/shared

Shared types, schemas, IPC contracts, enums, and cross-layer constants.

### packages/session-core

Transport abstractions and session orchestration. This package should have no renderer dependency.

### packages/db

SQLite schema, migrations, repositories, and persistence helpers.

## Terminal Architecture

The terminal subsystem is the product core.

### SSH Sessions

- The app launches the system `ssh` command inside a PTY using `node-pty`.
- Terminal output streams directly into xterm.js.
- Terminal input, resize events, and lifecycle commands are sent back through IPC to the session manager.
- SSH config expansion should happen before session start so the UI can display a resolved target and expected auth mode.

This approach favors compatibility over protocol-level control. It is the correct v1 choice because it lets the platform's OpenSSH implementation handle:

- SSH agent integration
- ProxyJump and config inheritance
- Known hosts behavior
- Kerberos/GSSAPI where supported by the host platform

### Serial Sessions

- The app opens local serial devices using `serialport`.
- Session-core wraps serial devices in the same session interface used for SSH.
- The terminal UI stays transport-agnostic by consuming a normalized stream of `data`, `error`, `status`, `resize`, and `exit` events.

Serial-specific controls such as baud rate, parity, RTS/DTR, and local echo should live in profile configuration and session toolbars, not in the terminal renderer itself.

## Data Model

Initial entities:

- `hosts`
- `host_groups`
- `tags`
- `auth_profiles`
- `serial_profiles`
- `sessions`
- `session_layouts`
- `snippets`
- `port_forward_profiles`
- `bookmarks`
- `app_settings`

Design rules:

- Store user configuration and metadata in SQLite.
- Store secrets separately via secure storage keyed by logical IDs kept in SQLite.
- Support `op://` references as pointers, not imported secret values.
- Avoid duplicating OpenSSH state when platform-native config files already exist.

## Security Model

### Stored Secrets

- Passwords and passphrases should be encrypted through Electron secure storage APIs.
- On Windows this maps to per-user DPAPI-backed protection.
- The renderer should never receive long-lived secret material unless a workflow strictly requires it.

### Authentication Sources

Supported v1 auth inputs:

- System SSH agent
- Private key file path plus optional passphrase reference
- Username and password
- `op://` secret references resolved at connect time

Supported later:

- Rich key generation and conversion workflows
- Extended agent management UI

### 1Password

The app should treat 1Password as an external secret and agent provider. It should resolve `op://` references only on demand and should support 1Password SSH Agent indirectly via the system `ssh` path.

## UX Principles

### Workbench

- The main window opens into a terminal-first workbench, not a settings-first experience.
- Quick Connect should be available globally via `Ctrl+K`.
- Tabs and split panes should be first-class from the start.

### Host Management

- Hosts, serial devices, groups, and tags should be easy to scan and edit.
- The app should support lightweight status indicators without requiring constant network polling.

### Broadcast Input

- Broadcast mode must require explicit opt-in.
- A clear persistent banner must show when it is active.
- The target set must be obvious before input is sent.

## Reliability Rules

- Every session gets a stable `sessionId`.
- Session state must be explicit: `connecting`, `connected`, `reconnecting`, `disconnected`, `failed`.
- Auto-reconnect is opt-in per profile.
- Serial sessions should not silently reconnect by default.
- If the renderer crashes, the main process should preserve session metadata and offer recovery where practical.

## Platform Notes

### Windows

Windows is the initial target. Priority integrations:

- Windows OpenSSH
- Windows SSH agent support
- COM port enumeration and control
- DPAPI-backed secret storage
- Tray behavior and startup polish

### macOS and Linux

These follow after the Windows release. The architecture should avoid Windows-only assumptions in the session and storage packages, but the UX edge cases and distribution pipeline can come later.

## Scope

### v1

- Host management with groups and tags
- Embedded terminal using xterm.js
- SSH sessions through system OpenSSH
- Serial sessions through serialport
- Multiple tabs and split panes
- Quick Connect
- Broadcast input
- Password, key, and agent auth paths
- `op://` reference support
- Basic port forwarding profiles
- Basic session restore
- Terminal themes
- System tray
- Host status monitoring
- Import from `~/.ssh/config`

### Deferred

- SFTP dual-pane browser
- Drag and drop remote transfer UX
- Remote file editing
- Visual tunnel builder
- X11 forwarding
- Cloud sync
- Terminal autocompletion
- Full SSH key management UI
- PuTTY import
- Backup and restore UX

## Delivery Phases

### Phase 1: Foundation

- Monorepo and build tooling
- Electron shell
- React workbench
- Shared IPC contracts
- SQLite schema and migrations
- Secure storage adapter

### Phase 2: Terminal MVP

- SSH PTY sessions
- Serial sessions
- xterm.js integration
- Tabs, splits, Quick Connect

### Phase 3: Host and Auth Flows

- Host CRUD
- Groups and tags
- SSH config import
- Password and key auth
- Agent detection
- `op://` resolution

### Phase 4: Power User Workflows

- Broadcast input
- Port forwarding profiles
- Session restore
- Keep-alive and reconnect
- Tray and host monitoring

### Phase 5: Post-v1

- SFTP and remote editing
- Sync and backup
- Key management UI
- Visual tunnel builder
- macOS/Linux parity hardening

## Testing Strategy

### Automated

- Unit tests for schemas, repositories, auth resolution, and session reducers
- Integration tests for PTY lifecycle, SSH launch arguments, and serial session behavior
- UI tests for tabs, splits, host CRUD, and Quick Connect

### Manual

Windows-first manual matrix:

- Password SSH login
- Key-based SSH login
- Windows SSH agent login
- 1Password SSH Agent login
- `op://` secret resolution
- Serial connect and disconnect
- Terminal behavior with vim, tmux, and htop
- Split pane and broadcast safety behavior

## Main Risks And Mitigations

### Risk: System ssh behavior varies by platform

Mitigation:

- Keep the SSH launch layer isolated
- Start with Windows OpenSSH as the reference environment
- Add platform-specific launch tests later

### Risk: Session recovery becomes fragile

Mitigation:

- Persist only minimal recoverable metadata in v1
- Rehydrate UI state cleanly instead of attempting full terminal buffer reconstruction

### Risk: Renderer becomes overloaded by terminal state

Mitigation:

- Keep session orchestration in main and session-core
- Treat the renderer as a subscriber to session events, not the owner of transport state

## Final Decisions

- Build with Electron, not Tauri
- Use React, TypeScript, Vite for the renderer
- Use xterm.js for terminal rendering
- Use node-pty plus system OpenSSH for SSH sessions
- Use serialport for serial sessions
- Ship Windows first
- Keep SFTP and advanced admin tooling out of v1
