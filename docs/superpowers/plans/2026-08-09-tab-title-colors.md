# Saved Tab Title Colors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a preset tab-title color picker whose case-insensitive title rules apply immediately to matching tabs and persist across HyperShell restarts.

**Architecture:** Keep the feature renderer-only and persist it inside the existing `app.settings` document. A focused color-rule module owns palette identifiers, normalization, validation, and CSS-variable mapping; `settingsStore` owns mutation/persistence; `TabBar` owns the right-click interaction and presentation.

**Tech Stack:** React 19, TypeScript, Zustand, Tailwind CSS v4/theme CSS variables, Vitest, Playwright.

## Global Constraints

- Palette identifiers are exactly `orange`, `blue`, `green`, `purple`, `red`, `yellow`, and `pink`.
- Matching uses the visible title from `resolveTabTitle`, trimmed and compared case-insensitively.
- Persist palette identifiers only; do not persist arbitrary CSS or hex values.
- Reuse the existing `--host-<color>` theme variables so every built-in dark and light theme supplies a readable value.
- Custom color applies to the tab title and glyph; the active accent line, close control, and tooltip connection-status dot retain existing semantics.
- `Default` removes the saved rule.
- Do not touch the existing ConPTY/WebGL/session-core work in the source checkout.

---

### Task 1: Color Rule Domain and Settings Persistence

**Files:**
- Create: `apps/ui/src/features/settings/tabTitleColors.ts`
- Create: `apps/ui/src/features/settings/tabTitleColors.test.ts`
- Modify: `apps/ui/src/features/settings/settingsStore.ts`
- Modify: `apps/ui/src/features/settings/settingsStore.test.ts`

**Interfaces:**
- Produces: `TabTitleColorId`, `TabTitleColorRules`, `TAB_TITLE_COLOR_OPTIONS`, `normalizeTabTitleColorKey(title)`, `sanitizeTabTitleColorRules(value)`, `resolveTabTitleColor(title, rules)`, and `getTabTitleColorCssValue(color)`.
- Produces: `AppearanceSettings.tabTitleColors: TabTitleColorRules` and `settingsStore.getState().updateTabTitleColor(title, color)` where `color` is `TabTitleColorId | null`.

- [ ] **Step 1: Write failing pure-domain tests**

Create `tabTitleColors.test.ts` with literal expectations that catch incorrect normalization, invalid persisted data, wrong matching, and wrong CSS-variable mapping:

```ts
import { describe, expect, it } from "vitest";
import {
  getTabTitleColorCssValue,
  normalizeTabTitleColorKey,
  resolveTabTitleColor,
  sanitizeTabTitleColorRules,
} from "./tabTitleColors";

describe("tab title color rules", () => {
  it("normalizes title rules case-insensitively", () => {
    expect(normalizeTabTitleColorKey("  Claude  ")).toBe("claude");
    expect(resolveTabTitleColor("CLAUDE", { claude: "orange" })).toBe("orange");
  });

  it("drops empty keys and unsupported persisted colors", () => {
    expect(sanitizeTabTitleColorRules({
      " Claude ": "orange",
      broken: "chartreuse",
      "   ": "blue",
    })).toEqual({ claude: "orange" });
  });

  it("maps palette ids to existing theme variables", () => {
    expect(getTabTitleColorCssValue("orange")).toBe("var(--host-orange)");
    expect(getTabTitleColorCssValue("pink")).toBe("var(--host-pink)");
  });
});
```

- [ ] **Step 2: Run the pure-domain test and verify RED**

Run:

```powershell
pnpm --filter @hypershell/ui test --run src/features/settings/tabTitleColors.test.ts
```

Expected: FAIL because `./tabTitleColors` does not exist.

- [ ] **Step 3: Implement the pure color-rule module**

Create `tabTitleColors.ts` with literal palette metadata and defensive persisted-data handling:

```ts
export const TAB_TITLE_COLOR_OPTIONS = [
  { id: "orange", label: "Orange", cssValue: "var(--host-orange)" },
  { id: "blue", label: "Blue", cssValue: "var(--host-blue)" },
  { id: "green", label: "Green", cssValue: "var(--host-green)" },
  { id: "purple", label: "Purple", cssValue: "var(--host-purple)" },
  { id: "red", label: "Red", cssValue: "var(--host-red)" },
  { id: "yellow", label: "Yellow", cssValue: "var(--host-yellow)" },
  { id: "pink", label: "Pink", cssValue: "var(--host-pink)" },
] as const;

export type TabTitleColorId = (typeof TAB_TITLE_COLOR_OPTIONS)[number]["id"];
export type TabTitleColorRules = Record<string, TabTitleColorId>;

const COLOR_IDS = new Set<string>(TAB_TITLE_COLOR_OPTIONS.map((option) => option.id));
const CSS_VALUES = Object.fromEntries(
  TAB_TITLE_COLOR_OPTIONS.map((option) => [option.id, option.cssValue])
) as Record<TabTitleColorId, string>;

export function normalizeTabTitleColorKey(title: string): string {
  return title.trim().toLowerCase();
}

export function sanitizeTabTitleColorRules(value: unknown): TabTitleColorRules {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const entries: Array<[string, TabTitleColorId]> = [];
  for (const [title, color] of Object.entries(value)) {
    const key = normalizeTabTitleColorKey(title);
    if (key && typeof color === "string" && COLOR_IDS.has(color)) {
      entries.push([key, color as TabTitleColorId]);
    }
  }
  return Object.fromEntries(entries);
}

export function resolveTabTitleColor(
  title: string,
  rules: TabTitleColorRules
): TabTitleColorId | null {
  return rules[normalizeTabTitleColorKey(title)] ?? null;
}

export function getTabTitleColorCssValue(color: TabTitleColorId): string {
  return CSS_VALUES[color];
}
```

- [ ] **Step 4: Run the pure-domain test and verify GREEN**

Run the Step 2 command again. Expected: the three new tests PASS.

- [ ] **Step 5: Write failing settings persistence tests**

Extend `settingsStore.test.ts` with a reset that sets `appearance` to `{ appTheme: "system", tabTitleColors: {} }`, then add:

```ts
describe("settingsStore tab title colors", () => {
  beforeEach(() => {
    mockSshterm.getSetting.mockReset();
    mockSshterm.updateSetting.mockReset();
    mockSshterm.updateSetting.mockResolvedValue({ key: "app.settings", value: "{}" });
    settingsStore.setState((state) => ({
      loaded: false,
      settings: {
        ...state.settings,
        appearance: { appTheme: "system", tabTitleColors: {} },
      },
    }));
  });

  it("loads only valid normalized title-color rules", async () => {
    mockSshterm.getSetting.mockResolvedValue({
      key: "app.settings",
      value: JSON.stringify({
        appearance: {
          appTheme: "mocha",
          tabTitleColors: { " Claude ": "orange", broken: "chartreuse" },
        },
      }),
    });
    await settingsStore.getState().load();
    expect(settingsStore.getState().settings.appearance).toEqual({
      appTheme: "mocha",
      tabTitleColors: { claude: "orange" },
    });
  });

  it("persists and removes a normalized title rule", async () => {
    await settingsStore.getState().updateTabTitleColor(" Claude ", "orange");
    let saved = JSON.parse(mockSshterm.updateSetting.mock.calls.at(-1)![0].value);
    expect(saved.appearance.tabTitleColors).toEqual({ claude: "orange" });

    await settingsStore.getState().updateTabTitleColor("CLAUDE", null);
    saved = JSON.parse(mockSshterm.updateSetting.mock.calls.at(-1)![0].value);
    expect(saved.appearance.tabTitleColors).toEqual({});
  });
});
```

- [ ] **Step 6: Run settings tests and verify RED**

Run:

```powershell
pnpm --filter @hypershell/ui test --run src/features/settings/settingsStore.test.ts
```

Expected: TypeScript/runtime failure because `AppearanceSettings.tabTitleColors` and `updateTabTitleColor` do not exist.

- [ ] **Step 7: Implement settings load, update, and persistence**

In `settingsStore.ts`:

1. Import `sanitizeTabTitleColorRules`, `normalizeTabTitleColorKey`, and the two color types.
2. Add `tabTitleColors: TabTitleColorRules` to `AppearanceSettings`.
3. Set `DEFAULT_APPEARANCE_SETTINGS` to `{ appTheme: "system", tabTitleColors: {} }`.
4. Make `migrateAppearance` preserve/sanitize `parsed.tabTitleColors` while retaining the existing legacy `themeMode` mapping.
5. Add `updateTabTitleColor: (title: string, color: TabTitleColorId | null) => Promise<void>` to `SettingsState`.
6. Implement the mutation by normalizing the title, copying the current rule map, adding or deleting the key, updating state synchronously, and calling `persistSettings(next)` inside the same non-fatal persistence handling used by `updateAppearance`.

The migration return must have this shape on every branch:

```ts
const tabTitleColors = sanitizeTabTitleColorRules(parsed.tabTitleColors);
return { appTheme, tabTitleColors };
```

The updater must no-op for an empty normalized title and must delete rather than persist `null`:

```ts
updateTabTitleColor: async (title, color) => {
  const key = normalizeTabTitleColorKey(title);
  if (!key) return;
  const current = get().settings;
  const tabTitleColors = { ...current.appearance.tabTitleColors };
  if (color === null) delete tabTitleColors[key];
  else tabTitleColors[key] = color;
  const next = {
    ...current,
    appearance: { ...current.appearance, tabTitleColors },
  };
  set({ settings: next });
  try { await persistSettings(next); } catch { /* non-fatal */ }
},
```

- [ ] **Step 8: Run Task 1 tests and verify GREEN**

Run:

```powershell
pnpm --filter @hypershell/ui test --run src/features/settings/tabTitleColors.test.ts src/features/settings/settingsStore.test.ts
```

Expected: all tests in both files PASS with zero failures.

- [ ] **Step 9: Commit Task 1**

```powershell
git add -- apps/ui/src/features/settings/tabTitleColors.ts apps/ui/src/features/settings/tabTitleColors.test.ts apps/ui/src/features/settings/settingsStore.ts apps/ui/src/features/settings/settingsStore.test.ts
git commit -m "feat(ui): persist tab title color rules"
```

---

### Task 2: Tab Context Menu and Automatic Matching

**Files:**
- Modify: `apps/ui/src/features/layout/TabBar.tsx`
- Modify: `apps/ui/src/features/layout/TabIcon.tsx`
- Create: `apps/ui/tests/tab-title-colors.spec.ts`

**Interfaces:**
- Consumes: Task 1's `TAB_TITLE_COLOR_OPTIONS`, `TabTitleColorId`, `resolveTabTitleColor`, `getTabTitleColorCssValue`, and `settingsStore.updateTabTitleColor`.
- Produces: right-click palette interaction and visible color on all tabs with the same normalized resolved title.

- [ ] **Step 1: Write the failing browser behavior test**

Create `tab-title-colors.spec.ts`. Seed a launchable `Claude` local profile plus `getSetting`/`updateSetting`; use `localStorage` behind those two methods so the simulated setting survives `page.reload()`:

```ts
import { expect, test } from "@playwright/test";

const profile = {
  id: "claude",
  name: "Claude",
  executable: "claude.exe",
  args: [],
  startingDirectory: null,
  icon: "terminal",
  color: null,
  elevated: false,
  source: "custom",
  detectKey: null,
  isAvailable: true,
  isHidden: false,
  sortOrder: 1,
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript((seed) => {
    const settingsKey = "tab-title-colors-e2e";
    (window as unknown as { hypershell: unknown }).hypershell = {
      listLocalProfiles: async () => [seed],
      rescanLocalProfiles: async () => [seed],
      getSetting: async ({ key }: { key: string }) => {
        const value = localStorage.getItem(settingsKey);
        return key === "app.settings" && value ? { key, value } : null;
      },
      updateSetting: async ({ key, value }: { key: string; value: string }) => {
        localStorage.setItem(settingsKey, value);
        return { key, value };
      },
    };
  }, profile);
});

async function openClaude(page: import("@playwright/test").Page) {
  await page.getByRole("main").getByRole("button", { name: "Claude" }).click();
  return page.getByTestId("tab-scroll-container").getByRole("button", { name: "Claude" }).last();
}

test("saves a title color, reuses it for matching tabs, and clears it", async ({ page }) => {
  await page.goto("/");
  let tab = await openClaude(page);
  await tab.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Orange" }).click();
  await expect(tab).toHaveAttribute("data-tab-title-color", "orange");

  await page.getByRole("button", { name: "New Tab" }).click();
  await page.getByRole("menuitem", { name: "Claude" }).click();
  const matchingTabs = page.getByTestId("tab-scroll-container").getByRole("button", { name: "Claude" });
  await expect(matchingTabs).toHaveCount(2);
  await expect(matchingTabs.nth(0)).toHaveAttribute("data-tab-title-color", "orange");
  await expect(matchingTabs.nth(1)).toHaveAttribute("data-tab-title-color", "orange");

  await page.reload();
  tab = await openClaude(page);
  await expect(tab).toHaveAttribute("data-tab-title-color", "orange");

  await tab.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Default" }).click();
  await expect(tab).toHaveAttribute("data-tab-title-color", "default");

  await tab.press("Shift+F10");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
});
```

- [ ] **Step 2: Run the browser test and verify RED**

Run:

```powershell
pnpm --filter @hypershell/ui test:e2e -- tab-title-colors.spec.ts
```

Expected: FAIL because right-click does not open a color menu and the tab has no `data-tab-title-color` state.

- [ ] **Step 3: Add color-aware glyph presentation**

Change `TabIcon` to accept an optional `color?: string` prop. Preserve the existing state tint classes and animation, but set an inline color only when a title rule exists:

```tsx
export function TabIcon({ tab, sessionState, isActive, color }: {
  tab: LayoutTab;
  sessionState: string | undefined;
  isActive: boolean;
  color?: string;
}) {
  const profiles = useStore(localProfilesStore, (state) => state.profiles);
  const tint = stateTint(sessionState, isActive);
  const localProfile =
    tab.transport === "local" && tab.profileId
      ? profiles.find((profile) => profile.id === tab.profileId)
      : undefined;

  return (
    <span
      className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center ${tint}`}
      style={color ? { color } : undefined}
    >
      {localProfile ? (
        <LocalProfileIcon icon={localProfile.icon} className="h-3.5 w-3.5" />
      ) : (
        <TransportGlyph tab={tab} />
      )}
    </span>
  );
}
```

- [ ] **Step 4: Add the right-click menu and automatic rule resolution**

In `TabBar.tsx`:

1. Import `ContextMenu` and Task 1's color helpers/types.
2. Select `settings.appearance.tabTitleColors` and `updateTabTitleColor` from `settingsStore`.
3. Store the open menu as `{ x: number; y: number; title: string } | null`.
4. For every tab, resolve the same visible `label` already used by `SortableTab`, then call `resolveTabTitleColor(label, rules)`.
5. Pass the color id and an `onContextMenu` callback into `SortableTab`.
6. On the tab button, prevent the browser menu, stop propagation, and open the palette at `event.clientX/clientY`.
7. Handle `Shift+F10` on the tab button by preventing the default and opening the same menu at the button's lower-left bounding rectangle, making the palette reachable without a pointer.
8. Apply `getTabTitleColorCssValue(id)` to the title span and `TabIcon`; set `data-tab-title-color={id ?? "default"}` on the tab button.
9. Render `ContextMenu` with a `Default` action, separator, and one action per `TAB_TITLE_COLOR_OPTIONS`. Each color action uses a circular swatch icon with `style={{ backgroundColor: option.cssValue }}`. Use the action's `shortcut` field to show `Current` for the selected entry.
10. Selecting an entry calls `void updateTabTitleColor(menu.title, id)`; Default calls it with `null`. Let `ContextMenu` close itself after the action, and clear menu state on outside click/Escape through `onClose`.

The new `SortableTab` props should be explicit:

```ts
titleColor: TabTitleColorId | null;
onOpenColorMenu: (x: number, y: number) => void;
```

Build the menu actions from the exact palette and current rule:

```tsx
const selectedColor = colorMenu
  ? resolveTabTitleColor(colorMenu.title, tabTitleColors)
  : null;
const colorMenuActions = colorMenu
  ? [
      {
        label: "Default",
        action: () => { void updateTabTitleColor(colorMenu.title, null); },
        shortcut: selectedColor === null ? "Current" : undefined,
      },
      { label: "palette-separator", action: () => {}, separator: true },
      ...TAB_TITLE_COLOR_OPTIONS.map((option) => ({
        label: option.label,
        action: () => { void updateTabTitleColor(colorMenu.title, option.id); },
        shortcut: selectedColor === option.id ? "Current" : undefined,
        icon: (
          <span
            aria-hidden="true"
            className="h-3 w-3 rounded-full ring-1 ring-white/15"
            style={{ backgroundColor: option.cssValue }}
          />
        ),
      })),
    ]
  : [];
```

The title styling should affect the visible label and glyph while leaving the
existing close control and active/tooltip elements unchanged after the label:

```tsx
const titleColorCss = titleColor ? getTabTitleColorCssValue(titleColor) : undefined;

<button
  data-tab-title-color={titleColor ?? "default"}
  onContextMenu={(event) => {
    event.preventDefault();
    event.stopPropagation();
    onOpenColorMenu(event.clientX, event.clientY);
  }}
  onKeyDown={(event) => {
    if (event.shiftKey && event.key === "F10") {
      event.preventDefault();
      const bounds = event.currentTarget.getBoundingClientRect();
      onOpenColorMenu(bounds.left, bounds.bottom);
    }
  }}
>
  <TabIcon
    tab={tab}
    sessionState={sessionState}
    isActive={isActive}
    color={titleColorCss}
  />
  <span style={titleColorCss ? { color: titleColorCss } : undefined}>
    {label}
  </span>
</button>

{colorMenu && (
  <ContextMenu
    x={colorMenu.x}
    y={colorMenu.y}
    actions={colorMenuActions}
    onClose={() => setColorMenu(null)}
  />
)}
```

- [ ] **Step 5: Run the focused browser test and verify GREEN**

Run the Step 2 command again. Expected: the saved/reused/reloaded/cleared color test PASS.

- [ ] **Step 6: Run focused unit and browser regression tests**

Run:

```powershell
pnpm --filter @hypershell/ui test --run src/features/settings/tabTitleColors.test.ts src/features/settings/settingsStore.test.ts src/features/layout/layoutStore.test.ts src/features/layout/tabTitle.test.ts
pnpm --filter @hypershell/ui test:e2e -- tab-title-colors.spec.ts local-profiles.spec.ts accessibility.spec.ts
```

Expected: all selected unit and browser tests PASS with zero failures.

- [ ] **Step 7: Commit Task 2**

```powershell
git add -- apps/ui/src/features/layout/TabBar.tsx apps/ui/src/features/layout/TabIcon.tsx apps/ui/tests/tab-title-colors.spec.ts
git commit -m "feat(ui): color tabs by saved title rules"
```

---

### Task 3: Build and Full UI Verification

**Files:**
- Modify only if verification exposes a feature regression; do not absorb unrelated failures.

**Interfaces:**
- Consumes: completed Tasks 1 and 2.
- Produces: fresh verification evidence for the final handoff.

- [ ] **Step 1: Inspect the feature diff and whitespace**

Run:

```powershell
git diff --check HEAD~2..HEAD
git status --short
git diff HEAD~2..HEAD -- apps/ui/src/features/settings apps/ui/src/features/layout apps/ui/tests/tab-title-colors.spec.ts
```

Expected: no whitespace errors; only the planned feature files appear in the two implementation commits. Existing source-checkout WIP must not appear in the isolated worktree.

- [ ] **Step 2: Run the complete UI unit suite**

```powershell
pnpm --filter @hypershell/ui test --run
```

Expected: zero failed UI unit tests.

- [ ] **Step 3: Run the UI production build**

```powershell
pnpm --filter @hypershell/ui build
```

Expected: TypeScript and Vite exit 0.

- [ ] **Step 4: Run the complete browser E2E suite**

```powershell
pnpm --filter @hypershell/ui test:e2e
```

Expected: zero failed browser tests. If an environment block prevents Playwright from starting, report that command as unavailable rather than treating it as a feature failure.

- [ ] **Step 5: Record final repository state**

```powershell
git status --short
git log -3 --oneline
```

Expected: implementation worktree clean, with the design commit followed by the two feature commits.
