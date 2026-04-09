---
name: bump
description: Bump the app version (patch increment), create a draft GitHub release, and let CI build & attach installers for Windows and macOS.
user_invocable: true
---

# /bump — Version Bump, Build & Release

Bump the app version (patch increment), create a draft GitHub release, and push a tag that triggers CI to build and attach platform installers (Windows `.exe` + macOS `.dmg`).

## Steps

1. **Read current version** from `package.json` (root) — field `"version"`.

2. **Parse** it as `major.minor.patch` (e.g. `"0.1.0"` → 0, 1, 0).

3. **Increment `patch`** by 1 (e.g. `0.1.0` → `0.1.1`).

4. **Update all workspace versions** by running:
   ```bash
   node .tools/release/prepare-version-and-changelog.mjs --version {new_version}
   ```
   This updates all 6 `package.json` files (root, apps/desktop, apps/ui, packages/db, packages/session-core, packages/shared).

5. **Build the project** — abort if build fails:
   ```bash
   pnpm build
   ```

6. **Run tests** — abort if tests fail:
   ```bash
   pnpm test
   ```

7. **Stage changed files and commit**:
   ```bash
   git add package.json apps/desktop/package.json apps/ui/package.json packages/db/package.json packages/session-core/package.json packages/shared/package.json CHANGELOG.md
   git commit -m "bump version to v{new_version}"
   ```

8. **Create a git tag** `v{new_version}` on that commit.

9. **Confirm with the user** before pushing — this is a shared-state action.

10. **Push the commit and tag to remote**:
    ```bash
    git push && git push origin v{new_version}
    ```

11. **Generate release notes** by running:
    ```bash
    git log v{old_version}..v{new_version} --oneline --no-decorate
    ```

12. **Create a draft GitHub release** (no local installer attached — CI will attach them):
    ```bash
    gh release create v{new_version} \
      --title "HyperShell v{new_version}" \
      --draft \
      --notes "{release_notes}"
    ```
    Where `{release_notes}` includes:
    - Title: `## HyperShell v{new_version}`
    - A `### Changes` section with the commit list from step 11
    - A `### Installation` section with:
      - **Windows:** `Download \`hypershell-{new_version}-x64.exe\` and run the installer.`
      - **macOS:** `Download \`hypershell-{new_version}-mac-x64.dmg\`, open it, and drag HyperShell to Applications.`
    - A `### System Requirements` section with:
      - `- Windows 10/11`
      - `- macOS 12+ (Monterey or later)`

13. **Print summary**: old version → new version, GitHub release URL, and a reminder:
    > Release is in **draft** state. CI is building Windows and macOS installers.
    > Once both workflows complete, review the release at {url} and publish it.

## After /bump completes

The tag push triggers two CI workflows:
- **Windows Release** (`windows-release.yml`) — builds signed `.exe`, attaches to the draft release via `gh release upload`
- **macOS Release** (`macos-release.yml`) — builds `.dmg`, attaches to the draft release via `gh release upload`

Once both finish, go to the GitHub release page and click **Publish**.

## Rules

- Do NOT modify any files other than the 6 `package.json` files and `CHANGELOG.md`.
- Do NOT build installers locally — CI handles both platforms.
- If any step fails (build, test), abort and report the error — do not push or release.
- Always confirm with the user before pushing (step 9).
