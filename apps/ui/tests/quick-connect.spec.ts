import { expect, test } from "@playwright/test";

test("quick connect opens from keyboard shortcut", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /hypershell/i })).toBeVisible();
  // Use Control+K on all platforms — Playwright sends key events directly to the
  // web page where the React handler listens for ctrlKey, not metaKey.
  await page.keyboard.press("Control+K");

  await expect(
    page.getByRole("dialog", { name: /quick connect/i })
  ).toBeVisible();
});
