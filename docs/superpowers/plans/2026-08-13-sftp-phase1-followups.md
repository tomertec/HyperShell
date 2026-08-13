# SFTP Phase 1 — Deferred Items and Follow-ups

Everything below was found during Phase 1 (`feat/sftp-phase1-data-integrity`), reviewed, and
**deliberately deferred with a ruling**. None of it blocks that branch. This file exists so the
decisions survive — a reviewer finding one of these later should know it was a choice.

Ordered by what I'd pick up first.

## Blocks nothing, but do these next

### 1. Sync uploads still truncate the remote file on failure
`packages/session-core/src/sftp/syncEngine.ts` — the upload leg writes straight to the remote path
via `transport.createWriteStream(remotePath)`. A killed upload leaves a truncated file at the real
path. This is the same bug class Phase 1 fixed for downloads (local temp + rename) and for editor
saves (`sftpTransport.writeFile`).

Pre-existing and out of Phase 1's scope — H4 covered downloads only. **The fix is now cheap:**
`renameWithOverwrite` is already exported from `sftpTransport.ts`, so the upload leg needs a
temp-path `createWriteStream` plus that call. A small follow-up, not a design question.

Call this out in the Phase 1 PR description — a reviewer will notice `writeFile` gained
temp-then-rename while `syncEngine.ts` right beside it did not, and unexplained that reads as an
oversight rather than a scope decision.

### 2. `RemoteEditor.tsx` is dead code carrying two fixed defects
`apps/ui/src/features/sftp/components/RemoteEditor.tsx` has zero importers. It still decodes base64
as text and writes `encoding: "utf-8"` with no version check — both fixed in `EditorApp.tsx`.

Phase 1 added a header comment rather than deleting it (repo convention: mention dead code, don't
remove it). The risk isn't the file; it's that whoever next wires up an SFTP-side editor
reintroduces both bugs with every test still green. **Deleting it is the better end state** — git
history keeps it.

### 3. Two workspaces have a `test` script that cannot work
`packages/session-core` and `packages/shared` have `"test": "vitest"` but no `vitest.config.ts`. Run
from inside the package, vitest resolves the root config whose `projects: ["apps/*", "packages/*"]`
globs match nothing, and reports "No projects were found". So `pnpm --filter @hypershell/session-core test`
fails for reasons unrelated to the tests.

Working form, from the repo root: `npx vitest run --project @hypershell/session-core`.

Fix by adding a `vitest.config.ts` to both, or by correcting the scripts — **and update CLAUDE.md's
Testing section**, which currently advertises the broken `pnpm --filter` form for two of five workspaces.

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

- **`handleReadFile` now stats before reading.** On a server that permits read but refuses stat, a
  file can no longer be **opened** at all — before Phase 1 it could. That is a reachability
  regression, not merely a save limitation. Exotic, but record it accurately.
- **A post-write stat failure reports a successful save as failed.** The write already landed;
  re-saving is idempotent. Annoying, not destructive.
- **Conflict state does not survive a renderer reload.** `conflictIds` is renderer-only and
  `transfer-conflict` isn't replayed, so after a reload a pending conflict shows as a system-paused
  row with only Cancel. Not stranded — Cancel works and correctly rejects the pending promise.
- **A broken symlink is still clobbered.** `lstat` reports a symlink, `realpath` fails on the
  dangling target, and the write replaces the link with a regular file. Per spec.
- **The temp file is briefly world-readable** — created with the server's default umask and
  `chmod`ed only after the write completes.
- **Sync temp files aren't excluded from the upload leg.** `.hypershell-sync-*.tmp` isn't in
  `shouldExclude`, so in a bidirectional run a stranded temp could be uploaded. Very narrow.

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
