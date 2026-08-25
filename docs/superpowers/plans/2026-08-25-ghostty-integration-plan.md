# Ghostty Host Integration Implementation Plan (HyperShell side)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every HyperShell terminal pane is rendered by `ghostty-host.exe` surfaces instead of xterm.js, with `session-core` still owning all transports, ending in the cutover commit that removes `@xterm/*`.

**Architecture:** Electron main spawns `ghostty-host.exe`, serves a framed named pipe, and bridges `SessionManager` data events ↔ host surfaces. The renderer's `GhosttyPane` renders a placeholder div and reports bounds/visibility/focus; keystrokes originate in the host (`input` frames) and broadcast fan-out moves to main. A `nativeOverlayGuard` hides surfaces whenever DOM overlays could cross them.

**Tech Stack:** Electron, TypeScript, Zod IPC (existing pattern), Node `net` named pipes, Vitest, Playwright (electron config).

**Spec:** `docs/superpowers/specs/2026-08-25-ghostty-terminal-replacement-design.md`. Companion plan (must be complete first): `docs/plans/2026-08-25-embed-host-plan.md` in `C:\Users\tomer.TEC\projects\llm-tests\ghostty\upstream` — its "Wire protocol" table is normative and shared verbatim; frame-type codes, payload shapes, the golden frame, and the chord allowlist in this plan are copies of it and must never drift.

## Global Constraints

- **Prerequisite:** Plan 1 delivered `ghostty-host.exe` with its 9/9 harness checks green. Dev builds locate it via env `GHOSTTY_HOST_PATH`; packaged builds via `path.join(process.resourcesPath, "ghostty-host", "ghostty-host.exe")`.
- Work on branch `ghostty-terminal` off `main`. CI does not gate direct pushes to main — do not push this to main until the parity checklist (Task 13) is signed off.
- Follow CLAUDE.md's new-IPC-channel recipe for every channel added: `packages/shared/src/ipc/channels.ts` → `schemas.ts` → handler in `apps/desktop/src/main/ipc/` → `registerIpc.ts` → `apps/desktop/src/preload/desktopApi.ts` → `apps/ui/src/types/global.d.ts`. Renderer calls only via `getShell()` (`apps/ui/src/lib/shell.ts`), never `window.hypershell`.
- After any main/preload change: `pnpm --filter @hypershell/desktop build` and restart Electron. Delete `apps/desktop/dist/renderer/` for UI HMR.
- Tests: `pnpm --filter @hypershell/desktop test`, `pnpm --filter @hypershell/ui test`; Electron E2E per CLAUDE.md's three-step (build:bundle, rebuild:native, `pnpm ci:test:e2e:electron`).
- Wire constants (normative, from Plan 1): frame `[u32 LE payloadLen][u8 type][u32 LE surfaceId][payload]`; types hello=0x01 createSurface=0x02 destroySurface=0x03 setBounds=0x04 setVisible=0x05 focus=0x06 feedData=0x07 sessionClosed=0x08 updateConfig=0x09 command=0x0A replayFile=0x0B input=0x14 gridSize=0x15 title=0x16 bell=0x17 passthroughChord=0x18 focusGained=0x19 focusLost=0x1A surfaceCrashed=0x1B; golden frame `feedData` surface 2 payload `ls\n` = `03 00 00 00 07 02 00 00 00 6c 73 0a`; chord allowlist `ctrl+shift+s|d|e|w|[|]`, `ctrl+=`, `ctrl+-`, `ctrl+0`.
- **Spec deviation (recorded):** recordings are DB frames (`recorder.getFrames`), not files, so playback drives the normal `feedData` path with main-side pacing; `replayFile`/`replay_*` commands go unused by HyperShell (they remain in the protocol for the harness). §5's playback requirement is met without them.

---

### Task 1: TypeScript frame codec

**Files:**
- Create: `apps/desktop/src/main/ghosttyHost/protocol.ts`
- Test: `apps/desktop/src/main/ghosttyHost/protocol.test.ts`

**Interfaces:**
- Produces:
  - `const FrameType = { hello: 0x01, createSurface: 0x02, destroySurface: 0x03, setBounds: 0x04, setVisible: 0x05, focus: 0x06, feedData: 0x07, sessionClosed: 0x08, updateConfig: 0x09, command: 0x0a, replayFile: 0x0b, input: 0x14, gridSize: 0x15, title: 0x16, bell: 0x17, passthroughChord: 0x18, focusGained: 0x19, focusLost: 0x1a, surfaceCrashed: 0x1b } as const;`
  - `type Frame = { type: number; surfaceId: number; payload: Buffer }`
  - `encodeFrame(type: number, surfaceId: number, payload: Buffer | string): Buffer`
  - `class FrameDecoder { push(chunk: Buffer): Frame[] }` — streaming, buffers partial frames across pushes; throws `ProtocolError` on unknown type or payload > 1 MiB.
  - `const PROTOCOL_VERSION = 1;`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from "vitest";
import { encodeFrame, FrameDecoder, FrameType } from "./protocol";

const GOLDEN = Buffer.from("030000000702000000" + "6c730a", "hex");

describe("ghostty frame codec", () => {
  test("encodeFrame produces the golden feedData frame", () => {
    expect(encodeFrame(FrameType.feedData, 2, "ls\n").equals(GOLDEN)).toBe(true);
  });

  test("decoder yields the golden frame whole", () => {
    const frames = new FrameDecoder().push(GOLDEN);
    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({ type: FrameType.feedData, surfaceId: 2 });
    expect(frames[0]!.payload.toString()).toBe("ls\n");
  });

  test("decoder reassembles a frame split at every byte boundary", () => {
    for (let split = 1; split < GOLDEN.length; split++) {
      const d = new FrameDecoder();
      expect(d.push(GOLDEN.subarray(0, split))).toHaveLength(0);
      const frames = d.push(GOLDEN.subarray(split));
      expect(frames).toHaveLength(1);
      expect(frames[0]!.payload.toString()).toBe("ls\n");
    }
  });

  test("decoder yields multiple frames from one chunk", () => {
    const two = Buffer.concat([GOLDEN, encodeFrame(FrameType.bell, 9, "{}")]);
    const frames = new FrameDecoder().push(two);
    expect(frames.map((f) => f.type)).toEqual([FrameType.feedData, FrameType.bell]);
  });

  test("decoder throws on unknown frame type", () => {
    const bad = Buffer.from("000000007e00000000", "hex");
    expect(() => new FrameDecoder().push(bad)).toThrow(/unknown frame type/i);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @hypershell/desktop test -- protocol` → FAIL (module missing).
- [ ] **Step 3: Implement** — `encodeFrame` allocates `9 + payload.length`, writes `writeUInt32LE(len, 0)`, `writeUInt8(type, 4)`, `writeUInt32LE(surfaceId, 5)`; `FrameDecoder` keeps an internal `Buffer` accumulator, loops while `>= 9` bytes and `>= 9 + len` bytes, validates type against a `Set(Object.values(FrameType))`.
- [ ] **Step 4: Run tests** → 5 PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(ghostty): TS frame codec with golden fixture"`

---

### Task 2: Host process manager

**Files:**
- Create: `apps/desktop/src/main/ghosttyHost/hostProcess.ts`
- Test: `apps/desktop/src/main/ghosttyHost/hostProcess.test.ts`

**Interfaces:**
- Consumes: Task 1 codec.
- Produces:
  - `createGhosttyHostProcess(opts: { exePath: string; spawn?: typeof child_process.spawn; createServer?: typeof net.createServer; onFrame: (f: Frame) => void; onRestart: () => void; onDead: (reason: string) => void }): GhosttyHostProcess`
  - `GhosttyHostProcess = { start(): Promise<void>; send(type: number, surfaceId: number, payload: Buffer | string): void; stop(): void; isAlive(): boolean }`
  - Behavior contract: `start()` creates a named-pipe server on `\\\\.\\pipe\\hypershell-ghostty-${pid}-${randomUUID()}`, spawns `exePath --pipe=<name>`, resolves when the client connects **and** its `hello` arrives with matching version (10s timeout → reject). All decoded frames except `hello` go to `onFrame`. Child exit or pipe error → destroy socket, kill child, respawn with exponential backoff (500ms, 1s, 2s, capped 5s); each successful respawn+hello fires `onRestart` (Task 3 rebuilds surfaces there). Three consecutive failures within 30s → `onDead(reason)` and stop retrying. `stop()` (app quit) ends the pipe and `child.kill()`; the host also self-exits on pipe EOF (Plan 1 contract), which covers the main-process-crash orphan case — no job object needed.

- [ ] **Step 1: Write the failing tests** — inject fake `spawn` (EventEmitter with `kill`) and fake `createServer` (hand the test a fake socket). Cases: (a) start resolves after fake client sends a valid hello frame; (b) start rejects on version-mismatch hello; (c) frames pushed into the fake socket reach `onFrame` decoded; (d) fake child `exit` triggers respawn (second spawn call observed) and `onRestart` after the new hello; (e) three rapid failures → `onDead`. Use vitest fake timers for backoff.
- [ ] **Step 2: Run to fail.** — `pnpm --filter @hypershell/desktop test -- hostProcess`
- [ ] **Step 3: Implement.** Keep all Node imports injectable exactly as the signature shows so tests never spawn processes.
- [ ] **Step 4: Run to pass. Commit** — `git commit -m "feat(ghostty): host process manager with respawn and hello handshake"`

---

### Task 3: Host client — surface registry and session bridging

**Files:**
- Create: `apps/desktop/src/main/ghosttyHost/ghosttyHostClient.ts`
- Test: `apps/desktop/src/main/ghosttyHost/ghosttyHostClient.test.ts`

**Interfaces:**
- Consumes: Task 2 (`GhosttyHostProcess`), `sessionManager` (`write(sessionId, data)`, `resize(sessionId, cols, rows)` — confirm exact method names in `packages/session-core/src/sessionManager.ts` and use those), Task 6's `ghosttyConfigFromSettings`.
- Produces (what IPC handlers and registerIpc call):
  - `createGhosttyHostClient(opts: { host: GhosttyHostProcess; writeSession: (sessionId: string, data: string) => void; resizeSession: (sessionId: string, cols: number, rows: number) => void; emitGhosttyEvent: (e: GhosttyRendererEvent) => void; getBroadcastTargets: () => string[] | null; getGlobalConfig: () => string }): GhosttyHostClient`
  - `GhosttyHostClient = { createSurface(sessionId: string, parentHwnd: string, bounds: Bounds, surfaceConfig?: string): void; destroySurface(sessionId: string): void; setBounds(sessionId: string, b: Bounds): void; setAllVisible(visible: boolean): void; setVisible(sessionId: string, visible: boolean): void; focus(sessionId: string): void; feedData(sessionId: string, data: string): void; sessionClosed(sessionId: string, exitCode: number | null): void; updateGlobalConfig(): void; updateSurfaceConfig(sessionId: string, config: string): void; sendCommand(sessionId: string, cmd: string): void; createReplaySurface(parentHwnd: string, bounds: Bounds): string; dispose(): void }`
  - `type Bounds = { x: number; y: number; w: number; h: number }` (physical px)
  - `type GhosttyRendererEvent = { kind: "grid" | "title" | "bell" | "chord" | "focusGained" | "focusLost" | "crashed"; sessionId: string; cols?: number; rows?: number; title?: string; chord?: string; error?: string }`
  - Internals: monotonic `nextSurfaceId` (u32, starts 1), `Map<sessionId, { surfaceId, parentHwnd, bounds, visible, surfaceConfig }>`; replay surfaces get synthetic sessionIds `"replay:<n>"`.
  - Frame routing: `input` → `getBroadcastTargets()` (null = just this session) → `writeSession` per target; `gridSize` → `resizeSession` + emit `grid`; `title`/`bell`/`passthroughChord`/`focusGained`/`focusLost`/`surfaceCrashed` → emit.
  - `onRestart` (wired by the caller): re-send global config, then `createSurface` for every registered entry from the stored metadata, restoring bounds/visibility. This is the crash-recovery path from spec §7 — it must be covered by unit test (e).

- [ ] **Step 1: Failing tests** with a fake `GhosttyHostProcess` (records `send` calls, exposes `injectFrame`): (a) createSurface sends 0x02 with correct JSON payload and registers the mapping; (b) injected `input` frame for surface N calls `writeSession` with that session's id; (c) with `getBroadcastTargets` returning 3 ids, one `input` frame → 3 `writeSession` calls; (d) injected `gridSize` calls `resizeSession(sessionId, cols, rows)` and emits a `grid` event; (e) simulated restart replays global config + createSurface for both registered surfaces with their stored bounds.
- [ ] **Step 2–4:** Run to fail → implement → run to pass.
- [ ] **Step 5: Commit** — `git commit -m "feat(ghostty): host client with surface registry and crash-recovery resurrection"`

---

### Task 4: IPC channels (renderer ↔ main)

**Files:**
- Modify: `packages/shared/src/ipc/channels.ts` — add:

```ts
export const ghosttyChannels = {
  surfaceCreate: "ghostty:surface-create",
  surfaceDestroy: "ghostty:surface-destroy",
  surfaceBounds: "ghostty:surface-bounds",
  surfaceVisible: "ghostty:surface-visible",
  surfaceFocus: "ghostty:surface-focus",
  surfaceCommand: "ghostty:surface-command",
  overlayGuard: "ghostty:overlay-guard",
  event: "ghostty:event"
} as const;
```

  and add `broadcastTargets: "session:set-broadcast-targets"` to `sessionChannels`.
- Modify: `packages/shared/src/ipc/schemas.ts` — Zod schemas: `GhosttySurfaceCreateRequest = z.object({ sessionId: z.string(), bounds: BoundsSchema, fontSize: z.number().optional() })` with `BoundsSchema = z.object({ x: z.number().int(), y: z.number().int(), w: z.number().int().min(0), h: z.number().int().min(0) })`; requests for destroy/bounds/visible/focus/command keyed by `sessionId`; `SetBroadcastTargetsRequest = z.object({ enabled: z.boolean(), targetSessionIds: z.array(z.string()) })`; `GhosttyEventSchema` mirroring `GhosttyRendererEvent` (Task 3) as a discriminated union on `kind`.
- Create: `apps/desktop/src/main/ipc/ghosttyIpc.ts` — handler functions delegating to the `GhosttyHostClient`; `surfaceCreate` resolves the parent HWND itself via `BrowserWindow.fromWebContents(event.sender).getNativeWindowHandle().readBigUInt64LE(0).toString()` (never trust an HWND from the renderer).
- Modify: `apps/desktop/src/main/ipc/registerIpc.ts` — register the handlers; instantiate host process + client next to `sessionManager` (`registerIpc.ts:252`); broadcast state lives in a module-level `{ enabled, targetSessionIds }` updated by the new session channel, read by `getBroadcastTargets`.
- Modify: `apps/desktop/src/preload/desktopApi.ts` — typed methods `ghosttySurfaceCreate`, `ghosttySurfaceDestroy`, `ghosttySurfaceBounds`, `ghosttySurfaceVisible`, `ghosttySurfaceFocus`, `ghosttySurfaceCommand`, `ghosttyOverlayGuard`, `onGhosttyEvent(cb)`, `setBroadcastTargets` — request/response validated with the Task's schemas like every existing method.
- Modify: `apps/ui/src/types/global.d.ts` — matching declarations.
- Test: `apps/desktop/src/main/ipc/ghosttyIpc.test.ts`

**Interfaces:**
- Consumes: Task 3 client.
- Produces: the renderer-callable surface listed above; `ghostty:event` pushes `GhosttyRendererEvent`s (main → renderer via the same webContents-send mechanism `session:event` uses — find `emitSessionEvent`'s wiring in `apps/desktop/src/main/main.ts` and mirror it as `emitGhosttyEvent`).

- [ ] **Step 1: Failing tests** — schema round-trips (valid payloads parse; `bounds.w = -1` rejects; unknown `kind` rejects) and handler delegation with a fake client (surfaceBounds handler calls `client.setBounds` with parsed args).
- [ ] **Step 2–4:** fail → implement all six recipe files → pass. Also update `apps/ui/src/lib/fakeShell.ts` so `createFakeShell` stubs the new methods (renderer unit tests depend on it).
- [ ] **Step 5:** `pnpm build && pnpm --filter @hypershell/desktop test`. Commit — `git commit -m "feat(ghostty): IPC channels for surface lifecycle, overlay guard, broadcast sync"`

---

### Task 5: Main data rerouting

**Files:**
- Modify: `apps/desktop/src/main/ipc/registerIpc.ts:1060-1107` (the `manager.onEvent` subscription)
- Test: extend `apps/desktop/src/main/ipc/registerIpc.test.ts` if it exists (check; otherwise add a focused test file for the routing function extracted below)

**Interfaces:**
- Consumes: Task 3 `client.feedData`, `client.sessionClosed`.
- Produces: extracted pure-ish function `routeSessionEvent(event, deps: { emitSessionEvent, feedData, sessionClosed, sessionLogger, recorder, ... })` so routing is unit-testable.

- [ ] **Step 1: Failing test** — `routeSessionEvent({ type: "data", sessionId: "s1", data: "x" }, deps)` calls `deps.feedData("s1", "x")`, `deps.sessionLogger.onSessionData`, `deps.recorder.onSessionData`, and does NOT call `deps.emitSessionEvent`; a `status` event calls `emitSessionEvent` and not `feedData`; an `exit` event calls both `emitSessionEvent` and `sessionClosed(sessionId, exitCode)`.
- [ ] **Step 2–3:** fail → refactor the existing subscription body into `routeSessionEvent` preserving every existing side effect (claude binder, recovery bookkeeping, logger, recorder — everything at `registerIpc.ts:1060-1107`), with the one behavioral change: **data events stop flowing to the renderer and start flowing to the host client.** → pass.
- [ ] **Step 4:** Manual smoke is impossible until Task 6 renders panes; rely on tests here. Commit — `git commit -m "feat(ghostty): route session data to host, keep logging/recording taps"`

---

### Task 6: Settings → ghostty config mapping

**Files:**
- Create: `apps/desktop/src/main/ghosttyHost/ghosttyConfigFromSettings.ts`
- Test: `apps/desktop/src/main/ghosttyHost/ghosttyConfigFromSettings.test.ts`

**Interfaces:**
- Consumes: the renderer settings shape — read `apps/ui/src/features/settings/settingsStore.ts` and `apps/ui/src/features/terminal/terminalTheme.ts` for the terminal settings + theme/customThemes structure; settings reach main already (find how settings persist — grep `settings` in `apps/desktop/src/main/ipc/`) — reuse that source rather than adding a new sync channel if main already has it; if settings are renderer-only, add `ghostty:update-config` carrying the computed blob from the renderer instead (decide by reading, record the choice in the commit message).
- Produces: `ghosttyConfigFromSettings(input: { fontFamily: string; fontSize: number; lineHeight?: number; cursorBlink: boolean; scrollback: number; theme: ResolvedTheme }): string` where `ResolvedTheme` = the resolved color set (background, foreground, cursor, selection, 16 ANSI colors). Output = ghostty `key = value` lines: `font-family`, `font-size`, `cursor-style-blink`, `scrollback-limit` (bytes — ghostty's unit; convert lines→bytes as `lines * 512` and note the approximation), `background`, `foreground`, `cursor-color`, `selection-background`, `selection-foreground`, `palette = N=#rrggbb` × 16.

- [ ] **Step 1: Failing golden test** — one fixture input → exact multi-line string compare (the full blob, byte-for-byte). Second test: 16 palette lines present and ordered 0–15. Third: font family with spaces is emitted unquoted (ghostty config takes raw values after `=`; verify against the port's config parsing before finalizing — if quoting is needed, the test encodes it).
- [ ] **Step 2–4:** fail → implement → pass.
- [ ] **Step 5:** Wire into the client: `getGlobalConfig` (Task 3) uses it; settings changes call `client.updateGlobalConfig()`. Commit — `git commit -m "feat(ghostty): settings-to-config mapping with golden fixtures"`

---

### Task 7: Renderer — GhosttyPane and useTerminalSession split

**Files:**
- Create: `apps/ui/src/features/terminal/GhosttyPane.tsx`
- Create: `apps/ui/src/features/terminal/useGhosttySurface.ts`
- Test: `apps/ui/src/features/terminal/useGhosttySurface.test.tsx` (via `setShell(createFakeShell({...}).shell)`)
- Modify: `apps/ui/src/features/terminal/useTerminalSession.ts` — remove the xterm mount effect (`useTerminalSession.ts:386-594`), the fit/search/webgl/clipboard-DOM machinery, `applyTerminalBackground` (`:137-160`), and the wiggle wiring (`:738-753`); keep session lifecycle (connect/disconnect/applySessionEvent/event subscription/recovery) intact. `connect()`'s cols/rows (`:608-609`) now come from the latest `grid` event, default `120×40` before the first report.
- Modify: the component that mounts the terminal (find the `useTerminalSession` consumer — `TerminalPane`) to render `<GhosttyPane>` instead of the xterm container.

**Interfaces:**
- Consumes: Task 4 shell methods.
- Produces:
  - `useGhosttySurface(input: { sessionId: string | null; fontSize: number; onGrid?: (cols: number, rows: number) => void; onChord?: (chord: string) => void }): { containerRef: RefObject<HTMLDivElement | null>; focused: boolean; focusSurface: () => void }`
  - Behavior contract (each a unit test with the fake shell): (a) when `sessionId` becomes non-null and the container has a rect, calls `ghosttySurfaceCreate` once with physical-px bounds (`Math.round(cssRect * devicePixelRatio)`); (b) `ResizeObserver`/scroll changes call `ghosttySurfaceBounds` debounced to one per animation frame; (c) unmount calls `ghosttySurfaceDestroy`; (d) `ghostty:event` with `kind: "grid"` for this session invokes `onGrid`; (e) `kind: "chord"` invokes `onChord`; (f) `kind: "focusGained"/"focusLost"` flips `focused`; (g) `TERMINAL_FOCUS_REQUEST_EVENT` for this session calls `ghosttySurfaceFocus`; (h) `IntersectionObserver` non-intersecting (hidden tab) → `ghosttySurfaceVisible(false)`, intersecting → `true` (this is how tab switching hides surfaces — DOM `visibility:hidden` does nothing to a native HWND).
  - `GhosttyPane` renders `<div ref={containerRef} className="h-full w-full" data-testid="ghostty-pane" />` plus the existing status overlays (connecting/failed states still render in DOM — they appear when the surface is hidden or before it exists).
  - Chord dispatch: `onChord` maps `"ctrl+shift+d"` → the same functions the App.tsx keydown handler calls (import from `paneShortcuts.ts`); `"ctrl+="`/`"ctrl+-"`/`"ctrl+0"` → `increaseFontSize`/`decreaseFontSize`/`resetFontSize`, whose new implementations call `ghosttySurfaceCommand` with a per-surface `font-size` config update (`client.updateSurfaceConfig` path) instead of mutating xterm options.
  - Title flow: OSC titles arrive as `ghostty:event` `kind: "title"` → `layoutStore.getState().setTabDynamicTitle(sessionId, sanitizeTitle(title))` — same store call the xterm `onTitleChange` made (`useTerminalSession.ts:429-435`).

- [ ] **Step 1:** Write failing tests (a)–(h). jsdom lacks `ResizeObserver`/`IntersectionObserver` — stub them in the test file the way existing UI tests do (grep `ResizeObserver` in `apps/ui/src/**/*.test.*` for the established stub; add one to `vitest.setup.ts` only if none exists).
- [ ] **Step 2–3:** fail → implement hook + component → pass.
- [ ] **Step 4:** Excise xterm from `useTerminalSession.ts` per the Files block; update `TerminalPane` (including moving the recording button + search trigger: search now sends `ghosttySurfaceCommand({ cmd: "toggle_search" })`; delete `TerminalSearchBar.tsx` usage). `pnpm --filter @hypershell/ui test` — fix every consumer the type-checker flags (`terminal`, `searchAddon` leave the hook's return type).
- [ ] **Step 5:** First live smoke: `GHOSTTY_HOST_PATH=<zig-out path> pnpm dev`-equivalent (delete `apps/desktop/dist/renderer/`, `pnpm --filter @hypershell/desktop build`, launch) — open a local shell tab, see ghostty render it, type, resize the pane. Fix what's broken before committing.
- [ ] **Step 6: Commit** — `git commit -m "feat(ghostty): GhosttyPane renders sessions via host surfaces"`

---

### Task 8: Native overlay guard (airspace)

**Files:**
- Create: `apps/ui/src/features/terminal/nativeOverlayGuard.ts`
- Test: `apps/ui/src/features/terminal/nativeOverlayGuard.test.ts`
- Modify: the shared modal/dialog primitive (find it: grep `Dialog|Modal` in `apps/ui/src/components/` — the component the connection-challenge modal, settings dialog, and tmux picker all render through; if there are two primitives, instrument both), the tab-drag layer, the snippets panel mount, and any `ContextMenu` component.
- Modify: `apps/ui/src/App.tsx` — `<Toaster>` position moves to a corner over the sidebar/status bar (`position="bottom-left"` with an offset clearing the terminal area).

**Interfaces:**
- Produces:
  - `acquireOverlayGuard(): () => void` — increments a module counter; returns release. On 0→1 calls `getShell().ghosttyOverlayGuard({ hidden: true })`; on 1→0, `{ hidden: false }` **after a 50ms delay** (collapses modal→modal transitions without flashing surfaces).
  - `useOverlayGuard(active: boolean): void` — React hook wrapping acquire/release in an effect; this is what the primitives call.
  - Main side: this task renames Task 3's `setAllVisible(visible)` to `setOverlayVisible(visible)` (update the Task 4 `overlayGuard` handler to call it) and makes it compose with per-surface visibility from Task 7(h): the client stores both flags per surface and shows a surface only when `overlayVisible && surfaceVisible`. Unit tests: guard hidden + tab visible → hidden; guard released → tab-visible surfaces reappear, hidden-tab surfaces stay hidden.
- [ ] **Step 1:** Failing tests: counter semantics (two acquires, one release → still hidden; both released → shown after the delay, fake timers); client composition test above.
- [ ] **Step 2–3:** fail → implement → pass.
- [ ] **Step 4:** Wire `useOverlayGuard(open)` into each overlay owner listed in Files. Live smoke: open the settings dialog over a running terminal — surface hides, backdrop shows, closing restores it. Commit — `git commit -m "feat(ghostty): overlay guard hides native surfaces under DOM overlays"`

---

### Task 9: Broadcast state sync

**Files:**
- Modify: `apps/ui/src/features/broadcast/broadcastStore.ts` — subscribe: on any change to `enabled`/`targetSessionIds`, call `getShell().setBroadcastTargets({ enabled, targetSessionIds })` (guard `hasShell()`).
- Test: `apps/ui/src/features/broadcast/broadcastStore.test.ts` (extend if exists, create otherwise) with the fake shell asserting the call on state change.
- Modify: remove the renderer-side fan-out at `useTerminalSession.ts:548-563` (`onData` broadcast loop) — already gone with Task 7's excision; this task verifies nothing else reads `broadcastStore` for fan-out and deletes the now-unused refs (`broadcastEnabledRef`, `broadcastTargetsRef`).

- [ ] **Steps:** failing test → subscription → pass → live smoke with two local tabs (enable broadcast, type in one, both receive — the input frame fans out in main via Task 3(c)) → commit `git commit -m "feat(ghostty): broadcast fan-out moves to main"`.

---

### Task 10: Recording playback via replay surface

**Files:**
- Modify: `apps/ui/src/features/recording/RecordingPlaybackDialog.tsx` — replace the xterm instance with a `GhosttyPane`-style container using a replay surface; playback controls call a new preload method.
- Modify: Task 4's channel set — add `replayOpen: "ghostty:replay-open"`, `replayControl: "ghostty:replay-control"` (`{ replayId, action: "play" | "pause" | "seek", frameIndex?: number }`), `replayClose: "ghostty:replay-close"` to `ghosttyChannels` with schemas/preload/global.d.ts (full recipe).
- Create: `apps/desktop/src/main/ghosttyHost/replayDriver.ts` + test.

**Interfaces:**
- Produces: `createReplayDriver(opts: { client: GhosttyHostClient; getFrames: (id: number) => Promise<RecordingFrame[]> })` → `{ open(recordingId, parentHwnd, bounds): Promise<string>; control(replayId, action, frameIndex?): void; close(replayId): void }`. `open` creates a replay surface (Task 3 `createReplaySurface`), loads frames; `play` feeds frames through `client.feedData` on their recorded timestamps (setTimeout chain, honoring pause); `seek` = `sendCommand(replayId, "clear")` + instant-feed frames `0..frameIndex`.
- The dialog registers with `useOverlayGuard(true)` **but** its own replay surface must stay visible: extend the Task 8 client composition with a per-surface `exemptFromOverlayGuard` flag set for replay surfaces (unit test: guard hidden → session surfaces hidden, replay surface still visible).

- [ ] **Steps:** failing replayDriver tests (open creates surface; play feeds frames in timestamp order with fake timers; pause stops; seek clears then feeds prefix) → implement → pass → dialog rewiring → live smoke (record a short local session, play it back) → commit `git commit -m "feat(ghostty): recording playback drives a replay surface"`.

---

### Task 11: Packaging

**Files:**
- Modify: `apps/desktop/electron-builder.yml` — `extraResources`: `{ from: "${env.GHOSTTY_HOST_DIST}", to: "ghostty-host/" }` copying `ghostty-host.exe` + `mesa/` (the Plan 1 artifacts); document `GHOSTTY_HOST_DIST` in the file comment and fail the build loudly if unset (electron-builder leaves missing from-dirs silent — add a `beforePack` check script if the config supports it, else a predicate in the release npm script).
- Modify: `apps/desktop/src/main/ghosttyHost/hostPath.ts` (create): `resolveGhosttyHostPath(): string` — `process.env.GHOSTTY_HOST_PATH ?? path.join(process.resourcesPath, "ghostty-host", "ghostty-host.exe")`; unit test both branches (stub `process.resourcesPath`).

- [ ] **Steps:** test → implement → `pnpm release:windows:unsigned` with `GHOSTTY_HOST_DIST` pointed at the port's `zig-out/bin` → install on this machine → launch → terminal renders (this is the packaged-GL/Mesa check from spec §7) → commit `git commit -m "feat(ghostty): bundle ghostty-host + mesa in the installer"`.

---

### Task 12: Electron E2E

**Files:**
- Create: `apps/desktop/tests/ghostty-session.spec.ts`
- Create: `apps/desktop/tests/ghostty-host-crash.spec.ts`
- Modify: `apps/desktop/playwright.electron.config.ts` env plumbing for `GHOSTTY_HOST_PATH`.

**Interfaces:** follows the existing electron E2E harness (fresh `HYPERSHELL_DATA_DIR` per test, local TCP echo server pattern from the session-lifecycle spec — copy its setup).

- [ ] **Step 1: `ghostty-session.spec.ts`** — boot app with real host; open a session against the echo server; assert: `data-testid="ghostty-pane"` present; the session reaches `connected`; typing into the window produces echo-server traffic (assert on the echo server's received bytes — keystrokes now travel renderer-window → host HWND → input frame → transport); tab title updates when the echo server sends an OSC 0 sequence (`\x1b]0;e2e-title\x07` → tab shows `e2e-title`).
- [ ] **Step 2: `ghostty-host-crash.spec.ts`** — mid-session, kill the host process by PID (expose the PID via a test-only IPC or find it by exe name with `taskkill /IM ghostty-host.exe /F` scoped to the test's child tree); assert within 10s: app window still alive, session still `connected` in the store, a new host PID exists, and a subsequent echo round-trip works (surface resurrected and rebound).
- [ ] **Step 3:** Run per CLAUDE.md: `pnpm --filter @hypershell/desktop run build:bundle && pnpm --filter @hypershell/desktop rebuild:native && pnpm ci:test:e2e:electron`. Green.
- [ ] **Step 4: Commit** — `git commit -m "test(ghostty): electron E2E for session lifecycle and host-crash recovery"`

---

### Task 13: Parity checklist, cutover, cleanup

**Files:**
- Modify: `apps/ui/package.json` (remove all five `@xterm/*` deps)
- Delete: `apps/ui/src/features/terminal/terminalRepaintGuard.ts`, `optionalWebglRenderer.ts` + `.test.ts`, `TerminalSearchBar.tsx`, `terminalUnicode.ts` + `.test.ts`, `conptyResyncWiggle.ts` (conditional — see Step 2), and every other file the type-checker orphans after the dep removal (`terminalTheme.ts` shrinks to the theme-resolution logic Task 6 consumes from it, or moves into it).
- Modify: `CLAUDE.md` — update the architecture section (terminal = ghostty-host), the gotchas that die (ConPTY wiggle, WebGL blank-canvas, SFTP-height stays), add gotchas discovered during this plan (airspace guard registration; GHOSTTY_HOST_PATH for dev).
- Modify: `docs/superpowers/specs/2026-08-25-ghostty-terminal-replacement-design.md` — check off §9 items as verified.

- [ ] **Step 1: Run the spec §9 parity checklist top to bottom** against a dev build. Each item gets verified by hand (SSH against both verification hosts — docker/zsh and checkmk/bash — for the bootstrap handshake item; serial/telnet against real targets or the echo server; IME; DPI drag across monitors; every overlay). Any failure spawns a fix before proceeding — the checklist gates this task, per spec.
- [ ] **Step 2: Wiggle verdict** — run the ConPTY ghost-row repro (claude full-width TUI in a local tab, widen the pane repeatedly; harness recipe in auto-memory `project_conpty_ghost_harness.md`). Clean → delete `conptyResyncWiggle.ts` + tests. Ghosts → keep the resync as a `setBounds` narrow-then-restore in `useGhosttySurface` and file it as a known-issue note in CLAUDE.md.
- [ ] **Step 3: The two port-bug gates (spec §7)** — confirm the black-screen-after-interactive-resize bug and the responsiveness gap are resolved/absent in embedded mode (they may simply not reproduce without ghostty's own chrome; test explicitly: rapid interactive pane resizes × 50, and a `time ls -R` style throughput feel-check vs. current main). Unresolved → STOP; the cutover commit does not land until they're retired (fix on the port branch, rebuild, retest).
- [ ] **Step 4: Cutover commit** — remove deps, delete files, `pnpm build && pnpm test && pnpm lint`, browser E2E still green (`pnpm --filter @hypershell/ui test:e2e` — bridgeless mode renders placeholder panes, which is the pre-existing `hasShell()` contract), electron E2E green. `git commit -m "feat!: replace xterm.js with ghostty-host rendering"`.
- [ ] **Step 5:** Push branch `ghostty-terminal`, open the PR (PR gates run the full matrix), and hand the parity-checked build to daily-driver use before merging.

**Deliverable of this plan:** HyperShell renders every terminal through ghostty-host, `@xterm/*` is gone, parity checklist signed, E2E (unit + browser + electron) green on the `ghostty-terminal` branch PR.
