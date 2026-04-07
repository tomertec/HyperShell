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
pnpm --filter @sshterm/desktop rebuild:native
```

### TypeScript build errors after changing shared schemas

After modifying `packages/shared/src/ipc/`, you may need to rebuild the package before dependent workspaces pick up the changes:
```bash
pnpm --filter @sshterm/shared build
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

## Serial

### No COM ports listed in serial profile form

1. Ensure the serial device is connected and drivers are installed
2. The port enumeration uses the `serialport` npm library — check Windows Device Manager for the port name
3. Click the refresh button to re-enumerate ports

## Database

### Migration errors on startup

Migrations are idempotent (they check if columns/tables already exist). If you see unexpected errors:

1. Check the database file location: `%APPDATA%/SSHTerm/sshterm.db`
2. Back up the database
3. Delete and let the app recreate it on next launch

### Host data appears corrupted

Export your hosts via SSH config import (reverse), delete `sshterm.db`, and reimport.
