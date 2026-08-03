# Active Process Tab Titles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tab running `llmtop` reads `llmtop` instead of the shell's stale OSC title (`pwsh in projects`), for both local shells and SSH sessions.

**Architecture:** Two independent signal sources feed one display path. Local sessions expose their pty pid; a main-process poller walks the Windows process tree once a second and emits the deepest non-shell descendant as a new `process-title` session event. SSH sessions get a one-line shell-integration hook injected at connect, which emits ordinary OSC titles per command and therefore rides the existing `onTitleChange` → `setTabDynamicTitle` pipeline untouched.

**Tech Stack:** TypeScript (strict, ES2022), Electron 39, Zod-validated IPC, Zustand (renderer state), Vitest 3.1, `@vscode/windows-process-tree` (new native dep), better-sqlite3 migrations.

**Spec:** [`docs/superpowers/specs/2026-08-03-active-process-tab-titles-design.md`](../specs/2026-08-03-active-process-tab-titles-design.md)

## Global Constraints

- TypeScript strict mode everywhere; target ES2022. No `any` in new code.
- `session-core` has **zero renderer dependencies** — it runs only in the main process.
- Every IPC payload crossing the preload bridge is validated by a Zod schema in `packages/shared/src/ipc/`. Both request and response.
- Native modules are loaded with the runtime `require()` declared per-file (`declare const require: (id: string) => unknown;`), never a static `import` — esbuild's banner provides `createRequire`. See `packages/session-core/src/transports/ptyProcess.ts:56`.
- Tab label format is **command only** (`llmtop`), never `llmtop — hermes`.
- Title resolution order everywhere: `processTitle ?? dynamicTitle ?? title`.
- Local shell titles are Windows-only; every other platform degrades silently to today's behaviour, never throws.
- The shell-integration bootstrap must be **idempotent** and must **never clobber** an existing `PROMPT_COMMAND` or `DEBUG` trap.
- Do not revert the uncommitted working-tree changes in `terminalTheme.ts`, `terminalUnicode.ts`, `useTerminalSession.ts`, `TabBar.tsx` — build on top of them.
- **Local test runs:** use targeted `pnpm vitest run <path>` from the repo root. A bare `pnpm test` may fail locally on `@hypershell/db` tests because better-sqlite3 is built against Electron's ABI, not Node's — that failure is environmental, not yours.

---

### Task 1: Foreground process selection (pure)

**Files:**
- Create: `packages/session-core/src/processTitle/foregroundProcess.ts`
- Test: `packages/session-core/src/processTitle/foregroundProcess.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `ProcessNode` (`{ pid: number; name: string; children: ProcessNode[] }`), `ProcessTreeProvider` (`(rootPid: number) => Promise<ProcessNode | null>`), `pickForegroundName(root: ProcessNode | null): string | null`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/session-core/src/processTitle/foregroundProcess.test.ts
import { describe, it, expect } from "vitest";
import { pickForegroundName, type ProcessNode } from "./foregroundProcess";

const node = (name: string, children: ProcessNode[] = [], pid = 1): ProcessNode => ({
  pid,
  name,
  children
});

describe("pickForegroundName", () => {
  it("returns null when the shell has no children", () => {
    expect(pickForegroundName(node("pwsh.exe"))).toBeNull();
  });

  it("returns null for a missing tree", () => {
    expect(pickForegroundName(null)).toBeNull();
  });

  it("returns the deepest descendant, without the .exe suffix", () => {
    const tree = node("pwsh.exe", [node("llmtop.exe", [], 2)]);
    expect(pickForegroundName(tree)).toBe("llmtop");
  });

  it("prefers the deepest branch over a shallower sibling", () => {
    const tree = node("pwsh.exe", [
      node("node.exe", [], 2),
      node("git.exe", [node("less.exe", [], 4)], 3)
    ]);
    expect(pickForegroundName(tree)).toBe("less");
  });

  it("breaks depth ties toward the last child", () => {
    const tree = node("pwsh.exe", [node("first.exe", [], 2), node("second.exe", [], 3)]);
    expect(pickForegroundName(tree)).toBe("second");
  });

  it("returns null when the deepest process is itself a shell or wrapper", () => {
    expect(pickForegroundName(node("pwsh.exe", [node("conhost.exe", [], 2)]))).toBeNull();
    expect(pickForegroundName(node("cmd.exe", [node("bash.exe", [], 2)]))).toBeNull();
  });

  it("matches shell names case-insensitively", () => {
    expect(pickForegroundName(node("pwsh.exe", [node("PowerShell.EXE", [], 2)]))).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/session-core/src/processTitle/foregroundProcess.test.ts`
Expected: FAIL — cannot find module `./foregroundProcess`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/session-core/src/processTitle/foregroundProcess.ts

/** One process in a pty's descendant tree. */
export interface ProcessNode {
  pid: number;
  name: string;
  children: ProcessNode[];
}

/** Resolves a pid to its process tree. Returns null when unavailable. */
export type ProcessTreeProvider = (rootPid: number) => Promise<ProcessNode | null>;

/** Names that mean "no foreground program" — the shell itself, or console plumbing. */
const SHELL_AND_WRAPPER_NAMES = new Set([
  "pwsh",
  "powershell",
  "cmd",
  "bash",
  "sh",
  "zsh",
  "wsl",
  "conhost",
  "openconsole",
  "winpty-agent"
]);

function stripExe(name: string): string {
  return name.replace(/\.exe$/i, "");
}

function deepest(node: ProcessNode, depth: number): { node: ProcessNode; depth: number } {
  let best = { node, depth };

  for (const child of node.children) {
    const candidate = deepest(child, depth + 1);
    // >= so that, among equally deep branches, the last (most recently spawned)
    // child wins — that is the one the user just started.
    if (candidate.depth >= best.depth) {
      best = candidate;
    }
  }

  return best;
}

/**
 * The name to show for a pty, or null when the shell is sitting at its prompt.
 */
export function pickForegroundName(root: ProcessNode | null): string | null {
  if (!root) {
    return null;
  }

  const { node, depth } = deepest(root, 0);
  if (depth === 0) {
    return null;
  }

  const name = stripExe(node.name);
  if (SHELL_AND_WRAPPER_NAMES.has(name.toLowerCase())) {
    return null;
  }

  return name.length > 0 ? name : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/session-core/src/processTitle/foregroundProcess.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/session-core/src/processTitle/
git commit -m "feat(session-core): pick the foreground process from a pty tree"
```

---

### Task 2: Expose the pty pid on the transport handle

**Files:**
- Modify: `packages/session-core/src/transports/ptyProcess.ts:25-31` (`PtyProcessLike`), `:180-241` (returned handle)
- Modify: `packages/session-core/src/transports/transportEvents.ts:32-38` (`TransportHandle`)
- Test: `packages/session-core/src/transports/ptyProcess.test.ts` (existing file — append)

**Interfaces:**
- Consumes: nothing.
- Produces: `TransportHandle.pid?: number` and `PtyProcessLike.pid?: number`. Task 5 reads `transport.pid`.

- [ ] **Step 1: Write the failing test**

Append to `packages/session-core/src/transports/ptyProcess.test.ts`. Match the existing fake-spawn helper in that file if one exists; otherwise use this:

```ts
describe("createPtyProcess pid", () => {
  it("exposes the spawned pty's pid on the handle", () => {
    const handle = createPtyProcess(
      { sessionId: "s1", transport: "local", profileId: "p1", cols: 80, rows: 24 },
      { command: "pwsh.exe", args: [], cols: 80, rows: 24 },
      {
        spawnPty: () => ({
          pid: 4242,
          write() {},
          resize() {},
          kill() {},
          onData: () => ({ dispose() {} }),
          onExit: () => ({ dispose() {} })
        })
      }
    );

    expect(handle.pid).toBe(4242);
  });

  it("leaves pid undefined when the spawn throws", () => {
    const handle = createPtyProcess(
      { sessionId: "s1", transport: "local", profileId: "p1", cols: 80, rows: 24 },
      { command: "missing.exe", args: [], cols: 80, rows: 24 },
      {
        spawnPty: () => {
          throw new Error("ENOENT");
        }
      }
    );

    expect(handle.pid).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/session-core/src/transports/ptyProcess.test.ts`
Expected: FAIL — `handle.pid` is `undefined` on the first test (and a type error on `pid` in the fake).

- [ ] **Step 3: Write minimal implementation**

In `transportEvents.ts`, add to `TransportHandle`:

```ts
export interface TransportHandle {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  close(): void;
  onEvent(listener: (event: SessionTransportEvent) => void): () => void;
  setSignals?(signals: { dtr?: boolean; rts?: boolean }): void;
  /** OS pid of the spawned process. Only pty-backed transports have one. */
  pid?: number;
}
```

In `ptyProcess.ts`, add `pid` to `PtyProcessLike`:

```ts
export interface PtyProcessLike {
  readonly pid?: number;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
  onData(listener: (data: string) => void): DisposableLike;
  onExit(listener: (event: PtyExitEvent) => void): DisposableLike;
}
```

and add the field to the returned handle object (alongside `write`, `resize`, `close`, `onEvent`):

```ts
  return {
    pid: pty?.pid,
    write(data: string) {
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/session-core/src/transports/`
Expected: PASS — the two new tests plus every pre-existing pty/local/serial transport test.

- [ ] **Step 5: Commit**

```bash
git add packages/session-core/src/transports/
git commit -m "feat(session-core): expose the pty pid on TransportHandle"
```

---

### Task 3: Windows process tree provider

**Files:**
- Create: `packages/session-core/src/processTitle/windowsProcessTree.ts`
- Test: `packages/session-core/src/processTitle/windowsProcessTree.test.ts`
- Modify: `apps/desktop/package.json` (dependency + `rebuild:native` script)

**Interfaces:**
- Consumes: `ProcessNode`, `ProcessTreeProvider` from Task 1.
- Produces: `createWindowsProcessTreeProvider(deps?: { platform?: NodeJS.Platform; load?: () => WindowsProcessTreeModule }): ProcessTreeProvider`, and the `WindowsProcessTreeModule` / `RawProcessTreeNode` types.

- [ ] **Step 1: Write the failing test**

```ts
// packages/session-core/src/processTitle/windowsProcessTree.test.ts
import { describe, it, expect } from "vitest";
import { createWindowsProcessTreeProvider } from "./windowsProcessTree";

describe("createWindowsProcessTreeProvider", () => {
  it("resolves null off Windows without loading the native module", async () => {
    let loaded = false;
    const provider = createWindowsProcessTreeProvider({
      platform: "linux",
      load: () => {
        loaded = true;
        throw new Error("should not load");
      }
    });

    await expect(provider(123)).resolves.toBeNull();
    expect(loaded).toBe(false);
  });

  it("maps the native tree shape onto ProcessNode", async () => {
    const provider = createWindowsProcessTreeProvider({
      platform: "win32",
      load: () => ({
        getProcessTree(rootPid, callback) {
          expect(rootPid).toBe(4242);
          callback({
            pid: 4242,
            name: "pwsh.exe",
            children: [{ pid: 4300, name: "llmtop.exe" }]
          });
        }
      })
    });

    await expect(provider(4242)).resolves.toEqual({
      pid: 4242,
      name: "pwsh.exe",
      children: [{ pid: 4300, name: "llmtop.exe", children: [] }]
    });
  });

  it("resolves null when the native module yields no tree", async () => {
    const provider = createWindowsProcessTreeProvider({
      platform: "win32",
      load: () => ({
        getProcessTree(_rootPid, callback) {
          callback(undefined);
        }
      })
    });

    await expect(provider(1)).resolves.toBeNull();
  });

  it("resolves null when the native module fails to load", async () => {
    const provider = createWindowsProcessTreeProvider({
      platform: "win32",
      load: () => {
        throw new Error("MODULE_NOT_FOUND");
      }
    });

    await expect(provider(1)).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/session-core/src/processTitle/windowsProcessTree.test.ts`
Expected: FAIL — cannot find module `./windowsProcessTree`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/session-core/src/processTitle/windowsProcessTree.ts
import type { ProcessNode, ProcessTreeProvider } from "./foregroundProcess";

// Loaded via require() at runtime (provided by esbuild banner's createRequire),
// exactly like node-pty — a static import would break the bundle on platforms
// where the module is absent.
declare const require: (id: string) => unknown;

export interface RawProcessTreeNode {
  pid: number;
  name: string;
  children?: RawProcessTreeNode[];
}

export interface WindowsProcessTreeModule {
  getProcessTree(
    rootPid: number,
    callback: (tree: RawProcessTreeNode | undefined) => void
  ): void;
}

export interface WindowsProcessTreeDeps {
  platform?: NodeJS.Platform;
  load?: () => WindowsProcessTreeModule;
}

function toProcessNode(raw: RawProcessTreeNode): ProcessNode {
  return {
    pid: raw.pid,
    name: raw.name,
    children: (raw.children ?? []).map(toProcessNode)
  };
}

function loadModule(): WindowsProcessTreeModule {
  return require("@vscode/windows-process-tree") as WindowsProcessTreeModule;
}

/**
 * Process trees come from a native module that only exists on Windows. Every
 * failure path resolves to null so a missing or unbuilt binding degrades the
 * tab title rather than breaking the session.
 */
export function createWindowsProcessTreeProvider(
  deps: WindowsProcessTreeDeps = {}
): ProcessTreeProvider {
  const platform = deps.platform ?? process.platform;
  const load = deps.load ?? loadModule;
  let cached: WindowsProcessTreeModule | null = null;
  let loadFailed = false;

  return (rootPid: number) =>
    new Promise<ProcessNode | null>((resolve) => {
      if (platform !== "win32" || loadFailed) {
        resolve(null);
        return;
      }

      if (!cached) {
        try {
          cached = load();
        } catch {
          loadFailed = true;
          resolve(null);
          return;
        }
      }

      try {
        cached.getProcessTree(rootPid, (tree) => {
          resolve(tree ? toProcessNode(tree) : null);
        });
      } catch {
        resolve(null);
      }
    });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/session-core/src/processTitle/windowsProcessTree.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Add the native dependency**

In `apps/desktop/package.json`, add to `dependencies` (keep the list alphabetical):

```json
    "@vscode/windows-process-tree": "^0.6.0",
```

Then extend the existing `rebuild:native` script so the new binding is rebuilt against Electron's ABI alongside better-sqlite3. Open `apps/desktop/package.json`, find `"rebuild:native"`, and append the package name to the module list it already rebuilds.

Install and rebuild:

```bash
pnpm install
pnpm --filter @hypershell/desktop rebuild:native
```

- [ ] **Step 6: Verify the module actually loads under Electron**

Run: `node -e "console.log(typeof require('@vscode/windows-process-tree').getProcessTree)"`
Expected: `function`. If this prints an ABI error, re-run `pnpm --filter @hypershell/desktop rebuild:native` — do not proceed with a broken binding.

- [ ] **Step 7: Commit**

```bash
git add packages/session-core/src/processTitle/ apps/desktop/package.json pnpm-lock.yaml
git commit -m "feat(session-core): Windows process tree provider"
```

---

### Task 4: The poller

**Files:**
- Create: `packages/session-core/src/processTitle/processTitlePoller.ts`
- Test: `packages/session-core/src/processTitle/processTitlePoller.test.ts`

**Interfaces:**
- Consumes: `ProcessTreeProvider`, `pickForegroundName` from Task 1.
- Produces: `createProcessTitlePoller(deps: ProcessTitlePollerDeps): ProcessTitlePoller` with methods `register(sessionId: string, pid: number): void`, `unregister(sessionId: string): void`, `onChange(listener: (sessionId: string, name: string | null) => void): () => void`, `stop(): void`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/session-core/src/processTitle/processTitlePoller.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createProcessTitlePoller } from "./processTitlePoller";
import type { ProcessNode } from "./foregroundProcess";

const tree = (child?: string): ProcessNode => ({
  pid: 1,
  name: "pwsh.exe",
  children: child ? [{ pid: 2, name: child, children: [] }] : []
});

describe("createProcessTitlePoller", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("emits the foreground name on the first tick", async () => {
    const poller = createProcessTitlePoller({
      provider: async () => tree("llmtop.exe"),
      intervalMs: 1000
    });
    const seen: Array<[string, string | null]> = [];
    poller.onChange((sessionId, name) => seen.push([sessionId, name]));

    poller.register("s1", 1);
    await vi.advanceTimersByTimeAsync(1000);

    expect(seen).toEqual([["s1", "llmtop"]]);
    poller.stop();
  });

  it("emits only when the name changes", async () => {
    let current = "llmtop.exe";
    const poller = createProcessTitlePoller({
      provider: async () => tree(current),
      intervalMs: 1000
    });
    const seen: Array<string | null> = [];
    poller.onChange((_sessionId, name) => seen.push(name));

    poller.register("s1", 1);
    await vi.advanceTimersByTimeAsync(3000);
    current = "htop.exe";
    await vi.advanceTimersByTimeAsync(1000);

    expect(seen).toEqual(["llmtop", "htop"]);
    poller.stop();
  });

  it("emits null when the program exits back to the prompt", async () => {
    let child: string | undefined = "llmtop.exe";
    const poller = createProcessTitlePoller({
      provider: async () => tree(child),
      intervalMs: 1000
    });
    const seen: Array<string | null> = [];
    poller.onChange((_sessionId, name) => seen.push(name));

    poller.register("s1", 1);
    await vi.advanceTimersByTimeAsync(1000);
    child = undefined;
    await vi.advanceTimersByTimeAsync(1000);

    expect(seen).toEqual(["llmtop", null]);
    poller.stop();
  });

  it("stops polling once the last session unregisters", async () => {
    const provider = vi.fn(async () => tree("llmtop.exe"));
    const poller = createProcessTitlePoller({ provider, intervalMs: 1000 });

    poller.register("s1", 1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(provider).toHaveBeenCalledTimes(1);

    poller.unregister("s1");
    await vi.advanceTimersByTimeAsync(5000);
    expect(provider).toHaveBeenCalledTimes(1);
    poller.stop();
  });

  it("survives a provider rejection and keeps polling", async () => {
    let fail = true;
    const poller = createProcessTitlePoller({
      provider: async () => {
        if (fail) throw new Error("boom");
        return tree("llmtop.exe");
      },
      intervalMs: 1000
    });
    const seen: Array<string | null> = [];
    poller.onChange((_sessionId, name) => seen.push(name));

    poller.register("s1", 1);
    await vi.advanceTimersByTimeAsync(1000);
    fail = false;
    await vi.advanceTimersByTimeAsync(1000);

    expect(seen).toEqual(["llmtop"]);
    poller.stop();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/session-core/src/processTitle/processTitlePoller.test.ts`
Expected: FAIL — cannot find module `./processTitlePoller`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/session-core/src/processTitle/processTitlePoller.ts
import { pickForegroundName, type ProcessTreeProvider } from "./foregroundProcess";

export interface ProcessTitlePollerDeps {
  provider: ProcessTreeProvider;
  intervalMs?: number;
}

export interface ProcessTitlePoller {
  register(sessionId: string, pid: number): void;
  unregister(sessionId: string): void;
  onChange(listener: (sessionId: string, name: string | null) => void): () => void;
  stop(): void;
}

interface TrackedSession {
  pid: number;
  lastName: string | null;
}

const DEFAULT_INTERVAL_MS = 1000;

/**
 * Walks each registered pty's process tree on an interval and reports the
 * foreground program. The timer only runs while at least one session is
 * registered, so an all-SSH workspace costs nothing.
 */
export function createProcessTitlePoller(deps: ProcessTitlePollerDeps): ProcessTitlePoller {
  const intervalMs = deps.intervalMs ?? DEFAULT_INTERVAL_MS;
  const tracked = new Map<string, TrackedSession>();
  const listeners = new Set<(sessionId: string, name: string | null) => void>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let ticking = false;

  async function tick(): Promise<void> {
    // Guard against a slow provider overlapping the next interval.
    if (ticking) {
      return;
    }

    ticking = true;

    try {
      for (const [sessionId, session] of Array.from(tracked)) {
        let name: string | null = null;

        try {
          name = pickForegroundName(await deps.provider(session.pid));
        } catch {
          // A failed walk is not evidence the program exited — keep the last
          // name and try again next tick.
          continue;
        }

        // The session may have been unregistered while we awaited.
        const current = tracked.get(sessionId);
        if (!current || current.lastName === name) {
          continue;
        }

        current.lastName = name;
        for (const listener of listeners) {
          listener(sessionId, name);
        }
      }
    } finally {
      ticking = false;
    }
  }

  function startTimer(): void {
    if (timer !== null) {
      return;
    }

    timer = setInterval(() => {
      void tick();
    }, intervalMs);
  }

  function stopTimer(): void {
    if (timer === null) {
      return;
    }

    clearInterval(timer);
    timer = null;
  }

  return {
    register(sessionId, pid) {
      tracked.set(sessionId, { pid, lastName: null });
      startTimer();
    },

    unregister(sessionId) {
      tracked.delete(sessionId);
      if (tracked.size === 0) {
        stopTimer();
      }
    },

    onChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    stop() {
      tracked.clear();
      listeners.clear();
      stopTimer();
    }
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/session-core/src/processTitle/processTitlePoller.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/session-core/src/processTitle/
git commit -m "feat(session-core): poll pty process trees for the foreground program"
```

---

### Task 5: The `process-title` event, end to end through main

**Files:**
- Modify: `packages/session-core/src/transports/transportEvents.ts:11-30` (event union)
- Modify: `packages/shared/src/ipc/schemas.ts:107-128` (`sessionEventSchema`)
- Modify: `packages/session-core/src/sessionManager.ts` (deps, `open`, `close`, `destroyAll`, exit handling)
- Modify: `packages/session-core/src/index.ts` (exports)
- Modify: `apps/desktop/src/main/ipc/registerIpc.ts:236` (construct the poller)
- Test: `packages/session-core/src/sessionManager.test.ts` (existing file — append)

**Interfaces:**
- Consumes: `ProcessTitlePoller` (Task 4), `TransportHandle.pid` (Task 2), `createWindowsProcessTreeProvider` (Task 3).
- Produces: session event variant `{ type: "process-title"; sessionId: string; name: string | null }`; `SessionManagerDeps.processTitlePoller?: ProcessTitlePoller`.

- [ ] **Step 1: Write the failing test**

Append to `packages/session-core/src/sessionManager.test.ts`:

```ts
describe("process titles", () => {
  function fakePoller() {
    const registered = new Map<string, number>();
    let emit: ((sessionId: string, name: string | null) => void) | null = null;

    return {
      registered,
      fire(sessionId: string, name: string | null) {
        emit?.(sessionId, name);
      },
      poller: {
        register(sessionId: string, pid: number) {
          registered.set(sessionId, pid);
        },
        unregister(sessionId: string) {
          registered.delete(sessionId);
        },
        onChange(listener: (sessionId: string, name: string | null) => void) {
          emit = listener;
          return () => {
            emit = null;
          };
        },
        stop() {}
      }
    };
  }

  function transportWithPid(pid: number | undefined) {
    const listeners = new Set<(event: SessionTransportEvent) => void>();
    return {
      pid,
      write() {},
      resize() {},
      close() {},
      onEvent(listener: (event: SessionTransportEvent) => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }
    };
  }

  it("registers local sessions that report a pid", () => {
    const fake = fakePoller();
    const manager = createSessionManager({
      processTitlePoller: fake.poller,
      createTransport: () => transportWithPid(4242)
    });

    const { sessionId } = manager.open({ transport: "local", profileId: "p1", cols: 80, rows: 24 });

    expect(fake.registered.get(sessionId)).toBe(4242);
  });

  it("does not register non-local transports", () => {
    const fake = fakePoller();
    const manager = createSessionManager({
      processTitlePoller: fake.poller,
      createTransport: () => transportWithPid(4242)
    });

    manager.open({ transport: "ssh", profileId: "host", cols: 80, rows: 24 });

    expect(fake.registered.size).toBe(0);
  });

  it("forwards poller changes as process-title events", () => {
    const fake = fakePoller();
    const manager = createSessionManager({
      processTitlePoller: fake.poller,
      createTransport: () => transportWithPid(4242)
    });
    const events: SessionTransportEvent[] = [];
    manager.onEvent((event) => events.push(event));

    const { sessionId } = manager.open({ transport: "local", profileId: "p1", cols: 80, rows: 24 });
    fake.fire(sessionId, "llmtop");

    expect(events).toContainEqual({ type: "process-title", sessionId, name: "llmtop" });
  });

  it("drops events for sessions that already closed", () => {
    const fake = fakePoller();
    const manager = createSessionManager({
      processTitlePoller: fake.poller,
      createTransport: () => transportWithPid(4242)
    });
    const events: SessionTransportEvent[] = [];

    const { sessionId } = manager.open({ transport: "local", profileId: "p1", cols: 80, rows: 24 });
    manager.close(sessionId);
    manager.onEvent((event) => events.push(event));
    fake.fire(sessionId, "llmtop");

    expect(events).toHaveLength(0);
    expect(fake.registered.has(sessionId)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/session-core/src/sessionManager.test.ts`
Expected: FAIL — `processTitlePoller` is not a known dependency; no `process-title` events emitted.

- [ ] **Step 3: Write minimal implementation**

In `transportEvents.ts`, add a variant to `SessionTransportEvent`:

```ts
  | {
      type: "process-title";
      sessionId: string;
      name: string | null;
    }
```

In `packages/shared/src/ipc/schemas.ts`, add the matching member to `sessionEventSchema`'s union:

```ts
  z.object({
    type: z.literal("process-title"),
    sessionId: z.string().min(1),
    name: z.string().min(1).nullable()
  }),
```

In `sessionManager.ts`:

```ts
import type { ProcessTitlePoller } from "./processTitle/processTitlePoller";
```

Add to `SessionManagerDeps`:

```ts
  processTitlePoller?: ProcessTitlePoller;
```

Inside `createSessionManager`, after `const networkMonitor = deps.networkMonitor;`:

```ts
  const processTitlePoller = deps.processTitlePoller;

  processTitlePoller?.onChange((sessionId, name) => {
    // A poll can land after the session went away; don't resurrect a dead tab.
    if (!sessions.has(sessionId)) {
      return;
    }

    for (const listener of listeners) {
      listener({ type: "process-title", sessionId, name });
    }
  });
```

In `open()`, after `sessions.set(...)` and before the `return`:

```ts
      if (input.transport === "local" && transport.pid !== undefined) {
        processTitlePoller?.register(sessionId, transport.pid);
      }
```

Unregister in all three teardown paths:
- in `handleEvent`, inside the `event.type === "exit"` branch, in the `else` arm right before `sessions.delete(sessionId);`
- in `close()`, right before `sessions.delete(sessionId);`
- in `destroyAll()`, right before `sessions.delete(sessionId);`

each as:

```ts
      processTitlePoller?.unregister(sessionId);
```

Export the new modules from `packages/session-core/src/index.ts`:

```ts
export * from "./processTitle/foregroundProcess";
export * from "./processTitle/processTitlePoller";
export * from "./processTitle/windowsProcessTree";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/session-core/ packages/shared/`
Expected: PASS — the 4 new tests plus every existing session-core and shared test.

- [ ] **Step 5: Wire the real poller in the main process**

In `apps/desktop/src/main/ipc/registerIpc.ts`, replace line 236:

```ts
export const sessionManager = createSessionManager({
  networkMonitor,
  processTitlePoller: createProcessTitlePoller({
    provider: createWindowsProcessTreeProvider()
  })
});
```

adding to the existing `@hypershell/session-core` import in that file:

```ts
  createProcessTitlePoller,
  createWindowsProcessTreeProvider,
```

- [ ] **Step 6: Verify the build**

Run: `pnpm build`
Expected: all workspaces compile.

- [ ] **Step 7: Commit**

```bash
git add packages/session-core/ packages/shared/ apps/desktop/src/main/ipc/registerIpc.ts
git commit -m "feat: emit process-title session events for local shells"
```

---

### Task 6: Renderer state — `processTitle` on the tab

**Files:**
- Modify: `apps/ui/src/features/layout/layoutStore.ts:3-16` (`LayoutTab`), `:38` (state type), `:171-190` (near `setTabDynamicTitle`)
- Modify: `apps/ui/src/features/terminal/terminalSessionModel.ts:12-19`, `:78-114`
- Modify: `apps/ui/src/features/terminal/useTerminalSession.ts` (event handling, near line 239)
- Test: `apps/ui/src/features/layout/layoutStore.test.ts`, `apps/ui/src/features/terminal/terminalSessionModel.test.ts` (existing files — append)

**Interfaces:**
- Consumes: the `process-title` event from Task 5.
- Produces: `LayoutTab.processTitle?: string`, `layoutStore.setTabProcessTitle(sessionId, name | null)`, `resolveTabTitle(tab): string`, `SessionEventEffect.processTitle?: string | null`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/ui/src/features/layout/layoutStore.test.ts`:

```ts
describe("process titles", () => {
  it("sets the process title without touching base or dynamic titles", () => {
    const store = createLayoutStore();
    store.getState().openTab({ sessionId: "s1", title: "PowerShell" });
    store.getState().setTabDynamicTitle("s1", "pwsh in hypershell");
    store.getState().setTabProcessTitle("s1", "llmtop");

    const tab = store.getState().tabs.find((t) => t.sessionId === "s1");
    expect(tab?.processTitle).toBe("llmtop");
    expect(tab?.dynamicTitle).toBe("pwsh in hypershell");
    expect(tab?.title).toBe("PowerShell");
  });

  it("clears the process title with null", () => {
    const store = createLayoutStore();
    store.getState().openTab({ sessionId: "s1", title: "PowerShell" });
    store.getState().setTabProcessTitle("s1", "llmtop");
    store.getState().setTabProcessTitle("s1", null);

    expect(store.getState().tabs.find((t) => t.sessionId === "s1")?.processTitle).toBeUndefined();
  });

  it("resolves process over dynamic over base", () => {
    expect(resolveTabTitle({ sessionId: "s1", title: "base" })).toBe("base");
    expect(resolveTabTitle({ sessionId: "s1", title: "base", dynamicTitle: "osc" })).toBe("osc");
    expect(
      resolveTabTitle({ sessionId: "s1", title: "base", dynamicTitle: "osc", processTitle: "llmtop" })
    ).toBe("llmtop");
  });
});
```

Add `resolveTabTitle` to that file's import from `./layoutStore`.

Append to `apps/ui/src/features/terminal/terminalSessionModel.test.ts`:

```ts
describe("mapSessionEvent process-title", () => {
  it("passes the process name through for the current session", () => {
    expect(mapSessionEvent("s1", { type: "process-title", sessionId: "s1", name: "llmtop" })).toEqual({
      handled: true,
      processTitle: "llmtop"
    });
  });

  it("passes null through so the renderer can clear it", () => {
    expect(mapSessionEvent("s1", { type: "process-title", sessionId: "s1", name: null })).toEqual({
      handled: true,
      processTitle: null
    });
  });

  it("ignores events for another session", () => {
    expect(mapSessionEvent("s1", { type: "process-title", sessionId: "s2", name: "llmtop" })).toEqual({
      handled: false
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run apps/ui/src/features/layout/layoutStore.test.ts apps/ui/src/features/terminal/terminalSessionModel.test.ts`
Expected: FAIL — `setTabProcessTitle` and `resolveTabTitle` are not exported; `process-title` falls through to the error branch of `mapSessionEvent`.

- [ ] **Step 3: Write minimal implementation**

In `layoutStore.ts`, add to `LayoutTab` (after `dynamicTitle`):

```ts
  /** Foreground program reported by the main-process poller. Local tabs only. */
  processTitle?: string;
```

Add to `LayoutState`:

```ts
  setTabProcessTitle: (sessionId: string, name: string | null) => void;
```

Add the action, modelled exactly on `setTabDynamicTitle` (`layoutStore.ts:171`):

```ts
    setTabProcessTitle: (sessionId, name) =>
      set((state) => {
        const index = state.tabs.findIndex((tab) => tab.sessionId === sessionId);
        if (index === -1) {
          return state;
        }

        const current = state.tabs[index];
        if ((current.processTitle ?? null) === name) {
          return state;
        }

        const tabs = [...state.tabs];
        if (name === null) {
          const { processTitle: _cleared, ...rest } = current;
          tabs[index] = rest;
        } else {
          tabs[index] = { ...current, processTitle: name };
        }

        return { tabs };
      }),
```

Add the shared resolver at module scope in `layoutStore.ts`:

```ts
/** Single source of truth for what a tab is called. */
export function resolveTabTitle(tab: LayoutTab): string {
  return tab.processTitle ?? tab.dynamicTitle ?? tab.title;
}
```

In `terminalSessionModel.ts`, add to `SessionEventEffect`:

```ts
  processTitle?: string | null;
```

and add a branch to `mapSessionEvent`, **before** the final fallthrough `return`:

```ts
  if (event.type === "process-title") {
    return {
      handled: true,
      processTitle: event.name
    };
  }
```

In `useTerminalSession.ts`, in the effect handler that already reacts to `mapSessionEvent` output (the block containing `if (effect.state)` around line 235), add:

```ts
    if (effect.processTitle !== undefined && sessionIdRef.current) {
      layoutStore
        .getState()
        .setTabProcessTitle(
          sessionIdRef.current,
          effect.processTitle === null ? null : sanitizeTitle(effect.processTitle)
        );
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run apps/ui/src/features/layout/ apps/ui/src/features/terminal/`
Expected: PASS — new tests plus all existing layout and terminal tests.

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/features/layout/ apps/ui/src/features/terminal/
git commit -m "feat(ui): track the active process name per tab"
```

---

### Task 7: Display and the settings toggle

**Files:**
- Modify: `apps/ui/src/features/layout/TabBar.tsx:58-64` (tooltip), `:126` (label)
- Modify: `apps/ui/src/features/settings/settingsStore.ts:20-26` (`GeneralSettings`), `:119-125` (defaults)
- Modify: `apps/ui/src/features/settings/SettingsPanel.tsx:290-296` (checkbox, mirroring `showLocalInSidebar`)
- Modify: any status-bar component resolving a tab title (find with `rg "dynamicTitle \?\? " apps/ui/src`)
- Test: `apps/ui/src/features/layout/TabBar.test.tsx` if it exists; otherwise `apps/ui/tests/local-profiles.spec.ts` conventions apply for E2E

**Interfaces:**
- Consumes: `resolveTabTitle`, `LayoutTab.processTitle` (Task 6).
- Produces: `GeneralSettings.showActiveProcess: boolean` (default `true`).

- [ ] **Step 1: Write the failing test**

Create `apps/ui/src/features/layout/tabTitle.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveTabTitle } from "./layoutStore";

describe("resolveTabTitle with the setting off", () => {
  it("falls back to the shell title when the process title is suppressed", () => {
    const tab = {
      sessionId: "s1",
      title: "PowerShell",
      dynamicTitle: "pwsh in projects",
      processTitle: "llmtop"
    };

    expect(resolveTabTitle(tab)).toBe("llmtop");
    expect(resolveTabTitle({ ...tab, processTitle: undefined })).toBe("pwsh in projects");
  });
});
```

- [ ] **Step 2: Run test to verify it passes as written**

Run: `pnpm vitest run apps/ui/src/features/layout/tabTitle.test.ts`
Expected: PASS — this test pins the resolver contract the UI depends on. The UI work below is verified manually in Step 6.

- [ ] **Step 3: Add the setting**

In `settingsStore.ts`, add to `GeneralSettings`:

```ts
  showActiveProcess: boolean;
```

and to `DEFAULT_GENERAL_SETTINGS`:

```ts
  showActiveProcess: true,
```

- [ ] **Step 4: Use the resolver in the UI**

In `TabBar.tsx`, replace the two inline `tab.dynamicTitle ?? tab.title` expressions (lines 58 and 126) with a locally computed value that honours the setting:

```tsx
  // Same subscription shape TerminalPane.tsx:35 uses for showRecordingButton.
  const showActiveProcess = useStore(settingsStore, (s) => s.settings.general.showActiveProcess);
  const label = resolveTabTitle(showActiveProcess ? tab : { ...tab, processTitle: undefined });
```

Add the imports if `TabBar.tsx` lacks them: `import { useStore } from "zustand";` and
`import { settingsStore } from "../settings/settingsStore";`.

Use `label` for the tab text (line 126) and the tooltip heading (line 58). Extend the tooltip's secondary block (line 61) so all three names are visible when they differ:

```tsx
  {tab.processTitle && showActiveProcess && (
    <div className="flex items-center gap-1">
      <span className="text-text-muted">running</span>
      <span>{tab.processTitle}</span>
    </div>
  )}
  {tab.dynamicTitle && tab.dynamicTitle !== tab.title && (
    <div className="flex items-center gap-1">
      <span className="text-text-muted">shell</span>
      <span>{tab.dynamicTitle}</span>
    </div>
  )}
```

Match the existing tooltip markup's class names rather than copying these verbatim if they differ.

- [ ] **Step 5: Add the settings checkbox**

In `SettingsPanel.tsx`, next to the `showLocalInSidebar` checkbox (line ~293), following the same component and prop shape used there:

```tsx
        <Checkbox
          label="Show the running program in tab titles"
          checked={showActiveProcess}
          onChange={() => void updateGeneral({ showActiveProcess: !showActiveProcess })}
        />
```

and destructure `showActiveProcess` alongside `showLocalInSidebar` at line ~243.

- [ ] **Step 6: Verify in the running app**

```bash
pnpm --filter @hypershell/desktop build
```

Start the app, open a local pwsh tab, and run a long-lived program (`llmtop`, or `ping -t 127.0.0.1`). Expected: the tab label changes to the program name within ~1s and reverts to the shell title when it exits. Toggle the new setting off — the label falls back to the shell title immediately.

- [ ] **Step 7: Commit**

```bash
git add apps/ui/src/features/layout/ apps/ui/src/features/settings/
git commit -m "feat(ui): show the running program in tab titles"
```

---

### Task 8: Shell-integration bootstrap builder

**Files:**
- Create: `packages/session-core/src/shellIntegration/bootstrap.ts`
- Test: `packages/session-core/src/shellIntegration/bootstrap.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `buildShellIntegrationBootstrap(): string` — a single line, leading space, `\r` terminated.

- [ ] **Step 1: Write the failing test**

```ts
// packages/session-core/src/shellIntegration/bootstrap.test.ts
import { describe, it, expect } from "vitest";
import { buildShellIntegrationBootstrap } from "./bootstrap";

describe("buildShellIntegrationBootstrap", () => {
  const line = buildShellIntegrationBootstrap();

  it("is a single line terminated by carriage return", () => {
    expect(line.endsWith("\r")).toBe(true);
    expect(line.slice(0, -1)).not.toContain("\n");
    expect(line.slice(0, -1)).not.toContain("\r");
  });

  it("starts with a space so HISTCONTROL=ignorespace keeps it out of history", () => {
    expect(line.startsWith(" ")).toBe(true);
  });

  it("is guarded so a second injection is a no-op", () => {
    expect(line).toContain("__HS_SI");
  });

  it("handles both bash and zsh", () => {
    expect(line).toContain("ZSH_VERSION");
    expect(line).toContain("BASH_VERSION");
    expect(line).toContain("add-zsh-hook");
  });

  it("refuses to install over an existing DEBUG trap", () => {
    expect(line).toContain("trap -p DEBUG");
  });

  it("appends to PROMPT_COMMAND instead of replacing it", () => {
    expect(line).toContain("${PROMPT_COMMAND:+");
  });

  it("emits an OSC 0 title sequence", () => {
    expect(line).toContain("\\033]0;");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/session-core/src/shellIntegration/bootstrap.test.ts`
Expected: FAIL — cannot find module `./bootstrap`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/session-core/src/shellIntegration/bootstrap.ts

/**
 * One line of shell that teaches a remote bash or zsh to report the command it
 * is about to run as an OSC 0 title, and to restore `user@host: cwd` when the
 * prompt comes back. HyperShell writes this into an SSH session right after it
 * connects, which is why every constraint below matters:
 *
 * - It must be ONE line. The pty sees it as typed input; a newline would run
 *   half a statement.
 * - It starts with a space so a remote with HISTCONTROL=ignorespace|ignoreboth
 *   (the Debian/Ubuntu default) keeps it out of shell history.
 * - It is guarded by __HS_SI so reconnects and manual re-runs are no-ops.
 * - It appends to PROMPT_COMMAND and refuses to install at all if the user
 *   already has a DEBUG trap — clobbering someone's prompt is worse than
 *   showing a stale tab title.
 * - Unknown shells (fish, csh, restricted) match neither branch and get nothing.
 */
const BOOTSTRAP = [
  'if [ -z "${__HS_SI:-}" ]; then',
  '__HS_SI=1;',
  'if [ -n "${ZSH_VERSION:-}" ]; then',
  'autoload -Uz add-zsh-hook;',
  `__hs_pre() { printf '\\033]0;%s\\007' "\${1%% *}"; };`,
  `__hs_post() { printf '\\033]0;%s@%s: %s\\007' "\${USER}" "\${HOST%%.*}" "\${PWD/#$HOME/~}"; };`,
  'add-zsh-hook preexec __hs_pre;',
  'add-zsh-hook precmd __hs_post;',
  'elif [ -n "${BASH_VERSION:-}" ] && [ -z "$(trap -p DEBUG)" ]; then',
  `__hs_pre() { case "$BASH_COMMAND" in __hs_post*) return;; esac; printf '\\033]0;%s\\007' "\${BASH_COMMAND%% *}"; };`,
  `__hs_post() { printf '\\033]0;%s@%s: %s\\007' "\${USER}" "\${HOSTNAME%%.*}" "\${PWD/#$HOME/~}"; };`,
  "trap '__hs_pre' DEBUG;",
  'PROMPT_COMMAND="__hs_post${PROMPT_COMMAND:+;$PROMPT_COMMAND}";',
  'fi;',
  'fi'
].join(" ");

export function buildShellIntegrationBootstrap(): string {
  return ` ${BOOTSTRAP}\r`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/session-core/src/shellIntegration/bootstrap.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Verify the line actually works in a real shell**

Paste the generated line into a bash and a zsh shell by hand (print it with
`node -e "console.log(require('./packages/session-core/dist/shellIntegration/bootstrap').buildShellIntegrationBootstrap())"`
after a build, or copy it from the source). Run `sleep 5` and watch the terminal title become `sleep`, then revert at the prompt. Then run the line a second time and confirm nothing breaks and `PROMPT_COMMAND` still contains any pre-existing value.

Expected: title tracks commands in both shells; second injection is inert.

- [ ] **Step 6: Commit**

```bash
git add packages/session-core/src/shellIntegration/
git commit -m "feat(session-core): shell-integration bootstrap for remote titles"
```

---

### Task 9: Per-host opt-out

**Files:**
- Create: `packages/db/src/migrations/017_shell_integration.sql`
- Modify: `packages/db/src/repositories/hostsRepository.ts:31` (record type), `:57` (input type), `:110` (row mapping), `:138` (insert column list), `:216` and `:278` (value mapping)
- Modify: `packages/shared/src/ipc/schemas.ts:173` and `:202` (host schemas)
- Modify: `packages/session-core/src/transports/transportEvents.ts` (`SshConnectionOptions`)
- Modify: `apps/desktop/src/main/ipc/registerIpc.ts:595-606` (populate from the host record)
- Modify: the host editor form component (find with `rg "tmuxDetect" apps/ui/src`)
- Test: `packages/db/src/repositories/hostsRepository.test.ts` (existing file — append)

**Interfaces:**
- Consumes: nothing.
- Produces: `HostRecord.shellIntegration: boolean` (default `true`), `SshConnectionOptions.shellIntegration?: boolean`.

- [ ] **Step 1: Write the failing test**

Append to `packages/db/src/repositories/hostsRepository.test.ts`, following the existing test setup in that file:

```ts
it("defaults shell integration to enabled", () => {
  const repo = createTestHostsRepository();
  const host = repo.create({ name: "hermes", hostname: "hermes", username: "tomer" });

  expect(repo.get(host.id)?.shellIntegration).toBe(true);
});

it("persists a shell integration opt-out", () => {
  const repo = createTestHostsRepository();
  const host = repo.create({ name: "hermes", hostname: "hermes", username: "tomer" });

  repo.update(host.id, { shellIntegration: false });

  expect(repo.get(host.id)?.shellIntegration).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/db/src/repositories/hostsRepository.test.ts`
Expected: FAIL — `shellIntegration` is undefined. If instead this errors with `NODE_MODULE_VERSION`, run `pnpm rebuild better-sqlite3` first; that is the ABI mismatch noted in Global Constraints.

- [ ] **Step 3: Write the migration**

```sql
-- packages/db/src/migrations/017_shell_integration.sql
-- Migration 017: opt out of SSH shell integration per host.
-- Defaults to 1: the feature is on unless a host is known to dislike injection.
-- Guard: SQLite raises "duplicate column" if it already exists; callers catch that.
ALTER TABLE hosts ADD COLUMN shell_integration INTEGER NOT NULL DEFAULT 1;
```

- [ ] **Step 4: Thread the column through the repository**

Mirror every place `tmuxDetect` appears in `hostsRepository.ts`:

```ts
// record type (near line 31)
  shellIntegration: boolean;

// input type (near line 57)
  shellIntegration?: boolean;

// row mapping (near line 110)
    shellIntegration: Boolean(row.shell_integration),

// insert column list (near line 138) — add to both the column names and @params
      @tmuxDetect, @shellIntegration

// create/update value mapping (near lines 216 and 278)
        shellIntegration: input.shellIntegration === false ? 0 : 1,
```

Note the default differs from `tmuxDetect`: absent means **enabled**, so map `=== false ? 0 : 1` rather than `? 1 : 0`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run packages/db/`
Expected: PASS — the 2 new tests plus every existing repository test.

- [ ] **Step 6: Extend the IPC schemas and transport options**

In `packages/shared/src/ipc/schemas.ts`, add to both host schemas (alongside `tmuxDetect` at lines 173 and 202):

```ts
  shellIntegration: z.boolean().optional(),
```

In `packages/session-core/src/transports/transportEvents.ts`, add to `SshConnectionOptions`:

```ts
  /** False disables the shell-integration bootstrap for this host. */
  shellIntegration?: boolean;
```

In `apps/desktop/src/main/ipc/registerIpc.ts`, in the block that builds `sshOptions` from the resolved host (line ~595), add after the `identityFile` line:

```ts
          shellIntegration: host.shellIntegration ?? true,
```

- [ ] **Step 7: Add the host editor checkbox**

In the host editor form (the component that renders the `tmuxDetect` checkbox), add an adjacent checkbox bound to `shellIntegration`, labelled **"Report the running command in the tab title"** with helper text **"Sends a one-line hook to bash/zsh when the session opens."** Match the surrounding form component and state-handling conventions exactly.

- [ ] **Step 8: Verify the build**

Run: `pnpm build`
Expected: all workspaces compile.

- [ ] **Step 9: Commit**

```bash
git add packages/db/ packages/shared/ packages/session-core/ apps/desktop/ apps/ui/
git commit -m "feat: per-host opt-out for SSH shell integration"
```

---

### Task 10: Inject the bootstrap on connect

**Files:**
- Modify: `packages/shared/src/ipc/schemas.ts` (`openSessionRequestSchema`)
- Modify: `packages/session-core/src/sessionManager.ts` (`OpenSessionInput`, `handleEvent` status branch)
- Modify: `apps/ui/src/features/terminal/useTerminalSession.ts:511` (openSession payload)
- Test: `packages/session-core/src/sessionManager.test.ts` (existing file — append)

**Interfaces:**
- Consumes: `buildShellIntegrationBootstrap()` (Task 8), `SshConnectionOptions.shellIntegration` (Task 9).
- Produces: `OpenSessionInput.tmuxAttach?: boolean`.

- [ ] **Step 1: Write the failing test**

Append to `packages/session-core/src/sessionManager.test.ts`:

```ts
describe("shell integration injection", () => {
  function recordingTransport() {
    const listeners = new Set<(event: SessionTransportEvent) => void>();
    const writes: string[] = [];
    return {
      writes,
      emit(event: SessionTransportEvent) {
        for (const listener of listeners) listener(event);
      },
      handle: {
        write(data: string) {
          writes.push(data);
        },
        resize() {},
        close() {},
        onEvent(listener: (event: SessionTransportEvent) => void) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        }
      }
    };
  }

  it("writes the bootstrap when an SSH session connects", () => {
    const transport = recordingTransport();
    const manager = createSessionManager({ createTransport: () => transport.handle });
    const { sessionId } = manager.open({
      transport: "ssh",
      profileId: "hermes",
      cols: 80,
      rows: 24,
      sshOptions: { hostname: "hermes" }
    });

    transport.emit({ type: "status", sessionId, state: "connected" });

    expect(transport.writes).toHaveLength(1);
    expect(transport.writes[0]).toContain("__HS_SI");
  });

  it("writes it again after a reconnect", () => {
    const transport = recordingTransport();
    const manager = createSessionManager({ createTransport: () => transport.handle });
    const { sessionId } = manager.open({
      transport: "ssh",
      profileId: "hermes",
      cols: 80,
      rows: 24,
      sshOptions: { hostname: "hermes" }
    });

    transport.emit({ type: "status", sessionId, state: "connected" });
    transport.emit({ type: "status", sessionId, state: "reconnecting" });
    transport.emit({ type: "status", sessionId, state: "connected" });

    expect(transport.writes).toHaveLength(2);
  });

  it("skips hosts that opted out", () => {
    const transport = recordingTransport();
    const manager = createSessionManager({ createTransport: () => transport.handle });
    const { sessionId } = manager.open({
      transport: "ssh",
      profileId: "hermes",
      cols: 80,
      rows: 24,
      sshOptions: { hostname: "hermes", shellIntegration: false }
    });

    transport.emit({ type: "status", sessionId, state: "connected" });

    expect(transport.writes).toHaveLength(0);
  });

  it("skips tmux attach tabs", () => {
    const transport = recordingTransport();
    const manager = createSessionManager({ createTransport: () => transport.handle });
    const { sessionId } = manager.open({
      transport: "ssh",
      profileId: "hermes",
      cols: 80,
      rows: 24,
      tmuxAttach: true,
      sshOptions: { hostname: "hermes" }
    });

    transport.emit({ type: "status", sessionId, state: "connected" });

    expect(transport.writes).toHaveLength(0);
  });

  it("never injects into local or serial sessions", () => {
    const transport = recordingTransport();
    const manager = createSessionManager({ createTransport: () => transport.handle });
    const { sessionId } = manager.open({
      transport: "local",
      profileId: "p1",
      cols: 80,
      rows: 24,
      localOptions: { executable: "pwsh.exe" }
    });

    transport.emit({ type: "status", sessionId, state: "connected" });

    expect(transport.writes).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/session-core/src/sessionManager.test.ts`
Expected: FAIL — nothing is written on connect; `tmuxAttach` is not a known input field.

- [ ] **Step 3: Write minimal implementation**

In `sessionManager.ts`, import the builder:

```ts
import { buildShellIntegrationBootstrap } from "./shellIntegration/bootstrap";
```

Add to `OpenSessionInput`:

```ts
  /** True when this tab will immediately attach to tmux. Suppresses shell integration. */
  tmuxAttach?: boolean;
```

In `handleEvent`, inside the existing `if (event.type === "status")` block, after the `updateSession(...)` call:

```ts
      if (event.state === "connected") {
        const session = sessions.get(sessionId);
        const shouldInject =
          session !== undefined &&
          session.input.transport === "ssh" &&
          session.input.sshOptions?.shellIntegration !== false &&
          session.input.tmuxAttach !== true;

        if (shouldInject) {
          // Fires on every connect, including reconnects — each one is a fresh
          // remote shell with no hook installed.
          session.transport.write(buildShellIntegrationBootstrap());
        }
      }
```

In `packages/shared/src/ipc/schemas.ts`, add to `openSessionRequestSchema`:

```ts
  tmuxAttach: z.boolean().optional(),
```

In `apps/ui/src/features/terminal/useTerminalSession.ts`, add to the `openSession({ ... })` payload at line ~511:

```ts
            tmuxAttach: Boolean(input.tmuxAttachTarget),
```

Confirm the main-process open handler forwards `tmuxAttach` from the validated request into `manager.open(...)`; if it builds `openInput` field by field (around `registerIpc.ts:733`), add `tmuxAttach: parsed.tmuxAttach` there.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/session-core/ packages/shared/ apps/ui/src/features/terminal/`
Expected: PASS — 5 new tests plus everything existing.

- [ ] **Step 5: Verify against a real host**

```bash
pnpm --filter @hypershell/desktop build
```

Start the app and connect to hermes. Expected: one echoed bootstrap line at the top of the session (known and accepted), then the tab title tracks commands — run `sleep 10` and watch it read `sleep`, then revert to `tomer@hermes: ~`. Disconnect the network to force a reconnect and confirm titles still track afterwards. Open a tmux-attach tab and confirm **no** bootstrap line appears.

- [ ] **Step 6: Commit**

```bash
git add packages/session-core/ packages/shared/ apps/ui/ apps/desktop/
git commit -m "feat: inject shell integration into SSH sessions on connect"
```

---

### Task 11: Documentation

**Files:**
- Modify: `CLAUDE.md` (Architecture section, near the tmux paragraph)
- Modify: `docs/ipc-reference.md` (session event list)
- Modify: `docs/troubleshooting.md` (known gotchas)

**Interfaces:**
- Consumes: everything above.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Document the architecture**

Add to `CLAUDE.md`, after the tmux paragraph:

```markdown
**Active-process tab titles:** Local tabs get their title from the pty's process
tree — `SessionManager` runs a 1s poller (`session-core/processTitle/`) over
`@vscode/windows-process-tree`, takes the deepest non-shell descendant, and emits
a `process-title` session event. SSH tabs instead receive a one-line shell
hook (`session-core/shellIntegration/bootstrap.ts`) written into the pty on every
`connected` transition, which emits ordinary OSC titles per command. Display
order is `processTitle ?? dynamicTitle ?? title` (`resolveTabTitle`). Per-host
opt-out via `shellIntegration`; global display toggle via
`general.showActiveProcess`.
```

- [ ] **Step 2: Document the new event**

Add the `process-title` variant to the session event list in `docs/ipc-reference.md`, matching the format used for `data` / `status` / `exit` / `error`:

```markdown
| `process-title` | `{ sessionId, name: string \| null }` | Foreground program for a local pty; `null` means the shell is at its prompt. |
```

- [ ] **Step 3: Document the gotchas**

Add to the known-gotchas list in `docs/troubleshooting.md`:

```markdown
- **A WSL tab never shows the running program** — WSL processes live inside the
  VM and are invisible to the Windows process tree. Expected; the local poller
  can only see Win32 processes.
- **A remote shell shows a line of shell code on connect** — that is the
  shell-integration bootstrap echoing. Turn it off per host with the
  "Report the running command in the tab title" checkbox in the host editor.
- **SSH tab titles stop updating inside tmux** — the hook lives in the shell that
  ran before `tmux attach`, and tmux captures OSC titles itself unless the remote
  sets `set -g set-titles on`.
```

- [ ] **Step 4: Run the full check**

```bash
pnpm build
pnpm lint
pnpm vitest run packages/ apps/ui/src
```

Expected: build clean, lint clean, all unit tests pass.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/
git commit -m "docs: active-process tab titles"
```

---

## Self-Review Notes

Spec coverage checked section by section:

| Spec section | Task |
|---|---|
| §1 pid on handle | 2 |
| §1 `pickForegroundName` + shell filter | 1 |
| §1 native provider, dep, `rebuild:native` | 3 |
| §1 poller, start/stop lifecycle | 4 |
| §1 `process-title` event + Zod schema | 5 |
| §2 bootstrap builder, idempotence, no clobber | 8 |
| §2 injection on every connect, tmux skip | 10 |
| §2 echoed line accepted | 10 (step 5), 11 (troubleshooting) |
| §3 `processTitle`, resolution order, sanitize, clear | 6 |
| §3 command-only label, tooltip | 7 |
| §4 `showActiveProcess` default on | 7 |
| §4 migration 017, per-host opt-out | 9 |
| §5 unit tests | 1, 2, 4, 6, 8, 9, 10 |
| §5 manual verification | 7 (step 6), 8 (step 5), 10 (step 5) |
| Limits documented | 11 |

Deliberately **not** covered: the Electron E2E assertion named in spec §5. The
useful part of it (schema acceptance of the new event) is already covered by the
`packages/shared` schema tests in Task 5, and asserting a live pid from a spawned
Electron session buys flakiness rather than confidence. Raise it if you disagree —
it belongs in `apps/desktop/tests/` if added.

The rendering-artifact investigation is explicitly out of scope for this plan.
