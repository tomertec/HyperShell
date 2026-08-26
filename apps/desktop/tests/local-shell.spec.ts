import { expect, test } from "@playwright/test";

import {
  closeApp,
  createDataDir,
  launchApp,
  readSessionLog,
  removeDataDir,
  sessionLogPath,
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

/**
 * Renderer half: opens a local session for `profileId`, optionally smuggling
 * `localOptions` (as a renderer would if it tried to override the spawn
 * target), points the session logger at `logPath`, and writes
 * `echo <sentinel>\r`. Runs inside the renderer via `page.evaluate`, so it can
 * only touch `window` — no closures over the Node-side test scope.
 *
 * The shell's answer is not read here: `data` events no longer reach the
 * renderer at all (routeSessionEvent.ts feeds them to the ghostty host), so
 * the Node side reads the logger's file instead — the same byte stream,
 * tapped in main. Logging is started before the write so nothing the shell
 * says in reply can land ahead of the stream.
 */
async function openLocalSessionWithLog(params: {
  profileId: string;
  sentinel: string;
  logPath: string;
  localOptions?: { executable: string };
}): Promise<string> {
  const { profileId, sentinel, logPath, localOptions } = params;
  const session = await window.hypershell.openSession({
    transport: "local",
    profileId,
    cols: 80,
    rows: 24,
    ...(localOptions ? { localOptions } : {})
  } as never);

  await window.hypershell.loggingStart({ sessionId: session.sessionId, filePath: logPath });
  await window.hypershell.writeSession({
    sessionId: session.sessionId,
    data: `echo ${sentinel}\r`
  });

  return session.sessionId;
}

/**
 * Node half: drives the above and waits for the sentinel to appear in the log.
 * `expect.poll` prints the log as it stood on the last attempt when it gives
 * up, which is the same "here's what we got instead" diagnostic the in-page
 * timeout used to produce.
 */
async function expectLocalShellSentinel(params: {
  profileId: string;
  sentinel: string;
  localOptions?: { executable: string };
}): Promise<void> {
  const logPath = sessionLogPath(launched.dataDir, `${params.sentinel}.log`);
  const sessionId = await launched.page.evaluate(openLocalSessionWithLog, { ...params, logPath });

  try {
    await expect.poll(() => readSessionLog(logPath), { timeout: 20_000 }).toContain(params.sentinel);
  } finally {
    await launched.page.evaluate(
      (id) => window.hypershell.closeSession({ sessionId: id }),
      sessionId
    );
  }
}

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

    await expectLocalShellSentinel({ profileId: cmd!.id, sentinel: "hypershell-e2e-ok" });
  });

  // Covers profile-ID validation only: an unknown profileId must be rejected.
  // It does NOT prove localOptions is ignored on a *valid* profile — a
  // regression where a real profile's executable got silently overridden by
  // a renderer-supplied localOptions would pass this test unchanged, because
  // the rejection here comes from the profile lookup failing before
  // localOptions is ever considered. See the next test for that boundary.
  test("rejects an unknown profileId even with a smuggled executable", async () => {
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

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Unknown local profile");
  });

  // The conclusive boundary test: a *valid* profileId plus a smuggled
  // localOptions.executable. If the smuggled executable ever took effect,
  // the session would spawn calc.exe instead of cmd.exe, "echo" would never
  // produce the sentinel, and this test would fail on timeout — see the
  // reasoning in the Task 15 report. Only a real cmd.exe answers `echo` with
  // the sentinel, so a passing result proves localOptions was ignored, not
  // just that it was absent from this particular request.
  test("ignores a smuggled executable on a valid local session", async () => {
    const profiles = await launched.page.evaluate(() => window.hypershell.listLocalProfiles());
    const cmd = profiles.find((profile) => profile.detectKey === "cmd");
    expect(cmd).toBeDefined();

    await expectLocalShellSentinel({
      profileId: cmd!.id,
      sentinel: "hypershell-boundary-ok",
      localOptions: { executable: "calc.exe" }
    });
  });
});
