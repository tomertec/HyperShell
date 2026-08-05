# Terminal Rendering Artifacts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prefer xterm's WebGL renderer to eliminate fractional-DPI ghost glyphs while retaining a reliable DOM-renderer fallback.

**Architecture:** Isolate optional WebGL activation in a small helper that owns dynamic import failure, activation failure, and context-loss behavior. Keep `useTerminalSession` responsible only for opening xterm and requesting optional acceleration, while CSS leaves renderer canvases and xterm's calculated screen geometry untouched.

**Tech Stack:** TypeScript, React, xterm.js 6, `@xterm/addon-webgl` 0.19, Vitest, Vite.

## Global Constraints

- Preserve all unrelated working-tree changes.
- WebGL failure must never prevent the terminal from opening or accepting input.
- Do not add forced redraws or change Unicode width handling.
- Do not apply CSS or inline backgrounds to `.xterm-screen canvas`.
- Do not override xterm's calculated `.xterm-screen` height.

---

### Task 1: Optional WebGL renderer lifecycle

**Files:**
- Create: `apps/ui/src/features/terminal/optionalWebglRenderer.ts`
- Create: `apps/ui/src/features/terminal/optionalWebglRenderer.test.ts`

**Interfaces:**
- Consumes: an open `Pick<Terminal, "loadAddon">` and an optional asynchronous addon factory.
- Produces: `loadOptionalWebglRenderer(terminal, createAddon?): Promise<boolean>`; `true` means WebGL was loaded, while `false` means the existing DOM renderer remains active.

- [ ] **Step 1: Write failing lifecycle tests**

```ts
import type { ITerminalAddon, Terminal } from "@xterm/xterm";
import { describe, expect, it, vi } from "vitest";

import { loadOptionalWebglRenderer } from "./optionalWebglRenderer";

function createFakeAddon() {
  let contextLoss: (() => void) | undefined;
  const addon = {
    activate: vi.fn(),
    dispose: vi.fn(),
    onContextLoss: vi.fn((listener: () => void) => {
      contextLoss = listener;
      return { dispose: vi.fn() };
    })
  } satisfies ITerminalAddon & {
    onContextLoss(listener: () => void): { dispose(): void };
  };
  return { addon, loseContext: () => contextLoss?.() };
}

describe("loadOptionalWebglRenderer", () => {
  it("loads the addon and disposes it when the WebGL context is lost", async () => {
    const { addon, loseContext } = createFakeAddon();
    const terminal = { loadAddon: vi.fn() } as unknown as Pick<Terminal, "loadAddon">;

    await expect(loadOptionalWebglRenderer(terminal, async () => addon)).resolves.toBe(true);
    expect(terminal.loadAddon).toHaveBeenCalledWith(addon);
    loseContext();
    expect(addon.dispose).toHaveBeenCalledOnce();
  });

  it("keeps the DOM renderer when the addon factory rejects", async () => {
    const terminal = { loadAddon: vi.fn() } as unknown as Pick<Terminal, "loadAddon">;

    await expect(
      loadOptionalWebglRenderer(terminal, async () => { throw new Error("WebGL unavailable"); })
    ).resolves.toBe(false);
    expect(terminal.loadAddon).not.toHaveBeenCalled();
  });

  it("disposes a partially loaded addon when activation throws", async () => {
    const { addon } = createFakeAddon();
    const terminal = {
      loadAddon: vi.fn(() => { throw new Error("activation failed"); })
    } as unknown as Pick<Terminal, "loadAddon">;

    await expect(loadOptionalWebglRenderer(terminal, async () => addon)).resolves.toBe(false);
    expect(addon.dispose).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the test to verify RED**

Run: `pnpm --filter @hypershell/ui exec vitest run src/features/terminal/optionalWebglRenderer.test.ts`

Expected: FAIL because `./optionalWebglRenderer` does not exist.

- [ ] **Step 3: Implement the minimal optional loader**

```ts
import type { ITerminalAddon, Terminal } from "@xterm/xterm";

type OptionalWebglAddon = ITerminalAddon & {
  onContextLoss(listener: () => void): { dispose(): void };
};

type CreateWebglAddon = () => Promise<OptionalWebglAddon>;

const createWebglAddon: CreateWebglAddon = async () => {
  const { WebglAddon } = await import("@xterm/addon-webgl");
  return new WebglAddon();
};

export async function loadOptionalWebglRenderer(
  terminal: Pick<Terminal, "loadAddon">,
  createAddon: CreateWebglAddon = createWebglAddon
): Promise<boolean> {
  let addon: OptionalWebglAddon | undefined;
  try {
    addon = await createAddon();
    addon.onContextLoss(() => addon?.dispose());
    terminal.loadAddon(addon);
    return true;
  } catch {
    addon?.dispose();
    return false;
  }
}
```

- [ ] **Step 4: Run the focused test to verify GREEN**

Run: `pnpm --filter @hypershell/ui exec vitest run src/features/terminal/optionalWebglRenderer.test.ts`

Expected: 3 tests pass.

### Task 2: Terminal integration and renderer-safe CSS

**Files:**
- Modify: `apps/ui/src/features/terminal/useTerminalSession.ts:1-10,343-399`
- Modify: `apps/ui/src/index.css:794-813`
- Modify: `apps/ui/package.json:39-43`
- Modify: `pnpm-lock.yaml`
- Create: `apps/ui/src/features/terminal/terminalRendererStyles.test.ts`

**Interfaces:**
- Consumes: `loadOptionalWebglRenderer(terminal): Promise<boolean>` from Task 1.
- Produces: non-blocking WebGL activation immediately after `Terminal.open()` with DOM fallback and renderer-safe CSS.

- [ ] **Step 1: Write a failing CSS contract test**

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../../index.css", import.meta.url), "utf8");

describe("terminal renderer CSS", () => {
  it("does not override renderer canvases or xterm screen height", () => {
    expect(css).not.toMatch(/\.xterm\s+\.xterm-screen\s+canvas\s*\{[^}]*background/si);
    expect(css).not.toMatch(/\.xterm\s+\.xterm-screen\s*\{[^}]*height\s*:/si);
  });
});
```

- [ ] **Step 2: Run the CSS test to verify RED**

Run: `pnpm --filter @hypershell/ui exec vitest run src/features/terminal/terminalRendererStyles.test.ts`

Expected: FAIL because `.xterm .xterm-screen { height: 100% !important; }` remains.

- [ ] **Step 3: Integrate the optional loader and remove unsafe overrides**

In `useTerminalSession.ts`, import `loadOptionalWebglRenderer`, remove WebGL from the mandatory `Promise.all`, and replace inline construction with:

```ts
instance.open(container);
void loadOptionalWebglRenderer(instance);
```

Keep background application on the container, `.xterm`, and `.xterm-viewport` only. In `index.css`, remove both the `.xterm-screen` height override and canvas-background rule. Retain `@xterm/addon-webgl` in `apps/ui/package.json` and the lockfile.

- [ ] **Step 4: Run focused terminal tests**

Run: `pnpm --filter @hypershell/ui exec vitest run src/features/terminal`

Expected: all terminal test files pass.

- [ ] **Step 5: Run production build**

Run: `pnpm --filter @hypershell/ui run build`

Expected: TypeScript and Vite complete with exit code 0. The existing Vite large-chunk warning may remain.

- [ ] **Step 6: Review task-scoped diff**

Run: `git diff --check -- apps/ui/package.json apps/ui/src/features/terminal apps/ui/src/index.css pnpm-lock.yaml`

Expected: no whitespace errors in task files.

Run: `git diff -- apps/ui/package.json apps/ui/src/features/terminal apps/ui/src/index.css pnpm-lock.yaml`

Expected: only the renderer dependency, optional loader, terminal integration, tests, and renderer-safe CSS changes appear.

### Task 3: Manual visual acceptance gate

**Files:**
- No code changes.

**Interfaces:**
- Consumes: the built renderer from Tasks 1 and 2.
- Produces: evidence that the original GPU symptom is visually resolved.

- [ ] **Step 1: Exercise the original reproduction**

At Windows 100% and 115% display scaling, open a local or SSH terminal that emits the affected output. Resize the pane repeatedly, switch tabs, change terminal font size, and switch themes.

- [ ] **Step 2: Confirm fallback behavior**

In Chromium DevTools, dispatch WebGL context loss for the terminal canvas or temporarily block WebGL initialization. Confirm the terminal remains usable through xterm's DOM renderer.

- [ ] **Step 3: Record the acceptance result**

Report visual verification as confirmed only if the original artifact is reproduced before the change and absent after it. Otherwise report build/unit verification separately and leave visual acceptance pending.
