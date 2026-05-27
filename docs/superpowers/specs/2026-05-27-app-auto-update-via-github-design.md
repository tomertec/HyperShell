# In-App Auto-Update via GitHub Releases — Design

**Date:** 2026-05-27
**Status:** Approved design, pending implementation plan
**Repo:** `tomertec/HyperShell` (public)

## Goal

Let HyperShell detect when a newer version has been published as a GitHub
Release and update itself from inside the app. Chosen UX: **notify +
one-click install**. Self-update on **Windows + Linux**; **macOS** gets a
"download" link only (the build is not signed/notarized, so unsigned
auto-install is not viable there).

## Mechanism

Use **`electron-updater`** (the `electron-builder` ecosystem's updater),
backed by GitHub Releases. It handles semver comparison, differential
downloads (blockmaps), signature verification, download-progress events,
and install orchestration (`quitAndInstall` → relaunch into the NSIS
installer on Windows / AppImage swap on Linux).

Rejected alternative: a custom GitHub-API checker. It avoids a pipeline
change but reimplements the hard, error-prone parts (NSIS
silent-install-and-relaunch, AppImage swap, differential download) and
offers weaker verification (sha from the same source as the file vs.
Authenticode). Not worth it.

## Current release pipeline (context)

- Releases are cut by pushing a `v*` git tag → GitHub Actions
  (`windows-release.yml`, `linux-release.yml`, `macos-release.yml`)
  builds, signs (Windows only), and uploads the installer asset to a
  GitHub Release via `gh release upload`.
- `electron-builder.yml` currently has `publish: null`, so **no**
  update metadata (`latest.yml` / blockmaps) is produced today.

## Architecture

Four units, each independently understandable and testable.

### 1. Release pipeline (CI) — the only CI-facing change

In `apps/desktop/electron-builder.yml`, replace `publish: null` with the
GitHub provider:

```yaml
publish:
  provider: github
  owner: tomertec
  repo: HyperShell
```

Effects of setting a publish provider (even while still packaging with
`--publish never`, so upload behavior is unchanged):

- electron-builder writes update metadata into `apps/desktop/release/`:
  `latest.yml` (Windows), `latest-linux.yml`, and `.blockmap` files.
- electron-builder bundles `app-update.yml` into the packaged app
  resources so the client knows which repo/release to poll.

Workflow change (`windows-release.yml` and `linux-release.yml`): broaden
the upload step from just `*.exe` / `*.AppImage` to also upload
`latest*.yml` and `*.blockmap`.

**Upload ordering (required):** upload the installer asset **first**, then
upload `latest*.yml` + `*.blockmap` **last**. Assets become visible on the
release as they upload; if `latest.yml` lands before the installer, a
client polling at that instant would see an advertised version whose asset
404s. Sequence the `gh release upload` calls accordingly.

### 2. Main-process update service — `apps/desktop/src/main/updates/updateService.ts`

Thin wrapper around `electron-updater`'s `autoUpdater`.

- **Config:** `autoDownload: false`, `autoInstallOnAppQuit: false`
  (we drive the flow to match notify-first UX), `allowPrerelease: false`.
- **Guards:** no-op unless `app.isPackaged` (dev builds have no metadata
  and electron-updater throws). On `process.platform === 'darwin'`, skip
  `autoUpdater` entirely and use the macOS fallback below.
- **Triggers:** one check ~10s after the main window is ready; a periodic
  re-check every ~4h while running; an on-demand check via IPC.
- **Events → renderer:** subscribe to `update-available`,
  `download-progress`, `update-downloaded`, `update-not-available`,
  `error`; normalize to a single state object and forward via
  `webContents.send` on the `updates:state` channel.
- **macOS fallback:** `fetch`
  `https://api.github.com/repos/tomertec/HyperShell/releases/latest`,
  semver-compare `tag_name` (strip leading `v`) against
  `app.getVersion()`; if newer, emit a `manual-available` state carrying
  the release HTML URL. The banner offers a button that calls
  `shell.openExternal(url)`.

Structure the service so the pure "given an updater event, produce the
next state object" logic is a separate, testable function from the
`autoUpdater` wiring.

### 3. IPC contract — `packages/shared/src/ipc/`

Following the existing Zod request/response pattern (validated on both
preload and main):

- **Channels** (`channels.ts`): `updates:check`, `updates:download`,
  `updates:install` (→ `quitAndInstall`), `updates:getState`, and a push
  event `updates:state`.
- **Schemas** (new `updateSchemas.ts`): the state object
  (`status`, `version?`, `progressPercent?`, `releaseUrl?`, `error?`) and
  the (mostly empty) request payloads.
- **Preload** (`desktopApi.ts`): typed methods for each channel plus a
  subscribe helper for `updates:state`.
- **Types** (`global.d.ts`): declarations for the new `window.hypershell`
  methods.

### 4. Renderer UI — `apps/ui/src/features/updates/`

**State machine** (Zustand `updateStore.ts`), mirroring the `updates:state`
push event:

```
idle ──check──▶ checking ──┬─▶ up-to-date ──▶ idle
                           ├─▶ available ──download──▶ downloading(%) ──▶ downloaded ──install──▶ (app quits)
                           ├─▶ manual-available (macOS: holds release URL)
                           └─▶ error
```

User actions (`download`, `install`, `check now`) call the matching IPC
method.

**Surfaces:**

- **`UpdateBanner.tsx`** — a slim, dismissible bar (Framer Motion
  slide-in, consistent with existing modals). States: "HyperShell vX.Y.Z
  is available → **Download**" / progress bar while downloading / "Update
  ready → **Restart & install**". macOS: "→ **Download**" opening the
  browser. Dismiss hides it until the next check finds a newer version.
- **Settings → Updates section** — current version, a "Check for updates"
  button (drives `updates:check`, shows the inline result), and the
  last-checked timestamp.

## Data flow (Windows/Linux happy path)

```
app start → updateService.init() [packaged & supported platform]
  → (after ~10s) checkForUpdates()
  → autoUpdater 'update-available'
  → main sends updates:state {available, version}
  → updateStore → banner shows "Download"
  → user clicks → IPC updates:download → autoUpdater.downloadUpdate()
  → 'download-progress' stream → updates:state {downloading, percent}
  → 'update-downloaded' → updates:state {downloaded}
  → banner "Restart & install"
  → user clicks → IPC updates:install → autoUpdater.quitAndInstall()
```

macOS path: `init()` → fetch releases API → compare → `updates:state
{manual-available, releaseUrl}` → banner "Download" → `shell.openExternal`.

## Error handling

- **Auto-checks fail silently** — log in main, set store `error`, show no
  banner. Never nag on a flaky network.
- **Manual checks** surface the error inline in Settings ("Couldn't check
  — try again").
- GitHub API unauthenticated limit (60/hr) is far above our cadence; the
  macOS path treats rate-limit/network errors as "couldn't check".
- **Signature / checksum mismatch** → electron-updater rejects the
  download; show "Update failed verification" and do **not** install.

## Security

- **Windows:** electron-updater validates the new installer's Authenticode
  publisher against the running signed app before installing.
- **Linux:** AppImage sha512 verified against `latest-linux.yml` (fetched
  over HTTPS from the GitHub release).
- **macOS:** manual download only — no unsigned auto-install.

## Bootstrap caveat (operational, must communicate)

Users on the current build (v0.1.9) have **no** `app-update.yml` in their
packaged resources — that file first ships in the first build that has
`publish: github`. Consequence: the **first** auto-update-enabled release
cannot deliver itself; existing users install it manually one last time,
and only **subsequent** releases auto-update. Note this in the release
notes so it isn't filed as "auto-update is broken."

## Testing

- **Unit (Vitest):** semver comparison + macOS release-API parser (mock
  `fetch`); the `updateStore` reducer transitions; the
  `updateService` pure event→state function. Test files next to source as
  `*.test.ts`.
- **Manual verification plan (documented for implementer):**
  - Local two-version test using electron-updater's `dev-app-update.yml`
    pointing at a test GitHub release. Confirm check → download → install
    on **Windows** and AppImage swap on **Linux**.
  - **NSIS install-mode checkpoint:** `electron-builder.yml` uses
    `oneClick: false, perMachine: false,
    allowToChangeInstallationDirectory: true`. electron-updater's NSIS
    update path is designed to install silently (different args than
    first-install), but the assisted-installer template + the
    change-directory option have surprised people. Verify: after clicking
    "Restart & install," the installer must **not** show UI. If it does,
    evaluate `oneClick: true` for the update path. **Do not pre-commit to
    a flag change — verify behavior first.**
- **CI:** unchanged — keeps gating build + unit + Playwright. No real
  install E2E (installers can't relaunch headlessly).

## Out of scope (YAGNI)

Delta/staged rollouts, release channels, mandatory/forced updates, in-app
changelog rendering, rollback, an auto-check on/off toggle (the chosen UX
is notify + one-click; checks-on-launch are always on).
