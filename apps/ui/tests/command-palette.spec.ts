import { test, expect } from "@playwright/test";

const modifier = process.platform === "darwin" ? "Meta" : "Control";

test.describe("Command Palette", () => {
  test("opens with Ctrl+Shift+P and closes with Escape", async ({ page }) => {
    await page.goto("/");
    await page.click("body");
    await page.keyboard.press(`${modifier}+Shift+P`);
    await expect(page.getByRole("dialog", { name: "Command Palette" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Command Palette" })).not.toBeVisible();
  });

  test("filters commands by typing", async ({ page }) => {
    await page.goto("/");
    await page.click("body");
    await page.keyboard.press(`${modifier}+Shift+P`);
    const dialog = page.getByRole("dialog", { name: "Command Palette" });
    await expect(dialog).toBeVisible();
    await dialog.getByPlaceholder("Search commands...").fill("settings");
    await expect(dialog.getByText("Open Settings")).toBeVisible();
  });

  test("shows 'No matching commands' for gibberish", async ({ page }) => {
    await page.goto("/");
    await page.click("body");
    await page.keyboard.press(`${modifier}+Shift+P`);
    const dialog = page.getByRole("dialog", { name: "Command Palette" });
    await expect(dialog).toBeVisible();
    await dialog.getByPlaceholder("Search commands...").fill("zzzxxx999");
    await expect(dialog.getByText("No matching commands.")).toBeVisible();
  });

  test("executes command and closes palette", async ({ page }) => {
    await page.goto("/");
    await page.click("body");
    await page.keyboard.press(`${modifier}+Shift+P`);
    const dialog = page.getByRole("dialog", { name: "Command Palette" });
    await expect(dialog).toBeVisible();
    await dialog.getByPlaceholder("Search commands...").fill("settings");
    await dialog.getByText("Open Settings").click();
    // Palette should close after execution (allow exit animation)
    await expect(dialog).not.toBeVisible({ timeout: 10000 });
  });

  test("shows shortcut badges on commands", async ({ page }) => {
    await page.goto("/");
    await page.click("body");
    await page.keyboard.press(`${modifier}+Shift+P`);
    const dialog = page.getByRole("dialog", { name: "Command Palette" });
    await expect(dialog).toBeVisible();
    await dialog.getByPlaceholder("Search commands...").fill("Open Settings");
    await expect(dialog.getByText("Ctrl+,")).toBeVisible();
  });
});
