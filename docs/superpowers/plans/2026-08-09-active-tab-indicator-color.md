# Active Tab Indicator Color Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the active tab's top indicator line match its saved title color while preserving the existing accent color for unassigned tabs.

**Architecture:** Reuse the resolved `titleColorCss` already calculated by `SortableTab`. Apply it as an inline background color to the active indicator only when a saved rule exists, allowing the existing `bg-accent` class to remain the fallback.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Playwright.

## Global Constraints

- Saved title colors use the existing preset palette and theme CSS variables.
- The connection-state dot remains unchanged.
- A tab using `Default` retains the existing blue accent indicator.
- Do not modify unrelated ConPTY, WebGL, session-core, or dependency files.

---

### Task 1: Color the Active Indicator

**Files:**
- Modify: `apps/ui/tests/tab-title-colors.spec.ts`
- Modify: `apps/ui/src/features/layout/TabBar.tsx`

**Interfaces:**
- Consumes: `SortableTab`'s existing `titleColorCss: string | undefined`.
- Produces: an active indicator whose computed background color equals the assigned tab title color.

- [ ] **Step 1: Write the failing browser assertion**

After choosing Orange in `tab-title-colors.spec.ts`, locate the active indicator and compare its computed background color with the colored title label:

```ts
const indicator = tab.getByTestId("active-tab-indicator");
const title = tab.getByText("Claude", { exact: true });
await expect(indicator).toBeVisible();
await expect.poll(async () => {
  const indicatorColor = await indicator.evaluate(
    (element) => getComputedStyle(element).backgroundColor
  );
  const titleColor = await title.evaluate(
    (element) => getComputedStyle(element).color
  );
  return indicatorColor === titleColor;
}).toBe(true);
```

- [ ] **Step 2: Run the focused browser test and verify RED**

Run:

```powershell
pnpm --filter @hypershell/ui test:e2e -- tab-title-colors.spec.ts
```

Expected: FAIL because the active indicator has no `active-tab-indicator` test id and still uses the accent background.

- [ ] **Step 3: Apply the resolved title color to the indicator**

Update the active indicator in `TabBar.tsx`:

```tsx
<span
  data-testid="active-tab-indicator"
  className="absolute top-0 left-2 right-2 h-[2px] bg-accent rounded-b-full"
  style={titleColorCss ? { backgroundColor: titleColorCss } : undefined}
/>
```

The inline value overrides `bg-accent` only for assigned tabs; omitting it preserves the default indicator.

- [ ] **Step 4: Run the focused browser test and verify GREEN**

Run the Step 2 command again. Expected: the test passes with the indicator and title both resolving to the theme's orange value.

- [ ] **Step 5: Run UI regression verification**

Run:

```powershell
pnpm --filter @hypershell/ui test --run
pnpm --filter @hypershell/ui build
pnpm --filter @hypershell/ui test:e2e
```

Expected: all UI unit tests and browser tests pass, and the production build exits 0.

- [ ] **Step 6: Commit**

```powershell
git add -- apps/ui/tests/tab-title-colors.spec.ts apps/ui/src/features/layout/TabBar.tsx
git commit -m "fix(ui): match active tab indicator color"
```
