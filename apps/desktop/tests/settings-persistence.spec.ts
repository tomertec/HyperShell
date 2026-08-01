import { expect, test } from "@playwright/test";

import { closeApp, createDataDir, launchApp, removeDataDir } from "./electronHarness";

test("settings written in one run are readable after a restart", async () => {
  const dataDir = createDataDir();

  try {
    const first = await launchApp(dataDir);

    const written = await first.page.evaluate(() =>
      window.hypershell.updateSetting({
        key: "e2e.persistence",
        value: JSON.stringify({ theme: "catppuccin-mocha", fontSize: 15 })
      })
    );
    expect(written.value).toContain("catppuccin-mocha");

    await closeApp(first.app);

    // Same data dir, brand-new process: the value has to have reached SQLite
    // on disk, not just an in-memory cache.
    const second = await launchApp(dataDir);

    const restored = await second.page.evaluate(() =>
      window.hypershell.getSetting({ key: "e2e.persistence" })
    );

    expect(restored).not.toBeNull();
    expect(JSON.parse(restored!.value)).toEqual({
      theme: "catppuccin-mocha",
      fontSize: 15
    });

    await closeApp(second.app);
  } finally {
    removeDataDir(dataDir);
  }
});

test("a fresh data directory starts with no stored setting", async () => {
  const dataDir = createDataDir();

  try {
    const launched = await launchApp(dataDir);

    const missing = await launched.page.evaluate(() =>
      window.hypershell.getSetting({ key: "e2e.persistence" })
    );

    expect(missing).toBeNull();

    await closeApp(launched.app);
  } finally {
    removeDataDir(dataDir);
  }
});
