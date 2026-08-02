# Local Shell Profiles (PowerShell / CMD / WSL) — Design

**Date:** 2026-08-02
**Status:** Approved for planning

## Problem

HyperShell has no local shell. Every session is remote (SSH, serial, telnet, SFTP), so a
Windows-first terminal cannot open the terminal its user is already on. This is the largest
daily-driver gap against Windows Terminal, which treats multiple local shell profiles as a
core capability.

Composable panes — the other half of that comparison — already exist
(`layoutStore.splitPane`, `Ctrl+Shift+D` / `Ctrl+Shift+E`). This design covers only the
profiles.

## Goals

- Auto-detect installed shells (Windows PowerShell, PowerShell 7, cmd.exe, Git Bash, each
  WSL distro) with zero configuration on first run.
- Let the user rename, recolor, hide, reorder, and add profiles, and set per-profile
  starting directory, arguments, and environment variables.
- Launch a shell so it behaves exactly as it would outside HyperShell — in particular, it
  loads the user's own shell profile (`$PROFILE`, `.bashrc`).
- Reach shells from the sidebar, the new-tab menu, the command palette, and the welcome
  screen.

## Non-goals

- Changing startup behavior. The Welcome screen still appears on launch; no profile opens
  automatically.
- Auto-reconnect or network-monitor participation for local sessions.
- Elevated tabs inside the existing window (see §7 for why, and what replaces it).

## 1. Transport layer

`transportSchema` becomes `z.enum(["ssh", "serial", "sftp", "telnet", "local"])`, and
`SessionManager.createDefaultTransport()` gains a `local` branch — the same shape telnet was
added in.

New files under `packages/session-core/src/transports/`:

**`ptyProcess.ts`** — the generic PTY core extracted from `sshPtyTransport.ts`
(approximately 130 lines): spawn, `onData` / `onExit` subscriptions, cleanup, `write`,
`resize`, `close`, and exit emission. `spawnPty` remains injectable so tests never load
node-pty.

**`sshPtyTransport.ts`** — retains only SSH-specific logic (`buildSshArgs`,
`buildSshPtyCommand`, password-prompt detection, env merging) and delegates lifecycle to
`ptyProcess`. The change is behavior-preserving; `sshPtyTransport.test.ts` passing unchanged
is the proof.

**`localShellTransport.ts`** — `createLocalShellTransport(request, profile)` resolves
command, args, cwd, and env, then calls `ptyProcess`. No reconnect logic and no network
monitor: a shell that exited did not lose connectivity.

### Environment hygiene

`ptyProcess` strips Electron- and Node-injected variables (`ELECTRON_*`, `NODE_OPTIONS`)
from the inherited environment before spawning, then layers per-profile variables on top.
Without this, running `node` inside a HyperShell tab behaves differently than in any other
terminal.

The transport never sets `HOME` or `USERPROFILE` itself. A profile may override them
through its own environment variables, which is a deliberate escape hatch — overriding
them relocates `$PROFILE` and `~`, so a profile that does it owns that consequence.
*(Ruling, 2026-08-02: this originally read "never set or overridden", which contradicted
the reference implementation in §1 of the plan. The escape hatch was kept.)*

Two inherited behaviors match Windows Terminal and are not regressions: `PATH` is
snapshotted at app launch (newly installed tools need an app restart), and a shell profile
stored on a cloud-synced drive waits on the file if it is a placeholder.

## 2. Security boundary

`session.open` with `transport: "local"` accepts **only `{ profileId }`**. It never accepts
`executable`, `args`, or `cwd` from the renderer. The main process resolves the row from
SQLite and constructs the spawn itself.

If the renderer could name an arbitrary executable, any renderer-side script injection would
become arbitrary local code execution with no SSH server in between. Profile mutation runs
over separate `localProfiles.*` IPC channels with Zod-validated payloads.

## 3. Data model — migration `015_local_profiles.sql`

```sql
CREATE TABLE IF NOT EXISTS local_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  executable TEXT NOT NULL,
  args_json TEXT NOT NULL DEFAULT '[]',   -- JSON string array
  starting_directory TEXT,
  icon TEXT,                              -- fixed glyph key, see below
  color TEXT,
  elevated INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'user',    -- 'user' | 'detected'
  detect_key TEXT UNIQUE,                 -- 'pwsh7', 'wsl:Ubuntu-22.04', ...
  is_available INTEGER NOT NULL DEFAULT 1,
  is_hidden INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS local_profile_env_vars (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES local_profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  is_enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_local_profile_env_vars_profile
  ON local_profile_env_vars(profile_id);
```

Environment variables get their own table rather than a JSON column so
`hostEnvVarRepository` (migration 012) is the template and the existing env-var form
component can be reused.

`localProfilesRepository.ts` follows `serialProfilesRepository.ts` for CRUD.

### Icon domain

The UI has no icon library — sidebar glyphs are inline SVG. `icon` is therefore **not** a
free-form string but one of a fixed set of built-in glyph keys:
`'powershell' | 'cmd' | 'linux' | 'bash' | 'terminal'`. Detection assigns a sensible default
per `detect_key`; the form offers exactly these five. `terminal` is the fallback for custom
profiles. Adding a glyph means adding an SVG and a key — no new dependency.

### Hiding vs. deleting

Deleting a detected profile outright would not stick: the next reconciliation pass would
re-insert its `detect_key`. So **"Delete" on a `source = 'detected'` profile sets
`is_hidden = 1`** — a tombstone reconciliation respects. Profiles with `source = 'user'`
delete for real.

Hidden profiles are excluded from the sidebar, new-tab menu, command palette, and welcome
chips. A "Show hidden" item in the Local section's overflow menu reveals them for
un-hiding.

## 4. Detection

`packages/session-core/src/localShells/detectLocalShells.ts` is a pure function over
injected probes (`fileExists`, `runCommand`, `env`, `platform`), so it unit-tests with fakes
and never touches the real filesystem.

Windows probes:

| detect_key | Location |
|---|---|
| `windows-powershell` | `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe` |
| `pwsh7` | `%ProgramFiles%\PowerShell\7\pwsh.exe` |
| `cmd` | `%SystemRoot%\System32\cmd.exe` |
| `git-bash` | `%ProgramFiles%\Git\bin\bash.exe` |
| `wsl:<distro>` | one per distro from `wsl.exe -l -q`, launched as `wsl.exe -d <distro>` |

Non-Windows fallback: `$SHELL`, `/bin/bash`, `/bin/zsh`.

**`wsl.exe -l -q` emits UTF-16LE, not UTF-8.** Decoded as UTF-8 the distro names come back
NUL-interleaved. The probe decodes explicitly.

### Detected profiles launch bare

Detected profiles are created with `args_json = '[]'` — no `-NoProfile`, no `-Command`, no
`-File`. Any of those either skips the user's shell profile or makes the session
non-interactive. The shell locates its own profile; HyperShell does no profile discovery.

Note for users whose customizations live in `Documents\PowerShell\`: that path is PowerShell
7's `$PROFILE`. The Windows PowerShell 5.1 entry reads
`Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1`, a different file, and will
look bare if that file does not exist. This is correct behavior, not a defect.

### Reconciliation rule

On startup, detection **inserts rows for `detect_key`s not already present** and **flips
`is_available`** on rows whose executable has vanished. It **never mutates an existing row's
user-editable fields.**

User edits therefore survive every rescan by construction, with no dirty-field tracking. A
newly installed WSL distro appears on the next launch; an uninstalled one greys out rather
than disappearing, and can be hidden by hand.

Detection runs in the main process during IPC registration, before the renderer first
requests the profile list, so the first render is already reconciled. The Local sidebar
section also carries a **Rescan** action for picking up a WSL distro installed mid-session
without restarting.

## 5. UI surfaces

New feature directory `apps/ui/src/features/local/`:

| Component | Role |
|---|---|
| `SidebarLocalList.tsx` | "Local" section beside Hosts and Serial, gated by `general.showLocalInSidebar` (default on), mirroring `SidebarSerialList` |
| `LocalProfileForm.tsx` | Add/edit: name, executable with file picker, args, starting directory, icon, color, env-var rows reusing the host env-var editor |
| `NewTabMenu.tsx` | Dropdown on the `+` button in `TabBar`, listing every available profile |

Also: command-palette entries ("Open local shell: …") and a row of profile chips on
`WelcomeScreen`, which is the surface the user actually lands on given no auto-open.
Profiles with `is_available = 0` render greyed and are not clickable.

Profiles reorder by drag within the section, persisting `sort_order` the same way
`onReorderHosts` does today.

Plumbing: `LayoutTab.transport` and the `useTerminalSession` transport union both gain
`"local"`; `profileId` carries the local profile id; the tab title is the profile name.
`general.showLocalInSidebar` is added to the UI settings store beside
`general.showSerialInSidebar` and persists through the existing settings IPC.

## 6. Exit lifecycle

`localShellTransport` emits the existing `exit` event with the real exit code.

`TerminalPane` gains an `onProcessExit` callback wired to the `closeTab` closure already
defined in `Workspace.tsx`. Exit code `0` closes the tab — typing `exit` feels native.
A non-zero code leaves the tab open showing `Process exited (N)` so the error is readable.
This matches Windows Terminal's `closeOnExit: graceful` default and needs no new setting.

Passing the existing closure down keeps the change surgical; `closeTab` is not lifted into
`layoutStore`.

## 7. Run as administrator

On Windows a medium-integrity process cannot host an elevated ConPTY. Two options exist:

**Elevated helper daemon** piping a PTY back over a named pipe. This produces a
medium-integrity client driving a high-integrity shell — structurally a UAC bypass — and the
named-pipe ACL becomes a privilege-escalation surface. Windows Terminal explicitly declines
this approach. Rejected.

**Relaunch elevated (chosen).** `ShellExecute` with the `runas` verb against our own
executable:

```
hypershell.exe --elevated-local-shell --exec <path> --args <json> --cwd <dir>
```

The user sees a real UAC prompt; the elevated instance opens a separate window carrying an
"Administrator" badge.

The parent process resolves the profile from SQLite and passes the resolved command on the
elevated command line, so the elevated instance needs no database — avoiding two Electron
processes contending on the same better-sqlite3 file. `main.ts` has no
`requestSingleInstanceLock`, so a second instance already starts cleanly.

The elevated instance validates its own arguments before spawning.

**Accepted tradeoff:** a separate elevated window, not an elevated tab in the current
window.

This is the largest single chunk of the work (CLI argument parsing, a database-less boot
path, window badging), so it is sequenced last. Phases 1–3 ship a complete feature without
it.

## 8. Testing

**Unit**

- `detectLocalShells` against fake probes, including a UTF-16LE `wsl -l -q` fixture — the
  decoding bug is the one most likely to ship.
- Reconciliation idempotency: running detection twice produces no duplicates, and a
  user-edited row is unchanged.
- `ptyProcess` lifecycle against a fake spawn.
- Environment hygiene: `ELECTRON_*` and `NODE_OPTIONS` are absent from the child
  environment.
- `localProfilesRepository` CRUD and `args_json` round-trip.

**Regression proof**

- `sshPtyTransport.test.ts` passes unchanged after the extraction. This gates Phase 1.

**Electron E2E** (the CI job runs on Windows)

- A real `cmd.exe` session opens, echoes, and exits end to end.
- `session.open` with `transport: "local"` **rejects** a payload carrying `executable` —
  the §2 security boundary, asserted rather than assumed.

**Browser E2E**

- Sidebar section and new-tab menu render; axe passes on the profile form.

**Manual acceptance**

- Open the PowerShell 7 profile and confirm the user's own `$PROFILE` customizations
  (prompt, aliases) are live.
- Open a WSL distro and confirm `.bashrc` loaded.

## Phasing

1. Extract `ptyProcess.ts`; SSH tests green unchanged.
2. `local` transport, migration 015, repository, detection, IPC channels.
3. UI: sidebar section, new-tab menu, profile form, welcome chips, exit behavior.
4. Run as administrator.

Phases 1–3 are the shippable feature. Phase 4 is separable.
