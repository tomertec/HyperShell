# Build & Release

## Build Commands

```bash
# Development
pnpm --filter @hypershell/ui dev          # Vite dev server (port 5173)
pnpm --filter @hypershell/desktop dev     # Electron with Vite HMR

# Production build
pnpm build                              # All workspaces
pnpm --filter @hypershell/ui build         # UI only (outputs to apps/ui/dist/)
pnpm --filter @hypershell/desktop build    # Desktop only (esbuild → apps/desktop/dist/)

# Native module rebuild (after Node.js version change)
pnpm --filter @hypershell/desktop rebuild:native
```

## Build Pipeline

```
packages/shared    → tsc (type-check only, no emit)
packages/db        → tsc
packages/session-core → tsc
apps/ui            → Vite (outputs to dist/)
apps/desktop       → tsc + esbuild (bundles main.js + preload.js)
                   → .tools/desktop/sync-renderer-dist.mjs copies ui/dist → desktop/dist/renderer/
```

The desktop main process is bundled with esbuild as ESM. Native modules (`better-sqlite3`, `node-pty`, `serialport`, `ssh2`) are externalized.

## Packaging

```bash
# Unsigned Windows installer (for dev/testing)
pnpm release:windows:unsigned

# Signed Windows installer (for distribution)
pnpm release:windows:signed

# macOS DMG (unsigned)
pnpm release:mac:unsigned

# Linux AppImage + deb (unsigned)
pnpm release:linux:unsigned
```

### electron-builder Configuration

Defined in `apps/desktop/electron-builder.yml`:

| Setting | Value |
|---------|-------|
| App ID | `com.hypershell.desktop` |
| Product Name | HyperShell |
| Target | Windows NSIS x64, macOS DMG x64, Linux AppImage/deb x64 |
| Output | `apps/desktop/release/` |
| Artifact | `hypershell-${version}-${arch}.exe` |
| ASAR | Enabled with unpack for native modules |

Native modules unpacked from ASAR: `better-sqlite3`, `node-pty`, `serialport`, `cpu-features`.

### Code Signing

Requires environment variables:
- `CSC_LINK` — Base64-encoded `.pfx` certificate
- `CSC_KEY_PASSWORD` — Certificate password

Verify signing environment: `.tools/desktop/verify-signing-env.mjs`

## Release Process

```bash
# 1. Bump version and update changelog
pnpm release:prepare

# 2. Build and package
pnpm build
pnpm release:windows:signed

# 3. Generate release manifest (checksums)
pnpm release:manifest

# 4. Tag and push
git tag v<version>
git push origin v<version>
```

## CI/CD

### PR Gates (`.github/workflows/pr-gates.yml`)
Triggered on every pull request:
1. Ubuntu (build + test + E2E), Windows (build), macOS (build), Linux (build)
2. pnpm install → build → unit tests → E2E (Playwright)
3. All checks must pass before merge

### Windows Release (`.github/workflows/windows-release.yml`)
Triggered by version tag (`v*`) or manual dispatch:
1. Runs on `windows-latest`
2. Builds all workspaces
3. Packages with electron-builder (NSIS)
4. Signs installer with CSC certificate
5. Uploads artifact to GitHub release

### macOS Release (`.github/workflows/macos-release.yml`)
Triggered by version tag (`v*`) or manual dispatch:
1. Runs on `macos-latest`
2. Builds, tests, packages DMG (unsigned)
3. Uploads artifact to GitHub release

### Linux Release (`.github/workflows/linux-release.yml`)
Triggered by version tag (`v*`) or manual dispatch:
1. Runs on `ubuntu-latest`
2. Builds, tests, packages AppImage + deb (unsigned)
3. Uploads artifacts to GitHub release

## Utility Scripts

| Script | Purpose |
|--------|---------|
| `.tools/release/prepare-version-and-changelog.mjs` | Bumps version in all package.json files, updates CHANGELOG.md |
| `.tools/release/write-release-manifest.mjs` | Generates SHA-256 checksums for release artifacts |
| `.tools/desktop/verify-signing-env.mjs` | Validates CSC_LINK and CSC_KEY_PASSWORD are set |
| `.tools/desktop/sync-renderer-dist.mjs` | Copies `apps/ui/dist/` into `apps/desktop/dist/renderer/` |
