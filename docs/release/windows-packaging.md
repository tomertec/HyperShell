# Windows Packaging

## Prerequisites

- Windows 10 or Windows 11 build machine
- Node.js 22+ and `pnpm@10.8.1`
- Installed dependencies from repo root: `pnpm install`
- Code signing certificate (`.pfx`) if producing signed artifacts
- Run packaging from a native Windows shell (PowerShell/CMD), not Linux cross-compilation, because native modules (`node-pty`) cannot be rebuilt for Windows from non-Windows hosts.

## End-to-End Packaging Commands

From repo root:

1. Build and package unsigned Windows installer:
   `pnpm release:windows:unsigned`
2. Build and package signed Windows installer:
   `pnpm release:windows:signed`
3. Generate artifact checksums and manifest:
   `pnpm release:manifest`

Generated artifacts are written to `apps/desktop/release`.

## Signing Configuration

Before running the signed flow, set these environment variables in the Windows shell session:

- `CSC_LINK` (or `WIN_CSC_LINK`): absolute path or base64 source for the certificate
- `CSC_KEY_PASSWORD` (or `WIN_CSC_KEY_PASSWORD`): certificate password

PowerShell example:

```powershell
$env:CSC_LINK = "C:\\certs\\sshterm-release.pfx"
$env:CSC_KEY_PASSWORD = "<certificate-password>"
pnpm release:windows:signed
```

## Validation

After packaging:

1. Run the smoke checklist in [windows-smoke-checklist.md](../testing/windows-smoke-checklist.md).
2. Record results and evidence in [windows-smoke-execution-sheet.md](../testing/windows-smoke-execution-sheet.md).
3. Verify generated hashes in `apps/desktop/release/SHA256SUMS.txt`.
4. Publish only artifacts listed in `apps/desktop/release/release-manifest.json`.

## Release Gates

- Smoke checklist passes on a clean Windows machine.
- Execution sheet is complete with pass/fail rows and evidence links for each applicable area.
- App launch, Quick Connect, SSH, serial, recovery, and broadcast evidence are attached when those flows are in scope.
- `pnpm ci:build`, `pnpm ci:test`, and Playwright PR gates pass.
- Installer launch, tray behavior, Quick Connect (`Ctrl+K`), SSH, and serial workflows pass in packaged app.
