import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";

import {
  closeApp,
  createDataDir,
  databasePath,
  launchApp,
  removeDataDir,
  type LaunchedApp
} from "./electronHarness";

let launched: LaunchedApp;

test.beforeEach(async () => {
  launched = await launchApp(createDataDir());
});

test.afterEach(async () => {
  await closeApp(launched.app);
  removeDataDir(launched.dataDir);
});

test("boots a single main window with the renderer loaded", async () => {
  expect(launched.app.windows()).toHaveLength(1);

  await expect(launched.page.locator("#root")).toBeVisible();
  await expect(
    launched.page.getByRole("heading", { name: /hypershell/i })
  ).toBeVisible();
});

test("exposes the preload bridge to the renderer", async () => {
  // contextIsolation is on, so this is the only surface the renderer gets. If
  // the preload fails to build or the contextBridge call regresses, everything
  // downstream breaks — the browser suite cannot see this at all.
  const bridge = await launched.page.evaluate(() => ({
    present: typeof window.hypershell === "object" && window.hypershell !== null,
    canListHosts: typeof window.hypershell.listHosts === "function",
    canOpenSession: typeof window.hypershell.openSession === "function"
  }));

  expect(bridge).toEqual({ present: true, canListHosts: true, canOpenSession: true });
});

test("isolates the renderer from Node", async () => {
  // contextIsolation on / nodeIntegration off, asserted through the property
  // that actually matters: the renderer cannot reach Node primitives.
  const leaked = await launched.page.evaluate(() => ({
    require: typeof (globalThis as Record<string, unknown>).require,
    process: typeof (globalThis as Record<string, unknown>).process,
    module: typeof (globalThis as Record<string, unknown>).module
  }));

  expect(leaked).toEqual({
    require: "undefined",
    process: "undefined",
    module: "undefined"
  });
});

test("rejects IPC payloads that fail the shared Zod schema", async () => {
  // Both sides validate against packages/shared. A renderer sending a bad
  // payload must be refused, not silently coerced.
  const error = await launched.page.evaluate(async () => {
    try {
      await window.hypershell.updateSetting({
        key: "",
        value: "x"
      });
      return null;
    } catch (caught) {
      return caught instanceof Error ? caught.message : String(caught);
    }
  });

  expect(error).not.toBeNull();
});

test("creates its SQLite database inside the isolated data directory", async () => {
  // Proves HYPERSHELL_DATA_DIR actually redirects storage. If this regresses,
  // the suite would be mutating the developer's real host database.
  await launched.page.evaluate(() => window.hypershell.listHosts());

  expect(existsSync(databasePath(launched.dataDir))).toBe(true);
});

test("opens native modules successfully (SQLite-backed host list responds)", async () => {
  // better-sqlite3 is a native module rebuilt against Electron's ABI. A version
  // mismatch shows up here as a rejected call, and nowhere in the browser suite.
  const hosts = await launched.page.evaluate(() => window.hypershell.listHosts());

  expect(Array.isArray(hosts)).toBe(true);
});
