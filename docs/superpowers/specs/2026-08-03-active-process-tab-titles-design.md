# Active Process in Tab Titles

**Date:** 2026-08-03
**Status:** Approved design, pending implementation plan
**Builds on:** [`2026-08-03-dynamic-tab-titles-design.md`](2026-08-03-dynamic-tab-titles-design.md)

## Goal

A tab running `llmtop` should read `llmtop`, not `pwsh in projects`. Today the
tab shows whatever OSC title the shell last emitted; pwsh sets its title at the
prompt and TUIs that never emit OSC leave it stale, so `onTitleChange`
(`useTerminalSession.ts:363`) simply stops firing for the whole life of the
program.

Two transports are in scope: **local** shells and **SSH**. Serial and telnet
keep today's behaviour.

## Architecture Decision

**Two signal sources, one display path.**

- **Local** — poll the pty's process tree in the main process and take the
  deepest descendant. Precise, needs no cooperation from the shell, and cannot
  be confused by a program that redraws without emitting OSC.
- **SSH** — inject a shell-integration hook at connect that emits OSC titles
  per command. The remote process is invisible to a local process walk (the
  local child is just `ssh.exe`), so the remote shell has to report for itself.
  This rides the OSC pipeline already built, so SSH needs no new plumbing.

Rejected: **remote `ps` polling over the ssh2 pool** — an extra channel per
poll, needs the session's tty (which we'd have to ask for), and inherits the
SFTP-vs-ssh auth divergence. **Opt-in profile snippets** — precise, but nothing
works until every host is hand-configured, which defeats the point.

## Section 1: Local — process-tree polling

- `PtyProcessLike` and `TransportHandle` (`transports/transportEvents.ts:32`)
  gain `pid?: number`. `createPtyProcess` reads it off the node-pty instance and
  exposes it; fakes in tests set it directly. Only pty-backed transports have one.
- New `packages/session-core/src/processTitle/foregroundProcess.ts` — pure,
  no I/O:
  - `ProcessNode = { pid: number; name: string; children: ProcessNode[] }`
  - `ProcessTreeProvider = (rootPid: number) => Promise<ProcessNode | null>`
  - `pickForegroundName(root): string | null` — deepest descendant wins, last
    one on a tie, `.exe` stripped. Returns `null` when the tree is just the root
    or the deepest leaf is itself a shell/wrapper: `pwsh`, `powershell`, `cmd`,
    `bash`, `sh`, `zsh`, `wsl`, `conhost`, `winpty-agent`, `openconsole`.
- New `packages/session-core/src/processTitle/windowsProcessTree.ts` — thin
  wrapper over `@vscode/windows-process-tree`, `require()`d at runtime like
  node-pty (`ptyProcess.ts:56`). Off Windows the provider resolves `null`, so
  the feature degrades to today's behaviour rather than throwing.
  - Why a native module: `wmic` is gone from current Win11 builds and spawning
    `Get-CimInstance` once a second is far too expensive for a background poll.
    `@vscode/windows-process-tree` is what VS Code uses for exactly this.
  - New dependency in `apps/desktop/package.json` and in the `rebuild:native`
    script — it is ABI-bound to Electron like better-sqlite3.
- New `createProcessTitlePoller({ provider, intervalMs = 1000 })` in
  session-core. `SessionManager` owns one instance, registers every local
  session that reports a pid, and emits **only on change**. The timer is created
  when the first local session registers and cleared when the last one leaves,
  so an all-SSH workspace pays nothing.
- New transport event `{ type: "process-title", sessionId, name: string | null }`
  added to `SessionTransportEvent` and to `sessionEventSchema`
  (`packages/shared/src/ipc/schemas.ts:107`), so it validates across the preload
  bridge like every other session event.

## Section 2: SSH — injected shell integration

- New `packages/session-core/src/shellIntegration/bootstrap.ts` exporting
  `buildShellIntegrationBootstrap(): string`: one line, leading space, `\r`
  terminated.
- The line detects its own shell via `$BASH_VERSION` / `$ZSH_VERSION` and
  installs a hook that emits `ESC]0;<first word of the command>BEL` before each
  command, and re-emits `user@host: cwd` when the prompt returns. zsh uses
  `add-zsh-hook preexec/precmd`; bash uses a `DEBUG` trap plus `PROMPT_COMMAND`.
  Any other shell (fish, csh, restricted) falls through and installs nothing.
- **Non-destructive rules**, both mandatory:
  - Idempotent — a guard variable makes a second injection a no-op.
  - `PROMPT_COMMAND` is appended to, never replaced. If a `DEBUG` trap already
    exists, the bootstrap **skips installation entirely** rather than chaining
    onto someone else's trap.
- `SessionManager` writes the line on every transition into `connected` for SSH
  sessions whose host has shell integration enabled — every reconnect gets a
  fresh remote shell, so it must be re-sent. When the tab is a tmux attach
  (`tmuxAttachTarget`), the bootstrap is **skipped**: the hook would land in the
  pre-tmux shell only, and two injected lines would race.
- **The bootstrap echoes once**, before the first prompt draws. v1 accepts this;
  a leading space keeps it out of history wherever `HISTCONTROL=ignorespace|ignoreboth`
  is set (the Debian/Ubuntu default). Recorded alternatives, deliberately not
  taken now: cursor-up + erase-line at the end of the bootstrap (breaks when the
  line wraps or under bracketed paste), or swallowing output in main until a
  sentinel appears (eats real output if a host behaves unexpectedly).

## Section 3: Display

- `LayoutTab` gains `processTitle?: string`; `layoutStore` gains
  `setTabProcessTitle(sessionId, name | null)` mirroring `setTabDynamicTitle`
  (`layoutStore.ts:171`).
- Resolution everywhere becomes **`processTitle ?? dynamicTitle ?? title`** —
  tab label (`TabBar.tsx:126`), tooltip (`TabBar.tsx:58`), status bar.
- Label shows the **command alone**: `llmtop`, not `llmtop — hermes`. Tabs stay
  scannable when narrow; the tooltip carries base title, shell title, and running
  command, so context is one hover away.
- Only the local path sets `processTitle`. SSH arrives as an OSC title and lands
  in `dynamicTitle`, unchanged from the existing pipeline.
- Process names go through the existing `sanitizeTitle` after `.exe` stripping.
- Cleared to `undefined` on process exit, session close, and session replacement.

## Section 4: Settings

- `GeneralSettings.showActiveProcess: boolean`, default `true`. It gates
  **display of `processTitle` only** — OSC titles keep working when it is off,
  since those are the existing dynamic-title feature and are governed per host by
  shell integration. The main-process poller runs whenever local sessions exist;
  one native tree walk per second is negligible, and keeping the toggle
  renderer-side avoids a settings channel into main for a boolean.
- SSH shell integration is **on by default with a per-host opt-out**:
  migration `017_shell_integration.sql` adds
  `shell_integration INTEGER NOT NULL DEFAULT 1`, plumbed through
  `hostsRepository` and the host Zod schemas the same way `tmuxDetect` is
  (`hostsRepository.ts:110`, `schemas.ts:173`), plus a checkbox in the host editor.
  Opt-*in* per host would mean it never works until configured; on-by-default
  with an escape hatch matches the intent while leaving a way out for hosts where
  injection is unwelcome.

## Section 5: Testing

Unit (Vitest):

- `pickForegroundName` — deepest leaf wins, shell leaf yields `null`, root-only
  tree yields `null`, `.exe` stripped, sibling tie-break.
- `createProcessTitlePoller` — injected provider and timer: emits only on change,
  stops the timer when the last session unregisters, survives a provider rejection.
- `buildShellIntegrationBootstrap` — single line, leading space, guard variable
  present, both shell branches present, no bare newline.
- `layoutStore` — precedence chain, clearing, `replaceSessionId` behaviour.
- `createPtyProcess` — handle exposes the pid from a fake spawn.

Electron E2E: a local session reports a pid, and a `process-title` event passes
`sessionEventSchema` across the preload bridge.

Manual: `llmtop` in a local pwsh tab and on hermes over SSH; confirm the title
reverts at the prompt.

## Out of Scope / Known Limits

- **WSL tabs** — the distro's processes run in the VM and are invisible to the
  Windows process tree, so WSL tabs get nothing from the local path. Injecting
  the same hook into local bash-family shells would fix it; deliberate follow-up.
- **tmux sessions** — the hook lives in the pre-attach shell, and tmux captures
  OSC titles itself unless `set-titles on` is configured remotely.
- **fish, csh, restricted shells** — no hook, no regression.
- **Serial and telnet** — unchanged.
- **Non-Windows local sessions** — the provider is Windows-only; the app is
  Windows-first and it degrades silently.
- The rendering-artifact bug (leftover glyphs clearing on resize) is a separate
  investigation and is **not** addressed here.
