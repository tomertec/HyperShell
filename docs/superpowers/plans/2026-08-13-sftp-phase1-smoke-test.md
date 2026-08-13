# SFTP Phase 1 — Manual Smoke Test

**Branch:** `feat/sftp-phase1-data-integrity`
**Why this exists:** two code paths cannot be reached by any automated test in this repo — the `chmod`/SETSTAT step and the symlink-resolution branch in `sftpTransport.writeFile`. Both need a real sshd. Everything else below is covered by unit/E2E tests but is worth eyeballing once, because these are data-loss paths.

**Hosts:** `docker` (zsh + oh-my-zsh — the adversarial one) and `checkmk` (bash, clean). Run the whole list against `docker`; run 3, 5 and 6 against `checkmk` too.

## Setup

```bash
pnpm --filter @hypershell/desktop build
# then launch the app normally
```

Confirm in Settings that **Use popup transfer monitor is OFF** (the default). The inline panel is what most users see and is what Task 4 fixed — testing only the popup would miss the point.

---

## 1. Conflict resolution in the default panel — the headline fix

1. Upload a file to a remote directory where a file of the same name already exists.
2. **Expect:** the inline transfer panel opens by itself and the row shows conflict actions — Overwrite, Skip, Rename, Overwrite all, Skip all.
3. **Expect:** that row has **no** Resume button. (Before this branch it offered one, and the backend rejected it.)
4. Click the panel's **×** to close it while the conflict is still unresolved.
5. **Expect:** a bar remains, reading `Transfers (1 need attention)`. Click it — the panel reopens with the conflict still resolvable.
   *This is the exact stranding bug: previously the panel returned nothing and the transfer was unreachable forever.*
6. Before reopening, switch the panel filter to **completed**, then trigger another conflict.
   **Expect:** the filter snaps back to **all** and the conflicted row is visible. *(FIX 1 from the final review.)*
7. Resolve with Overwrite. **Expect:** the transfer completes.

## 2. Binary files open read-only

1. Open `/bin/ls` (or any binary) from the remote pane via Edit.
2. **Expect:** a read-only notice naming the file, a Download button, and **no** editor.
3. **Expect:** Ctrl+S does nothing and the toolbar Save is disabled.
4. Click **Download**, choose a local path, and confirm the bytes match: `certutil -hashfile <local> SHA256` against `sha256sum /bin/ls` on the host.
5. Now open a **latin-1** text file with no NUL bytes — create one first:
   ```bash
   printf 'copyright \xa9 2026\n' > /tmp/latin1.txt
   ```
   **Expect:** it also opens read-only. *(Before this branch it opened as text with a replacement character and saving corrupted it.)*

## 3. Concurrent remote change is detected — needs both hosts

1. Open a remote text file in the editor. Type something; do not save.
2. In a terminal on the same host, modify that file: `echo "changed by someone else" >> /path/to/file`
3. Save in the editor (Ctrl+S).
4. **Expect:** the conflict dialog appears offering Overwrite, Reload from server (discards your local changes), Save As, Cancel.
5. Click **Reload** — **expect** the server's version, including the appended line.
6. Repeat, and this time use **Save As** with a path that **already exists**.
   **Expect:** it refuses with an inline error naming the path; nothing is overwritten.
7. Repeat, Save As to a **free** path. **Expect:** it succeeds, and the tab's title and syntax highlighting update to the new filename.

## 4. Atomic save preserves permissions — the SETSTAT path

1. On the host: `install -m 600 /dev/null /tmp/secret.txt && echo hello > /tmp/secret.txt`
2. Open it in the editor, change it, save.
3. `ls -l /tmp/secret.txt` — **expect** the mode is still `-rw-------`.
4. `ls -la /tmp/` — **expect no** leftover `.secret.txt.hypershell-*.tmp` files.
5. **If your server refuses SETSTAT**, the save must still succeed (we ruled mode preservation best-effort). The file may land at the server default mode — that is the accepted trade-off, not a bug.

## 5. Symlinked files write through to the target — untestable in CI

1. On the host:
   ```bash
   mkdir -p /tmp/dotfiles && echo "original" > /tmp/dotfiles/bashrc
   ln -sf /tmp/dotfiles/bashrc /tmp/linked-bashrc
   ```
2. Open `/tmp/linked-bashrc` in the editor, change it, save.
3. **Expect:** `cat /tmp/dotfiles/bashrc` shows your edit.
4. **Expect:** `ls -l /tmp/linked-bashrc` is *still a symlink*, not a regular file.
   *Without symlink resolution the save would replace the link itself and the dotfiles copy would silently keep the old content.*

## 6. Sync handles large files and isolates failures

1. On the host, in a directory you will sync:
   ```bash
   dd if=/dev/urandom of=/tmp/synctest/big.bin bs=1M count=25
   echo ok > /tmp/synctest/small.txt
   chmod 000 /tmp/synctest/unreadable.bin   # as a non-root user
   ```
2. Sync remote → local.
3. **Expect:** `big.bin` transfers completely — 25 MB, well over the old 10 MB cap that used to fail outright.
4. **Expect:** the run **completes** rather than aborting; `small.txt` arrives despite `unreadable.bin` failing.
5. **Expect:** the sync panel names the failed file, and the completion line reports the failure count rather than a bare success.
6. **Expect no** leftover `.hypershell-sync-*.tmp` files in the local target directory.

## 7. Fast navigation shows the right directory

1. In the remote pane, click into a large/slow directory, then immediately into a different one.
2. **Expect:** the listing always matches the breadcrumb. Repeat several times quickly.
3. Do the same in the local pane, including navigating to a path outside the allowed roots to trigger the home-directory redirect, then immediately navigating somewhere valid.
4. **Expect:** you are not yanked back to home, and no stale error appears.

---

## Report back

For each numbered section: pass, or what actually happened. Sections **4** and **5** are the ones I most need — they are the only two with no automated coverage anywhere.
