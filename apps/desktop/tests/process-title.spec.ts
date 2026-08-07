// Covers the active-process tab-title chain below the renderer UI: the
// process-title poller must register a real local pty, walk its process tree
// via the native module, and deliver `process-title` events through IPC and
// the preload bridge. `ping -t` is the foreground program because it is a
// real .exe child of the shell — shells themselves report null by design.
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

test("a local session running ping emits process-title events to the renderer", async () => {
  test.setTimeout(60_000);

  const profiles = await launched.page.evaluate(() => window.hypershell.listLocalProfiles());
  const shell =
    profiles.find((p) => p.detectKey === "pwsh7" || p.detectKey === "windows-powershell") ??
    profiles.find((p) => p.detectKey === "cmd");
  expect(shell).toBeDefined();

  const result = await launched.page.evaluate(async (profileId: string) => {
    const session = await window.hypershell.openSession({
      transport: "local",
      profileId,
      cols: 80,
      rows: 24
    } as never);

    const titleEvents: Array<{ name: string | null; at: number }> = [];
    let dataEventCount = 0;
    const started = Date.now();

    const unsubscribe = window.hypershell.onSessionEvent((event) => {
      if (event.sessionId !== session.sessionId) return;
      if (event.type === "process-title") {
        titleEvents.push({ name: event.name, at: Date.now() - started });
      }
      if (event.type === "data") {
        dataEventCount += 1;
      }
    });

    // Let the shell reach its prompt, then start a long-running real .exe.
    await new Promise((r) => setTimeout(r, 3000));
    await window.hypershell.writeSession({
      sessionId: session.sessionId,
      data: "ping -t 127.0.0.1\r"
    });

    // Poller ticks every 1s; give it plenty.
    await new Promise((r) => setTimeout(r, 6000));

    unsubscribe();
    void window.hypershell.closeSession({ sessionId: session.sessionId });

    return { sessionId: session.sessionId, titleEvents, dataEventCount };
  }, shell!.id);

  expect(result.dataEventCount).toBeGreaterThan(0);
  expect(
    result.titleEvents.some((e) => e.name?.toLowerCase() === "ping"),
    `expected a process-title event naming ping; got ${JSON.stringify(result.titleEvents)}`
  ).toBe(true);
});
