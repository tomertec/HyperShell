# sshmanager → HyperShell Migration Roadmap

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Achieve full feature parity with sshmanager (.NET, 31 GitHub stars) and prepare HyperShell for cross-platform release (Windows + macOS), enabling a confident public migration announcement.

**Architecture:** Each phase builds on the previous. Phase 1 covers ship-blocking security and import features. Phase 2 brings feature parity for existing users. Phase 3 adds differentiators and macOS support. Every feature follows the established IPC contract pattern: Zod schema → IPC handler → preload bridge → UI component.

**Tech Stack:** Electron 34, React 19, xterm.js 6, Zustand 5, Zod 3, better-sqlite3, ssh2, node-pty, Playwright (E2E), Vitest (unit)

---

## How to Use This Document

- Each **Phase** is a release milestone. Ship after completing a phase.
- Each **Task** is a self-contained feature. Work one task at a time.
- Each task lists: **Files** to create/modify, **Schema** changes, **Steps** with code, **Tests**, **Commit** message.
- Follow the project's established patterns documented in `CLAUDE.md`.
- Run `pnpm build && pnpm test` after every task. Fix before moving on.

---

## Phase 1 — Ship Blockers

> These features MUST be complete before announcing the migration on the sshmanager GitHub repo. Without them, existing users will reject the switch.

---

### Task 1.1: Host Key Verification (Fingerprint Trust)

**Why:** Without this, HyperShell connects to any server without verifying identity — a security hole that sshmanager handles properly. Enterprise users and security-conscious users will not migrate without it.

**Behavior:**
- On first connection to a host, show the server's key fingerprint and ask user to trust/reject
- Store trusted fingerprints in the database
- On subsequent connections, compare fingerprints. If changed, warn with a scary dialog (MITM warning)
- The system SSH binary already does this via `known_hosts`, but SFTP connections via ssh2 library do NOT — they need explicit handling

**Schema — Migration 007:**

Create: `packages/db/src/migrations/007_host_fingerprints.sql`
```sql
-- 007_host_fingerprints.sql
-- Stores trusted SSH host key fingerprints for SFTP/ssh2 connections

CREATE TABLE IF NOT EXISTS host_fingerprints (
  id TEXT PRIMARY KEY,
  hostname TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 22,
  algorithm TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  is_trusted INTEGER NOT NULL DEFAULT 0,
  first_seen TEXT DEFAULT CURRENT_TIMESTAMP,
  last_seen TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(hostname, port, algorithm)
);
```

**Files:**

| Action | Path |
|--------|------|
| Create | `packages/db/src/migrations/007_host_fingerprints.sql` |
| Create | `packages/db/src/repositories/hostFingerprintRepository.ts` |
| Create | `packages/db/src/repositories/hostFingerprintRepository.test.ts` |
| Modify | `packages/db/src/index.ts` — apply migration 007 |
| Modify | `packages/shared/src/ipc/channels.ts` — add `hostFingerprint` channels |
| Modify | `packages/shared/src/ipc/schemas.ts` — add fingerprint schemas |
| Create | `apps/desktop/src/main/ipc/hostFingerprintIpc.ts` |
| Modify | `apps/desktop/src/main/ipc/registerIpc.ts` — register handler |
| Modify | `apps/desktop/src/preload/desktopApi.ts` — add preload methods |
| Modify | `apps/ui/src/types/global.d.ts` — add type declarations |
| Create | `apps/ui/src/features/hosts/HostKeyVerificationDialog.tsx` |
| Modify | `apps/ui/src/app/App.tsx` — wire dialog into SFTP connect flow |
| Modify | `packages/session-core/src/transports/sftpTransport.ts` — emit fingerprint event on ssh2 `hostkeys` callback |

**Steps:**

1. Create migration SQL file and apply in `packages/db/src/index.ts` (same try-catch ALTER pattern)
2. Create repository with methods: `findByHost(hostname, port)`, `trustFingerprint(hostname, port, algorithm, fingerprint)`, `isTrusted(hostname, port, fingerprint)`, `updateLastSeen(id)`
3. Write repository tests against in-memory SQLite
4. Add Zod schemas: `hostFingerprintSchema`, `verifyHostKeyRequestSchema`, `trustHostKeyRequestSchema`
5. Add IPC channels: `hostFingerprint.verify`, `hostFingerprint.trust`, `hostFingerprint.list`
6. Create IPC handler following snippetsIpc pattern
7. Wire into preload with request/response validation
8. Modify `sftpTransport.ts` — on ssh2 `Client.connect()`, use the `hostVerifier` callback to emit a synchronous IPC event that checks the DB and returns trust/reject
9. Create `HostKeyVerificationDialog.tsx` — modal showing: hostname, algorithm, fingerprint (formatted as `SHA256:xxxx`), trust/reject buttons, "Always trust this host" checkbox
10. Wire into App.tsx SFTP connection flow: if fingerprint unknown → show dialog → on trust → store and retry connection

**Test plan:**
- Unit: repository CRUD, trust lookup, duplicate handling
- Unit: Zod schema validation for fingerprint format
- Manual: connect to new host via SFTP → see dialog → trust → reconnect without dialog → change server key → see MITM warning

**Commit:** `feat: add SSH host key verification for SFTP connections`

---

### Task 1.2: Keyboard-Interactive Authentication (2FA)

**Why:** Many servers require 2FA (TOTP, Duo, etc.) via SSH keyboard-interactive auth. sshmanager has a multi-step dialog for this. Without it, those servers are inaccessible.

**Behavior:**
- When ssh2 library triggers a `keyboard-interactive` auth event, surface the prompts to the UI
- Show a dialog with each prompt (e.g., "Verification code:", "Password:")
- User enters responses, which are sent back to the server
- Supports multi-prompt scenarios (some servers ask password + TOTP in one exchange)

**Files:**

| Action | Path |
|--------|------|
| Modify | `packages/shared/src/ipc/schemas.ts` — add keyboard-interactive schemas |
| Modify | `packages/shared/src/ipc/channels.ts` — add `session.keyboardInteractive` channel |
| Modify | `packages/session-core/src/transports/sftpTransport.ts` — handle `keyboard-interactive` event from ssh2 |
| Modify | `apps/desktop/src/main/ipc/registerIpc.ts` — add IPC relay for interactive prompts |
| Modify | `apps/desktop/src/preload/desktopApi.ts` — add event listener |
| Modify | `apps/ui/src/types/global.d.ts` — add type |
| Create | `apps/ui/src/features/hosts/KeyboardInteractiveDialog.tsx` |
| Modify | `apps/ui/src/app/App.tsx` — wire dialog |

**Steps:**

1. Add schemas: `keyboardInteractivePromptSchema` (name, instruction, prompts array with `{prompt, echo}`)  and `keyboardInteractiveResponseSchema` (responses string array)
2. In `sftpTransport.ts`, when creating ssh2 `Client.connect()`, add `tryKeyboard: true` to auth methods and handle the `keyboard-interactive` event — emit it as an IPC event up to the renderer
3. Create `KeyboardInteractiveDialog.tsx` — modal showing server name, instruction text, and a text input per prompt (masked if `echo: false`). Submit button sends responses back via IPC
4. Wire the dialog into App.tsx with a callback that resolves the ssh2 `keyboard-interactive` callback with user responses
5. Handle timeout: if user doesn't respond within 60s, send empty responses and let the server reject

**Test plan:**
- Unit: schema validation for prompt/response structures
- Manual: connect to a 2FA-enabled server via SFTP → see prompt dialog → enter code → authenticate

**Commit:** `feat: add keyboard-interactive auth dialog for 2FA servers`

---

### Task 1.3: PuTTY Session Import

**Why:** Many Windows SSH users come from PuTTY. sshmanager imports PuTTY sessions from the Windows registry. This is a high-value onboarding feature for the Windows audience.

**Behavior:**
- Read PuTTY sessions from `HKEY_CURRENT_USER\Software\SimonTatham\PuTTY\Sessions\`
- Parse each session: hostname, port, username, key file path
- Skip non-SSH sessions (protocol !== "ssh") and "Default Settings"
- Session names are URL-encoded in registry — decode them
- Show import preview dialog (like existing SSH config import)
- Import selected sessions as HyperShell hosts

**Files:**

| Action | Path |
|--------|------|
| Modify | `packages/shared/src/ipc/channels.ts` — add `hosts.importPutty` channel |
| Modify | `packages/shared/src/ipc/schemas.ts` — add import schemas |
| Create | `apps/desktop/src/main/ipc/puttyImportIpc.ts` |
| Create | `apps/desktop/src/main/ipc/puttyImportIpc.test.ts` |
| Modify | `apps/desktop/src/main/ipc/registerIpc.ts` — register handler |
| Modify | `apps/desktop/src/preload/desktopApi.ts` — add preload method |
| Modify | `apps/ui/src/types/global.d.ts` — add type |
| Create | `apps/ui/src/features/hosts/PuttyImportDialog.tsx` |
| Modify | `apps/ui/src/features/sidebar/Sidebar.tsx` — add "Import from PuTTY" menu option |

**Steps:**

1. Add IPC channel `hosts.importPutty` (scan) and response schema (array of `{name, hostname, port, username, keyPath}`)
2. Create `puttyImportIpc.ts` — use `child_process.execFile("reg", ["query", "HKCU\\Software\\SimonTatham\\PuTTY\\Sessions", "/s"])` to read the registry. Parse output to extract session entries. Guard with `process.platform === "win32"` check — return empty on macOS/Linux
3. Write unit test with mocked `execFile` output matching real PuTTY registry format
4. Create `PuttyImportDialog.tsx` — reuse the pattern from `SshConfigImportDialog.tsx` (checkbox list with select all, import button)
5. On import, create hosts via `window.hypershell.upsertHost()` for each selected entry
6. Add "Import from PuTTY" button to sidebar context menu (Windows only — hide on macOS)

**Test plan:**
- Unit: parse PuTTY registry output, URL-decode session names, skip non-SSH
- Manual: install PuTTY, create sessions, import into HyperShell

**Commit:** `feat: add PuTTY session import from Windows registry`

---

### Task 1.4: PPK Key Format Support

**Why:** PuTTY users have `.ppk` format keys. sshmanager has a full PPK import wizard with bidirectional conversion. At minimum, HyperShell needs to detect PPK files and convert them to OpenSSH format.

**Behavior:**
- When a user selects a `.ppk` file as identity file, detect the format
- Offer to convert to OpenSSH format using `puttygen` (if available) or `ssh-keygen` (OpenSSH 8.4+ supports PPK v2/v3 import)
- Save the converted key alongside the original (e.g., `id_rsa_converted`)
- If conversion tools aren't available, show a message explaining how to convert manually

**Files:**

| Action | Path |
|--------|------|
| Create | `packages/session-core/src/ssh/ppkConverter.ts` |
| Create | `packages/session-core/src/ssh/ppkConverter.test.ts` |
| Modify | `packages/shared/src/ipc/channels.ts` — add `sshKeys.convertPpk` |
| Modify | `packages/shared/src/ipc/schemas.ts` — add convert request/response schemas |
| Modify | `apps/desktop/src/main/ipc/sshKeysIpc.ts` — add convert handler |
| Modify | `apps/desktop/src/preload/desktopApi.ts` — add preload method |
| Modify | `apps/ui/src/types/global.d.ts` — add type |
| Modify | `apps/ui/src/features/ssh-keys/SshKeyManager.tsx` — add "Import PPK" button |
| Modify | `apps/ui/src/features/hosts/HostForm.tsx` — detect PPK and prompt conversion |

**Steps:**

1. Create `ppkConverter.ts` with `convertPpkToOpenSsh(ppkPath: string): Promise<{outputPath: string}>`. Try `ssh-keygen -i -f <ppk> > <output>` first (works for PPK v2). If that fails, try `puttygen <ppk> -O private-openssh -o <output>`. Return the output path or throw with a helpful message
2. Write test with a mock PPK file (v2 format header: `PuTTY-User-Key-File-2:`)
3. Add IPC channel and schema for convert request `{ppkPath: string}` → response `{opensshPath: string}`
4. In `SshKeyManager.tsx`, add an "Import PPK" button that opens a file picker filtered to `.ppk`, calls convert, and shows the result
5. In `HostForm.tsx`, when identity file is selected and ends with `.ppk`, show a warning banner with a "Convert to OpenSSH" button

**Test plan:**
- Unit: detect PPK format from file header, construct correct command args
- Manual: select a .ppk key → convert → use converted key to connect

**Commit:** `feat: add PPK to OpenSSH key conversion`

---

### Task 1.5: Database Backup & Restore

**Why:** sshmanager has auto-backup + manual backup/restore. Users need confidence their host database won't be lost. This is table-stakes for a productivity tool.

**Behavior:**
- Manual backup: copy SQLite DB file to a user-chosen location (with timestamp in filename)
- Manual restore: replace current DB with a backup file (requires app restart)
- Auto-backup: on app startup, copy DB to `%APPDATA%/HyperShell/backups/` with rotation (keep last 5)
- Show backup/restore dialog in settings

**Files:**

| Action | Path |
|--------|------|
| Modify | `packages/shared/src/ipc/channels.ts` — add `backup` channels |
| Modify | `packages/shared/src/ipc/schemas.ts` — add backup schemas |
| Create | `apps/desktop/src/main/ipc/backupIpc.ts` |
| Modify | `apps/desktop/src/main/ipc/registerIpc.ts` — register handler |
| Modify | `apps/desktop/src/main/main.ts` — auto-backup on startup |
| Modify | `apps/desktop/src/preload/desktopApi.ts` — add preload methods |
| Modify | `apps/ui/src/types/global.d.ts` — add types |
| Create | `apps/ui/src/features/settings/BackupRestorePanel.tsx` |
| Modify | `apps/ui/src/features/settings/SettingsPanel.tsx` — add backup section |

**Steps:**

1. Add channels: `backup.create`, `backup.restore`, `backup.list`, `backup.autoBackup`
2. Create `backupIpc.ts`:
   - `create`: use `fs.copyFileSync(dbPath, targetPath)` — SQLite is safe to copy when using WAL mode or between transactions
   - `restore`: validate the backup is a valid SQLite file (check magic bytes `SQLite format 3`), copy to DB path, return `{requiresRestart: true}`
   - `list`: read backup directory, return sorted by date
   - `autoBackup`: copy to `app.getPath("userData")/backups/hypershell-backup-YYYY-MM-DD.db`, delete oldest when count > 5
3. Call `autoBackup` in `main.ts` during app initialization (after DB is opened)
4. Create `BackupRestorePanel.tsx` with: backup list table, "Create Backup" button (opens save dialog), "Restore" button (opens file picker), last auto-backup timestamp display
5. Add the panel as a section in `SettingsPanel.tsx`

**Test plan:**
- Unit: backup file naming, rotation logic (delete oldest), SQLite magic byte check
- Manual: create backup → delete a host → restore backup → verify host is back

**Commit:** `feat: add database backup and restore with auto-backup on startup`

---

### Task 1.6: Confirm on Close

**Why:** Accidentally closing the app while connected to multiple servers is frustrating. sshmanager shows a confirmation dialog.

**Behavior:**
- When user closes the main window while sessions are active, show "You have N active sessions. Close anyway?"
- Controlled by a setting `general.confirmOnClose` (default: true)
- Skip the dialog if no sessions are connected

**Files:**

| Action | Path |
|--------|------|
| Modify | `apps/desktop/src/main/windows/createMainWindow.ts` — add `close` event handler |
| Modify | `apps/desktop/src/main/ipc/registerIpc.ts` — expose active session count |
| Modify | `apps/ui/src/features/settings/settingsStore.ts` — add `confirmOnClose` setting |
| Modify | `apps/ui/src/features/settings/SettingsPanel.tsx` — add toggle |

**Steps:**

1. In `createMainWindow.ts`, add a `close` event handler on the BrowserWindow:
   - Query session manager for active session count
   - If count > 0 and setting enabled, call `dialog.showMessageBox()` with Yes/No
   - If No, `event.preventDefault()` to block close
2. Add `general.confirmOnClose` toggle to settings panel (default: true)
3. Read the setting in the close handler via the settings repository

**Test plan:**
- Manual: open sessions → close window → see dialog → cancel → still open → confirm → closes

**Commit:** `feat: add confirm-on-close dialog for active sessions`

---

### Task 1.7: sshmanager Database Import

**Why:** This is THE migration feature. Existing sshmanager users have hosts, groups, and settings in a SQLite database at `%LocalAppData%\SshManager\sshmanager.db`. One-click import removes all friction.

**Behavior:**
- Detect if sshmanager DB exists at the default path
- Parse the sshmanager schema (EF Core format) and map to HyperShell schema
- Import: hosts, groups, tags, port forwarding profiles, snippets
- Map auth types: SshAgent→default, Password→password, PrivateKeyFile→keyfile, OnePassword→op-reference
- Show import preview with counts before committing
- Skip duplicates (match by hostname+port+username)

**Files:**

| Action | Path |
|--------|------|
| Modify | `packages/shared/src/ipc/channels.ts` — add `hosts.importSshManager` |
| Modify | `packages/shared/src/ipc/schemas.ts` — add import schemas |
| Create | `apps/desktop/src/main/ipc/sshManagerImportIpc.ts` |
| Create | `apps/desktop/src/main/ipc/sshManagerImportIpc.test.ts` |
| Modify | `apps/desktop/src/main/ipc/registerIpc.ts` — register handler |
| Modify | `apps/desktop/src/preload/desktopApi.ts` — add preload method |
| Modify | `apps/ui/src/types/global.d.ts` — add type |
| Create | `apps/ui/src/features/hosts/SshManagerImportDialog.tsx` |
| Modify | `apps/ui/src/features/sidebar/Sidebar.tsx` — add import option |

**Steps:**

1. Create `sshManagerImportIpc.ts`:
   - Open the sshmanager DB read-only at `%LocalAppData%\SshManager\sshmanager.db`
   - Query `HostEntries` table — map columns to HyperShell host schema
   - Query `HostGroups` — map to groups
   - Query `CommandSnippets` — map to snippets
   - Query `PortForwardingProfiles` — map to host port forwards
   - Map auth types: `0`=SshAgent→`default`, `1`=PrivateKeyFile→`keyfile`, `2`=Password→`password`, `4`=OnePassword→`op-reference`
   - Return preview: `{hosts: [...], groups: [...], snippets: [...], portForwards: [...]}`
2. Create import dialog showing counts and checkboxes per category
3. On confirm, batch-insert into HyperShell DB using existing repositories
4. Handle DPAPI passwords: these CANNOT be decrypted by Electron (DPAPI is .NET specific) — show a note that passwords must be re-entered or use 1Password references instead

**Test plan:**
- Unit: auth type mapping, column name mapping, duplicate detection
- Manual: have sshmanager installed with hosts → import → verify all hosts appear

**Commit:** `feat: add one-click import from sshmanager database`

---

## Phase 2 — Feature Parity

> These features bring HyperShell to full parity with sshmanager. Complete before removing the "beta" label.

---

### Task 2.1: Session Recording (ASCIINEMA v2)

**Why:** sshmanager records terminal sessions in ASCIINEMA v2 format with playback. This is a differentiating feature that power users love for auditing, training, and debugging.

**Behavior:**
- Record button in terminal toolbar starts recording
- Captures terminal output as ASCIINEMA v2 `.cast` files (JSON header + newline-delimited event frames)
- Playback dialog with speed control (0.5x–4x), seek bar, play/pause
- Recording browser to list/delete/export recordings

**ASCIINEMA v2 format:**
```
{"version": 2, "width": 80, "height": 24, "timestamp": 1234567890}
[0.5, "o", "hello "]
[1.0, "o", "world\r\n"]
```

**Files:**

| Action | Path |
|--------|------|
| Create | `packages/db/src/migrations/008_session_recordings.sql` |
| Create | `packages/db/src/repositories/sessionRecordingRepository.ts` |
| Modify | `packages/db/src/index.ts` — apply migration 008 |
| Create | `packages/session-core/src/recording/asciinemaWriter.ts` |
| Create | `packages/session-core/src/recording/asciinemaReader.ts` |
| Create | `packages/session-core/src/recording/asciinemaWriter.test.ts` |
| Create | `packages/session-core/src/recording/asciinemaReader.test.ts` |
| Modify | `packages/shared/src/ipc/channels.ts` — add `recording` channels |
| Modify | `packages/shared/src/ipc/schemas.ts` — add recording schemas |
| Create | `apps/desktop/src/main/ipc/recordingIpc.ts` |
| Modify | `apps/desktop/src/main/ipc/registerIpc.ts` — register + intercept session data for recording |
| Modify | `apps/desktop/src/preload/desktopApi.ts` — add methods |
| Modify | `apps/ui/src/types/global.d.ts` — add types |
| Create | `apps/ui/src/features/recording/RecordingPlaybackDialog.tsx` |
| Create | `apps/ui/src/features/recording/RecordingBrowserDialog.tsx` |
| Modify | `apps/ui/src/features/terminal/LoggingButton.tsx` — add recording option alongside text logging |

**Steps:**

1. Create migration 008: `session_recordings` table (id, host_id, title, file_name, width, height, started_at, ended_at, duration_ms, file_size_bytes, event_count, created_at)
2. Create `asciinemaWriter.ts` — class that creates the header, appends frames with relative timestamps, and finalizes the file. Store recordings at `app.getPath("userData")/recordings/`
3. Create `asciinemaReader.ts` — parse a `.cast` file, return header + frames array for playback
4. Create IPC handler with: `recording.start`, `recording.stop`, `recording.list`, `recording.delete`, `recording.getFrames`
5. Integrate with existing `registerIpc.ts` session data flow — when recording is active, pipe terminal data events to the writer
6. Create `RecordingPlaybackDialog.tsx` — xterm.js terminal in read-only mode, replay frames with `setTimeout` at adjusted speed, slider for seek, speed buttons
7. Create `RecordingBrowserDialog.tsx` — table of recordings with play/delete buttons
8. Add a "Record" toggle to the existing `LoggingButton.tsx` dropdown

**Commit:** `feat: add ASCIINEMA v2 session recording and playback`

---

### Task 2.2: Connection History

**Why:** Users want to see when they last connected, how often, and whether connections failed. sshmanager tracks this for every connection attempt.

**Files:**

| Action | Path |
|--------|------|
| Create | `packages/db/src/migrations/009_connection_history.sql` |
| Create | `packages/db/src/repositories/connectionHistoryRepository.ts` |
| Modify | `packages/db/src/index.ts` — apply migration |
| Modify | `packages/shared/src/ipc/channels.ts` — add channels |
| Modify | `packages/shared/src/ipc/schemas.ts` — add schemas |
| Create | `apps/desktop/src/main/ipc/connectionHistoryIpc.ts` |
| Modify | `apps/desktop/src/main/ipc/registerIpc.ts` — log connection events |
| Modify | `apps/desktop/src/preload/desktopApi.ts` |
| Modify | `apps/ui/src/types/global.d.ts` |
| Create | `apps/ui/src/features/hosts/ConnectionHistoryDialog.tsx` |
| Modify | `apps/ui/src/features/sidebar/SidebarHostList.tsx` — show "last connected" in context menu |

**Schema — Migration 009:**
```sql
CREATE TABLE IF NOT EXISTS connection_history (
  id TEXT PRIMARY KEY,
  host_id TEXT REFERENCES hosts(id) ON DELETE CASCADE,
  connected_at TEXT DEFAULT CURRENT_TIMESTAMP,
  disconnected_at TEXT,
  was_successful INTEGER NOT NULL DEFAULT 1,
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_conn_history_host ON connection_history(host_id);
```

**Steps:**

1. Create migration and repository with: `record(hostId, success, error?)`, `listByHost(hostId, limit)`, `listRecent(limit)`, `cleanup(olderThanDays)`
2. In `registerIpc.ts`, when a session emits `connected` or `failed` status, insert a connection history record
3. On session `exit`, update `disconnected_at`
4. Add cleanup on app startup: delete records older than 90 days (configurable via setting)
5. Create `ConnectionHistoryDialog.tsx` — table sorted by date, showing host, duration, success/fail
6. Add "Connection History" to host context menu in sidebar

**Commit:** `feat: add connection history tracking with auto-cleanup`

---

### Task 2.3: Credential Caching

**Why:** Re-entering passwords on every reconnect is tedious. sshmanager caches credentials in encrypted memory with configurable timeout and clears on Windows lock.

**Behavior:**
- After successful auth with a password, cache it in main process memory (NOT on disk)
- Cache key: `hostname:port:username`
- Timeout: clear after 15 minutes of inactivity (configurable)
- Clear on: Windows lock event (`powerMonitor.on("lock-screen")`)
- Clear on: app exit
- On reconnect, check cache before prompting

**Files:**

| Action | Path |
|--------|------|
| Create | `apps/desktop/src/main/security/credentialCache.ts` |
| Create | `apps/desktop/src/main/security/credentialCache.test.ts` |
| Modify | `apps/desktop/src/main/ipc/registerIpc.ts` — use cache in SFTP connect flow |
| Modify | `apps/desktop/src/main/main.ts` — setup lock-screen listener, clear on quit |
| Modify | `apps/ui/src/features/settings/SettingsPanel.tsx` — add cache settings |

**Steps:**

1. Create `credentialCache.ts`:
   ```typescript
   interface CacheEntry { password: string; expiresAt: number; }
   const cache = new Map<string, CacheEntry>();
   function cacheKey(host, port, user) { return `${host}:${port}:${user}`; }
   export function set(host, port, user, password, ttlMs = 900000) { ... }
   export function get(host, port, user): string | null { ... }
   export function clearAll() { cache.clear(); }
   ```
2. In `registerIpc.ts` SFTP connect flow, check cache before prompting for password
3. After successful SFTP auth, cache the credential
4. In `main.ts`, register `powerMonitor.on("lock-screen", () => clearAll())` and `app.on("before-quit", () => clearAll())`
5. Add settings: `security.credentialCacheEnabled` (default true), `security.credentialCacheTtlMinutes` (default 15)

**Commit:** `feat: add in-memory credential caching with auto-expiry`

---

### Task 2.4: Session Crash Recovery

**Why:** If the app crashes with 10 sessions open, users lose all their work. sshmanager saves session state and offers to restore on next launch.

**Behavior:**
- Periodically save active session state (tab layout, host IDs, transport types) to DB
- On app launch, check for unsaved sessions from a non-graceful shutdown
- Show recovery dialog: "Restore previous sessions?" with list of what was open
- On restore, reopen tabs and reconnect

**Note:** HyperShell already has `sessionRecoveryStore.ts` in the UI — this task adds the backend persistence and crash detection.

**Files:**

| Action | Path |
|--------|------|
| Create | `packages/db/src/migrations/010_saved_sessions.sql` |
| Create | `packages/db/src/repositories/savedSessionRepository.ts` |
| Modify | `packages/db/src/index.ts` — apply migration |
| Modify | `packages/shared/src/ipc/channels.ts` — add `session.saveState`, `session.loadSavedState`, `session.clearSavedState` |
| Modify | `packages/shared/src/ipc/schemas.ts` |
| Create | `apps/desktop/src/main/ipc/sessionRecoveryIpc.ts` |
| Modify | `apps/desktop/src/main/ipc/registerIpc.ts` |
| Modify | `apps/desktop/src/main/main.ts` — save state on interval + set graceful flag on quit |
| Modify | `apps/desktop/src/preload/desktopApi.ts` |
| Modify | `apps/ui/src/types/global.d.ts` |
| Create | `apps/ui/src/features/sessions/SessionRecoveryDialog.tsx` |
| Modify | `apps/ui/src/app/App.tsx` — show recovery dialog on mount |

**Steps:**

1. Migration 010: `saved_sessions` table (id, host_id, transport, profile_id, title, was_graceful INTEGER DEFAULT 0, saved_at)
2. In `main.ts`, save all active session tab state every 30 seconds to `saved_sessions`
3. On graceful quit (`before-quit`), set `was_graceful = 1` on all saved sessions
4. On app startup, query for sessions where `was_graceful = 0` — these are crash survivors
5. Create `SessionRecoveryDialog.tsx` — shows list of sessions with host names, "Restore All" / "Dismiss" buttons
6. On restore, reopen tabs via `layoutStore` and trigger reconnection

**Commit:** `feat: add session crash recovery with periodic state save`

---

### Task 2.5: SSH Config Export

**Why:** sshmanager can export hosts back to `~/.ssh/config`. Users expect round-trip capability. HyperShell only exports JSON/CSV currently.

**Files:**

| Action | Path |
|--------|------|
| Create | `apps/desktop/src/main/ipc/hostExport.ts` — extract export logic |
| Modify | `apps/desktop/src/main/ipc/registerIpc.ts` — add SSH config export handler |
| Modify | `packages/shared/src/ipc/schemas.ts` — extend `exportHostsRequestSchema` with `"ssh-config"` format |
| Modify | `apps/ui/src/features/sidebar/SidebarHostList.tsx` — add export format option |

**Steps:**

1. Extend `exportHostsRequestSchema` format enum: `z.enum(["json", "csv", "ssh-config"])`
2. Create `exportHostsToSshConfig(hosts)` function that generates valid `~/.ssh/config` syntax:
   ```
   Host myserver
     HostName 10.0.0.1
     Port 22
     User admin
     IdentityFile ~/.ssh/id_ed25519
     ProxyJump bastion
   ```
3. Add `"ssh-config"` case to the export handler in `registerIpc.ts`
4. Add "SSH Config" option to the export format dropdown in the UI

**Commit:** `feat: add SSH config format to host export`

---

### Task 2.6: Host Profiles (Templates)

**Why:** Power users with many similar hosts (e.g., a fleet of servers) want templates to avoid repeating config. sshmanager has `HostProfile` for this.

**Files:**

| Action | Path |
|--------|------|
| Create | `packages/db/src/migrations/011_host_profiles.sql` |
| Create | `packages/db/src/repositories/hostProfileRepository.ts` |
| Modify | `packages/db/src/index.ts` |
| Modify | `packages/shared/src/ipc/channels.ts` — add `hostProfile` channels |
| Modify | `packages/shared/src/ipc/schemas.ts` — add profile schemas |
| Create | `apps/desktop/src/main/ipc/hostProfileIpc.ts` |
| Modify | `apps/desktop/src/main/ipc/registerIpc.ts` |
| Modify | `apps/desktop/src/preload/desktopApi.ts` |
| Modify | `apps/ui/src/types/global.d.ts` |
| Create | `apps/ui/src/features/hosts/HostProfileManagerDialog.tsx` |
| Modify | `apps/ui/src/features/hosts/HostForm.tsx` — add "Apply Profile" dropdown |

**Schema — Migration 011:**
```sql
CREATE TABLE IF NOT EXISTS host_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  default_port INTEGER DEFAULT 22,
  default_username TEXT,
  auth_method TEXT DEFAULT 'default',
  identity_file TEXT,
  proxy_jump TEXT,
  keep_alive_interval INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE hosts ADD COLUMN host_profile_id TEXT REFERENCES host_profiles(id) ON DELETE SET NULL;
```

**Steps:**

1. Create migration, repository with CRUD operations
2. Add IPC channels: `hostProfile.list`, `hostProfile.upsert`, `hostProfile.remove`
3. Create `HostProfileManagerDialog.tsx` — list profiles, create/edit/delete
4. In `HostForm.tsx`, add a "Profile" dropdown at the top. When selected, auto-fill port, username, auth method, identity file, proxy jump from the profile. User can override individual fields.
5. When saving a host with a profile, store `host_profile_id` on the host record

**Commit:** `feat: add host profiles (templates) for bulk configuration`

---

### Task 2.7: Per-Host Environment Variables

**Why:** Some servers need specific env vars set on connection (e.g., `TERM=xterm-256color`, `LANG=en_US.UTF-8`). sshmanager stores these per-host.

**Files:**

| Action | Path |
|--------|------|
| Create | `packages/db/src/migrations/012_host_env_vars.sql` |
| Create | `packages/db/src/repositories/hostEnvVarRepository.ts` |
| Modify | `packages/db/src/index.ts` |
| Modify | `packages/shared/src/ipc/channels.ts` |
| Modify | `packages/shared/src/ipc/schemas.ts` |
| Create | `apps/desktop/src/main/ipc/hostEnvVarIpc.ts` |
| Modify | `apps/desktop/src/main/ipc/registerIpc.ts` — pass env vars to SSH session |
| Modify | `packages/session-core/src/transports/sshPtyTransport.ts` — accept env vars |
| Modify | `apps/ui/src/features/hosts/HostForm.tsx` — add env var editor section |

**Schema — Migration 012:**
```sql
CREATE TABLE IF NOT EXISTS host_env_vars (
  id TEXT PRIMARY KEY,
  host_id TEXT NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  is_enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_host_env_vars_host ON host_env_vars(host_id);
```

**Steps:**

1. Create migration and repository
2. In `sshPtyTransport.ts`, accept `envVars?: Record<string, string>` in profile, merge with `process.env` when spawning PTY
3. In `registerIpc.ts` SSH connect flow, load env vars for the host and pass to transport
4. In `HostForm.tsx`, add an "Environment Variables" collapsible section with a key-value editor (add/remove rows, name validation: `^[A-Za-z_][A-Za-z0-9_]*$`)

**Commit:** `feat: add per-host environment variables`

---

### Task 2.8: Window State Persistence

**Why:** Users expect the app to remember its position and size. sshmanager does this.

**Files:**

| Action | Path |
|--------|------|
| Modify | `apps/desktop/src/main/windows/createMainWindow.ts` — save/restore position/size |
| Modify | `apps/desktop/src/main/ipc/hostsIpc.ts` — use settings repo for window state |

**Steps:**

1. In `createMainWindow.ts`, before creating the window, read stored bounds from `app_settings` (keys: `window.x`, `window.y`, `window.width`, `window.height`, `window.maximized`)
2. If stored bounds exist and are on a visible display (check with `screen.getDisplayMatching()`), use them. Otherwise use defaults.
3. On window `resize`, `move`, and `maximize`/`unmaximize` events, debounce-save the bounds to settings
4. On maximize, store `window.maximized = true`. On restore, load maximized state.

**Commit:** `feat: persist and restore main window position and size`

---

### Task 2.9: Host Status Pinging

**Why:** sshmanager pings hosts in the background to show online/offline status. Users with many servers value this at-a-glance info.

**Files:**

| Action | Path |
|--------|------|
| Create | `apps/desktop/src/main/monitoring/hostStatusService.ts` |
| Create | `apps/desktop/src/main/monitoring/hostStatusService.test.ts` |
| Modify | `packages/shared/src/ipc/channels.ts` — add `hosts.status` event channel |
| Modify | `packages/shared/src/ipc/schemas.ts` — add status schemas |
| Modify | `apps/desktop/src/main/ipc/registerIpc.ts` — start monitoring, emit events |
| Modify | `apps/desktop/src/preload/desktopApi.ts` |
| Modify | `apps/ui/src/types/global.d.ts` |
| Modify | `apps/ui/src/features/sidebar/SidebarHostList.tsx` — show status dot (green/red/gray) |

**Steps:**

1. Create `hostStatusService.ts` — periodically (every 60s) attempt TCP connect to each host's port with a 3s timeout. Emit status events: `{hostId, online: boolean, latencyMs}`
2. Use `net.createConnection()` for TCP probe — NOT ICMP ping (many servers block ICMP)
3. Only check hosts that are visible in the sidebar (not all 200 hosts at once)
4. Emit status via IPC event to renderer
5. In `SidebarHostList.tsx`, show a small colored dot next to each host: green=online, red=offline, gray=unknown/not checked

**Commit:** `feat: add background host status monitoring with sidebar indicator`

---

### Task 2.10: Tags System

**Why:** sshmanager has color-coded tags for filtering hosts. HyperShell has host colors but no proper tag system with filtering.

**Note:** The `tags` and `host_tags` tables already exist in migration 001 but are unused. This task activates them.

**Files:**

| Action | Path |
|--------|------|
| Create | `packages/db/src/repositories/tagRepository.ts` |
| Modify | `packages/shared/src/ipc/channels.ts` — add `tags` channels |
| Modify | `packages/shared/src/ipc/schemas.ts` — add tag schemas |
| Create | `apps/desktop/src/main/ipc/tagIpc.ts` |
| Modify | `apps/desktop/src/main/ipc/registerIpc.ts` |
| Modify | `apps/desktop/src/preload/desktopApi.ts` |
| Modify | `apps/ui/src/types/global.d.ts` |
| Create | `apps/ui/src/features/hosts/TagManager.tsx` |
| Modify | `apps/ui/src/features/hosts/HostForm.tsx` — add tag picker |
| Modify | `apps/ui/src/features/sidebar/SidebarHostList.tsx` — add tag filter bar |

**Steps:**

1. Create tag repository: `list()`, `upsert(id, name, color)`, `remove(id)`, `getHostTags(hostId)`, `setHostTags(hostId, tagIds[])`
2. Add IPC + preload for tag CRUD and host-tag association
3. Create `TagManager.tsx` — color picker + name editor for tags
4. In `HostForm.tsx`, add a tag picker (multi-select chips with color dots)
5. In `SidebarHostList.tsx`, add a filter bar with clickable tag chips — clicking a tag filters the host list

**Commit:** `feat: add color-coded tag system with sidebar filtering`

---

## Phase 3 — Differentiators & Cross-Platform

> These features go beyond sshmanager and target growth.

---

### Task 3.1: macOS Support

**Why:** This is the primary reason for the migration. Cross-platform is the growth multiplier.

**Substasks:**

| # | Item | Details |
|---|------|---------|
| 3.1a | **Secure storage** | Replace DPAPI with Electron `safeStorage` (already used). Verify it works on macOS Keychain. |
| 3.1b | **SSH binary path** | macOS uses `/usr/bin/ssh`. Update `buildSshPtyCommand()` in `sshPtyTransport.ts` to handle macOS path. |
| 3.1c | **Serial ports** | macOS uses `/dev/tty.*` and `/dev/cu.*` paths. Verify `serialport` npm discovers them. |
| 3.1d | **App menu** | macOS expects an app menu bar (About, Preferences, Quit in the app menu). Create a macOS-specific menu. |
| 3.1e | **DMG packaging** | Add `electron-builder` macOS target in `electron-builder.yml`: `dmg` + `zip` for auto-update. |
| 3.1f | **Code signing** | Add Apple Developer ID signing config (can be deferred for initial beta). |
| 3.1g | **CI pipeline** | Add macOS runner to GitHub Actions for build + test. |
| 3.1h | **PuTTY import** | Already guarded with `process.platform === "win32"` — verify it hides on macOS. |
| 3.1i | **Tray icon** | macOS tray uses template images (monochrome). Provide a macOS-specific icon. |
| 3.1j | **Homebrew Cask** | Create a Homebrew Cask formula for `brew install --cask hypershell`. |

**Commit series:** `feat(macos): ...` for each substask

---

### Task 3.2: Visual Tunnel Builder

**Why:** sshmanager's graph-based tunnel builder is its most unique feature. Replicating it in HyperShell would be a strong differentiator.

**Approach:** Use a React canvas library (e.g., `reactflow`) for the node graph. Nodes represent: local machine, jump hosts, destination servers. Edges represent SSH tunnels with port forward configs.

**Files:**

| Action | Path |
|--------|------|
| New dependency | `reactflow` in `apps/ui/package.json` |
| Create | `apps/ui/src/features/tunnels/TunnelBuilderDialog.tsx` |
| Create | `apps/ui/src/features/tunnels/TunnelNode.tsx` |
| Create | `apps/ui/src/features/tunnels/TunnelEdge.tsx` |
| Create | `apps/ui/src/features/tunnels/tunnelBuilderStore.ts` |
| Create | `packages/db/src/migrations/013_tunnel_profiles.sql` |
| Create | `packages/db/src/repositories/tunnelProfileRepository.ts` |

**This is a large feature — break into sub-PRs:**
1. Data model + repository for tunnel profiles (nodes + edges as JSON)
2. React Flow canvas with drag-drop node placement
3. Edge configuration (port forward type, ports)
4. Execute button — translates graph into SSH commands and port forwards
5. Save/load tunnel profiles

**Commit:** `feat: add visual tunnel builder with React Flow`

---

### Task 3.3: Kerberos/GSSAPI Authentication

**Why:** Enterprise users on Active Directory domains use Kerberos. sshmanager supports it. This is only needed if targeting enterprise customers.

**Approach:** The ssh2 npm library does NOT support GSSAPI. Two options:
1. Use the system `ssh` binary (already used for terminal sessions) which supports GSSAPI natively — just add `-o GSSAPIAuthentication=yes` to args
2. For SFTP (which uses ssh2 library), fall back to password auth with a note

**Files:**

| Action | Path |
|--------|------|
| Modify | `packages/session-core/src/transports/sshPtyTransport.ts` — add GSSAPI SSH args |
| Modify | `packages/shared/src/ipc/schemas.ts` — add `"kerberos"` to auth method enum |
| Modify | `apps/ui/src/features/hosts/HostForm.tsx` — add Kerberos auth option |

**Steps:**

1. Add `"kerberos"` to auth method enum in schemas
2. In `buildSshArgs()`, when auth method is kerberos, add `-o GSSAPIAuthentication=yes -o GSSAPIDelegateCredentials=yes`
3. In `HostForm.tsx`, add Kerberos option in auth method dropdown (show note: "Uses your Windows domain credentials")
4. For SFTP connections, show a warning that Kerberos is not supported for file transfers — use password or key auth instead

**Commit:** `feat: add Kerberos/GSSAPI authentication support for SSH`

---

### Task 3.4: Application Theming (Light/Dark/System)

**Why:** sshmanager supports System/Light/Dark themes. HyperShell is dark-only. macOS users especially expect light mode support.

**Files:**

| Action | Path |
|--------|------|
| Modify | `apps/ui/src/index.css` — add light theme CSS variables |
| Modify | `apps/ui/src/features/settings/settingsStore.ts` — add theme setting |
| Modify | `apps/ui/src/features/settings/SettingsPanel.tsx` — add theme selector |
| Modify | `apps/desktop/src/main/main.ts` — sync with `nativeTheme` |

**Steps:**

1. Define light theme CSS variables in `index.css` under a `[data-theme="light"]` selector
2. Add `appearance.theme` setting with values: `"system"`, `"dark"`, `"light"`
3. In main process, use `nativeTheme.themeSource` to sync with OS preference
4. In renderer, apply `data-theme` attribute to `<html>` based on setting
5. Listen to `nativeTheme` changes for `"system"` mode

**Commit:** `feat: add light/dark/system theme support`

---

## Phase Summary & Timeline Guidance

| Phase | Tasks | Focus | Ship Gate |
|-------|-------|-------|-----------|
| **Phase 1** | 1.1–1.7 | Security, import, safety | Can announce migration |
| **Phase 2** | 2.1–2.10 | Feature parity | Can remove "beta" label |
| **Phase 3** | 3.1–3.4 | Growth & cross-platform | Can target new audiences |

**Dependency order within phases:** Tasks within each phase are independent unless noted. They can be worked in parallel or in any order. The numbering reflects recommended priority, not hard dependencies.

**Cross-phase dependencies:**
- Task 1.7 (sshmanager import) should be last in Phase 1 since it benefits from all other Phase 1 features being in place
- Task 3.1 (macOS) can start during Phase 2 — it's mostly infrastructure, not features
- Task 3.2 (tunnel builder) depends on the port forwarding system already working (it does)

---

## Migration Announcement Template

Once Phase 1 is complete, post this on the sshmanager GitHub repo:

```markdown
## Announcing HyperShell — The Next Generation

After [X] months of development, I'm excited to announce **HyperShell**, 
the successor to SshManager. Built with Electron + React for cross-platform 
support (Windows today, macOS coming soon).

### What's New
- Cross-platform architecture (macOS support in progress)
- Integrated SFTP file browser with drag-and-drop
- SFTP sync engine
- Remote file editor
- Visual port forwarding manager
- Modern UI with split panes and workspace save/restore

### Migration
**One-click import:** HyperShell can import your SshManager hosts, groups, 
and snippets automatically. Just go to Settings → Import from SshManager.

**Note:** Saved passwords cannot be migrated (they use Windows DPAPI encryption). 
You'll need to re-enter them or switch to 1Password references.

### Download
[Link to releases]

### SshManager Status
SshManager will remain available for existing users but is now in maintenance mode. 
New features will be developed exclusively in HyperShell.
```
