import { test, expect } from "@playwright/test";

test.describe("Command Palette", () => {
  test("opens with Ctrl+Shift+P and closes with Escape", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Control+Shift+P");
    await expect(page.getByRole("dialog", { name: "Command Palette" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Command Palette" })).not.toBeVisible();
  });

  test("filters commands by typing", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Control+Shift+P");
    const dialog = page.getByRole("dialog", { name: "Command Palette" });
    await dialog.getByPlaceholder("Search commands...").fill("settings");
    await expect(dialog.getByText("Open Settings")).toBeVisible();
  });

  test("shows 'No matching commands' for gibberish", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Control+Shift+P");
    const dialog = page.getByRole("dialog", { name: "Command Palette" });
    await dialog.getByPlaceholder("Search commands...").fill("zzzxxx999");
    await expect(dialog.getByText("No matching commands.")).toBeVisible();
  });

  test("executes command with Enter", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Control+Shift+P");
    const dialog = page.getByRole("dialog", { name: "Command Palette" });
    await dialog.getByPlaceholder("Search commands...").fill("settings");
    await page.keyboard.press("Enter");
    // Palette should close after execution
    await expect(dialog).not.toBeVisible();
  });

  test("shows shortcut badges on commands", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Control+Shift+P");
    const dialog = page.getByRole("dialog", { name: "Command Palette" });
    await dialog.getByPlaceholder("Search commands...").fill("Open Settings");
    await expect(dialog.getByText("Ctrl+,")).toBeVisible();
  });
});
