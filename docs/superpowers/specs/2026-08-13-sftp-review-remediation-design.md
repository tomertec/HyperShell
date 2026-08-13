# SFTP Review Remediation — Design

**Date:** 2026-08-13
**Status:** Approved for planning
**Scope:** All high-priority, medium-priority, accessibility, and UX findings from the SFTP feature review. The missing-feature roadmap (P0–P2) is explicitly out of scope.

## Context

A feature review of the SFTP browser returned a FIX-FIRST verdict: five high-priority
findings, four medium, an accessibility pass, and six UX improvements. All fifteen were
verified against the code before this design was written. Every one is real.

Three are worse than the review described, and two of the review's proposed fixes were
adjusted after reading the surrounding code. Those differences are recorded inline below,
because they change what gets built.

The work is organised as four sequential phases in one design. Phases ship independently;
each gates on its own tests.

## Verification notes

Findings confirmed at the cited locations, with corrections:

| Finding | Status | Correction |
|---|---|---|
| H1 conflict UI unreachable | Confirmed, worse | `deriveActiveCount` (transferStore.ts:27) counts only `status === "active"`. A conflict-paused job is `paused`, so once the panel is closed and nothing else runs, `TransferPanel` returns `null` (line 96–105) — permanently unreachable. Separately, `conflictIds` lives in `TransferPopup` local state (line 376), so it does not survive unmount and does not exist for the panel at all. |
| H2 binary corruption | Confirmed | Detection covers NUL bytes only; a non-UTF-8 text file with no NULs also round-trips lossily. |
| H3 non-atomic saves | Confirmed | — |
| H4 sync >10 MB | Confirmed, worse | The `readFile` throw at syncEngine.ts:252 sits inside the outer `try`, so one oversized file aborts the entire sync run, not just that file. |
| H5 stale listings | Confirmed | — |
| M1 sync ownership | Confirmed, worse | `sftpSyncStatusSchema` carries no `sftpSessionId` and no paths, so the panel is structurally unable to identify its own sync. Because `running` is local state, reopening the panel offers "Start Sync" while a sync is live — permitting two overlapping syncs over the same paths. |
| M2 silent mutations | Confirmed | `PromptDialog`/`ConfirmDialog` are shared, so one fix covers rename, delete, mkdir, and bookmark. `handleBookmarkConfirm` (SftpTab.tsx:369) also never refreshes the toolbar list. |
| M3 close-tab | Confirmed | — |
| A11y | Confirmed, reframed | `color-contrast` is deliberately disabled in `accessibility.spec.ts:7` as a theme-wide concern. There are 14 themes, at least 4 light; the review scanned one. |
| UX (6) | Confirmed | — |

## Phase 1 — Data integrity

**Goal:** SFTP cannot silently lose, corrupt, or strand data.

### 1.1 Conflict resolution reachable in both monitors

Root cause: conflict state lives in a component instead of the store.

- Move conflict state into `transferStore` as `conflictIds: Set<string>`, written only by
  `transferEventCoordinator` — added on `transfer-conflict`, cleared on any subsequent
  `transfer-progress` or `transfer-complete` for that id. `TransferPopup` drops its local
  `useState`. This also fixes conflict loss on popup unmount, which the review did not catch.
- Extract `<TransferConflictActions>` (Overwrite / Skip / Rename / Overwrite all / Skip all),
  rendered by both `TransferPanel` and `TransferPopup`.
- Gate `TransferPanel`'s Resume on `userInitiated`, matching `TransferPopup:315`, so a
  conflict-paused job shows conflict actions instead of a button the backend throws on
  (`transferManager.ts:1190`).
- Add a derived `attentionCount` — queued, active, paused, interrupted, or conflicted — and
  use it for the collapsed affordance in place of `activeCount`. Closing the panel can no
  longer strand work.

### 1.2 Editor cannot corrupt binary files

- Persist `encoding` on `EditorTab` instead of discarding the value `normalizeFileContent`
  already returns (sftpIpc.ts:231).
- Extend detection beyond NUL bytes to invalid UTF-8: strict-decode in main, and classify as
  binary on failure. Without this, a latin-1 file with no NULs decodes to U+FFFD and saves back
  corrupted.
- Binary tabs open read-only: banner, save disabled, Download and Open-externally offered.

### 1.3 Atomic, conflict-aware saves

- Add `writeFileAtomic` to `sftpTransport`: write to a sibling temp, `chmod` it to the
  original's mode, rename over the target. A dropped connection leaves a temp file rather than
  a truncated original. The `chmod` step is required — a plain temp+rename silently resets
  permissions.
- Rename requires a fallback chain. SFTP v3 `RENAME` fails when the destination exists on
  OpenSSH, so rename-over is not portable: try `posix-rename@openssh.com`, fall back to
  unlink-then-rename, fall back to direct write.
- Record `{size, mtime}` at open; re-stat before save; on change prompt **Overwrite / Reload /
  Save As / Cancel**.
- **Compare is dropped from the review's list.** It requires a diff viewer that does not exist,
  which makes it a feature rather than a fix; it belongs with the deferred roadmap. Reload plus
  Save As already prevent data loss.

### 1.4 Sync streams large files

- Replace `transport.readFile()` at syncEngine.ts:252 with `createReadStream` → local temp →
  rename, matching the upload path which already streams.
- Isolate per-file errors: wrap each file, collect failures, report on completion instead of
  aborting the run.

### 1.5 Stale directory listings discarded

Per-pane monotonic request id held in a ref. `loadDirectory` captures it; entries, errors, and
the `setLoading(false)` in `finally` all no-op when the id has moved on. Applied identically to
`RemotePane` and `LocalPane`.

### Phase 1 tests

Vitest: store/coordinator conflict transitions, encoding classifier, rename fallback chain,
request-id guard. Sync gains a case with a file above the 10 MB editor limit — the exact gap
that hid this defect.

## Phase 2 — Trust and feedback

**Goal:** every operation reports what happened, and nothing destroys work without asking.

### 2.1 Sync ownership

- Add `sftpSessionId`, `localPath`, `remotePath`, and `direction` to `sftpSyncStatusSchema`.
  Nothing else in this section is possible without them.
- Filter sync events by `syncId` so another session's `sync-complete` cannot reset this panel.
- Scope the sync list to the current session; label rows `local → remote` rather than a
  12-character id prefix.
- Recover ownership on mount from `sftpSyncList()` instead of local `useState`, so reopening
  the panel can still stop a running sync.
- Derive `running` from recovered status, making the duplicate-overlapping-sync hazard
  unrepresentable.

### 2.2 Remote mutations report failure

- Extend `PromptDialog` and `ConfirmDialog` with `pending` and `error` props.
- Invert the order in all four handlers: `await` inside `try/catch` with the dialog held open
  and disabled; close only on success; render failures inline.
- Use `Promise.allSettled` for delete and name the paths that failed. The current `Promise.all`
  rejects on first failure and abandons the rest silently.
- Refresh bookmarks after upsert.

### 2.3 Closing a tab protects in-flight work

- Before disconnecting, gather work owned by that `sftpSessionId`: running transfers from
  `transferStore`, running syncs (identifiable via 2.1), and unsaved editor tabs.
- Editor dirty state requires a small IPC addition — the editor is a separate window with its
  own store, invisible to `Workspace`. Main already tracks editor windows per session
  (`onEditorSessionClosed`), so the editor reports a dirty count and `Workspace` queries it.
  Without this the warning covers only part of the user's work.
- Dialog lists affected work and offers **Cancel** or **Close and disconnect**.
- **"Keep connection until transfers finish"** requires main to own a deferred-disconnect state
  machine: detach the tab, keep the session alive, disconnect when transfers drain. Included,
  but flagged as the first item to cut if scope needs trimming — the other two options already
  prevent data loss; this one is convenience.

### Phase 2 tests

Vitest: sync-event filtering and ownership recovery including the double-start case; dialog
pending/error contract; close-tab work gathering. The deferred-disconnect machine gets its own
main-process test if retained.

## Phase 3 — Accessibility

**Goal:** the SFTP browser is keyboard-operable and legible in every theme.

### 3.1 Contrast at the token level

The review found three failing elements. The underlying defect is that `--color-text-muted` is
a decorative token used for essential information — column headings, status labels, filter
counts — compounded by opacity modifiers and 9–10px type.

- **Fix usage first (SFTP only, no outside impact).** Move column headings, status labels, and
  filter counts from `text-text-muted` to `text-text-secondary`. Replace Disconnect's
  `text-red-400/80` with the `--color-danger` token, no opacity. Remove opacity-on-text
  throughout the SFTP components — it defeats any token fix beneath it.
- **Audit token values across all 14 themes.** Four are light; at least one fails by
  inspection (rosé-pine-dawn `#9893a5` on `#faf4ed`, roughly 3:1). Raise only failing values,
  preserving hue.
- **Guard with a unit test, not axe.** Compute contrast ratios for `text-secondary`,
  `text-muted`, and `danger` against their `base-*` backgrounds for every theme and assert
  **4.5:1** (WCAG AA, normal text) for all three, since all three carry essential information
  after the usage fix above. A pure function covers all 14 themes without a browser and does
  not reopen the `color-contrast` rule that `accessibility.spec.ts:7` deliberately disabled.

**Accepted tradeoff:** raising token values changes light-theme appearance app-wide, not just
in SFTP. Approved on the grounds that the token is the actual defect and patching only SFTP
leaves the same trap for the next feature.

### 3.2 Structural fixes

- `DriveSelector`: add `aria-label="Local drive"`. `title` is not an accessible name for a
  `<select>`.
- Sortable headers: wrap labels in real `<button>`s; put `aria-sort` on the `<th>`; treat the
  `▲/▼` indicator as decorative.
- Splitters become keyboard-operable. The pane splitter (`SftpDualPane:220`) and the three
  column handles (`FileList:321`) carry `role="separator"` with no `tabIndex`, no key handling,
  and no values — the role is currently inaccurate. Add `tabIndex={0}`, arrow-key adjust,
  Home/End, `aria-valuenow`/`valuemin`/`valuemax`, and an accessible name.

### Phase 3 tests

Token contrast as a unit test across all themes. Structural additions extend
`accessibility.spec.ts` under the existing rule set: `aria-sort` presence, drive selector
accessible name, splitter focusability and arrow-key response. `color-contrast` stays disabled
there.

## Phase 4 — UX affordances

**Goal:** common actions are visible and the active pane is unmistakable.

### 4.1 Transfer rail between the panes

Widen the 1px divider into a ~28px vertical rail with centered **←** and **→** buttons, drag
handle occupying the remainder. Buttons disable with a reason when the relevant pane has no
selection — Upload reads the local selection, Download the remote. Tooltips carry existing
bindings ("Download (F5)") so the rail advertises the keyboard path rather than competing with
it.

A Total Commander–style bottom function bar was considered and rejected: it spends vertical
space permanently, and the review specifically asked for a between-panes control.

### 4.2 Filter always visible

Remove the `w-0` → `focus:w-44` behaviour (SftpToolbar.tsx:97) — a zero-width input is an
invisible target that only works if you already know it exists. Replace with a resting-width
input, magnifier icon, and the existing `Filter (Ctrl+F)` placeholder, using the toolbar's
`flex-1` spacer.

### 4.3 Refresh actually refreshes

Rather than renaming the button to "Reload bookmarks", make it reload the active pane's
directory, which is what every file manager's Refresh does and what users assume regardless of
label. Bind `Ctrl+R` — F5 is taken by Download. Bookmark reloading needs no button: 2.2
refreshes after upsert, and the menu reloads on open.

### 4.4 Recoverable error states

`FileList:330` replaces the list with centered red text and no way forward. Replace with an
error block carrying the message, **Retry** (re-runs `loadDirectory` for that path), and
**Copy details**. Toolbar and breadcrumb already survive, so navigating elsewhere stays
possible.

### 4.5 Legible type

Raise the floor to 11px: every `text-[9px]` and `text-[10px]` in the SFTP components and both
transfer monitors becomes `text-[11px]`. One target value, no case-by-case judgement.

**No Compact/Comfortable setting.** The review offered it as an alternative, but it adds a
persisted preference, a settings row, and two layout paths to maintain, to solve what raising
the floor solves for everyone. Density can be added later if the result feels cramped.

### 4.6 Unmistakable active pane

The two-pixel top border is too quiet for a surface where keyboard transfers and destructive
commands target the active pane. Give the active pane an accent-tinted breadcrumb/header bar
and a full accent border.

**The inactive pane is deliberately not dimmed** — the obvious way to increase contrast between
panes would push inactive text below the Phase 3 threshold. Brighten active chrome only; leave
all text at full strength.

### Phase 4 tests

Playwright: rail enable/disable states, filter visibility at rest, Refresh re-listing the
active pane, error-state Retry. Active-pane styling asserted structurally, not by pixel.

## Out of scope

The review's missing-feature roadmap is deferred in full: sync preview, persistent per-host
paths and column widths, complete bookmark management, clear-completed/filtering/durable
resume for transfers, directory comparison, remote search, symlink identification, recursive
chmod, local "New folder", and batch conflict policy. Editor **Compare** (from H3) joins this
list for the same reason — it is a feature, not a fix.
