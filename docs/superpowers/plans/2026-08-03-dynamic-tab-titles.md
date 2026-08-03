# Dynamic Tab Titles + Tab Bar Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tabs follow the terminal's OSC title updates (all transports) and get Windows-Terminal-grade visual polish: per-tab state-tinted icons, roomier tabs with fade truncation, stronger active contrast, full-title tooltip.

**Architecture:** Renderer-only. xterm.js `onTitleChange` (fired for OSC 0/2, which ConPTY synthesizes from PowerShell console-title changes) → sanitizer → `layoutStore.setTabDynamicTitle`. Display resolution is `dynamicTitle ?? title` everywhere; the static base `title` is never overwritten. Terminals stay mounted for background tabs (`Workspace.tsx` hides with `invisible`), so every tab updates.

**Tech Stack:** React 18, xterm.js (`@xterm/xterm`), Zustand vanilla stores, Tailwind v4 tokens/primitives from the UI-polish work.

**Spec:** `docs/superpowers/specs/2026-08-03-dynamic-tab-titles-design.md`

## Global Constraints

- Zero IPC / main-process / session-core changes.
- All colors through semantic tokens (`text-warning`, `text-danger`, `text-text-*`); no hardcoded palette classes.
- Primitives concatenate className without tailwind-merge — no colliding overrides.
- `apps/ui/src/features/terminal/useTerminalSession.ts` has UNCOMMITTED user work (unicode addon wiring, ~11 lines). Additive edits only. NEVER revert, reformat, or stage the unrelated hunks — stage with `git add -p`-level care or verify with `git diff --cached` that only your hunks are staged. Same for the other dirty files (`apps/ui/package.json`, `terminalTheme*.ts`, `terminalUnicode*.ts`, `pnpm-lock.yaml`): never stage them.
- No manual tab rename, no persistence of dynamic titles across restarts.
- Verification cadence: every task ends with `pnpm --filter @hypershell/ui test` + `pnpm lint` green, then a commit. Final task adds build + browser E2E.
- Commit trailer (every commit):
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01HJEuuxhBce3Yw6TVxUnuMm`

---

### Task 1: Title sanitizer

**Files:**
- Create: `apps/ui/src/features/terminal/titleSanitizer.ts`
- Test: `apps/ui/src/features/terminal/titleSanitizer.test.ts`

**Interfaces:**
- Produces: `sanitizeTitle(raw: string): string | null` — strips C0/C1 control chars, collapses whitespace runs to single spaces, trims, caps at 120 chars; returns `null` for empty results. Task 3 pipes xterm titles through this.

- [ ] **Step 1: Write the failing test**

`apps/ui/src/features/terminal/titleSanitizer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sanitizeTitle } from "./titleSanitizer";

describe("sanitizeTitle", () => {
  it("passes ordinary titles through", () => {
    expect(sanitizeTitle("pwsh in hypershell")).toBe("pwsh in hypershell");
  });

  it("strips C0/C1 control characters", () => {
    expect(sanitizeTitle("evil\u0007title\u001b[31m")).toBe("eviltitle[31m");
  });

  it("collapses whitespace runs and trims", () => {
    expect(sanitizeTitle("  a \t b\n\nc  ")).toBe("a b c");
  });

  it("caps length at 120 characters", () => {
    expect(sanitizeTitle("x".repeat(300))).toHaveLength(120);
  });

  it("returns null for empty or whitespace-only input", () => {
    expect(sanitizeTitle("")).toBeNull();
    expect(sanitizeTitle("   \t ")).toBeNull();
    expect(sanitizeTitle("\u0007\u001b")).toBeNull();
  });
});
```

Note the control-char test above is intentionally simple in expectation: control chars are REMOVED (not replaced with spaces), so `"evil\u0007title\u001b[31m"` → `"eviltitle[31m"`. Write the assertion as exactly:

```ts
expect(sanitizeTitle("evil\u0007title\u001b[31m")).toBe("eviltitle[31m");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hypershell/ui test -- titleSanitizer`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`apps/ui/src/features/terminal/titleSanitizer.ts`:

```ts
const MAX_TITLE_LENGTH = 120;

/** OSC titles come straight from the remote/local shell — strip control
 *  characters, normalize whitespace, cap length. Empty results → null so
 *  callers fall back to the tab's static base title. */
export function sanitizeTitle(raw: string): string | null {
  const cleaned = raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TITLE_LENGTH);
  return cleaned.length > 0 ? cleaned : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @hypershell/ui test -- titleSanitizer`
Expected: PASS (5 tests).

- [ ] **Step 5: Lint + commit**

Run: `pnpm lint` — expect 0 errors. Then:

```bash
git add apps/ui/src/features/terminal/titleSanitizer.ts apps/ui/src/features/terminal/titleSanitizer.test.ts
git commit -m "feat(ui): add OSC title sanitizer"
```

### Task 2: layoutStore dynamic title

**Files:**
- Modify: `apps/ui/src/features/layout/layoutStore.ts` (LayoutTab type, new action)
- Test: `apps/ui/src/features/layout/layoutStore.test.ts` (append cases)

**Interfaces:**
- Produces: `LayoutTab.dynamicTitle?: string`; store action `setTabDynamicTitle(sessionId: string, title: string | null): void`. Resolution rule used by Tasks 3-4: `tab.dynamicTitle ?? tab.title`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/ui/src/features/layout/layoutStore.test.ts` (read the file first and follow its existing setup pattern for creating a store and opening tabs):

```ts
describe("setTabDynamicTitle", () => {
  it("sets the dynamic title without touching the base title", () => {
    const store = createLayoutStore();
    store.getState().openTab({ sessionId: "s1", title: "PowerShell" });
    store.getState().setTabDynamicTitle("s1", "pwsh in hypershell");
    const tab = store.getState().tabs.find((t) => t.sessionId === "s1");
    expect(tab?.dynamicTitle).toBe("pwsh in hypershell");
    expect(tab?.title).toBe("PowerShell");
  });

  it("clears the dynamic title with null", () => {
    const store = createLayoutStore();
    store.getState().openTab({ sessionId: "s1", title: "PowerShell" });
    store.getState().setTabDynamicTitle("s1", "cd C:\\repos");
    store.getState().setTabDynamicTitle("s1", null);
    const tab = store.getState().tabs.find((t) => t.sessionId === "s1");
    expect(tab?.dynamicTitle).toBeUndefined();
  });

  it("is a no-op for unknown sessions", () => {
    const store = createLayoutStore();
    store.getState().openTab({ sessionId: "s1", title: "PowerShell" });
    const before = store.getState().tabs;
    store.getState().setTabDynamicTitle("nope", "x");
    expect(store.getState().tabs).toBe(before);
  });

  it("survives replaceSessionId", () => {
    const store = createLayoutStore();
    store.getState().openTab({ sessionId: "s1", title: "hermes" });
    store.getState().setTabDynamicTitle("s1", "htop");
    store.getState().replaceSessionId("s1", "s2");
    const tab = store.getState().tabs.find((t) => t.sessionId === "s2");
    expect(tab?.dynamicTitle).toBe("htop");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @hypershell/ui test -- layoutStore`
Expected: FAIL — `setTabDynamicTitle` is not a function (type error on build too).

- [ ] **Step 3: Implement**

In `layoutStore.ts`:
- Add `dynamicTitle?: string;` to `LayoutTab` (after `title`).
- Add to `LayoutState`: `setTabDynamicTitle: (sessionId: string, title: string | null) => void;`
- Implement in `createLayoutStore()`:

```ts
setTabDynamicTitle: (sessionId, title) =>
  set((state) => {
    const index = state.tabs.findIndex((t) => t.sessionId === sessionId);
    if (index === -1) {
      return state;
    }
    const current = state.tabs[index];
    if ((current.dynamicTitle ?? null) === title) {
      return state;
    }
    const tabs = state.tabs.slice();
    if (title === null) {
      const { dynamicTitle: _cleared, ...rest } = current;
      tabs[index] = rest;
    } else {
      tabs[index] = { ...current, dynamicTitle: title };
    }
    return { tabs };
  }),
```

(`replaceSessionId` spreads the existing tab object, so `dynamicTitle` survives automatically — the test proves it.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @hypershell/ui test -- layoutStore`
Expected: PASS (all existing + 4 new).

- [ ] **Step 5: Lint + commit**

Run: `pnpm lint` — 0 errors. Then:

```bash
git add apps/ui/src/features/layout/layoutStore.ts apps/ui/src/features/layout/layoutStore.test.ts
git commit -m "feat(ui): layoutStore supports per-tab dynamic titles"
```

### Task 3: Wire xterm onTitleChange + StatusBar resolution

**Files:**
- Modify: `apps/ui/src/features/terminal/useTerminalSession.ts` (main terminal-creation effect, ~line 347 area — CONTAINS UNCOMMITTED USER WORK, additive edits only)
- Modify: `apps/ui/src/features/statusbar/StatusBar.tsx` (title display, one line)

**Interfaces:**
- Consumes: `sanitizeTitle` (Task 1), `setTabDynamicTitle` via the app's layout store singleton (Task 2), xterm `Terminal.onTitleChange(cb: (title: string) => void): IDisposable`.
- Note: find the layout store singleton with `grep -n "layoutStore" apps/ui/src/features/statusbar/StatusBar.tsx` — StatusBar already imports it; import the same binding in useTerminalSession.

- [ ] **Step 1: Read the current effect**

Read `useTerminalSession.ts` fully. Locate the async terminal-creation effect (`instance = new XTerm(opts)` ~line 347) and the cleanup path (`disposeInput`, `removeFocusListeners`, terminal disposal). Note `sessionIdRef.current` — it tracks the LIVE session id (updated on reconnect), so the title callback must read it at fire time, not capture it.

- [ ] **Step 2: Subscribe onTitleChange**

Immediately after `setSearchAddon(search);` (still inside the async block, before `container = containerRef.current;`), add:

```ts
const titleDisposable = instance.onTitleChange((rawTitle) => {
  const sessionId = sessionIdRef.current;
  if (!sessionId) {
    return;
  }
  layoutStore.getState().setTabDynamicTitle(sessionId, sanitizeTitle(rawTitle));
});
```

Imports at the top of the file (additive):

```ts
import { layoutStore } from "../layout/layoutStore";
import { sanitizeTitle } from "./titleSanitizer";
```

(Adjust the layoutStore import path/binding to match what StatusBar.tsx uses.)

Dispose it in the effect's cleanup exactly where the other disposables go — follow the existing pattern: capture it in a variable declared alongside `disposeInput` (e.g. `let titleDisposable: { dispose(): void } | null = null;` at the top of the effect, assign inside the async block) and call `titleDisposable?.dispose();` in the cleanup next to `disposeInput?.dispose();`.

- [ ] **Step 3: StatusBar shows the resolved title**

In `StatusBar.tsx`, change the title span (currently `{activeTab.title}`, ~line 85):

```tsx
<span className="text-text-primary truncate max-w-[160px]">{activeTab.dynamicTitle ?? activeTab.title}</span>
```

- [ ] **Step 4: Verify**

Run: `pnpm --filter @hypershell/ui test && pnpm lint && pnpm --filter @hypershell/ui build`
Expected: all green (no new unit tests here — the sanitizer and store are covered; this task is wiring).

Then confirm staging hygiene: `git add apps/ui/src/features/terminal/useTerminalSession.ts apps/ui/src/features/statusbar/StatusBar.tsx`, then `git diff --cached apps/ui/src/features/terminal/useTerminalSession.ts` and verify the staged diff INCLUDES the user's pre-existing unicode hunks is EXPECTED — wait, no: the user's hunks were already in the working tree, so staging the file stages them too. **Do NOT stage the whole file.** Instead use:

```bash
git add apps/ui/src/features/statusbar/StatusBar.tsx
git add -p apps/ui/src/features/terminal/useTerminalSession.ts
```

selecting ONLY the hunks you authored (the two imports, the titleDisposable declaration/assignment, the cleanup line). `git add -p` is interactive and cannot be used in this harness — instead do this: run `git diff apps/ui/src/features/terminal/useTerminalSession.ts` FIRST (before editing) and save the pre-existing diff to `/tmp` is ALSO not available. Use this deterministic method instead:

1. Before editing, run `git stash push -- apps/ui/src/features/terminal/useTerminalSession.ts` — stashes ONLY the user's uncommitted hunks in that file.
2. Make your edits on the clean file, stage, commit.
3. `git stash pop` — restores the user's hunks on top of your commit. If the pop conflicts, resolve by keeping BOTH (their hunks are in the import block and addon wiring; yours are separate lines).

Verify after pop: `git diff apps/ui/src/features/terminal/useTerminalSession.ts` shows only the user's original ~11-line unicode diff, and `git log -1 --stat` shows your commit touched only your lines.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(ui): tab titles follow terminal OSC title changes"
```

(with the staging flow from Step 4 — commit happens between stash and pop.)

### Task 4: TabBar polish — icons, sizing, fade, contrast, tooltip

**Files:**
- Create: `apps/ui/src/features/layout/TabIcon.tsx`
- Modify: `apps/ui/src/features/layout/TabBar.tsx`

**Interfaces:**
- Consumes: `LayoutTab` (incl. `dynamicTitle`, `transport`, `profileId`, `type`), `sessionStateStore` states, `LocalProfileIcon` (`apps/ui/src/features/local/LocalProfileIcon.tsx`, props `{ icon, className }`), `localProfilesStore` (`apps/ui/src/features/local/localProfilesStore.ts`, `s.profiles: LocalProfileRecord[]` with `id` and `icon` fields).
- Produces: `<TabIcon tab={LayoutTab} sessionState={string | undefined} isActive={boolean} />` — renders the profile/transport glyph tinted by state.

- [ ] **Step 1: Create `TabIcon.tsx`**

```tsx
import { useStore } from "zustand";
import type { LayoutTab } from "./layoutStore";
import { LocalProfileIcon } from "../local/LocalProfileIcon";
import { localProfilesStore } from "../local/localProfilesStore";

function stateTint(sessionState: string | undefined, isActive: boolean): string {
  switch (sessionState) {
    case "connected":
      return isActive ? "text-text-primary" : "text-text-secondary";
    case "connecting":
    case "reconnecting":
      return "text-warning host-status-pulse";
    case "waiting_for_network":
      return "text-warning";
    case "failed":
      return "text-danger";
    default:
      return "text-text-muted/50";
  }
}

function TransportGlyph({ tab }: { tab: LayoutTab }) {
  if (tab.type === "sftp") {
    return (
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M2 4.5A1.5 1.5 0 013.5 3H6.5L8 5H12.5A1.5 1.5 0 0114 6.5V11.5A1.5 1.5 0 0112.5 13H3.5A1.5 1.5 0 012 11.5V4.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    );
  }
  if (tab.transport === "serial") {
    return (
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M5 2V7M11 2V7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M3.5 7H12.5V9A4.5 4.5 0 018 13.5V13.5A4.5 4.5 0 013.5 9V7Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M8 13.5V15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }
  // ssh, telnet, and anything else terminal-shaped
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4 6l2 2-2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.5 10.5H12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function TabIcon({
  tab,
  sessionState,
  isActive,
}: {
  tab: LayoutTab;
  sessionState: string | undefined;
  isActive: boolean;
}) {
  const profiles = useStore(localProfilesStore, (s) => s.profiles);
  const tint = stateTint(sessionState, isActive);
  const localProfile =
    tab.transport === "local" && tab.profileId
      ? profiles.find((p) => p.id === tab.profileId)
      : undefined;

  return (
    <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center ${tint}`}>
      {localProfile ? (
        <LocalProfileIcon icon={localProfile.icon} className="h-3.5 w-3.5" />
      ) : (
        <TransportGlyph tab={tab} />
      )}
    </span>
  );
}
```

Check `LocalProfileRecord`'s icon field name first (`grep -n "icon" packages/shared/src` or the store) — if it's optional, `LocalProfileIcon` already handles undefined (it's used that way in WelcomeScreen).

- [ ] **Step 2: TabBar — swap dot for TabIcon, resolved titles, sizing, fade, contrast**

In `TabBar.tsx` (`SortableTab` and `TabTooltip`):

1. Replace the dot `<span className={\`w-1.5 h-1.5 rounded-full shrink-0 ...\`} />` in the tab button with:

```tsx
<TabIcon tab={tab} sessionState={sessionState} isActive={isActive} />
```

Import `TabIcon` from `./TabIcon`. Remove the now-unused `tabStateColors` map IF nothing else references it (the tooltip uses `stateTextColors` — keep that one).

2. Resolved title with fade truncation — replace `<span className="truncate">{tab.title}</span>` with:

```tsx
<span className="min-w-0 flex-1 overflow-hidden whitespace-nowrap pr-3 [mask-image:linear-gradient(to_right,black_calc(100%-14px),transparent)]">
  {tab.dynamicTitle ?? tab.title}
</span>
```

(The `pr-3` keeps short titles out of the fade zone, so only clipped text visually fades — Windows Terminal behavior.)

3. Tab sizing + contrast — update the tab `<button>` class string: replace `max-w-[200px]` with `min-w-[110px] max-w-[220px]`, and change the inactive-state classes from `text-text-secondary hover:text-text-primary hover:bg-base-700/40` to `text-text-muted hover:text-text-primary hover:bg-base-700/40`. Active stays `bg-base-900 text-text-primary` + accent top-line.

4. Tooltip — in `TabTooltip`, headline becomes the resolved title and the base title joins the meta row:

```tsx
<div className="font-medium text-text-primary text-[13px] mb-1 break-words">{tab.dynamicTitle ?? tab.title}</div>
<div className="flex items-center gap-1.5 text-text-muted">
  <span className="text-text-secondary">{transport}</span>
  {tab.dynamicTitle && tab.dynamicTitle !== tab.title && (
    <>
      <span className="text-text-muted/50">&middot;</span>
      <span>{tab.title}</span>
    </>
  )}
  {tab.profileId && (
    <>
      <span className="text-text-muted/50">&middot;</span>
      <span>{tab.profileId}</span>
    </>
  )}
</div>
```

Also widen the tooltip slightly for long titles: `min-w-[180px]` → `min-w-[180px] max-w-[320px]`.

- [ ] **Step 3: Verify**

Run: `pnpm --filter @hypershell/ui test && pnpm lint && pnpm --filter @hypershell/ui build`
Expected: green. If ESLint flags the removed `tabStateColors` as unused, delete it (only if truly unreferenced).

- [ ] **Step 4: Commit**

```bash
git add apps/ui/src/features/layout/TabIcon.tsx apps/ui/src/features/layout/TabBar.tsx
git commit -m "feat(ui): tab icons with state tint; roomier tabs, fade truncation, richer tooltip"
```

### Task 5: Final verification + live check

**Files:** none (verification; fix regressions found)

- [ ] **Step 1: Full gates**

Run: `pnpm --filter @hypershell/ui test && pnpm lint && pnpm --filter @hypershell/ui build && pnpm --filter @hypershell/ui test:e2e`
Expected: all green (accessibility spec included — the tab markup changed).

- [ ] **Step 2: Live smoke via Playwright screenshot**

Write a THROWAWAY spec (do not commit) that opens the app in the Vite dev harness the e2e config provides, opens a local PowerShell tab if the environment allows (the browser e2e runs without Electron IPC, so a real PTY is unavailable — in that case, drive the layout store directly: `window` access to stores is not exposed, so instead assert statically): capture a screenshot of the tab bar area for visual confirmation of icon + spacing rendering, save to the SDD workspace screenshots dir. If tab content can't be opened in the browser harness, screenshot the welcome screen only and note that PTY-driven title changes need the Electron manual check below.
Delete the throwaway spec afterwards.

- [ ] **Step 3: Manual Electron check (report instructions, do not block)**

The real OSC flow needs Electron + ConPTY. Note in the report for the human: launch dev app, open PowerShell tab → title should change to PowerShell's console title (path/command) within a prompt cycle; `cd` somewhere → title follows; SSH to a host with PROMPT_COMMAND title → follows; disconnect/clear → falls back to profile/host name.

- [ ] **Step 4: Commit any fixes**

```bash
git add apps/ui/src/features/layout/ apps/ui/src/features/terminal/titleSanitizer.ts
git commit -m "fix(ui): dynamic title polish regressions from final verification"
```

(Only if fixes were needed.)
