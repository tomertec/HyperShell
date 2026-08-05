# Terminal PTY Semantics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop incremental TUI cursor corruption by restoring xterm's PTY-safe line-feed behavior.

**Architecture:** Keep `terminalOptions` as the single source of xterm defaults and disable application-side LF-to-CRLF conversion. Prove the behavior through xterm's public buffer API, then rebuild and synchronize the exact renderer consumed by Electron.

**Tech Stack:** TypeScript, xterm.js 6, Playwright, Vitest, Vite, Electron.

## Global Constraints

- Preserve all unrelated working-tree changes.
- Change newline handling only; retain the current renderer and repaint code for this live validation.
- Do not alter PTY, SSH, serial, or telnet transport bytes.
- Do not claim visual resolution until the original streaming TUI workload passes after restart.

---

### Task 1: Restore PTY line-feed semantics

**Files:**
- Modify: `apps/ui/tests/terminal-rendering.spec.ts`
- Modify: `apps/ui/src/features/terminal/terminalTheme.ts:27-39`

**Interfaces:**
- Consumes: `getTerminalOptions()` and xterm's public `Terminal.write()` and buffer APIs.
- Produces: terminal defaults with `convertEol: false`, preserving the cursor column when PTY output contains a bare line feed.

- [ ] **Step 1: Add the failing behavioral test**

Append this Playwright test to `apps/ui/tests/terminal-rendering.spec.ts`:

```ts
test("PTY line feeds preserve the cursor column", async ({ page }) => {
  await page.goto("/");

  const cells = await page.evaluate(async () => {
    const [{ Terminal }, { getTerminalOptions }] = await Promise.all([
      import("/@id/@xterm/xterm"),
      import("/src/features/terminal/terminalTheme.ts")
    ]);
    const container = document.createElement("div");
    container.style.cssText = "width:800px;height:400px;position:fixed;inset:0";
    document.body.appendChild(container);

    const terminal = new Terminal(getTerminalOptions());
    terminal.open(container);
    await new Promise<void>((resolve) => terminal.write("abc\nx", resolve));

    const secondLine = terminal.buffer.active.getLine(1);
    const result = {
      columnZero: secondLine?.getCell(0)?.getChars() ?? "",
      originalColumn: secondLine?.getCell(3)?.getChars() ?? ""
    };
    terminal.dispose();
    container.remove();
    return result;
  });

  expect(cells).toEqual({ columnZero: "", originalColumn: "x" });
});
```

- [ ] **Step 2: Run the focused browser test to verify RED**

Run: `pnpm --filter @hypershell/ui exec playwright test tests/terminal-rendering.spec.ts --grep "PTY line feeds"`

Expected: FAIL because `convertEol: true` places `x` in `columnZero` and leaves `originalColumn` empty.

- [ ] **Step 3: Implement the minimal option change**

In `apps/ui/src/features/terminal/terminalTheme.ts`, change only:

```ts
convertEol: false,
```

- [ ] **Step 4: Run the focused browser test to verify GREEN**

Run: `pnpm --filter @hypershell/ui exec playwright test tests/terminal-rendering.spec.ts --grep "PTY line feeds"`

Expected: 1 test passes.

- [ ] **Step 5: Run UI regression gates**

Run: `pnpm --filter @hypershell/ui test -- --run`

Expected: all UI unit tests pass.

Run: `pnpm --filter @hypershell/ui run test:e2e`

Expected: all UI browser tests pass.

- [ ] **Step 6: Build and synchronize the Electron renderer**

Run: `pnpm --filter @hypershell/desktop run build:bundle`

Expected: UI TypeScript, Vite, desktop TypeScript, esbuild, and renderer synchronization complete with exit code 0. The existing Vite large-chunk warning may remain.

- [ ] **Step 7: Exercise a real PTY in Electron**

Run: `pnpm --filter @hypershell/desktop run test:e2e -- tests/local-shell.spec.ts`

Expected: all local-shell Electron tests pass.

- [ ] **Step 8: Verify and commit the scoped change**

Run: `git diff --check -- apps/ui/src/features/terminal/terminalTheme.ts apps/ui/tests/terminal-rendering.spec.ts`

Expected: no whitespace errors.

```bash
git add apps/ui/src/features/terminal/terminalTheme.ts apps/ui/tests/terminal-rendering.spec.ts
git commit -m "fix: preserve PTY line-feed semantics"
```

### Task 2: Live acceptance gate

**Files:**
- No code changes.

**Interfaces:**
- Consumes: the synchronized Electron renderer from Task 1.
- Produces: user confirmation that the original streaming TUI workload no longer leaves stale fragments.

- [ ] **Step 1: Restart HyperShell without discarding active sessions unexpectedly**

Ask the user to restart after saving or closing sessions they need. Confirm the new Electron process started after `apps/desktop/dist/renderer/index.html` was generated.

- [ ] **Step 2: Re-run the original workload**

Exercise OpenCode and at least one other incremental full-screen TUI without resizing the pane as a recovery action.

- [ ] **Step 3: Record the outcome**

If artifacts are absent, mark visual acceptance confirmed and schedule removal of the fractional-scale repaint guard as a separate follow-up. If artifacts remain, do not add another renderer workaround; instrument a diagnostic build that compares xterm buffer cells with the visible renderer surface.
