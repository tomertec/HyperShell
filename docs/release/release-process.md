# Release Process

## Versioning

- Use semantic versioning in the root `package.json` (`major.minor.patch`).
- Update version before release:
  `pnpm version <new-version> --no-git-tag-version`

## Changelog

- Update `CHANGELOG.md` before packaging.
- Move completed items from `Unreleased` into the new version section.
- Keep entries grouped by `Added`, `Changed`, and `Fixed`.

## Windows Release Steps

1. Run validation gates:
   - `pnpm ci:build`
   - `pnpm ci:test`
   - `pnpm ci:test:e2e`
2. Package installer:
   - unsigned: `pnpm release:windows:unsigned`
   - signed: `pnpm release:windows:signed`
3. Create artifact manifest + checksums:
   - `pnpm release:manifest`
4. Execute manual smoke checklist in [windows-smoke-checklist.md](../testing/windows-smoke-checklist.md).
5. Complete [windows-smoke-execution-sheet.md](../testing/windows-smoke-execution-sheet.md) with pass/fail rows and evidence links.
6. Attach evidence before release approval:
   - App launch and tray evidence.
   - Quick Connect evidence.
   - SSH session evidence.
   - Serial session evidence, if serial is in scope.
   - Broadcast evidence, if broadcast is in scope.
   - Any failure logs or notes.
7. Publish only artifacts listed in `apps/desktop/release/release-manifest.json`.

## Required Artifacts

- NSIS installer (`*.exe`)
- Optional unpacked directory (if created with `package:win:dir`)
- `release-manifest.json`
- `SHA256SUMS.txt`
- Completed smoke execution sheet with evidence links
