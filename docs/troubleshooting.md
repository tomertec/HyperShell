# Troubleshooting

## SFTP

### SFTP tab opens but file list is empty (no files, no errors)

**Cause:** CSS height collapse — the SFTP pane container has 0px height so the file list renders but is invisible.

**Fix:** In `Workspace.tsx`, the `PaneView` root and pane wrappers must use `h-full` (not just `flex-1`) to give absolute-positioned SFTP content a real height.

**How to diagnose:** Open DevTools (Ctrl+Shift+I) → Elements → inspect the SFTP pane container → check computed height. If it's 0, this is the issue.

### SFTP connect fails with "All configured authentication methods failed"

**Possible causes:**

1. **Wrong username** — The SFTP transport may be sending a Windows domain username (e.g. `DOMAIN\user`). Check the host record's username field. The transport strips domain prefixes automatically, but `ssh -G` may return the Windows default user.

2. **Wrong key file** — The host record may reference a key that isn't in `authorized_keys` on the server. The SFTP transport tries all candidate keys sequentially (host record key, then default keys like `id_ed25519`, `id_rsa`). If no default keys exist in `~/.ssh/`, only the explicitly configured key is tried.

3. **No SSH agent** — On Windows, the OpenSSH agent service must be running for agent-based auth. Check: `Get-Service ssh-agent` in PowerShell. The named pipe `\\.\pipe\openssh-ssh-agent` must exist.

4. **Encrypted key without passphrase** — If the key is passphrase-protected, the SFTP auth modal should appear. Enter the passphrase in the "Password / Key Passphrase" field.

**How to diagnose:** Check the Electron console output for `[sftp-auth]` log lines showing what credentials are being used.

### A remote file opens read-only and says it is binary

**Cause:** intended. `sftp:read-file` classified it as binary — either NUL bytes in the first 8KB,
or the content is not valid UTF-8 (a latin-1 file has no NUL bytes but still cannot round-trip).
Editing it as text and saving back as UTF-8 would destroy it.

**Fix:** use the Download button on the notice, edit locally, and upload.

**If it is genuinely UTF-8 text:** check for stray high bytes — `file <path>` and
`iconv -f utf-8 -t utf-8 <path> >/dev/null` on the host will confirm. The classifier is
`normalizeFileContent()` in `sftpIpc.ts`.

### Saving in the editor shows a "changed on the server" dialog

**Cause:** intended. The editor records `size` + `modifiedAt` when it opens a file and sends them
back on save; main re-stats first and refuses to write if either differs, so another person's edits
are not silently destroyed.

**Options:** Overwrite (discard the server's version), Reload (discard yours), Save As, Cancel.

**If it fires when nothing changed:** something else is rewriting the file — a config-management
agent, an editor's autosave, a log rotation. Watch it on the host with
`stat -c '%s %Y' <path>` before and after.

### A saved file's permissions changed

**Cause:** mode preservation is best-effort. Saving writes a temp file and renames it over the
original, copying the original's mode first. If the server refuses SETSTAT the save still succeeds,
and the file lands at the server's default mode instead. Failing the save outright was judged worse.

**Fix:** re-apply the mode on the host (`chmod 600 <path>`). If it recurs on that server, that
server does not support SETSTAT over SFTP.

### Stray `.hypershell-*.tmp` or `.hypershell-sync-*.tmp` files

**Cause:** a save or sync failed after creating its temp file, and the cleanup could not reach the
server either (usually the connection dropped).

**Important:** if the failure message named a temp path, **that file holds your only copy of the
data** — the original was already removed and the replacement rename failed. Recover it before
deleting anything.

**Otherwise:** they are safe to delete. Remote save temps are siblings of the file, hidden, named
`.<name>.hypershell-<hex>.tmp`; sync temps are local, named `<name>.hypershell-sync-<hex>.tmp`.

### A sync reports "Complete" but files are missing

**Cause:** per-file failures no longer abort the whole run — one unreadable file used to kill the
entire sync silently. The completion line reports the failure count and the sync panel shows the
first failure in red.

**Fix:** check the panel's error text for the failing path. Usual causes are permissions on the
remote file or a full local disk.

### SFTP works for SSH terminal but not for SFTP browser

The SSH terminal uses the **system `ssh` binary** which has full access to SSH agent, `~/.ssh/config`, ProxyJump, etc. The SFTP browser uses the **ssh2 npm library** which needs credentials passed explicitly. They may resolve credentials differently.

## Build

### `better-sqlite3` NODE_MODULE_VERSION mismatch

```
The module was compiled against a different Node.js version using
NODE_MODULE_VERSION 132. This version of Node.js requires NODE_MODULE_VERSION 127.
```

**Fix:** Rebuild native modules for the correct Electron version:
```bash
pnpm --filter @hypershell/desktop rebuild:native
```

### TypeScript build errors after changing shared schemas

After modifying `packages/shared/src/ipc/`, you may need to rebuild the package before dependent workspaces pick up the changes:
```bash
pnpm --filter @hypershell/shared build
pnpm build
```

### Vite dev server changes not reflected in Electron

If Electron loads from `apps/desktop/dist/renderer/` (bundled build) instead of `http://localhost:5173` (Vite dev server), the dev server's HMR won't apply.

**Check:** If `apps/desktop/dist/renderer/index.html` exists, Electron uses it. Delete `apps/desktop/dist/renderer/` to force Electron to use the Vite dev server in development.

## Terminal

### Terminal shows garbled output or wrong encoding

Check the terminal theme and font settings in Settings. Ensure the font supports the required character set. Default font is Cascadia Mono.

### SSH connection hangs on "connecting"

1. Verify the host is reachable: `ssh -v user@host` from a terminal
2. Check if ProxyJump is configured in `~/.ssh/config` — the system SSH handles this, but it may timeout
3. Check host status in the sidebar (green dot = reachable)

### A WSL tab's title never shows the running program

WSL processes run inside the VM and are invisible to the Windows process tree (`@vscode/windows-process-tree`). The local process-title poller (`session-core/processTitle/`) can only see Win32 processes, so a WSL pty's tab title stays on the shell name. Expected, not a bug.

### A local Node app's tab title still shows `node`

HyperShell resolves npm-installed Node CLIs by matching the running JavaScript entry script against the nearest package's `bin` metadata. If the command line is unavailable or truncated, the entry script is not an absolute `.js`/`.cjs`/`.mjs` path, the package manifest is inaccessible, or its bin target does not match, the title safely falls back to `node`.

This release resolves Node/npm bins only. Other runtime wrappers and applications that do not expose matching package metadata keep their executable name. Main-process changes require rebuilding `@hypershell/desktop` and restarting Electron before testing the title live.

### A remote shell prints a line of shell code right after connecting

That line is the shell-integration bootstrap (`session-core/shellIntegration/bootstrap.ts`) being echoed back instead of installing silently — happens on shells it wasn't written for (fish, csh) or ones with unusual echo settings.

**Fix:** Turn it off per host with the "Report the running command in the tab title" checkbox in the host editor.

### SSH tab titles stop updating inside tmux

The bootstrap hook installs into the shell that ran before `tmux attach`. Once attached, tmux captures OSC title escapes itself and won't forward them unless the remote's tmux config has `set -g set-titles on`.

### A password-authenticated SSH host never shows the running command

`SessionManager` deliberately skips the shell-integration bootstrap when the host has a configured password. Writing the bootstrap and `sshPtyTransport`'s password-prompt watcher would race on the same pty, so the bootstrap is silently dropped or consumed as (part of) the password. Key-based auth hosts are unaffected. Expected, not a bug.

### A local tab running `ssh` shows "ssh" instead of the remote program's name

The process-title poller only sees the local process tree, and `ssh` (or `mosh`/`plink`/`telnet`) is deepest in it — the actual foreground program is on the far end of the connection. `pickForegroundName` treats these client names as "no local answer" and returns `null`, letting the OSC title from the remote's own shell-integration bootstrap win instead.

**Consequence:** if the remote host has no shell integration (or it's an unsupported shell), the tab keeps showing whatever OSC title was last set — not "ssh". That's the intended trade-off; permanently pinning the tab to "ssh" would hide the real program's name whenever integration does work.

## Serial

### No COM ports listed in serial profile form

1. Ensure the serial device is connected and drivers are installed
2. The port enumeration uses the `serialport` npm library — check Windows Device Manager for the port name
3. Click the refresh button to re-enumerate ports

## Database

### Migration errors on startup

Migrations are idempotent (they check if columns/tables already exist). If you see unexpected errors:

1. Check the database file location: `%APPDATA%/HyperShell/hypershell.db`
2. Back up the database
3. Delete and let the app recreate it on next launch

### Host data appears corrupted

Export your hosts via SSH config import (reverse), delete `hypershell.db`, and reimport.
