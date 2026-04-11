# Tmux Session Detection — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Detect existing tmux sessions on remote hosts before connecting, showing a picker dialog so users can attach to an existing session or start a fresh shell.

**Architecture:** Pre-connection SSH probe via `child_process.execFile` reusing `buildSshArgs()`. Per-host opt-in toggle stored in DB. Modal picker in renderer, attach command sent as terminal input after connection.

**Tech Stack:** Node.js child_process, Zod schemas, Electron IPC, React + Framer Motion modal, Vitest

**Design doc:** `docs/plans/2026-04-11-tmux-detection-design.md`

---

## Task 1: Database Migration — Add `tmux_detect` Column

**Files:**
- Create: `packages/db/src/migrations/014_tmux_detect.sql`

**Step 1: Create migration file**

```sql
-- Migration 014: add tmux_detect column to hosts table
-- Guard: SQLite raises "duplicate column" if it already exists; callers catch that.
ALTER TABLE hosts ADD COLUMN tmux_detect INTEGER NOT NULL DEFAULT 0;
```

**Step 2: Verify migration loads**

Run: `pnpm --filter @hypershell/db build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add packages/db/src/migrations/014_tmux_detect.sql
git commit -m "feat(db): add tmux_detect column to hosts table (migration 014)"
```

---

## Task 2: Update Hosts Repository — Expose `tmuxDetect` Field

**Files:**
- Modify: `packages/db/src/repositories/hostsRepository.ts`

**Step 1: Add `tmuxDetect` to `HostRecord` type**

At `hostsRepository.ts:24` (after `reconnectBaseInterval`), add:

```typescript
  tmuxDetect: boolean;
```

**Step 2: Add column to INSERT statement**

In the `insertHost` prepared statement (around line 119), add `tmux_detect` to both the column list and VALUES list:

Column list — add after `reconnect_base_interval`:
```
tmux_detect
```

VALUES list — add after `@reconnectBaseInterval`:
```
@tmuxDetect
```

**Step 3: Update any row-mapping logic**

Search the file for where rows are mapped from SQLite to `HostRecord`. SQLite stores booleans as 0/1, so map `tmux_detect` → `tmuxDetect` as `Boolean(row.tmux_detect)`. Follow the same pattern used for `autoReconnect` and `isFavorite`.

**Step 4: Build and verify**

Run: `pnpm --filter @hypershell/db build`
Expected: Build succeeds with no type errors

**Step 5: Commit**

```bash
git add packages/db/src/repositories/hostsRepository.ts
git commit -m "feat(db): expose tmuxDetect field in HostRecord"
```

---

## Task 3: Tmux Probe — Write Failing Tests

**Files:**
- Create: `packages/session-core/src/tmux/tmuxProbe.ts` (empty stub)
- Create: `packages/session-core/src/tmux/tmuxProbe.test.ts`

**Step 1: Create stub module**

```typescript
// packages/session-core/src/tmux/tmuxProbe.ts

export interface TmuxSession {
  name: string;
  windowCount: number;
  createdAt: Date;
  attached: boolean;
}

export interface TmuxProbeOptions {
  hostname: string;
  username?: string;
  port?: number;
  identityFile?: string;
  proxyJump?: string;
  keepAliveSeconds?: number;
  extraArgs?: string[];
  timeoutMs?: number;
}

export async function tmuxProbe(_options: TmuxProbeOptions): Promise<TmuxSession[]> {
  throw new Error("Not implemented");
}
```

**Step 2: Write test file**

```typescript
// packages/session-core/src/tmux/tmuxProbe.test.ts
import { describe, it, expect, vi } from "vitest";
import { parseTmuxListOutput, type TmuxSession } from "./tmuxProbe";

describe("parseTmuxListOutput", () => {
  it("parses a single detached session", () => {
    const output = "main|3|1712850000|0\n";
    const result = parseTmuxListOutput(output);
    expect(result).toEqual([
      {
        name: "main",
        windowCount: 3,
        createdAt: new Date(1712850000 * 1000),
        attached: false,
      },
    ]);
  });

  it("parses multiple sessions with mixed attached status", () => {
    const output = "dev|2|1712850000|1\nops|5|1712860000|0\n";
    const result = parseTmuxListOutput(output);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("dev");
    expect(result[0].attached).toBe(true);
    expect(result[1].name).toBe("ops");
    expect(result[1].attached).toBe(false);
  });

  it("returns empty array for empty string", () => {
    expect(parseTmuxListOutput("")).toEqual([]);
  });

  it("returns empty array for whitespace-only output", () => {
    expect(parseTmuxListOutput("  \n  \n")).toEqual([]);
  });

  it("skips malformed lines gracefully", () => {
    const output = "good|2|1712850000|0\nbad-line\n||\nalso-good|1|1712860000|1\n";
    const result = parseTmuxListOutput(output);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("good");
    expect(result[1].name).toBe("also-good");
  });

  it("handles session names with special characters", () => {
    const output = "my-session_v2.0|1|1712850000|0\n";
    const result = parseTmuxListOutput(output);
    expect(result[0].name).toBe("my-session_v2.0");
  });
});
```

**Step 3: Run tests to verify they fail**

Run: `pnpm --filter @hypershell/session-core test -- --run tmuxProbe`
Expected: FAIL — `parseTmuxListOutput` is not exported

**Step 4: Commit**

```bash
git add packages/session-core/src/tmux/
git commit -m "test(session-core): add failing tests for tmux probe parser"
```

---

## Task 4: Tmux Probe — Implement Parser

**Files:**
- Modify: `packages/session-core/src/tmux/tmuxProbe.ts`

**Step 1: Implement `parseTmuxListOutput`**

Add this exported function to `tmuxProbe.ts`:

```typescript
export function parseTmuxListOutput(output: string): TmuxSession[] {
  const sessions: TmuxSession[] = [];
  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parts = trimmed.split("|");
    if (parts.length < 4) continue;

    const name = parts[0];
    const windowCount = parseInt(parts[1], 10);
    const createdEpoch = parseInt(parts[2], 10);
    const attachedFlag = parseInt(parts[3], 10);

    if (!name || isNaN(windowCount) || isNaN(createdEpoch)) continue;

    sessions.push({
      name,
      windowCount,
      createdAt: new Date(createdEpoch * 1000),
      attached: attachedFlag === 1,
    });
  }
  return sessions;
}
```

**Step 2: Run tests to verify they pass**

Run: `pnpm --filter @hypershell/session-core test -- --run tmuxProbe`
Expected: All 6 tests PASS

**Step 3: Commit**

```bash
git add packages/session-core/src/tmux/tmuxProbe.ts
git commit -m "feat(session-core): implement tmux ls output parser"
```

---

## Task 5: Tmux Probe — Implement SSH Probe Function

**Files:**
- Modify: `packages/session-core/src/tmux/tmuxProbe.ts`

**Step 1: Implement `tmuxProbe` using `execFile`**

Replace the stub `tmuxProbe` function. Import `buildSshArgs` and `buildSshPtyCommand` from the sibling transport module:

```typescript
import { execFile } from "node:child_process";
import { buildSshArgs, buildSshPtyCommand } from "../transports/sshPtyTransport";

const TMUX_FORMAT = "#{session_name}|#{session_windows}|#{session_created}|#{session_attached}";
const DEFAULT_TIMEOUT_MS = 10_000;

export async function tmuxProbe(options: TmuxProbeOptions): Promise<TmuxSession[]> {
  const profile = {
    hostname: options.hostname,
    username: options.username,
    port: options.port,
    identityFile: options.identityFile,
    proxyJump: options.proxyJump,
    keepAliveSeconds: options.keepAliveSeconds,
    extraArgs: options.extraArgs,
    requestTty: false, // no TTY needed for one-shot command
  };

  const { command } = buildSshPtyCommand(profile);
  const args = buildSshArgs(profile);

  // Replace the destination (last arg) — buildSshArgs puts destination last.
  // We need to append the remote command after it.
  args.push(`tmux ls -F '${TMUX_FORMAT}'`);

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise<TmuxSession[]>((resolve) => {
    const child = execFile(
      command,
      args,
      { timeout: timeoutMs, windowsHide: true },
      (error, stdout) => {
        if (error) {
          // tmux not installed, no sessions, auth failure, timeout — all return empty
          resolve([]);
          return;
        }
        resolve(parseTmuxListOutput(stdout));
      }
    );

    // Safety: resolve empty on unexpected close
    child.on("error", () => resolve([]));
  });
}
```

**Step 2: Export from session-core index**

Add to `packages/session-core/src/index.ts`:

```typescript
export { tmuxProbe, parseTmuxListOutput, type TmuxSession, type TmuxProbeOptions } from "./tmux/tmuxProbe";
```

**Step 3: Build and verify**

Run: `pnpm --filter @hypershell/session-core build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add packages/session-core/src/tmux/tmuxProbe.ts packages/session-core/src/index.ts
git commit -m "feat(session-core): implement tmuxProbe SSH probe function"
```

---

## Task 6: IPC Contract — Channel + Schemas

**Files:**
- Modify: `packages/shared/src/ipc/channels.ts`
- Modify: `packages/shared/src/ipc/schemas.ts`

**Step 1: Add tmux channel**

In `channels.ts`, add before line 204 (`export const ipcChannels`):

```typescript
export const tmuxChannels = {
  probe: "tmux:probe",
} as const;
```

Then add `tmux: tmuxChannels,` inside the `ipcChannels` object (before the closing `} as const;` at line 230).

**Step 2: Add `tmuxDetect` to existing host schemas**

In `hostRecordSchema` (line 130), add after `passwordSavedAt` (line 152):

```typescript
  tmuxDetect: z.boolean().optional(),
```

In `upsertHostRequestSchema` (line 155), add after `clearSavedPassword` (line 180):

```typescript
  tmuxDetect: z.boolean().optional(),
```

This is critical — without this, Zod validation strips `tmuxDetect` from host records crossing the IPC boundary, and the renderer never sees it. The feature silently never activates.

**Step 3: Add tmux probe schemas**

At the end of `schemas.ts` (after line 989), add:

```typescript
// --- Tmux ---

export const tmuxSessionSchema = z.object({
  name: z.string().min(1),
  windowCount: z.number().int().nonnegative(),
  createdAt: z.string(), // ISO date string (serialized across IPC)
  attached: z.boolean(),
});

export const tmuxProbeRequestSchema = z.object({
  hostId: z.string().min(1),
});

export const tmuxProbeResponseSchema = z.object({
  sessions: z.array(tmuxSessionSchema),
});

export type TmuxSessionIpc = z.infer<typeof tmuxSessionSchema>;
export type TmuxProbeRequest = z.infer<typeof tmuxProbeRequestSchema>;
export type TmuxProbeResponse = z.infer<typeof tmuxProbeResponseSchema>;
```

Note: `createdAt` is a string (ISO) across IPC since `Date` objects don't survive JSON serialization. The renderer converts to `Date` for display.

**Step 4: Build shared package**

Run: `pnpm --filter @hypershell/shared build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add packages/shared/src/ipc/channels.ts packages/shared/src/ipc/schemas.ts
git commit -m "feat(shared): add tmux:probe IPC channel, schemas, and tmuxDetect to host schemas"
```

---

## Task 7: IPC Handler — Main Process

**Files:**
- Create: `apps/desktop/src/main/ipc/tmuxIpc.ts`
- Modify: `apps/desktop/src/main/ipc/registerIpc.ts`

**Step 1: Create tmux IPC handler**

```typescript
// apps/desktop/src/main/ipc/tmuxIpc.ts
import { tmuxProbeRequestSchema, type TmuxProbeResponse } from "@hypershell/shared";
import { tmuxProbe, type TmuxSession } from "@hypershell/session-core";
import { getOrCreateHostsRepo } from "./registerIpc";

export async function handleTmuxProbe(_event: Electron.IpcMainInvokeEvent, request: unknown): Promise<TmuxProbeResponse> {
  const parsed = tmuxProbeRequestSchema.parse(request);
  const repo = getOrCreateHostsRepo();
  const host = repo.get(parsed.hostId);

  if (!host) {
    return { sessions: [] };
  }

  const sessions = await tmuxProbe({
    hostname: host.hostname,
    username: host.username ?? undefined,
    port: host.port,
    identityFile: host.identityFile ?? undefined,
    proxyJump: host.proxyJump ?? undefined,
    keepAliveSeconds: host.keepAliveInterval ?? undefined,
  });

  // Convert Date to ISO string for IPC serialization
  const serialized = sessions.map((s: TmuxSession) => ({
    name: s.name,
    windowCount: s.windowCount,
    createdAt: s.createdAt.toISOString(),
    attached: s.attached,
  }));

  return { sessions: serialized };
}
```

**Step 2: Register handler in registerIpc.ts**

Import `handleTmuxProbe` at the top of `registerIpc.ts`, then add this line in the handler registration section (near line 1353, alongside other `ipcMain.handle` calls):

```typescript
ipcMain.handle(ipcChannels.tmux.probe, handleTmuxProbe);
```

Also verify that `getOrCreateHostsRepo` is exported (it should already be used elsewhere in the file — if it's a local function, export it so `tmuxIpc.ts` can import it).

**Step 3: Build desktop package**

Run: `pnpm --filter @hypershell/desktop build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add apps/desktop/src/main/ipc/tmuxIpc.ts apps/desktop/src/main/ipc/registerIpc.ts
git commit -m "feat(desktop): add tmux:probe IPC handler"
```

---

## Task 8: Preload Bridge + Global Types

**Files:**
- Modify: `apps/desktop/src/preload/desktopApi.ts`
- Modify: `apps/ui/src/types/global.d.ts`

**Step 1: Add `tmuxProbe` to DesktopApi interface**

In `desktopApi.ts`, add to the `DesktopApi` interface (around line 410):

```typescript
tmuxProbe(request: TmuxProbeRequest): Promise<TmuxProbeResponse>;
```

Make sure `TmuxProbeRequest` and `TmuxProbeResponse` are imported from `@hypershell/shared`.

**Step 2: Add implementation**

In the implementation object (near the end of `desktopApi.ts`, around line 1360), add:

```typescript
async tmuxProbe(request: TmuxProbeRequest): Promise<TmuxProbeResponse> {
  const parsed = tmuxProbeRequestSchema.parse(request);
  const raw = await ipcRenderer.invoke(ipcChannels.tmux.probe, parsed);
  return tmuxProbeResponseSchema.parse(raw);
},
```

Make sure `tmuxProbeRequestSchema`, `tmuxProbeResponseSchema` are imported from `@hypershell/shared`.

**Step 3: Add to global type declaration**

In `apps/ui/src/types/global.d.ts`, inside the `window.hypershell` interface (before the closing `}`), add:

```typescript
tmuxProbe?: (request: { hostId: string }) => Promise<{ sessions: Array<{ name: string; windowCount: number; createdAt: string; attached: boolean }> }>;
```

**Step 4: Build**

Run: `pnpm build`
Expected: Full build succeeds

**Step 5: Commit**

```bash
git add apps/desktop/src/preload/desktopApi.ts apps/ui/src/types/global.d.ts
git commit -m "feat: wire tmuxProbe through preload bridge and global types"
```

---

## Task 9: Host Form — Add Tmux Detection Toggle

**Files:**
- Modify: `apps/ui/src/features/hosts/HostForm.tsx`

**Step 1: Add `tmuxDetect` to `HostFormValue` type**

At `HostForm.tsx:93` (after `clearSavedPassword`), add:

```typescript
  tmuxDetect: boolean;
```

**Step 2: Add default value**

In the `defaultValue` object (around line 130), add:

```typescript
  tmuxDetect: false,
```

**Step 3: Add toggle in Reliability section**

In the Reliability section (after the auto-reconnect block, around line 1089), add a new checkbox:

```tsx
<label htmlFor={`${formId}-tmuxDetect`} className="flex items-center gap-3 cursor-pointer">
  <input
    id={`${formId}-tmuxDetect`}
    type="checkbox"
    checked={value.tmuxDetect}
    onChange={(e) => setValue({ ...value, tmuxDetect: e.target.checked })}
    className="rounded border-border accent-accent"
  />
  <span className="text-sm text-text-primary">Detect tmux sessions on connect</span>
</label>
```

**Step 4: Update any host-to-form and form-to-host mapping**

Search `HostForm.tsx` (and `App.tsx`) for where `HostRecord` is converted to `HostFormValue` (for editing) and where `HostFormValue` is converted back to the save payload. Add `tmuxDetect` to both mappings.

**Step 5: Build and verify visually**

Run: `pnpm --filter @hypershell/ui build`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add apps/ui/src/features/hosts/HostForm.tsx
git commit -m "feat(ui): add tmux detection toggle to host form"
```

---

## Task 10: Tmux Session Picker — Component

**Files:**
- Create: `apps/ui/src/features/tmux/TmuxSessionPicker.tsx`

**Step 1: Create the picker modal**

Follow the `TelnetQuickConnect.tsx` pattern (same animation, styling conventions):

```tsx
// apps/ui/src/features/tmux/TmuxSessionPicker.tsx
import { useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

export interface TmuxSessionInfo {
  name: string;
  windowCount: number;
  createdAt: string; // ISO string
  attached: boolean;
}

interface TmuxSessionPickerProps {
  open: boolean;
  sessions: TmuxSessionInfo[];
  hostName: string;
  onAttach: (sessionName: string) => void;
  onSkip: () => void;
}

function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function TmuxSessionPicker({
  open,
  sessions,
  hostName,
  onAttach,
  onSkip,
}: TmuxSessionPickerProps) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") onSkip();
    },
    [onSkip]
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={onSkip}
          onKeyDown={handleKeyDown}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className="bg-base-800 border border-border rounded-xl shadow-2xl w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-medium text-text-primary mb-1">
              Tmux Sessions
            </h2>
            <p className="text-xs text-text-muted mb-4">
              {sessions.length} session{sessions.length !== 1 ? "s" : ""} found on {hostName}
            </p>

            <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
              {sessions.map((session) => (
                <button
                  key={session.name}
                  type="button"
                  onClick={() => onAttach(session.name)}
                  className="flex items-center justify-between w-full px-3 py-2.5 rounded-lg text-left text-sm transition-colors hover:bg-base-700/60 group"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-text-primary">{session.name}</span>
                    <span className="text-text-muted ml-2 text-xs">
                      {session.windowCount} window{session.windowCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <span className="text-[11px] text-text-muted">{formatRelativeTime(session.createdAt)}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        session.attached
                          ? "bg-warning/15 text-warning"
                          : "bg-success/15 text-success"
                      }`}
                    >
                      {session.attached ? "attached" : "detached"}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            <div className="pt-4">
              <button
                type="button"
                onClick={onSkip}
                className="w-full py-2 rounded-lg text-sm bg-base-700 hover:bg-base-600 text-text-muted hover:text-text-primary transition-colors"
              >
                New shell
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

**Step 2: Build and verify**

Run: `pnpm --filter @hypershell/ui build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add apps/ui/src/features/tmux/TmuxSessionPicker.tsx
git commit -m "feat(ui): add TmuxSessionPicker modal component"
```

---

## Task 11: Integration — Wire Tmux Probe into Connection Flow

**Files:**
- Modify: `apps/ui/src/app/App.tsx`
- Modify: `apps/ui/src/features/layout/layoutStore.ts`

This is the core integration task. The `connectHost` callback (at `App.tsx:588`) needs to be modified to:

1. Check if the host has `tmuxDetect` enabled
2. If yes, call `window.hypershell.tmuxProbe({ hostId })` 
3. If sessions returned, show `TmuxSessionPicker` modal
4. On attach: open the tab with a `tmuxAttachTarget` stored in the `LayoutTab`
5. On skip: open the tab normally

**Step 1: Add `tmuxAttachTarget` to `LayoutTab`**

In `layoutStore.ts:3`, add to the `LayoutTab` type:

```typescript
  tmuxAttachTarget?: string; // tmux session name to attach to after connecting
```

**Step 2: Add state for tmux picker in App.tsx**

Near other dialog state (search for `telnetDialogOpen` as a reference), add:

```typescript
const [tmuxPickerState, setTmuxPickerState] = useState<{
  open: boolean;
  sessions: Array<{ name: string; windowCount: number; createdAt: string; attached: boolean }>;
  host: HostRecord;
} | null>(null);
```

**Step 3: Modify `connectHost` callback**

Replace the `connectHost` callback (lines 588-605) with logic that:
1. Checks `host.tmuxDetect`
2. If true, probes for tmux sessions
3. If sessions found, opens the tmux picker (storing the host reference)
4. If no sessions or tmuxDetect is false, opens tab normally

```typescript
const connectHost = useCallback(
  async (host: HostRecord) => {
    if (host.tmuxDetect && window.hypershell?.tmuxProbe) {
      try {
        const result = await window.hypershell.tmuxProbe({ hostId: host.id });
        if (result.sessions.length > 0) {
          setTmuxPickerState({ open: true, sessions: result.sessions, host });
          return;
        }
      } catch {
        // Probe failed — proceed with normal connection
      }
    }

    openHostTab(host);
  },
  [openHostTab]
);
```

Extract the tab-opening logic into a helper:

```typescript
const openHostTab = useCallback(
  (host: HostRecord, tmuxAttachTarget?: string) => {
    setConnectingHostIds((prev) => new Set(prev).add(host.id));
    const optimisticSessionId = `ssh-${host.id}-${Date.now()}`;
    openTab({
      tabKey: optimisticSessionId,
      sessionId: optimisticSessionId,
      title: host.name,
      transport: "ssh",
      profileId: host.id,
      hostId: host.id,
      preopened: false,
      tmuxAttachTarget,
    });
  },
  [openTab]
);
```

**Step 4: Add tmux picker handlers**

```typescript
const handleTmuxAttach = useCallback(
  (sessionName: string) => {
    if (tmuxPickerState?.host) {
      openHostTab(tmuxPickerState.host, sessionName);
    }
    setTmuxPickerState(null);
  },
  [tmuxPickerState, openHostTab]
);

const handleTmuxSkip = useCallback(() => {
  if (tmuxPickerState?.host) {
    openHostTab(tmuxPickerState.host);
  }
  setTmuxPickerState(null);
}, [tmuxPickerState, openHostTab]);
```

**Step 5: Render TmuxSessionPicker in JSX**

Near the `TelnetQuickConnect` dialog rendering (around line 1023), add:

```tsx
<TmuxSessionPicker
  open={tmuxPickerState?.open ?? false}
  sessions={tmuxPickerState?.sessions ?? []}
  hostName={tmuxPickerState?.host.name ?? ""}
  onAttach={handleTmuxAttach}
  onSkip={handleTmuxSkip}
/>
```

Import `TmuxSessionPicker` at the top of `App.tsx`.

**Step 6: Build and verify**

Run: `pnpm build`
Expected: Full build succeeds

**Step 7: Commit**

```bash
git add apps/ui/src/app/App.tsx apps/ui/src/features/layout/layoutStore.ts
git commit -m "feat(ui): wire tmux probe into host connection flow with picker"
```

---

## Task 12: Integration — Send `tmux attach` After Connect

**Files:**
- Modify: `apps/ui/src/features/terminal/useTerminalSession.ts`

**Step 1: Add `tmuxAttachTarget` to `UseTerminalSessionInput`**

At `useTerminalSession.ts:28` (after `telnetOptions`), add:

```typescript
  tmuxAttachTarget?: string;
```

**Step 2: Send attach command after connected**

In the `applySessionEvent` callback (line 212), after the state is set to "connected", send the tmux attach command:

```typescript
const applySessionEvent = useCallback((event: SessionEvent): void => {
  const effect = mapSessionEvent(sessionIdRef.current, event);
  if (!effect.handled) {
    return;
  }

  if (effect.state) {
    setStateSafe(effect.state);
  }

  // Send tmux attach command when connected
  if (effect.state === "connected" && input.tmuxAttachTarget && sessionIdRef.current) {
    const cmd = `tmux attach -t ${input.tmuxAttachTarget}\r`;
    void window.hypershell?.writeSession?.({
      sessionId: sessionIdRef.current,
      data: cmd,
    });
  }

  if (effect.clearSessionId) {
    sessionIdRef.current = null;
  }

  const instance = terminalRef.current;
  if (!instance) {
    return;
  }

  if (effect.data) {
    instance.write(effect.data);
  }

  if (effect.errorMessage) {
    instance.writeln(`\r\n[error] ${effect.errorMessage}`);
  }
}, [setStateSafe, input.tmuxAttachTarget]);
```

**Step 3: Thread `tmuxAttachTarget` from LayoutTab to useTerminalSession**

Find where `TerminalPane` receives its props and passes them to `useTerminalSession`. The `LayoutTab.tmuxAttachTarget` field needs to reach the `useTerminalSession` hook's `input.tmuxAttachTarget`. Check the component that creates `UseTerminalSessionInput` from `LayoutTab` and add the field mapping.

**Step 4: Build and verify**

Run: `pnpm build`
Expected: Full build succeeds

**Step 5: Commit**

```bash
git add apps/ui/src/features/terminal/useTerminalSession.ts
git commit -m "feat(ui): send tmux attach command after SSH connection established"
```

---

## Task 13: Thread `tmuxAttachTarget` Through TerminalPane

The chain is: `LayoutTab` → `Workspace.tsx:75` → `TerminalPane` → `useTerminalSession`.

**Files:**
- Modify: `apps/ui/src/features/terminal/TerminalPane.tsx` (lines 10-38)
- Modify: `apps/ui/src/features/layout/Workspace.tsx` (line 80)

**Step 1: Add `tmuxAttachTarget` to TerminalPaneProps**

In `TerminalPane.tsx:15`, after `telnetOptions`, add:

```typescript
  tmuxAttachTarget?: string;
```

**Step 2: Destructure and pass to `useTerminalSession`**

In `TerminalPane.tsx:25`, add `tmuxAttachTarget` to the destructured props. Then in the `useTerminalSession` call (line 31-38), add:

```typescript
  const session = useTerminalSession({
    transport,
    profileId,
    sessionId,
    autoConnect,
    telnetOptions,
    tmuxAttachTarget,  // <-- add this
    onSessionOpened
  });
```

**Step 3: Pass from Workspace to TerminalPane**

In `Workspace.tsx:80`, after the `telnetOptions` prop, add:

```tsx
  tmuxAttachTarget={tab.tmuxAttachTarget}
```

**Step 4: Build and verify**

Run: `pnpm build`
Expected: Full build succeeds

**Step 5: Commit**

```bash
git add apps/ui/src/features/terminal/TerminalPane.tsx apps/ui/src/features/layout/Workspace.tsx
git commit -m "feat(ui): thread tmuxAttachTarget from LayoutTab through to terminal session"
```

---

## Task 14: Update Host Save/Load — Persist `tmuxDetect`

**Files:**
- Modify: `apps/ui/src/app/App.tsx` (host save/load handlers)
- Possibly modify: `apps/desktop/src/main/ipc/registerIpc.ts` (host CRUD handlers)

**Step 1: Update host creation/update handlers**

Find where `HostFormValue` is converted to the DB payload when saving a host. Add `tmuxDetect` to the payload sent via `window.hypershell.createHost()` / `window.hypershell.updateHost()`.

**Step 2: Update host-to-form mapping**

Find where `HostRecord` is converted to `HostFormValue` when editing an existing host. Add:

```typescript
tmuxDetect: host.tmuxDetect ?? false,
```

**Step 3: Update IPC handlers if needed**

Check `registerIpc.ts` host creation/update handlers. If they validate incoming fields against a schema, add `tmuxDetect` to that schema. If they pass through directly to the repository, the field should flow through automatically.

**Step 4: Build and test**

Run: `pnpm build && pnpm test`
Expected: Build succeeds, all tests pass

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: persist tmuxDetect through host save/load cycle"
```

---

## Task 15: Final Verification

**Step 1: Run full test suite**

Run: `pnpm test`
Expected: All tests pass (existing + new tmux probe parser tests)

**Step 2: Run lint**

Run: `pnpm lint`
Expected: No lint errors

**Step 3: Run full build**

Run: `pnpm build`
Expected: All workspaces build successfully

**Step 4: Manual smoke test**

1. Launch app in dev mode
2. Create or edit a host → verify "Detect tmux sessions" toggle appears in Reliability section
3. Enable toggle, save host
4. Connect to host that has tmux running → verify picker appears
5. Connect to host without tmux → verify it connects normally (no errors)
6. Pick a tmux session → verify `tmux attach -t <name>` is sent after connection
7. Detach from tmux (`Ctrl+B, D`) → verify you land in a shell
8. Connect with toggle disabled → verify no probe, direct connection

**Step 5: Commit any final fixes**

```bash
git add -A
git commit -m "feat: tmux session detection — final polish"
```
