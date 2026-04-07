# Configuration

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `SSHTERM_RENDERER_URL` | (auto-detected) | Override renderer URL. In dev: `http://localhost:5173`. In prod: bundled `dist/renderer/index.html`. |
| `SSHTERM_ENABLE_LOCAL_FS` | `1` | Enable local filesystem IPC (`fs:list`, `fs:stat`, `fs:get-drives`). Set to `0` to disable local browsing. |
| `SSHTERM_FS_ALLOW_SYSTEM_ROOTS` | `0` | Expand local FS allowlist to system roots/drives. When `0`, access is scoped to home + `SSHTERM_FS_ALLOWED_ROOTS`. |
| `SSHTERM_FS_ALLOWED_ROOTS` | (empty) | Comma-separated absolute paths added to the local FS allowlist. |
| `SSHTERM_ENABLE_SSH_KEY_DISCOVERY` | `0` | Enable `fs:list-ssh-keys` path discovery for `~/.ssh` private keys. |
| `SSH_AUTH_SOCK` | (none) | SSH agent socket path. Used by SFTP transport as fallback agent. |
| `CI` | (none) | Set by GitHub Actions. Affects test timeouts and server startup. |

### Build & Release Variables

| Variable | Purpose |
|----------|---------|
| `CSC_LINK` | Base64-encoded code signing certificate (Windows release) |
| `CSC_KEY_PASSWORD` | Code signing key password |
| `PLAYWRIGHT_BASE_URL` | E2E test server URL (default: `http://127.0.0.1:5173`) |
| `PLAYWRIGHT_START_SERVER` | Auto-start Vite dev server for E2E (default: `true`) |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE` | Custom Chromium binary path for Playwright |

## App Settings

User preferences are stored in the `app_settings` SQLite table as JSON key-value pairs. Managed through `settingsStore` (UI) and `settingsIpc` (main process).

### Terminal Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `terminal.theme` | string | `"default"` | Active terminal color theme |
| `terminal.fontSize` | number | `14` | Terminal font size in pixels |
| `terminal.fontFamily` | string | `"IBM Plex Mono"` | Terminal font family |
| `terminal.lineHeight` | number | `1.2` | Terminal line height multiplier |
| `terminal.cursorStyle` | string | `"block"` | Cursor style: block, underline, bar |
| `terminal.cursorBlink` | boolean | `true` | Whether cursor blinks |

### Window Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `window.width` | number | `1200` | Window width in pixels |
| `window.height` | number | `800` | Window height in pixels |
| `window.maximized` | boolean | `false` | Whether window is maximized |
| `window.sidebarWidth` | number | `240` | Sidebar width in pixels |

## Terminal Themes

The default terminal theme uses the custom color palette defined in `apps/ui/src/index.css`:

```
Background:  #07111f (surface)
Foreground:  #e5eefb
Cursor:      #7dd3fc (light cyan)
Selection:   rgba(125, 211, 252, 0.28)
```

Custom themes can be created via the Theme Editor in Settings. Dracula theme is included as a preset.

## SSH Configuration

HyperShell reads `~/.ssh/config` for host resolution during SFTP connections. The system `ssh` binary (used for terminal sessions) reads this file natively.

SFTP connections resolve credentials in this priority order:
1. Auth modal input (username/password entered by user)
2. Host record from database (username, identity_file)
3. Effective SSH config (`ssh -G <target>` output)
4. Default key files (`~/.ssh/id_ed25519`, `~/.ssh/id_rsa`, etc.)

## Database Location

The SQLite database is stored at the Electron app data path:
- **Windows:** `%APPDATA%/SSHTerm/sshterm.db`
- **macOS:** `~/Library/Application Support/SSHTerm/sshterm.db`
- **Linux:** `~/.config/SSHTerm/sshterm.db`
