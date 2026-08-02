import { expect, test } from "@playwright/test";

import { closeApp, createDataDir, launchApp, removeDataDir } from "./electronHarness";

/**
 * The one test the per-task suite was missing: everything else launches the app
 * once, and an in-memory profile store is indistinguishable from a persistent
 * one inside a single run. Only a second launch against the same data directory
 * can tell them apart.
 *
 * Two things have to survive the restart, and both matter:
 *  - the user's edits, or the whole editor is decorative; and
 *  - the profile *id*, because a restored local tab in `saved_sessions` refers
 *    to it. A regenerated id makes session restore throw "Unknown local
 *    profile" — which is exactly what migration 016 exists to prevent.
 */
test("local profile edits and ids survive an app restart", async () => {
  const dataDir = createDataDir();

  try {
    const first = await launchApp(dataDir);

    const before = await first.page.evaluate(() => window.hypershell.listLocalProfiles());
    expect(before.length).toBeGreaterThan(0);

    // A detected profile is the interesting case: reconciliation runs again on
    // the next launch and must not overwrite what the user changed.
    const target = before.find((profile) => profile.source === "detected") ?? before[0];
    const renamed = `Renamed ${Date.now()}`;

    await first.page.evaluate(
      ({ id, name, executable }) =>
        window.hypershell.upsertLocalProfile({ id, name, executable, color: "purple" }),
      { id: target.id, name: renamed, executable: target.executable }
    );

    const idsBefore = before.map((profile) => profile.id).sort();
    await closeApp(first.app);

    const second = await launchApp(dataDir);
    const after = await second.page.evaluate(() => window.hypershell.listLocalProfiles());

    const restored = after.find((profile) => profile.id === target.id);
    expect(restored, "the renamed profile kept its id across the restart").toBeDefined();
    expect(restored?.name).toBe(renamed);
    expect(restored?.color).toBe("purple");
    // Its detect key is intact, so reconciliation matched it instead of
    // inserting a second row for the same shell.
    expect(restored?.detectKey).toBe(target.detectKey);
    expect(after.filter((profile) => profile.detectKey === target.detectKey)).toHaveLength(
      target.detectKey === null ? 0 : 1
    );

    // No profile got a fresh id: the detection pass reuses stored rows rather
    // than minting a new UUID per shell on every launch.
    expect(after.map((profile) => profile.id).sort()).toEqual(idsBefore);

    await closeApp(second.app);
  } finally {
    removeDataDir(dataDir);
  }
});

test("hiding a local profile survives an app restart", async () => {
  const dataDir = createDataDir();

  try {
    const first = await launchApp(dataDir);
    const before = await first.page.evaluate(() => window.hypershell.listLocalProfiles());
    const target = before[0];
    expect(target).toBeDefined();

    await first.page.evaluate(
      (id) => window.hypershell.setLocalProfileHidden({ id, hidden: true }),
      target.id
    );
    await closeApp(first.app);

    const second = await launchApp(dataDir);
    const after = await second.page.evaluate(() => window.hypershell.listLocalProfiles());

    // A hidden detected profile is a tombstone — reconciliation must respect it
    // rather than resurrecting the shell on the next launch.
    expect(after.find((profile) => profile.id === target.id)?.isHidden).toBe(true);

    await closeApp(second.app);
  } finally {
    removeDataDir(dataDir);
  }
});
