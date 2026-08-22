import { expect, test, type Page } from "@playwright/test";
import { installFakeBridge } from "./support/fakeBridge";

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
  await page.addInitScript(installFakeBridge, { profiles: [profile] });
});

const strip = (page: Page) => page.getByTestId("tab-scroll-container");
const scrollLeftButton = (page: Page) => page.getByRole("button", { name: "Scroll tabs left" });
const scrollRightButton = (page: Page) => page.getByRole("button", { name: "Scroll tabs right" });

async function openTabs(page: Page, count: number) {
  await page.getByRole("main").getByRole("button", { name: "Claude" }).click();
  for (let i = 1; i < count; i++) {
    await page.getByRole("button", { name: "New Tab" }).click();
    await page.getByRole("menuitem", { name: "Claude" }).click();
  }
  await expect(strip(page).locator("button[data-tab-title-color]")).toHaveCount(count);
}

const scrollLeft = (page: Page) => strip(page).evaluate((el) => el.scrollLeft);

test("no scroll chevrons while every tab fits", async ({ page }) => {
  await page.goto("/");
  await openTabs(page, 2);

  await expect(scrollLeftButton(page)).toHaveCount(0);
  await expect(scrollRightButton(page)).toHaveCount(0);
});

test("a newly opened tab is scrolled into view", async ({ page }) => {
  await page.goto("/");
  await openTabs(page, 12);

  // The regression: the strip stays at scrollLeft 0, so the tab that was just
  // opened — and is now active — is clipped past the right edge with no
  // scrollbar to drag. Compare boxes rather than Playwright visibility, which
  // reports a clipped-but-painted tab as visible.
  const lastTab = strip(page).locator("button[data-tab-title-color]").last();
  const [tabBox, stripBox] = await Promise.all([lastTab.boundingBox(), strip(page).boundingBox()]);
  expect(tabBox!.x).toBeGreaterThanOrEqual(stripBox!.x - 1);
  expect(tabBox!.x + tabBox!.width).toBeLessThanOrEqual(stripBox!.x + stripBox!.width + 1);
});

test("chevrons page an overflowing tab strip in both directions", async ({ page }) => {
  await page.goto("/");
  await openTabs(page, 12);

  // Opening the 12th tab scrolled it into view, so the strip sits at its right
  // end: only the left chevron has anywhere to go.
  await expect(scrollLeftButton(page)).toBeVisible();
  await expect(scrollRightButton(page)).toHaveCount(0);

  const end = await scrollLeft(page);
  expect(end).toBeGreaterThan(0);

  await scrollLeftButton(page).click();
  await expect.poll(() => scrollLeft(page)).toBeLessThan(end);
  await expect(scrollRightButton(page)).toBeVisible();

  const middle = await scrollLeft(page);
  await scrollRightButton(page).click();
  await expect.poll(() => scrollLeft(page)).toBeGreaterThan(middle);

  // Paging all the way back to the start retires the left chevron. Each click
  // has to settle first: scrollBy is relative to the *animated* position, so
  // clicking mid-animation pages less than a full width.
  for (let i = 0; i < 10 && (await scrollLeftButton(page).count()); i++) {
    await scrollLeftButton(page).click();
    await page.waitForTimeout(250);
  }
  await expect.poll(() => scrollLeft(page)).toBe(0);
  await expect(scrollLeftButton(page)).toHaveCount(0);
});
