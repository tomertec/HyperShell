# Tmux Session Detection — Design Document

**Date:** 2026-04-11
**Status:** Approved
**Branch:** `feat/tmux-detection`

## Summary

Detect existing tmux sessions on remote hosts before connecting, and let the user pick one to attach to via a modal dialog. Per-host opt-in toggle, tmux only, minimal scope.

## Requirements

- **Detect & attach** — probe for tmux sessions before opening the terminal
- **Per-host toggle** — `tmuxDetect` boolean on host profile, default off
- **Tmux only** — no GNU screen support in v1
- **Modal picker** — consistent with existing QuickConnect dialog pattern
- **Fall back to shell** — send `tmux attach` as terminal input (not SSH command), so detaching lands the user back in a shell
- **Minimal actions** — attach or skip; no kill/create

## Architecture: Pre-connection Probe via Separate SSH Command

Spawn a one-shot `ssh host 'tmux ls -F ...'` child process before opening the real PTY session. Parse stdout into a session list. If sessions exist, show a picker. If empty or failed, proceed silently.

### Why This Approach

- Clean separation — probe is independent of the live session
- Reuses `buildSshArgs()` so auth resolution is identical to the real connection
- Easy to timeout, test, and fail gracefully
- No interference with terminal output or shell startup

### Alternatives Considered

1. **ssh2 connection pool probe** — Rejected because ssh2 resolves auth differently than system SSH (no agent forwarding, no `~/.ssh/config`). Would fail on hosts where only system SSH can authenticate.
2. **Post-connect silent probe** — Rejected because intercepting and parsing terminal output during shell startup is fragile and race-prone.

## Data Model

**Migration 007:** Add `tmux_detect` boolean column to `hosts` table, default `0` (false).

No new tables. The tmux session list is ephemeral — fetched fresh on each connect.

## Probe Mechanism

**Module:** `packages/session-core/src/tmux/tmuxProbe.ts`

1. Reuse `buildSshArgs()` to construct SSH args (port, identity file, proxy jump, etc.)
2. Append remote command: `tmux ls -F '#{session_name}|#{session_windows}|#{session_created}|#{session_attached}'`
3. Spawn via `child_process.execFile('ssh', args)` — no TTY needed
4. 10s timeout. On timeout or non-zero exit, return empty list (not an error)
5. Parse stdout into:

```typescript
interface TmuxSession {
  name: string;
  windowCount: number;
  createdAt: Date;
  attached: boolean;
}
```

**Edge cases:**
- `tmux ls` exit code 1 with "no server running" → empty list
- Host unreachable / auth failure → timeout, empty list, normal connection proceeds
- Tmux session names are unique — no dedup needed

## IPC Contract

**New channel:** `tmux:probe`

**Schemas:**
- `TmuxProbeRequest`: `{ hostId: string }`
- `TmuxProbeResponse`: `{ sessions: TmuxSession[] }`

**Handler:** `apps/desktop/src/main/ipc/tmuxIpc.ts` — resolves host profile, builds SSH options, calls `tmuxProbe()`.

**Preload:** `window.hypershell.tmuxProbe(hostId)` method.

## UI Flow

1. User clicks Connect on a host with `tmuxDetect: true`
2. UI calls `window.hypershell.tmuxProbe(hostId)` — tab shows spinner: "Checking for tmux sessions..."
3. If sessions returned → show `TmuxSessionPicker` modal
4. If empty → connect normally, silently
5. User picks session → connect, then send `tmux attach -t <name>\r` after `connected` status event
6. User clicks "New shell" or presses Escape → connect normally

**Picker modal:** `apps/ui/src/features/tmux/TmuxSessionPicker.tsx`

- Follows QuickConnect dialog pattern (Framer Motion, same styling)
- Each row: session name (bold), window count, relative created time, attached/detached badge
- Actions: click row to attach, "New shell" button to skip
- Close/escape = skip

**Attach command delivery:** On `connected` event in `useTerminalSession.ts`, if a pending tmux target is set (stored in layout store tab metadata), send `tmux attach -t <name>\r` via `writeSession`.

## Error Handling

- **Probe failures are silent.** Any failure returns empty list; connection proceeds normally. No toasts.
- **Attach failure.** If the session was killed between probe and connect, `tmux attach` prints an error in the live shell. User can see it and act. No special handling.
- **Slow probe.** 10s timeout. Tab spinner shown. User can close tab to abort (kills probe child process).
- **Concurrent probes.** Each probe is an independent `execFile`. Safe to run multiple simultaneously.

## Testing

**Unit tests:**
- `tmuxProbe.test.ts` — parse `tmux ls` output: normal, no sessions, malformed, empty. Mock `execFile` for timeout/error.
- `tmuxIpc.test.ts` — handler resolves host and calls probe.
- Zod schema validation tests.

**E2E:** Manual testing against a dev server with tmux. Not automatable in CI.

## Out of Scope

- GNU screen support
- Creating new tmux sessions
- Killing/managing tmux sessions
- Mapping tmux windows/panes into HyperShell tabs
- Caching tmux session lists
