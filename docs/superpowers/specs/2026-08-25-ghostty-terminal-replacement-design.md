# Ghostty Terminal Replacement — Design

*2026-08-25. Approved direction: embed the user's native Win32 Ghostty port into
HyperShell as an out-of-process surface host (Approach A), replacing xterm.js
entirely in a single milestone (no fallback renderer).*

## Goal and non-goals

**Goal:** every terminal pane in HyperShell is rendered by the Ghostty Windows
port (GPU-rendered, ghostty feature set) instead of xterm.js, while
`session-core` remains the sole owner of every transport (SSH via system ssh in
node-pty, serial, local ConPTY, telnet) and every main-process stream feature
(logging, broadcast, shell-integration bootstrap, Claude binder, tmux
injection, password watcher, reconnect) keeps working.

**Non-goals:**

- Using ghostty's own chrome: tabs, split tree, quick terminal, tab strip, and
  single-instance IPC stay out. HyperShell's React layout owns tabs and panes.
- Ghostty owning any PTY or child process. The host has no ConPTY.
- Cross-platform embedding. This is Windows-only, like the port.
- Keeping xterm.js as a fallback. The cutover commit removes `@xterm/*` from
  `apps/ui/package.json`; the parity checklist (§9) gates that commit.

## Motivation

Rendering quality/perf (GPU rendering, correct reflow — retiring the
`conptyResyncWiggle` hack is an explicit goal, gated on verification) and
ghostty's terminal feature set (kitty protocols, inspector, search overlay,
config/theming ecosystem).

## 1. Process topology

A new artifact built from the port's `windows-port` tree
(`C:\Users\tomer.TEC\projects\llm-tests\ghostty\upstream`):
**`ghostty-host.exe`** — libghostty core plus a trimmed win32 apprt in
"embedded mode": no chromes, no tab strip, no split tree, no quick terminal,
no single-instance pipe. It is a surface server.

- HyperShell's Electron **main process spawns it** at startup as a child
  process inside a Windows job object, so it cannot outlive the app.
- They talk over a private named pipe (random suffix, current user only).
- Main asks it to create/destroy/position **one leaf-surface child HWND per
  HyperShell pane**, parented cross-process via `SetParent` into the
  `BrowserWindow` HWND (`win.getNativeWindowHandle()`).
- Restart policy: if the host exits for any reason, main respawns it and
  re-creates surfaces for all live sessions. Scrollback is lost; sessions and
  transports survive; panes repaint from the live stream. This crash isolation
  is the reason for the out-of-process choice and must be a tested path.
- Multiple `BrowserWindow`s are supported by construction: `createSurface`
  takes the parent HWND, so surfaces are not bound to one window.

## 2. Wire protocol

One duplex named pipe carrying length-prefixed binary frames:

```
[u32 LE len][u8 type][u32 LE surfaceId][payload]
```

Data-plane frames carry raw bytes (no JSON, no base64 — hot path). Control
frames carry JSON payloads. Protocol version is exchanged in a `hello` frame;
a mismatch is fatal (main kills and rebuilds the host — both binaries ship in
the same installer, so versions only skew during development).

**HyperShell → host:**

| Message | Payload | Purpose |
|---|---|---|
| `hello` | version | handshake |
| `createSurface` | parentHwnd, rect(px), configBlob | new pane surface |
| `destroySurface` | — | pane closed |
| `setBounds` | rect in physical pixels | pane moved/resized |
| `setVisible` | bool | airspace guard, tab switching |
| `focus` | — | give keyboard focus to the surface |
| `feedData` | raw bytes | transport output for the surface |
| `sessionClosed` | exitCode? | show child-exited state |
| `updateConfig` | configBlob | theme/font/settings push (global or per-surface) |
| `command` | action name (+args) | search toggle, font size, clear, inspector, replay control |
| `replayFile` | path | recording playback surface |

**Host → HyperShell:**

| Message | Payload | Purpose |
|---|---|---|
| `hello` | version | handshake |
| `input` | raw bytes | user keystrokes/paste from termio `queueWrite` |
| `gridSize` | cols, rows, cellW, cellH | after create/resize/font change; replaces the fit addon |
| `title` | string | OSC title change |
| `bell` | — | bell |
| `passthroughChord` | chord id | HyperShell-owned shortcut pressed while surface focused |
| `focusGained` / `focusLost` | — | mirror focus into the DOM |
| `surfaceCrashed` | error | surface-level failure without host death |

Framing discipline mirrors the port's existing `Ipc.zig` (u32 LE length +
payload), so the Zig side reuses known patterns.

## 3. Port-side changes (Zig, on a branch layered on `windows-port`)

1. **`termio.Backend` gains a `stream` variant.** `backend.zig` is today a
   one-variant tagged union (`exec`) with a small interface (`threadEnter`,
   `threadExit`, `resize`, `queueWrite`, `focusGained`,
   `childExitedAbnormally`, `initTerminal`, `getProcessInfo`) — a designed
   extension point. The `stream` backend:
   - has no child process and no ConPTY;
   - `feedData` frames are handed into the same processOutput path Exec's pty
     reads use (wakeup handle registered in `threadEnter`);
   - `queueWrite` emits `input` frames to the pipe instead of writing a pty;
   - `resize` records the grid and triggers a `gridSize` report;
   - `childExitedAbnormally` renders the "session closed" state when
     HyperShell sends `sessionClosed`;
   - `getProcessInfo` returns null (process facts live in HyperShell).
2. **Embedded apprt mode** (`-Dembed` build option or runtime flag). Reuses
   `Surface.zig`, `Wgl.zig`/`Gl.zig` (including the bundled-Mesa fallback),
   `Input.zig`, IME anchoring, `SearchOverlay.zig`, clipboard handling, and
   per-monitor DPI handling. Replaces `Workspace.zig`'s chrome/tab/split
   management with a flat `surfaceId → Surface` map. Apprt actions that
   assume chrome (`new_tab`, `goto_split`, `toggle_fullscreen`, …) report
   unhandled, same as today's unhandled-action logging.
3. **Chord passthrough.** A fixed allowlist of HyperShell-owned chords —
   sourced from `apps/ui/src/features/*/paneShortcuts.ts` and the App.tsx
   keydown handler (Ctrl+Shift+S/D/E/W, Ctrl+Shift+[ and ], plus any added
   during implementation) — is intercepted in the embedded runtime's key path
   *before* core encoding and forwarded as `passthroughChord` frames. Every
   other key goes to the terminal, matching upstream's "terminal gets the
   keys" rule. Ctrl+Shift+F is handled host-side: it opens the port's own
   `SearchOverlay` on the focused surface (xterm's SearchAddon and
   `TerminalSearchBar.tsx` are removed with no renderer-side replacement).
4. **Standing-rule compatibility.** The port's rule is "match upstream unless
   Windows makes it impossible", protecting terminal behavior and
   upstreamability. The embedding work is additive — a new backend variant and
   a new runtime mode — and changes no terminal behavior. It lives on its own
   branch so `windows-port` stays clean for upstream merges.

## 4. HyperShell main-process changes

- New module `apps/desktop/src/main/ghosttyHost/`: host spawn/respawn +
  job-object management, pipe client with frame codec, and a
  `surfaceId ↔ sessionId` registry.
- **Data rerouting.** `SessionManager` data events are delivered to the host
  client (`feedData`) instead of being forwarded over Electron IPC to the
  renderer. Session logging (`createSessionLogger`), the shell-integration
  bootstrap handshake, the Claude session binder, tmux attach injection, the
  password-prompt watcher, and reconnect logic already tap this stream in the
  main process and are **untouched**. The renderer keeps receiving non-data
  session events (state transitions, process titles, claude-session, errors)
  exactly as today.
- **Broadcast moves to main.** Today the renderer fans out xterm `onData` to N
  sessions. Input now arrives as host `input` frames; main consults broadcast
  state and writes to one or many transports. The renderer syncs
  `broadcastStore` state (enabled + target session ids) to main via one new
  IPC channel (following the standard new-channel recipe in CLAUDE.md).
- **Resize flow reverses.** The host computes cols×rows from surface pixel
  size and cell metrics and reports `gridSize`; main calls the transport
  resize (`SessionManager.resize`). `openSession` issued before the first
  `gridSize` report uses an estimated size and corrects on the first report —
  equivalent to today's pre-fit behavior.
- **Renderer input path removal.** `writeSession` remains for programmatic
  writes (tmux attach command, snippets, Claude resume typing) but no longer
  carries keystrokes.

## 5. Renderer changes (`apps/ui`)

- **`useTerminalSession` splits.** Session lifecycle/state logic
  (connect/disconnect, event mapping, recovery, claude/tmux wiring) stays.
  The xterm mount is replaced by a `GhosttyPane` component that renders a
  placeholder div, reports its rect (`ResizeObserver` + layout/scroll
  tracking) through a new preload method as `setBounds` in **physical
  pixels** (CSS rect × `devicePixelRatio`; DPI changes flow through the same
  path), and mirrors focus state.
- **Deleted outright:** `@xterm/*` dependencies, fit/search/webgl/unicode
  addon wiring, `terminalRepaintGuard.ts`, `optionalWebglRenderer.ts`,
  `applyTerminalBackground`, `TerminalSearchBar.tsx`, and
  `conptyResyncWiggle.ts` — the wiggle only **if** ghostty's ConPTY-reflow
  handling proves ghost-free in testing (explicit checklist item: the
  divergence lives between conhost's reflow and any non-conhost reflow, so it
  must be verified against the known claude-UI repro before deletion; if
  ghosts appear, the equivalent narrow-then-restore resync is reimplemented
  as `setBounds` wiggle in `GhosttyPane`).
- **Airspace rule.** A native HWND composites above all DOM content. Any DOM
  overlay that can cross a pane — connection-challenge modals, tmux picker,
  settings dialog, context menus, tab-drag ghosts, snippets panel — must hide
  native surfaces first. Mechanism: a renderer-side `nativeOverlayGuard`
  module holding a counter; overlay owners (connectionChallengeStore, dialog
  mounts, drag handlers) increment/decrement it, and while >0 all surfaces in
  that window get `setVisible(false)`. Panes go blank behind the dimmed modal
  backdrop, which existing modals already provide. Sonner toasts move to a
  position guaranteed DOM-owned (over the status bar / host-browser sidebar),
  since hiding every terminal for a toast is unacceptable.
- **Focus coordination.** Clicking a surface focuses the host process's HWND.
  The `focusGained`/`focusLost` frames drive pane-active styling and keep
  `TERMINAL_FOCUS_REQUEST_EVENT` working (the renderer answers it with a
  `focus` command instead of `xterm.focus()`).
- **Recording playback.** `RecordingPlaybackDialog` uses a host surface in
  replay mode (`replayFile` + `command` play/pause/seek) instead of an xterm
  instance. This is what allows `@xterm/*` to leave `package.json` entirely.
  Note the airspace consequence: the playback dialog itself is a DOM overlay
  hosting a native surface — its surface is positioned inside the dialog rect
  and the dialog registers with `nativeOverlayGuard` to hide *other* surfaces.

## 6. Settings mapping

- A pure function `ghosttyConfigFromSettings(settings)` in the desktop main
  process translates HyperShell terminal settings — font family/size, theme
  (including custom themes), cursor blink, scrollback limit — into a ghostty
  config blob (`key = value` text). Unit-tested with golden fixtures.
- Pushed via `updateConfig` at host startup and on every settings change,
  applied through the port's existing live-reload path.
- Per-pane font-size shortcuts (Ctrl+= / Ctrl+- / Ctrl+0) join the chord
  passthrough allowlist (§3) rather than being handled host-natively: the
  renderer owns the persisted per-tab font size, updates it, and sends the
  new size back down as a per-surface `updateConfig`/`command`; the
  resulting `gridSize` report resizes the transport. Host-native handling
  would change the rendered size without the tab's persisted value ever
  learning about it.
- The `%LOCALAPPDATA%\ghostty\config` file is **not** read by the host
  (embedded mode ignores it): HyperShell settings are the single source of
  truth, preventing two config systems from fighting.

## 7. Failure modes

- **Host crash:** respawn under the job object, re-create surfaces for live
  sessions, re-push config, re-report grids. Sessions/transports unaffected.
  Covered by a dedicated E2E (kill host mid-session, assert recovery).
- **GL:** `windows-gl-backend = auto` semantics carry over; HyperShell's
  installer bundles Mesa llvmpipe next to `ghostty-host.exe` so RDP/old-GPU
  machines fall back to software rendering.
- **Protocol desync:** length-prefixed framing + version handshake; any codec
  error is treated as host death (kill + respawn) rather than limping.
- **Known port bugs are blocking pre-cutover items:** the
  black-screen-after-interactive-resize bug and the unexplained
  responsiveness gap must be fixed or demonstrated absent in embedded mode
  before the cutover commit. Full replacement leaves no fallback renderer to
  hide behind.

## 8. Testing

- **Zig:** unit tests for the `stream` backend (feed → terminal state,
  queueWrite → frames, resize → gridSize) in the port's suite; a standalone
  **host harness exe** that parents surfaces into a bare Win32 window and
  drives the pipe protocol — exercises cross-process SetParent, focus, IME,
  and DPI without Electron in the loop. The harness is where SetParent
  quirks get debugged first.
- **Protocol:** a golden frame fixture shared by the Zig codec tests and the
  TypeScript codec tests (`apps/desktop`), so both ends parse identical bytes.
- **HyperShell unit:** `ghosttyConfigFromSettings` goldens; host client
  respawn/registry logic against a fake pipe; `nativeOverlayGuard` counting.
- **Electron E2E** (existing Playwright electron suite): boot with the real
  host; run the local TCP echo-server session lifecycle asserting
  `gridSize`/title/input round-trips; kill-the-host-mid-session recovery;
  overlay-hides-surfaces assertion.
- **Manual verification:** the two standing SSH hosts (docker = zsh/omz
  adversarial, checkmk = bash clean) for the bootstrap handshake riding the
  new data path; the claude-UI ConPTY ghost-row repro before deleting the
  wiggle.

## 9. Parity checklist (gates the cutover commit)

Each item verified and checked off before the commit that removes `@xterm/*`:

- [ ] Selection + copy (mouse, keyboard), paste incl. bracketed paste
- [ ] Clipboard confirmations (OSC 52 `ask` policy)
- [ ] Link detection + open
- [ ] Search (host SearchOverlay via Ctrl+Shift+F)
- [ ] Scrollback + wheel, configured scrollback limit
- [ ] IME composition in an embedded surface
- [ ] OSC titles → tab label/tooltip/status bar (`resolveTabTitle` chain)
- [ ] Process titles (poller — unchanged path, verify end-to-end)
- [ ] Bell
- [ ] Broadcast input to multiple sessions (now main-side)
- [ ] Session logging produces identical output to today
- [ ] Recording playback dialog
- [ ] Shell-integration bootstrap handshake on SSH (both verification hosts)
- [ ] tmux picker attach injection
- [ ] Claude session binding + resume typing
- [ ] Reconnect / waiting_for_network states render sanely
- [ ] Themes + custom themes + live settings updates
- [ ] Per-tab font size persistence
- [ ] Per-monitor DPI move
- [ ] Splits/tab reorder/drag produce correct bounds with no orphan surfaces
- [ ] All overlays hide surfaces (modal, toast placement, drag ghosts,
      snippets panel, context menus)
- [ ] Host-crash recovery E2E green
- [ ] ConPTY ghost-row repro clean (or wiggle reimplemented)
- [ ] Black-screen-after-resize bug resolved/absent in embedded mode
- [ ] Responsiveness at least on par with current xterm.js experience
- [ ] Serial and telnet sessions work byte-for-byte

## 10. Risks

1. **Cross-process `SetParent`** focus/activation/IME quirks — the known
   sharp edge (mitigation: standalone harness first; precedent: VS
   out-of-process WinForms designer ships on this technique).
2. **Full replacement with no fallback** puts the port's two open bugs on the
   critical path (accepted by decision; §7 makes them blocking).
3. **Airspace regressions** — a future DOM overlay added without registering
   the guard renders under terminals. Mitigation: guard registration is
   centralized in the modal/dialog primitives, not per-feature.
4. **Two-repo coordination** — protocol changes span the port branch and
   HyperShell. Mitigation: version handshake + golden frame fixtures in both
   repos.

## Decision log

- Embed ghostty in HyperShell (not app inversion, not loose integration).
- HyperShell's `session-core` feeds ghostty (stream termio backend); ghostty
  never owns a PTY. Motivated by preserving all main-process stream features.
- Port changes: "whatever it takes", on a branch layered on `windows-port`.
- Full replacement in one milestone; parity checklist gates the cutover.
- Approach A (out-of-process host) over in-process DLL: crash isolation
  (alpha core + no fallback renderer), no native-addon toolchain (this PC
  cannot build Spectre-mitigated addons locally), standalone testability.
