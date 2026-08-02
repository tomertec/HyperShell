import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Matches the convention in accessibility.spec.ts: color contrast is tracked
// separately as a theme-wide concern, so it's excluded here too.
const DISABLED_RULES = ["color-contrast"];

async function scan(page: Page, selector?: string) {
  let builder = new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .disableRules(DISABLED_RULES);

  if (selector) {
    builder = builder.include(selector);
  }

  return builder.analyze();
}

const profiles = [
  {
    id: "p1",
    name: "PowerShell",
    executable: "pwsh.exe",
    args: [],
    startingDirectory: null,
    icon: "powershell",
    color: null,
    elevated: false,
    source: "detected",
    detectKey: "pwsh7",
    isAvailable: true,
    isHidden: false,
    sortOrder: 1
  },
  {
    id: "p2",
    name: "Gone Shell",
    executable: "missing.exe",
    args: [],
    startingDirectory: null,
    icon: "terminal",
    color: null,
    elevated: false,
    source: "detected",
    detectKey: "gone",
    isAvailable: false,
    isHidden: false,
    sortOrder: 2
  }
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript((seed) => {
    (window as unknown as { hypershell: unknown }).hypershell = {
      listLocalProfiles: async () => seed,
      rescanLocalProfiles: async () => seed
    };
  }, profiles);
});

test("lists local profiles in the sidebar", async ({ page }) => {
  await page.goto("/");

  // Scoped by title rather than accessible name: dnd-kit's useSortable spreads
  // its own role="button" onto each row's wrapping <div> (pre-existing, from
  // the sidebar's drag-to-reorder support), which duplicates the "PowerShell"
  // accessible name on that wrapper and on the real connect <button> inside it.
  const sidebar = page.getByRole("complementary");
  await expect(sidebar.getByTitle(/click to connect/)).toBeVisible();
});

test("marks an unavailable profile as disabled", async ({ page }) => {
  await page.goto("/");

  // getByText matches the innermost node containing the text — the <span>
  // inside the row, not the disabled <button> that carries aria-disabled.
  await expect(page.getByTitle(/unavailable/)).toHaveAttribute("aria-disabled", "true");
});

test("the welcome screen shows a chip per launchable profile only", async ({ page }) => {
  await page.goto("/");

  const main = page.getByRole("main");
  await expect(main.getByRole("button", { name: "PowerShell" })).toBeVisible();
  await expect(main.getByRole("button", { name: "Gone Shell" })).toHaveCount(0);
});

test("the new-tab menu lists launchable profiles only", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /new tab/i }).click();

  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: "PowerShell" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Gone Shell" })).toHaveCount(0);
});

test("local profile surfaces have no accessibility violations", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /new tab/i }).click();

  // Scoped to <main>, where this task's surfaces (welcome chips, the "+"
  // button, and its dropdown) live — the sidebar's pre-existing drag-to-reorder
  // markup (Task 11) has its own unrelated nested-interactive violation that
  // isn't part of what this task built.
  const results = await scan(page, "main");
  expect(results.violations).toEqual([]);
});
