# Renderer Shell Seam Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put a substitutable seam between the renderer and `window.hypershell` so bridge drift fails loudly and renderer modules become unit-testable (architecture review 2026-08-21, item 3).

**Architecture:** One accessor module (`apps/ui/src/lib/shell.ts`) exposes `getShell(): ShellApi` (a `Required<>` view of the bridge type) and `hasShell()`. The prod adapter is a lazy Proxy over `window.hypershell`: bridge absent → benign stubs (browser E2E boots the app with no bridge at all); bridge present but method missing → **throw** (this is the tunnel-buttons bug class). The second adapter is `createFakeShell()` for unit tests, installed via `setShell()`. All 218 direct `window.hypershell` call sites across 46 modules migrate to `getShell()`; an ESLint `no-restricted-properties` rule then forbids new direct access.

**Tech Stack:** TypeScript strict, React 18, Zustand, Vitest 3 + RTL (jsdom), Playwright (browser E2E), flat ESLint config.

**Spec:** Architecture review artifact `architecture-review-20260821-095921.html`, candidate 3 ("Put a seam under the renderer"). Key evidence: 181 of 218 calls are `window.hypershell?.method?.()` — a missing preload method silently no-ops (this is how the Tunnel Manager buttons died); the 4 largest renderer modules (4,702 lines) have zero unit tests because nothing can substitute the far side of the bridge.

## Global Constraints

- `react-hooks/exhaustive-deps` is an **error** in this repo → use `getShell()` (imported function, not a hook value) inside effects/callbacks; do NOT introduce a `useShell()` hook whose value would have to enter dependency arrays.
- `@typescript-eslint/no-floating-promises` is an error → keep every existing `void` / `await` / `.catch()` exactly as found.
- Browser E2E (`accessibility.spec.ts`, `quick-connect.spec.ts`) boots the app with **no bridge at all**; other specs inject `window.hypershell` via `addInitScript`. Both must keep working: the prod adapter must read `window.hypershell` lazily at call time and must not crash when it is absent.
- Preserve all existing undefined-result handling (`?? []`, `if (result)`, `if (!hosts) return`) — only the access expression changes, never the result handling.
- `git add` only files this plan touches, by explicit path — the working tree carries unrelated uncommitted work (claude-resume feature) including in `useTerminalSession.ts` and `Workspace.tsx`. **Do not commit; leave changes uncommitted** and report (harness rule: commit only when asked; overlapping files make clean commits impossible anyway).
- Unit tests: `pnpm --filter @hypershell/ui test` only (root `pnpm test` hits the known better-sqlite3 ABI mismatch locally).

## Migration transform rules (applied in Tasks 2–8)

| # | Before | After |
|---|--------|-------|
| 1 | `window.hypershell?.method?.(args)` | `getShell().method(args)` |
| 2 | `window.hypershell.method(args)` (non-optional sites) | `getShell().method(args)` |
| 3 | `if (!window.hypershell?.method) { …; return; }` | `if (!hasShell()) { …; return; }` (drift now throws at call time instead) |
| 4 | `const fn = window.hypershell?.method; if (!fn) …` | `if (!hasShell()) …; getShell().method(…)` |
| 5 | `window.hypershell?.method?.().then(…)` | `getShell().method().then(…)` (bridgeless stub returns a Promise, so `.then` is safe) |
| 6 | `return window.hypershell?.onX?.(cb)` (effect cleanup) | `return getShell().onX(cb)` (bridgeless stub for `on*` returns `() => {}`) |

Import line added per migrated module: `import { getShell } from "<rel>/lib/shell";` (add `hasShell` where rule 3/4 applies). Remove the import of nothing — `window` is global, so nothing else changes.

---

### Task 1: The seam — `lib/shell.ts`, `lib/fakeShell.ts`, tests

**Files:**
- Create: `apps/ui/src/lib/shell.ts`
- Create: `apps/ui/src/lib/fakeShell.ts`
- Test: `apps/ui/src/lib/shell.test.ts`

**Interfaces:**
- Produces: `type ShellApi = Required<NonNullable<Window["hypershell"]>>`; `getShell(): ShellApi`; `hasShell(): boolean`; `setShell(api: ShellApi | null): void`; `createFakeShell(overrides?: Partial<ShellApi>): { shell: ShellApi; calls: { method: string; args: unknown[] }[] }`.

- [x] **Step 1: Write the failing test** (`apps/ui/src/lib/shell.test.ts`):

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { createFakeShell } from "./fakeShell";
import { getShell, hasShell, setShell } from "./shell";

type BridgeShape = NonNullable<Window["hypershell"]>;

function installBridge(bridge: Partial<BridgeShape> | undefined) {
  (window as { hypershell?: Partial<BridgeShape> }).hypershell = bridge;
}

afterEach(() => {
  setShell(null);
  delete (window as { hypershell?: unknown }).hypershell;
});

describe("getShell with no bridge (browser / Playwright without init script)", () => {
  it("reports no shell", () => {
    expect(hasShell()).toBe(false);
  });

  it("returns a promise-resolving stub so awaited calls yield undefined", async () => {
    await expect(getShell().listHosts()).resolves.toBeUndefined();
  });

  it("returns an unsubscribe function from on* listeners", () => {
    const unsubscribe = getShell().onSessionEvent(() => {});
    expect(typeof unsubscribe).toBe("function");
    expect(unsubscribe()).toBeUndefined();
  });
});

describe("getShell with a bridge", () => {
  it("forwards calls with arguments and results", async () => {
    const listHosts = vi.fn().mockResolvedValue([{ id: "h1" }]);
    installBridge({ listHosts });
    await expect(getShell().listHosts()).resolves.toEqual([{ id: "h1" }]);
    expect(hasShell()).toBe(true);
  });

  it("throws loudly when a declared method is missing from the bridge (preload drift)", () => {
    installBridge({});
    expect(() => getShell().startPortForward).toThrow(/startPortForward/);
  });

  it("does not throw on promise/react probe properties", () => {
    installBridge({});
    const shell = getShell() as unknown as Record<string, unknown>;
    expect(shell.then).toBeUndefined();
    expect(shell.$$typeof).toBeUndefined();
  });
});

describe("setShell override", () => {
  it("wins over the window bridge and counts as present", async () => {
    const { shell, calls } = createFakeShell({
      listHosts: vi.fn().mockResolvedValue([]),
    });
    setShell(shell);
    expect(hasShell()).toBe(true);
    await getShell().listHosts();
    expect(calls).toEqual([{ method: "listHosts", args: [] }]);
  });
});

describe("createFakeShell", () => {
  it("stubs unlisted methods to resolve undefined and records the call", async () => {
    const { shell, calls } = createFakeShell();
    await expect(shell.closeSession({ sessionId: "s1" })).resolves.toBeUndefined();
    expect(calls).toEqual([{ method: "closeSession", args: [{ sessionId: "s1" }] }]);
  });

  it("returns an unsubscribe function for unlisted on* listeners", () => {
    const { shell } = createFakeShell();
    const unsubscribe = shell.onUpdateState(() => {});
    expect(typeof unsubscribe).toBe("function");
  });
});
```

- [x] **Step 2: Run to verify it fails** — `pnpm --filter @hypershell/ui test -- run src/lib/shell.test.ts` → FAIL (modules don't exist).

- [x] **Step 3: Implement** `apps/ui/src/lib/shell.ts`:

```ts
/**
 * The one seam between the renderer and the preload bridge.
 *
 * Every renderer module calls `getShell()` instead of touching
 * `window.hypershell` directly (enforced by ESLint `no-restricted-properties`).
 * Three behaviours, by situation:
 *
 * - Bridge absent (plain-browser dev, Playwright specs that inject nothing):
 *   methods are benign stubs — async methods resolve `undefined`, `on*`
 *   listeners return a no-op unsubscribe — matching what the old
 *   `window.hypershell?.method?.()` chains evaluated to.
 * - Bridge present but a declared method missing (preload drift — the class of
 *   bug that made the Tunnel Manager buttons silent no-ops): the access
 *   THROWS with the method name, instead of resolving `undefined`.
 * - Tests: `setShell(fake)` substitutes the whole far side in-memory.
 */

export type ShellApi = Required<NonNullable<Window["hypershell"]>>;

let override: ShellApi | null = null;

export function setShell(api: ShellApi | null): void {
  override = api;
}

export function hasShell(): boolean {
  return override != null || window.hypershell != null;
}

/** Properties probed by Promise resolution / React internals — never bridge methods. */
const PROBE_PROPS = new Set(["then", "toJSON", "$$typeof"]);

function bridgelessStub(prop: string): unknown {
  if (prop.startsWith("on")) {
    return () => () => {};
  }
  return () => Promise.resolve(undefined);
}

const bridgeProxy = new Proxy({} as Record<string, unknown>, {
  get(_target, prop) {
    if (typeof prop !== "string" || PROBE_PROPS.has(prop)) {
      return undefined;
    }
    const bridge = window.hypershell as Record<string, unknown> | undefined;
    if (!bridge) {
      return bridgelessStub(prop);
    }
    const method = bridge[prop];
    if (typeof method !== "function") {
      throw new Error(
        `window.hypershell.${prop} is not bridged — the preload and global.d.ts have drifted`
      );
    }
    return method;
  },
}) as unknown as ShellApi;

export function getShell(): ShellApi {
  return override ?? bridgeProxy;
}
```

- [x] **Step 4: Implement** `apps/ui/src/lib/fakeShell.ts`:

```ts
import type { ShellApi } from "./shell";

export interface FakeShell {
  shell: ShellApi;
  /** Every invocation in order, including calls to overridden methods. */
  calls: { method: string; args: unknown[] }[];
}

/**
 * In-memory second adapter for the shell seam. Methods not listed in
 * `overrides` resolve `undefined` (or return a no-op unsubscribe for `on*`
 * listeners) and record their invocation, so a test stubs only what it needs.
 */
export function createFakeShell(overrides: Partial<ShellApi> = {}): FakeShell {
  const calls: FakeShell["calls"] = [];
  const table = overrides as Record<string, (...args: unknown[]) => unknown>;
  const shell = new Proxy({} as Record<string, unknown>, {
    get(_target, prop) {
      if (typeof prop !== "string" || prop === "then" || prop === "$$typeof") {
        return undefined;
      }
      return (...args: unknown[]) => {
        calls.push({ method: prop, args });
        const impl = table[prop];
        if (typeof impl === "function") {
          return impl(...args);
        }
        return prop.startsWith("on") ? () => {} : Promise.resolve(undefined);
      };
    },
  }) as unknown as ShellApi;
  return { shell, calls };
}
```

- [x] **Step 5: Run to verify it passes** — `pnpm --filter @hypershell/ui test -- run src/lib/shell.test.ts` → PASS.

### Task 2: Migrate the tunnels feature and prove the seam with the test that would have caught the dead buttons

**Files:**
- Modify: `apps/ui/src/features/tunnels/tunnelStore.ts` (1 call), `TunnelForm.tsx` (1), `TunnelList.tsx` (1)
- Test: `apps/ui/src/features/tunnels/tunnelStore.test.ts` (create)

**Interfaces:** Consumes `getShell`, `setShell`, `createFakeShell` from Task 1.

- [x] **Step 1: Migrate the three modules** per transform rules (rule 1). Example, `tunnelStore.ts`:

```ts
import { getShell } from "../../lib/shell";
// …
const result = await getShell().listPortForwards();
```

- [x] **Step 2: Write the test** (`tunnelStore.test.ts`):

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { createFakeShell } from "../../lib/fakeShell";
import { setShell } from "../../lib/shell";
import { useTunnelStore } from "./tunnelStore";

afterEach(() => {
  setShell(null);
  useTunnelStore.setState({ activeForwards: [], selectedForwardId: null, showPanel: false });
});

describe("tunnelStore.refresh", () => {
  it("reads active forwards through the shell seam", async () => {
    const { shell } = createFakeShell({
      listPortForwards: vi.fn().mockResolvedValue([
        { id: "fwd-1", hostname: "db", localPort: 5432, remoteHost: "127.0.0.1", remotePort: 5432 },
      ]),
    });
    setShell(shell);

    await useTunnelStore.getState().refresh();

    expect(useTunnelStore.getState().activeForwards).toEqual([
      { status: "active", id: "fwd-1", hostname: "db", localPort: 5432, remoteHost: "127.0.0.1", remotePort: 5432 },
    ]);
  });

  it("leaves state untouched when the call resolves undefined (no bridge)", async () => {
    const { shell } = createFakeShell();
    setShell(shell);
    await useTunnelStore.getState().refresh();
    expect(useTunnelStore.getState().activeForwards).toEqual([]);
  });
});
```

- [x] **Step 3: Run** — `pnpm --filter @hypershell/ui test -- run src/features/tunnels` → PASS; `npx tsc --noEmit` in `apps/ui` → clean.

### Task 3: Migrate `App.tsx` (52 calls, all guard patterns)

**Files:** Modify: `apps/ui/src/app/App.tsx`

- [x] Apply rules 1–6. The ~20 `if (!window.hypershell?.method)` guards become `if (!hasShell())` (rule 3), keeping their warn/return bodies; `const tmuxProbe = window.hypershell?.tmuxProbe` (line ~741) follows rule 4; the `.then` chains at ~422/438 follow rule 5; listener registrations (~493, 526, 612, 619) follow rule 6.
- [x] Verify: `npx tsc --noEmit` clean; `pnpm --filter @hypershell/ui test` still green.

### Task 4: Migrate terminal + statusbar + layout

**Files:** Modify: `features/terminal/useTerminalSession.ts` (13), `TerminalPane.tsx` (1), `LoggingButton.tsx` (7), `ClaudeResumePrompt.tsx` (1), `features/statusbar/useSessionStats.ts` (1), `features/layout/Workspace.tsx` (2). *(useTerminalSession.ts and Workspace.tsx carry unrelated uncommitted edits — touch only the hypershell expressions.)*

- [x] Apply rules; `npx tsc --noEmit`; run `pnpm --filter @hypershell/ui test`.

### Task 5: Migrate SFTP feature

**Files:** Modify: `features/sftp/SftpTab.tsx` (17), `components/LocalPane.tsx` (7), `TransferPopup.tsx` (5), `TransferPanel.tsx` (4), `SyncPanel.tsx` (4), `FileList.tsx` (3), `transferEventCoordinator.ts` (2), `resolveTransferConflict.ts` (1), `SftpToolbar.tsx` (1), `RemotePane.tsx` (1), `DriveSelector.tsx` (1). Migrate `LocalPane.staleResponse.test.tsx` from a `window.hypershell` stub to `setShell(createFakeShell({...}))` with the same stubbed methods.

- [x] Apply rules; run `pnpm --filter @hypershell/ui test -- run src/features/sftp`; `npx tsc --noEmit`.

### Task 6: Migrate hosts, sidebar, workspace menu

**Files:** Modify: `features/hosts/HostForm.tsx` (8), `TagManager.tsx` (6), `HostProfileManagerDialog.tsx` (5), `useHostExport.ts` (4), `OpPickerModal.tsx` (3), `HostPortForwardList.tsx` (3), `SshManagerImportDialog.tsx` (2), `HostsView.tsx` (2), `ConnectionHistoryDialog.tsx` (2), `PuttyImportDialog.tsx` (1), `features/sidebar/SidebarHostList.tsx` (4), `features/workspace/WorkspaceMenu.tsx` (5).

- [x] Apply rules; `npx tsc --noEmit`; run ui tests.

### Task 7: Migrate the remainder

**Files:** Modify: `features/editor/EditorApp.tsx` (7) + migrate `EditorApp.test.tsx` to `setShell`, `features/local/localProfilesStore.ts` (6) + `LocalProfileForm.tsx` (2), `features/updates/updateStore.ts` (5), `features/settings/BackupRestorePanel.tsx` (5) + `settingsStore.ts` (2) + migrate `settingsStore.test.ts` to `setShell`, `features/recording/RecordingBrowserDialog.tsx` (5) + `RecordingPlaybackDialog.tsx` (1, non-optional — rule 2), `features/ssh-keys/SshKeyManager.tsx` (4), `features/snippets/snippetStore.ts` (3) + `SnippetsPanel.tsx` (1), `features/serial/SerialProfilesView.tsx` (4, non-optional — rule 2), `lib/droppedFilePaths.ts` (1, sync `getPathForFile` — rule 4: `if (!dataTransfer || !hasShell()) return [];` then `getShell().getPathForFile(file)`).

- [x] Apply rules; verify zero remaining direct references: `grep -rn 'window\.hypershell' apps/ui/src --include='*.ts' --include='*.tsx' | grep -v 'src/lib/shell.ts' | grep -v 'types/global.d.ts'` → only `shell.test.ts` (which tests the bridge path deliberately).
- [x] `npx tsc --noEmit`; full `pnpm --filter @hypershell/ui test`.

### Task 8: Enforce the seam (ESLint), update docs, full verification

**Files:** Modify: `eslint.config.mjs`, `CLAUDE.md` ("New UI feature" step 4 and the state-management blurb).

- [x] Add to the renderer block (`apps/ui/src/**`) in `eslint.config.mjs`:

```js
      // The bridge is reached only through the lib/shell seam; a direct
      // window.hypershell call is a silent no-op the moment the preload drifts.
      "no-restricted-properties": [
        "error",
        {
          object: "window",
          property: "hypershell",
          message: "Use getShell()/hasShell() from lib/shell instead of window.hypershell.",
        },
      ],
```

  and after it a carve-out block:

```js
  // The seam itself and its adapter test are the only places allowed to touch
  // the real bridge global.
  {
    files: ["apps/ui/src/lib/shell.ts", "apps/ui/src/lib/shell.test.ts"],
    rules: { "no-restricted-properties": "off" },
  },
```

- [x] Update `CLAUDE.md`: step 4 of "New UI feature" → "Call backend via `getShell().<method>()` (from `apps/ui/src/lib/shell.ts` — never `window.hypershell` directly; ESLint enforces this)". Add one line under Key Conventions about the seam and `createFakeShell` for renderer unit tests.
- [x] Full verification: `pnpm lint` (proves the restriction fires nowhere), `pnpm --filter @hypershell/ui test`, `pnpm --filter @hypershell/ui build` (or `npx tsc --noEmit` + vite build), `pnpm --filter @hypershell/ui test:e2e` (proves bridgeless boot and `addInitScript` injection both survived).
- [x] Do **not** commit (see Global Constraints); report the change set to the user.

---

## Execution notes (2026-08-21)

- Executed inline on `fix/tunnel-bridge-and-credential-resolver`; **nothing committed** (working tree carries unrelated uncommitted claude-resume work overlapping `useTerminalSession.ts` / `Workspace.tsx`).
- **Unplanned addition — browser E2E stubs:** four Playwright specs (`local-profiles`, `tab-overflow`, `tab-title-colors`, `terminal-rendering`) injected two-method partial bridges and relied on the old per-method guards to skip boot work. Under the seam a present bridge is trusted, so App boot crashed on `undefined.map`. Fix: `apps/ui/tests/support/fakeBridge.ts` — a serializable `installFakeBridge()` init script that models a complete, truthful-but-empty backend (shape-correct empties for the boot surface, proxy fallback for the rest); all four specs now use it.
- `createFakeShell` gained drift simulation (an override explicitly set to `undefined` throws on access, matching the prod adapter); EditorApp's "FIX 2" regression test was repointed at it.
- Final verification: tsc clean · ESLint 0 errors (new `no-restricted-properties` rule active) · 371/371 unit tests · 27/27 browser E2E · `pnpm --filter @hypershell/ui build` OK. Root `pnpm lint` fails only on pre-existing errors in the untracked `packages/session-core/src/shellIntegration/terminalReplies.ts` (other feature's in-progress work).
