// The ghostty host is a separate process, so it can die on its own — a GPU
// driver fault, a bad frame, someone's task manager. When it does, the app
// window and every live session are still perfectly healthy, and the only
// thing lost is the rendering surface. This spec kills the real host mid-
// session and holds the recovery to that standard: the window survives, the
// transport never notices, and the resurrected host gets a working surface
// bound back to the same session in both directions.
import { expect, test } from "@playwright/test";

import {
  closeApp,
  createDataDir,
  launchApp,
  removeDataDir,
  type LaunchedApp
} from "./electronHarness";
import {
  collectEvents,
  ghosttyEvents,
  ghosttyHostPath,
  ghosttyHostPids,
  ghosttySurfaceHwnds,
  killProcess,
  mainProcessPid,
  mainWindowHwnd,
  openRawTcpTab,
  oscTitle,
  sessionEvents,
  startEchoServer,
  typeIntoSurface,
  waitForSurface,
  type EchoServer
} from "./ghosttyHarness";

test.skip(
  ghosttyHostPath === null,
  "GHOSTTY_HOST_PATH is not set — build the Zig host and point it at ghostty-host.exe"
);

let launched: LaunchedApp;
let echo: EchoServer;

test.beforeEach(async () => {
  echo = await startEchoServer();
  launched = await launchApp(createDataDir());
  await collectEvents(launched.page);
});

test.afterEach(async () => {
  await closeApp(launched.app);
  removeDataDir(launched.dataDir);
  await echo.close();
});

test("respawns the host and rebinds the surface after the host process is killed", async () => {
  const sessionId = await openRawTcpTab(launched.page, echo.port);
  await waitForSurface(launched.page, sessionId);

  const parentHwnd = await mainWindowHwnd(launched.app);
  const electronPid = await mainProcessPid(launched.app);

  // Scoped to this app's own child, never `taskkill /IM`: another HyperShell
  // on this machine has its own host process and must not be collateral.
  const originalPids = ghosttyHostPids(electronPid);
  expect(originalPids).toHaveLength(1);
  const originalSurfaces = ghosttySurfaceHwnds(parentHwnd);
  expect(originalSurfaces).toHaveLength(1);

  killProcess(originalPids[0]);

  // A new host, not the old one. Backoff starts at 500ms, so this is quick,
  // but poll rather than sleep — a CI runner's spawn is its own animal.
  await expect
    .poll(
      () => ghosttyHostPids(electronPid).filter((pid) => pid !== originalPids[0]),
      { timeout: 10_000 }
    )
    .toHaveLength(1);

  // The window is untouched by any of this.
  expect(launched.page.isClosed()).toBe(false);
  await expect(launched.page.locator("#root")).toBeVisible();

  // So is the session: the transport never knew the host existed, so nothing
  // may have moved it off `connected`.
  const statuses = (await sessionEvents(launched.page))
    .filter((event) => event.sessionId === sessionId && event.type === "status")
    .map((event) => event.state);
  expect(statuses.at(-1)).toBe("connected");

  // onRestart re-creates every registered surface against the new host, which
  // means a brand-new HWND under the same parent.
  await expect
    .poll(
      () => ghosttySurfaceHwnds(parentHwnd).filter((hwnd) => hwnd !== originalSurfaces[0]),
      { timeout: 10_000 }
    )
    .toHaveLength(1);
  const [newSurface] = ghosttySurfaceHwnds(parentHwnd).filter(
    (hwnd) => hwnd !== originalSurfaces[0]
  );

  // Outbound leg: keys posted at the resurrected surface still reach the
  // transport, so the new surface id is mapped back to the same session.
  typeIntoSurface(newSurface, "afterkill");
  await expect.poll(() => echo.received(), { timeout: 15_000 }).toContain("afterkill");

  // Inbound leg: bytes from the server still find a surface to be parsed by.
  echo.send(oscTitle("post-crash"));
  await expect
    .poll(
      async () =>
        (await ghosttyEvents(launched.page)).some(
          (event) =>
            event.kind === "title" && event.sessionId === sessionId && event.title === "post-crash"
        ),
      { timeout: 15_000 }
    )
    .toBe(true);
  await expect(launched.page.getByTestId("tab-scroll-container")).toContainText("post-crash");
});
