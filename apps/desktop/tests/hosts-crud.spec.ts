import { expect, test } from "@playwright/test";

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

test("creates, updates, and removes a host through the real repository", async () => {
  const created = await launched.page.evaluate(() =>
    window.hypershell.upsertHost({
      id: "e2e-host-1",
      name: "E2E Box",
      hostname: "e2e.invalid",
      port: 2222,
      username: "tester"
    })
  );

  expect(created).toMatchObject({
    id: "e2e-host-1",
    name: "E2E Box",
    hostname: "e2e.invalid",
    port: 2222,
    username: "tester"
  });

  const afterCreate = await launched.page.evaluate(() => window.hypershell.listHosts());
  expect(afterCreate.filter((host) => host.id === "e2e-host-1")).toHaveLength(1);

  // Upsert on an existing id updates in place rather than inserting a duplicate.
  await launched.page.evaluate(() =>
    window.hypershell.upsertHost({
      id: "e2e-host-1",
      name: "E2E Box (renamed)",
      hostname: "e2e.invalid",
      port: 2200,
      username: "tester"
    })
  );

  const afterUpdate = await launched.page.evaluate(() => window.hypershell.listHosts());
  const updated = afterUpdate.filter((host) => host.id === "e2e-host-1");
  expect(updated).toHaveLength(1);
  expect(updated[0]).toMatchObject({ name: "E2E Box (renamed)", port: 2200 });

  await launched.page.evaluate(() => window.hypershell.removeHost({ id: "e2e-host-1" }));

  const afterRemove = await launched.page.evaluate(() => window.hypershell.listHosts());
  expect(afterRemove.filter((host) => host.id === "e2e-host-1")).toHaveLength(0);
});

test("hosts survive a restart", async () => {
  await launched.page.evaluate(() =>
    window.hypershell.upsertHost({
      id: "e2e-host-persist",
      name: "Persisted",
      hostname: "persist.invalid",
      port: 22
    })
  );

  const { dataDir } = launched;
  await closeApp(launched.app);

  launched = await launchApp(dataDir);

  const hosts = await launched.page.evaluate(() => window.hypershell.listHosts());
  expect(hosts.filter((host) => host.id === "e2e-host-persist")).toHaveLength(1);
});

test("rejects a host that fails schema validation", async () => {
  const error = await launched.page.evaluate(async () => {
    try {
      await window.hypershell.upsertHost({
        id: "e2e-host-bad",
        name: "Bad",
        // Empty hostname violates the shared schema's .min(1).
        hostname: "",
        port: 22
      });
      return null;
    } catch (caught) {
      return caught instanceof Error ? caught.message : String(caught);
    }
  });

  expect(error).not.toBeNull();

  const hosts = await launched.page.evaluate(() => window.hypershell.listHosts());
  expect(hosts.filter((host) => host.id === "e2e-host-bad")).toHaveLength(0);
});
