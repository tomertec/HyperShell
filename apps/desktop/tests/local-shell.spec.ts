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

test.describe("local shell profiles", () => {
  test("detects at least one local shell on this machine", async () => {
    const profiles = await launched.page.evaluate(() => window.hypershell.listLocalProfiles());

    expect(profiles.length).toBeGreaterThan(0);
    expect(profiles.every((profile) => Array.isArray(profile.args))).toBe(true);
  });

  test("detected profiles carry no arguments so the shell loads its own profile", async () => {
    const profiles = await launched.page.evaluate(() => window.hypershell.listLocalProfiles());
    const powershell = profiles.find(
      (profile) => profile.detectKey === "pwsh7" || profile.detectKey === "windows-powershell"
    );

    expect(powershell?.args).toEqual([]);
  });

  test("opens a real local shell and receives output", async () => {
    const profiles = await launched.page.evaluate(() => window.hypershell.listLocalProfiles());
    const cmd = profiles.find((profile) => profile.detectKey === "cmd");
    expect(cmd).toBeDefined();

    // Generous timeout with a fallback resolve: a hang here should report a
    // readable "no sentinel yet" failure with whatever output was captured,
    // rather than a bare Playwright timeout with no diagnostic value.
    const output = await launched.page.evaluate(async (profileId) => {
      const session = await window.hypershell.openSession({
        transport: "local",
        profileId,
        cols: 80,
        rows: 24
      });

      return await new Promise<string>((resolve) => {
        let buffer = "";
        let settled = false;

        const finish = (result: string) => {
          if (settled) return;
          settled = true;
          unsubscribe();
          clearTimeout(timer);
          void window.hypershell.closeSession({ sessionId: session.sessionId });
          resolve(result);
        };

        const unsubscribe = window.hypershell.onSessionEvent((event) => {
          if (event.sessionId !== session.sessionId) return;
          if (event.type === "data") {
            buffer += event.data;
            if (buffer.includes("hypershell-e2e-ok")) {
              finish(buffer);
            }
          }
        });

        const timer = setTimeout(() => {
          finish(`TIMEOUT waiting for sentinel; buffer so far: ${JSON.stringify(buffer)}`);
        }, 20_000);

        void window.hypershell.writeSession({
          sessionId: session.sessionId,
          data: "echo hypershell-e2e-ok\r"
        });
      });
    }, cmd!.id);

    expect(output).toContain("hypershell-e2e-ok");
  });

  test("rejects a renderer-supplied executable on a local session", async () => {
    const result = await launched.page.evaluate(async () => {
      try {
        const session = await window.hypershell.openSession({
          transport: "local",
          profileId: "does-not-exist",
          cols: 80,
          rows: 24,
          localOptions: { executable: "calc.exe" }
        } as never);
        return { ok: true, sessionId: session.sessionId };
      } catch (error) {
        return { ok: false, message: String(error) };
      }
    });

    // The unknown profileId must fail, and localOptions must never be honoured
    // — the preload's request schema has no localOptions field at all, so it
    // is stripped before the request ever reaches the main process.
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Unknown local profile");
  });
});
