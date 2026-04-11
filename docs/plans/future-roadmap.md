# HyperShell Future Roadmap

## Current Status (v0.1.2)

Solid MVP with SSH/serial terminals, dual-pane SFTP, port forwarding, host management (PuTTY/SSH config/SshManager/1Password imports), auto-reconnect, broadcast mode, snippets, session recovery, workspace save/restore. CI covers Ubuntu, Windows, and macOS.

---

## Improvements

### UX Polish
1. **Keyboard shortcut customization** — let users rebind shortcuts instead of hardcoded Ctrl+Shift combos
2. **Multi-language / i18n support** — even just English/Hebrew would broaden reach
3. **Search within SFTP file browser** — find files by name in remote directories
4. **Drag-and-drop file transfer** — drag files from OS explorer into SFTP pane (and vice versa)
5. **Tab pinning** — pin frequently used sessions so they persist across restarts
6. **Connection profiles** — save full connection configs (host + tunnels + env vars + snippets) as reusable profiles
7. **Breadcrumb editing** — wire breadcrumb editing in SftpDualPane (existing TODO)
8. **Terminal scrollback search highlighting** — highlight all matches in scrollback, not just current

### Performance & Reliability
9. **SFTP transfer resume** — resume interrupted large file transfers
10. **Connection health dashboard** — aggregate view of all active sessions' latency/status
11. ~~**Database WAL mode** — if not already enabled, WAL improves concurrent read/write performance~~ **Done (v0.1.0)** — WAL enabled in `openDatabase()` pragmas.
12. **Lazy-load CodeMirror** — the 12 language packages are heavy; load on demand

### Security
13. **SSH agent forwarding toggle** — per-host option to enable/disable agent forwarding
14. **Audit log** — track who connected where and when (useful for teams)
15. **Session timeout / auto-lock** — lock app after idle period

---

## New Features

### High Impact
16. **SSH key generation** — generate ed25519/RSA keys directly in-app (SshKeyManager partially implemented)
17. ~~**Remote terminal multiplexing (tmux integration)** — detect/attach to remote tmux/screen sessions~~ **Done (v0.1.2)** — per-host opt-in probe, picker modal, shell-quoted attach. Key-based auth only.
18. **Cloud host discovery** — import hosts from AWS EC2, Azure VMs, GCP instances via their CLIs
19. ~~**Telnet/Raw TCP transport** — some network gear still needs telnet~~ **Done (v0.1.1)** — quick-connect dialog, Telnet protocol negotiation (NAWS, SGA, echo), raw TCP mode.
20. **Command palette** — Ctrl+Shift+P for all actions (like VS Code)
21. **Session sharing / collaboration** — share terminal view read-only with a teammate
22. **Portable mode** — run from USB with config stored alongside executable

### Nice to Have
23. ~~**Terminal recording playback** — add `.cast` format (asciinema-compatible) for replay~~ **Done (v0.1.1)** — asciinema `.cast` recording + reader/writer in session-core.
24. **Expect/automation scripts** — simple scripting for login sequences or repeated tasks
25. **Host grouping by tags** — filter sidebar by color tag, not just group folders
26. **SFTP diff viewer** — compare local and remote file before upload
27. **Notification webhooks** — notify Slack/Teams when a session disconnects
28. **Plugin/extension system** — let users add custom transports or UI panels

---

## ~~Linux Version~~ **Done (v0.1.1)** — AppImage + deb packaging, CI workflow, tray support.

### 1. Packaging (electron-builder)

Add to `electron-builder.yml`:

```yaml
linux:
  icon: build/icons
  category: Development
  target:
    - target: AppImage
      arch: [x64]
    - target: deb
      arch: [x64]
    - target: rpm
      arch: [x64]
  desktop:
    Name: HyperShell
    Comment: SSH & Serial Terminal
    Terminal: false
    Type: Application
    Categories: Development;Network;
```

### 2. Tray Icon

In `createTray.ts`, add a Linux branch. Note: Linux tray support varies (GNOME removed it, KDE/XFCE have it). Consider making tray optional or using `libappindicator`.

### 3. Secure Storage

Electron's `safeStorage` on Linux uses the system keyring (GNOME Keyring, KWallet, or `libsecret`). Existing fallback to base64 handles cases where no keyring is available. Add a warning in settings if secure storage is unavailable.

### 4. CI/CD — Add `linux-release.yml`

```yaml
name: Linux Release
on:
  workflow_dispatch:
  push:
    tags: ["v*"]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm ci:build && pnpm ci:test && pnpm ci:test:e2e
      - run: pnpm rebuild:native
      - run: pnpm release:linux:unsigned
      - run: pnpm release:manifest
      - uses: actions/upload-artifact@v4
        with:
          name: linux-release
          path: apps/desktop/release/*.{AppImage,deb,rpm}
```

### 5. Release Scripts

Add to `apps/desktop/package.json`:
```json
"package:linux:unsigned": "electron-builder --linux --config electron-builder.yml",
"release:linux:unsigned": "pnpm build:bundle && pnpm prepare:package && pnpm package:linux:unsigned"
```

### 6. Platform-Specific Notes

- **PuTTY import**: already guarded with `process.platform !== "win32"` — no change needed
- **Serial ports**: `serialport` auto-discovers `/dev/ttyUSB*` etc. on Linux — works out of the box
- **File paths**: already using `path.join` and `app.getPath()` — no hardcoded Windows paths
- **Native modules**: node-pty, better-sqlite3, serialport all build on Linux — need build-essential and python3

### 7. Linux-Specific Additions (Optional)

- **Wayland support**: add `--ozone-platform-hint=auto` to Electron flags for native Wayland
- **`.desktop` file**: electron-builder generates it from the `linux.desktop` config
- **Snap/Flatpak**: can be added later as additional targets
- **Auto-updater**: consider `electron-updater` with GitHub Releases as update source (works for AppImage)
