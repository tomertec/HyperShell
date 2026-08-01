import { expect, test } from "@playwright/test";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  closeApp,
  createDataDir,
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

test("creates a backup and lists it", async () => {
  const backupPath = path.join(launched.dataDir, "e2e-backup.db");

  const created = await launched.page.evaluate(
    (filePath) => window.hypershell.backupCreate({ filePath }),
    backupPath
  );

  expect(created.filePath).toBeTruthy();
  expect(created.size).toBeGreaterThan(0);
  expect(existsSync(created.filePath)).toBe(true);

  const listed = await launched.page.evaluate(() => window.hypershell.backupList());
  expect(Array.isArray(listed.backups)).toBe(true);
});

test("restores a backup taken from the live database", async () => {
  await launched.page.evaluate(() =>
    window.hypershell.upsertHost({
      id: "e2e-backup-host",
      name: "Backed Up",
      hostname: "backup.invalid",
      port: 22
    })
  );

  const backupPath = path.join(launched.dataDir, "roundtrip.db");
  await launched.page.evaluate(
    (filePath) => window.hypershell.backupCreate({ filePath }),
    backupPath
  );

  const restored = await launched.page.evaluate(
    (filePath) => window.hypershell.backupRestore({ filePath }),
    backupPath
  );

  expect(restored.requiresRestart).toBe(true);
});

test("refuses a file that is not a SQLite database", async () => {
  const junkPath = path.join(launched.dataDir, "not-really.db");
  writeFileSync(junkPath, "this is not a database, it is a text file\n", "utf8");

  const error = await launched.page.evaluate(async (filePath) => {
    try {
      await window.hypershell.backupRestore({ filePath });
      return null;
    } catch (caught) {
      return caught instanceof Error ? caught.message : String(caught);
    }
  }, junkPath);

  expect(error).toContain("Invalid backup file");
});

test("refuses a file whose extension is not a SQLite extension", async () => {
  const wrongExtension = path.join(launched.dataDir, "backup.txt");
  writeFileSync(wrongExtension, "irrelevant", "utf8");

  const error = await launched.page.evaluate(async (filePath) => {
    try {
      await window.hypershell.backupRestore({ filePath });
      return null;
    } catch (caught) {
      return caught instanceof Error ? caught.message : String(caught);
    }
  }, wrongExtension);

  expect(error).toContain("SQLite extension");
});

test("refuses a backup path that does not exist", async () => {
  const missingPath = path.join(launched.dataDir, "absent.db");

  const error = await launched.page.evaluate(async (filePath) => {
    try {
      await window.hypershell.backupRestore({ filePath });
      return null;
    } catch (caught) {
      return caught instanceof Error ? caught.message : String(caught);
    }
  }, missingPath);

  expect(error).toContain("not found");
});
