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

test("welcome SSH quick connect shows username input inside the form", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Click to connect").click();

  const hostInput = page.getByPlaceholder("Hostname or IP address");
  const portInput = page.getByPlaceholder("Port");
  const usernameInput = page.getByPlaceholder("Username");

  await expect(hostInput).toBeVisible();
  await expect(portInput).toBeVisible();
  await expect(usernameInput).toBeVisible();

  const hostBox = await hostInput.boundingBox();
  const portBox = await portInput.boundingBox();
  const usernameBox = await usernameInput.boundingBox();

  expect(hostBox).not.toBeNull();
  expect(portBox).not.toBeNull();
  expect(usernameBox).not.toBeNull();

  expect(usernameBox!.x).toBeGreaterThan(portBox!.x + portBox!.width);
  expect(usernameBox!.x + usernameBox!.width).toBeLessThanOrEqual(
    hostBox!.x + hostBox!.width + 2
  );
  expect(usernameBox!.width).toBeGreaterThan(100);
});
