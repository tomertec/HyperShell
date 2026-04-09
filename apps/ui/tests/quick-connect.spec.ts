import { expect, test } from "@playwright/test";

test("quick connect opens from keyboard shortcut", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /hypershell/i })).toBeVisible();
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+K" : "Control+K"
  );

  await expect(
    page.getByRole("dialog", { name: /quick connect/i })
  ).toBeVisible();
});
