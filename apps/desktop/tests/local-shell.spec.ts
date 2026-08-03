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

/**
 * Opens a local session for `profileId`, optionally smuggling `localOptions`
 * (as a renderer would if it tried to override the spawn target), writes
 * `echo <sentinel>\r`, and waits for the sentinel to come back in a `data`
 * event. Runs inside the renderer via `page.evaluate`, so it can only touch
 * `window` — no closures over the Node-side test scope.
 *
 * Generous timeout with a fallback resolve: a hang reports a readable
 * "no sentinel yet, here's what we got" failure instead of a bare Playwright
 * timeout with no diagnostic value.
 */
async function openLocalSessionAndWaitForSentinel(params: {
  profileId: string;
  sentinel: string;
  localOptions?: { executable: string };
}): Promise<string> {
  const { profileId, sentinel, localOptions } = params;
  const session = await window.hypershell.openSession({
    transport: "local",
    profileId,
    cols: 80,
    rows: 24,
    ...(localOptions ? { localOptions } : {})
  } as never);

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
        if (buffer.includes(sentinel)) {
          finish(buffer);
        }
      }
    });

    const timer = setTimeout(() => {
      finish(`TIMEOUT waiting for sentinel; buffer so far: ${JSON.stringify(buffer)}`);
    }, 20_000);

    void window.hypershell.writeSession({
      sessionId: session.sessionId,
      data: `echo ${sentinel}\r`
    });
  });
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

    const output = await launched.page.evaluate(openLocalSessionAndWaitForSentinel, {
      profileId: cmd!.id,
      sentinel: "hypershell-e2e-ok"
    });

    expect(output).toContain("hypershell-e2e-ok");
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

    const output = await launched.page.evaluate(openLocalSessionAndWaitForSentinel, {
      profileId: cmd!.id,
      sentinel: "hypershell-boundary-ok",
      localOptions: { executable: "calc.exe" }
    });

    expect(output).toContain("hypershell-boundary-ok");
  });
});
