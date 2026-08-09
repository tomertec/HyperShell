import { expect, test, type Page } from "@playwright/test";

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

async function openClaude(page: Page) {
  await page.getByRole("main").getByRole("button", { name: "Claude" }).click();
  return page
    .getByTestId("tab-scroll-container")
    .locator('button[data-tab-title-color]')
    .filter({ hasText: "Claude" })
    .last();
}

test("saves a title color, reuses it for matching tabs, and clears it", async ({ page }) => {
  await page.goto("/");
  let tab = await openClaude(page);

  await tab.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Orange" }).click();
  await expect(tab).toHaveAttribute("data-tab-title-color", "orange");
  const indicator = tab.getByTestId("active-tab-indicator");
  const title = tab.getByText("Claude", { exact: true });
  await expect(indicator).toBeVisible();
  await expect
    .poll(async () => {
      const indicatorColor = await indicator.evaluate(
        (element) => getComputedStyle(element).backgroundColor
      );
      const titleColor = await title.evaluate(
        (element) => getComputedStyle(element).color
      );
      return indicatorColor === titleColor;
    })
    .toBe(true);

  await page.getByRole("button", { name: "New Tab" }).click();
  await page.getByRole("menuitem", { name: "Claude" }).click();
  const matchingTabs = page
    .getByTestId("tab-scroll-container")
    .locator('button[data-tab-title-color]')
    .filter({ hasText: "Claude" });
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
