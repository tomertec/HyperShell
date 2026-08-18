# SFTP Phase 1 — Deferred Items and Follow-ups

Everything below was found during Phase 1 (`feat/sftp-phase1-data-integrity`), reviewed, and
**deliberately deferred with a ruling**. None of it blocks that branch. This file exists so the
decisions survive — a reviewer finding one of these later should know it was a choice.

Ordered by what I'd pick up first.

## Resolved (2026-08-13, after Phase 1 merged)

### 1. Sync uploads truncated the remote file on failure — fixed
`syncEngine.ts`'s upload leg wrote straight to the remote path, so a killed upload left a truncated
file there — the same bug class Phase 1 fixed for downloads and editor saves. It now uploads to a
sibling temp file and renames it into place via a new `renameOverwrite` on `SftpTransportHandle`
(a thin wrapper over the already-tested `renameWithOverwrite`, which needs the raw `SFTPWrapper`
the sync engine doesn't hold).

Two things came with it:
- Both legs now build their temp path through one `buildTempPath` helper, which also trims the base
  name to the 255-byte filename ceiling — without that, adding a suffix would have made long-named
  files start failing to upload.
- `shouldExclude` now filters `*.hypershell-sync-<hex>.tmp` in **both** directions. This became
  load-bearing rather than cosmetic: before the fix, temp files only ever existed locally, so a
  stranded one was a narrow case; now they exist remotely too, and an unexcluded stranded temp would
  be copied to the far end and then look like real content to the run after that.
- On the `destinationRemoved` failure (rename unlinked the destination, then failed), the temp file
  is deliberately **not** cleaned up — it holds the only copy — and its path is reported in the
  failure message.

### 2. `RemoteEditor.tsx` deleted
Zero importers, and it carried both defects `EditorApp.tsx` had already fixed (base64 decoded as
text, `encoding: "utf-8"` written with no version check). The risk was never the file itself but the
next person wiring up an SFTP-side editor from it with every test still green. Git history keeps it.
`docs/INDEX.md` and `docs/architecture.md` now point at the editor window instead.

### 3. Workspace `test` scripts fixed
It was three workspaces, not two — `db` as well as `session-core` and `shared`. Each now has its own
`vitest.config.ts`, so `pnpm --filter @hypershell/<name> test` works uniformly across all five, and
CLAUDE.md's Testing section and gotcha entry were updated to match.

Note: `db`'s tests (and the two desktop tests that open a real SQLite file) still fail locally on
the better-sqlite3 ABI mismatch — the native module is built against Electron's
`NODE_MODULE_VERSION`, not plain Node's. That is unrelated and pre-existing; the configs fixed the
resolution failure, not that.

### 4. `handleReadFile`'s stat is no longer fatal
Phase 1's stat-before-read made a file unopenable on a server that permits read but refuses stat —
a reachability regression, not just a save limitation. The stat now goes through `readVersionToken`,
which returns `{size: null, modifiedAt: null}` on failure; `sftpReadFileResponseSchema` marks both
nullable, and the renderer already omitted `expectedSize`/`expectedModifiedAt` when its base version
is null. The file opens, saves work, only conflict detection is unavailable.

### 5. Typing during a save no longer clears `dirty`
`writeTab` marked the tab clean using content captured before the await, so a keystroke landing
during the write left the tab looking clean while holding unsaved text — and closing it then skipped
the unsaved-changes confirm entirely. `dirty` is now recomputed against live store state after the
await. `originalContent` still takes the pre-await snapshot, which is correct: that is what actually
reached the server.

## Accepted trade-offs — deliberate, not defects

- **A conflict resets the transfer panel's filter to "all".** A burst of conflicts will repeatedly
  yank a manually-chosen filter back. Accepted: the alternative is a queue-blocking, un-cancelable
  conflict row hidden entirely behind a filter.
- **Mode preservation is best-effort.** A 0600 file saved to a server refusing SETSTAT lands at the
  server default. Accepted because failing the save outright is worse. Owner ruling, commented at
  the site in `sftpTransport.ts`.
- **Small type sizes and opacity-on-text in the transfer monitors** (`text-[9px]`, `text-[10px]`,
  `text-sky-200/70`) were copied verbatim from existing code. Phase 3 owns contrast across all SFTP
  components as one pass; Phase 1 does not make it worse.
- **`apps/ui` now runs entirely under jsdom.** A test needing real Node semantics opts out per-file
  with `// @vitest-environment node` — noted in `apps/ui/vitest.config.ts`.
- **TOCTOU between the version stat and the write** cannot be closed — SFTP has no atomic
  compare-and-swap. Commented at the site.
- **Second-granularity mtime** means a same-length edit within the same second is undetectable by
  the conflict check. Inherent to SFTP v3. Commented at the site.

## Known limitations worth recording

- **A post-write stat failure reports a successful save as failed.** The write already landed;
  re-saving is idempotent. Annoying, not destructive.
- **Conflict state does not survive a renderer reload.** `conflictIds` is renderer-only and
  `transfer-conflict` isn't replayed, so after a reload a pending conflict shows as a system-paused
  row with only Cancel. Not stranded — Cancel works and correctly rejects the pending promise.
- **A broken symlink is still clobbered.** `lstat` reports a symlink, `realpath` fails on the
  dangling target, and the write replaces the link with a regular file. Per spec.
- **The temp file is briefly world-readable** — created with the server's default umask and
  `chmod`ed only after the write completes.
- **Sync upload mode preservation is best-effort**, same ruling as `sftpTransport.writeFile`. Temp +
  rename does not inherit the destination's mode the way an in-place write did, so the upload leg
  copies it from the stat it already performs — but a server refusing SETSTAT lands the file at the
  server default rather than failing the upload. Only applies to files that already existed
  remotely; a newly created one has no mode to preserve.

## Structural invariants a future change could break

- **`pendingConflicts` can currently hold at most one entry**, because `maxConcurrent: 1` and the
  conflicting job still counts against the active budget. This is why `TransferPopup`'s
  `MAX_VISIBLE_TRANSFERS = 1` is safe today. **Raising `maxConcurrent` breaks that invariant** and
  the popup would then hide conflicts.
- **`TransferPopup`'s sort tiebreaker is inert.** `updatedAt` is stamped with one `now` per batch in
  `setTransfers`, so `right.updatedAt - left.updatedAt` is always 0 and ordering collapses to
  insertion order. Correct today by accident, not by design.
- **`transferRowControls` suppresses retry when `hasConflict`**, which the old popup did not.
  Verified unreachable: a job holding a `pendingConflicts` entry is always `paused` and never
  reaches `interrupted`/`failed` except via `cancel()`, which clears the conflict first.

## Test-coverage gaps

- `conflictIds` is never pruned when a transfer leaves the list. Tiny unbounded set; ids are never
  rendered again.
- No isolated test asserts streams are destroyed on failure — `pipeline()` guarantees it, so the
  test would be testing Node.
- The editor's base64 branch and `handleDownloadBinary`'s cancel path are untested. The
  classification logic itself is covered in `sftpIpc.encoding.test.ts`, which is the part that can
  silently regress.
- `setConflict`'s no-op-on-present-id branch and `attentionCount` via `updateTransfer` are untested;
  both are the symmetric twin of a branch that is tested.
- **Typing during a save silently clears `dirty`** — `writeTab` marks the tab clean using content
  captured before the await. Pre-existing, but Phase 1 widened the window (stat + temp write +
  rename + stat).

## Phases 2–4

Still unbuilt, and specified in
[`docs/superpowers/specs/2026-08-13-sftp-review-remediation-design.md`](../specs/2026-08-13-sftp-review-remediation-design.md):
sync ownership and duplicate-run prevention, remote mutations reporting failure, close-tab
protection for in-flight work, the accessibility pass (token-level contrast across all 14 themes,
`aria-sort`, keyboard-operable splitters), and the UX affordances (transfer rail, always-visible
filter, a Refresh that refreshes, recoverable error states, an 11px type floor, unmistakable active
pane).
