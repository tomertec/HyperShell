# Dynamic Tab Titles + Tab Bar Polish

**Date:** 2026-08-03
**Status:** Approved design, pending implementation plan

## Goal

Two improvements to the tab bar, modeled on Windows Terminal:

1. **Dynamic titles** — tabs follow the terminal's OSC 0/2 title updates
   (PowerShell's `SetConsoleTitle` reaches xterm as OSC via ConPTY; remote
   shells emit OSC from PROMPT_COMMAND/precmd). Applies to ALL terminal
   transports: local, SSH, serial, telnet.
2. **Visual polish** — per-tab icons replacing the status dot, roomier tabs
   with fade-out truncation, stronger active-tab contrast, tooltip carrying
   the full title.

## Architecture Decision

**Renderer-only, via xterm.js `onTitleChange`.** xterm already parses OSC
title sequences from the data stream; every tab's terminal stays mounted
while hidden (`Workspace.tsx` uses `invisible`, not unmount), so background
tabs update too. No IPC changes, no main-process changes, no second OSC
parser. (Rejected: main-process parsing + new IPC channel — buys nothing
while renderers stay mounted; PTY title polling — local-only, dead end.)

## Section 1: Dynamic titles (data flow)

- `LayoutTab` gains `dynamicTitle?: string`. The existing `title` field
  remains the **static base** (profile name / host name / `user@host`) and
  is never overwritten. Display resolution everywhere: `dynamicTitle ?? title`.
- `layoutStore` gains `setTabDynamicTitle(sessionId: string, title: string | null)`.
  Empty or whitespace-only titles clear to `null` (fallback to base).
- The terminal session hook (`useTerminalSession.ts` — note: this file has
  in-progress uncommitted user changes; build on top, do not revert them)
  subscribes `terminal.onTitleChange`, pipes through a sanitizer, and calls
  the store. The listener is disposed with the terminal.
- **Sanitizer** (pure function, unit-tested): strip C0/C1 control chars,
  collapse runs of whitespace to single spaces, trim, cap at 120 chars.
  Result of `""` → `null`.
- Status bar's active-session title uses the same resolved title.
- Session replacement (`replaceSessionId`, reconnect flows) carries
  `dynamicTitle` with the tab record; a fresh shell will overwrite or the
  base title shows meanwhile.

## Section 2: Tab visual polish (`TabBar.tsx`)

- **Icon replaces the status dot; state tints the icon:**
  - Local tabs: the profile's `LocalProfileIcon` (PowerShell/cmd/WSL glyph),
    resolved from `localProfilesStore` by `profileId`.
  - SSH: terminal `>_` glyph; serial: plug glyph; telnet: terminal glyph;
    SFTP: folder glyph. Small (≈13px), inline SVG, semantic colors only.
  - Tint by session state: connected → `text-text-secondary`
    (`text-text-primary` on the active tab); connecting/reconnecting →
    `text-warning` + existing `host-status-pulse`; `waiting_for_network` →
    `text-warning`; failed → `text-danger`; disconnected →
    `text-text-muted/50`.
- **Roomier tabs:** `min-w-[110px] max-w-[220px]`, slightly wider padding;
  long titles truncate with a CSS `mask-image` linear-gradient fade at the
  right edge (Windows Terminal-style) instead of a hard ellipsis.
- **Stronger active contrast:** active tab keeps `bg-base-900` + accent
  top-line; inactive tab text dims to `text-text-muted` (hover unchanged →
  `text-text-primary`), making the active tab visibly dominant.
- **Tooltip:** headline = resolved (dynamic) title in full; below it the
  base title + transport line and the existing state row.
- Untouched: close button behavior, middle-click close, drag reorder,
  NewTabMenu, keyboard shortcuts.

## Constraints

- Zero IPC / main-process / session-core changes.
- All colors through semantic tokens; no hardcoded palette classes.
- Primitives conventions apply (no colliding className overrides).
- `useTerminalSession.ts` contains uncommitted user work — additive edits
  only; never revert or reformat the existing changes.
- No manual tab rename, no per-host title toggles, no persistence of
  dynamic titles across app restarts (YAGNI — base titles persist as today).

## Testing

- Unit: sanitizer function (control chars, whitespace, cap, empty→null);
  `layoutStore.setTabDynamicTitle` (set/clear/unknown session no-op;
  resolution fallback).
- Existing Vitest + Playwright suites stay green (browser e2e includes
  accessibility spec; tab markup changes must keep names/roles).
- Manual: PowerShell tab title follows cd/running command; SSH tab follows
  remote PROMPT_COMMAND; clearing title reverts to profile/host name.
