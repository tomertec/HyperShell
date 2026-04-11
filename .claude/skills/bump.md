---
name: bump
description: Bump the app version (patch increment), create a draft GitHub release, let CI build & attach installers for Windows, macOS and Linux, then verify all releases completed.
user_invocable: true
---

# /bump — Version Bump, Build & Release

Bump the app version (patch increment), create a draft GitHub release, push a tag that triggers CI to build and attach platform installers (Windows `.exe`, macOS `.dmg`, Linux `.AppImage`/`.deb`), and verify all three release workflows complete successfully.

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
      - **Linux:** `Download \`hypershell-{new_version}-linux-x86_64.AppImage\` or \`.deb\` and install.`
    - A `### System Requirements` section with:
      - `- Windows 10/11`
      - `- macOS 12+ (Monterey or later)`
      - `- Linux (Ubuntu 20.04+, Fedora 36+, or equivalent)`

13. **Inform the user** that CI is building, then **wait 5 minutes** before checking:
    > Release is in **draft** state. CI is building installers for all 3 platforms.
    > I'll check back in 5 minutes to verify all builds completed.

14. **Wait 5 minutes**, then check all three release workflows:
    ```bash
    gh run list --limit 10 | grep "v{new_version}"
    ```
    Look for three workflows matching the tag: `Windows Release`, `macOS Release`, `Linux Release`.

    - If **all three show `completed` + `success`**: report success and print the release URL.
    - If **any are still `in_progress`**: wait another 3 minutes and check again (up to 3 retries, ~14 minutes total max wait).
    - If **any show `completed` + `failure`**: report which platform(s) failed, fetch the failed logs with `gh run view {run_id} --log-failed | tail -30`, and show the error to the user.

15. **Final summary**:
    - Old version → new version
    - GitHub release URL
    - Status of each platform build (pass/fail)
    - If all passed: remind user to review and publish the draft release
    - If any failed: show the error and suggest next steps

## After /bump completes

The tag push triggers three CI workflows:
- **Windows Release** (`windows-release.yml`) — builds signed `.exe`, attaches to the draft release via `gh release upload`
- **macOS Release** (`macos-release.yml`) — builds `.dmg`, attaches to the draft release via `gh release upload`
- **Linux Release** (`linux-release.yml`) — builds `.AppImage` and `.deb`, attaches to the draft release via `gh release upload`

The skill automatically verifies all three complete before declaring done.

## Rules

- Do NOT modify any files other than the 6 `package.json` files and `CHANGELOG.md`.
- Do NOT build installers locally — CI handles all three platforms.
- If any step fails (build, test), abort and report the error — do not push or release.
- Always confirm with the user before pushing (step 9).
- Always verify CI releases completed before declaring the bump done (steps 14-15).
