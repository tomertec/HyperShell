// The first E2E against the real ghostty-host.exe. Everything below the
// renderer is live here: the host process is spawned, a native surface is
// parented into the Electron window, keystrokes are posted at that surface's
// HWND, and the bytes they produce are asserted on the far side of a TCP echo
// server. Nothing in the browser suite can reach any of it — Chromium neither
// owns the surface nor sees session `data` events, which routeSessionEvent.ts
// now feeds to the host instead of the renderer.
import { expect, test } from "@playwright/test";

import {
  closeApp,
  createDataDir,
  launchApp,
  removeDataDir,
  type LaunchedApp
} from "./electronHarness";
import {
  childWindowsInZOrder,
  collectEvents,
  describeOcclusion,
  ghosttyEvents,
  ghosttyHostPath,
  ghosttySurfaceHwnds,
  mainWindowHwnd,
  openRawTcpTab,
  oscTitle,
  setChildZOrder,
  startEchoServer,
  surfaceOcclusion,
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

test("renders a live session in a native ghostty surface", async () => {
  const sessionId = await openRawTcpTab(launched.page, echo.port);

  // Present in the DOM and sized: the div is what the surface's bounds are
  // computed from, so a collapsed one would silently mean no surface at all.
  const pane = launched.page.getByTestId("ghostty-pane");
  await expect(pane).toBeVisible();
  const box = await pane.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(0);
  expect(box?.height ?? 0).toBeGreaterThan(0);

  // The host builds the surface and reports its grid — the first proof that a
  // real terminal, not just a container div, exists for this session.
  await waitForSurface(launched.page, sessionId);
  const grid = (await ghosttyEvents(launched.page)).find(
    (event) => event.kind === "grid" && event.sessionId === sessionId
  );
  expect(grid?.cols ?? 0).toBeGreaterThan(0);
  expect(grid?.rows ?? 0).toBeGreaterThan(0);

  // One native child window, parented into the Electron window by the host.
  const parentHwnd = await mainWindowHwnd(launched.app);
  const surfaces = ghosttySurfaceHwnds(parentHwnd);
  expect(surfaces).toHaveLength(1);

  // ...and actually on screen. Everything asserted above was true of the blank
  // terminal a user reported: connected session, live host, a visible HWND at
  // the right rect, grid and title events flowing. The surface was invisible
  // anyway because it sat at the bottom of the parent's child z-order, under
  // Chrome_RenderWidgetHostHWND and the Intermediate D3D Window, each covering
  // 100% of it. Nothing in the suite asserted pixels or stacking, so 34 tests
  // passed against a terminal no one could see. This is that assertion.
  const occlusion = surfaceOcclusion(parentHwnd, surfaces[0]);
  expect(occlusion.occluders, describeOcclusion(occlusion)).toEqual([]);

  // Keystrokes: renderer window → host HWND → input frame → transport. The
  // echo server is the only place this can be observed, since `data` events
  // stop at the host now.
  typeIntoSurface(surfaces[0], "e2etyped");
  await expect.poll(() => echo.received(), { timeout: 15_000 }).toContain("e2etyped");

  // And the other direction: bytes from the server are fed to the host, which
  // parses OSC 0 and reports a title that becomes the tab's label.
  echo.send(oscTitle("e2e-title"));
  await expect
    .poll(
      async () =>
        (await ghosttyEvents(launched.page)).some(
          (event) =>
            event.kind === "title" && event.sessionId === sessionId && event.title === "e2e-title"
        ),
      { timeout: 15_000 }
    )
    .toBe(true);
  await expect(launched.page.getByTestId("tab-scroll-container")).toContainText("e2e-title");
});

// The host does not only place the leaf on top when a surface is created; it
// handles WM_WINDOWPOSCHANGED and re-raises itself whenever it finds it is not
// first among its siblings. That recovery is what closes the hole where an
// event outside the app's control — a GPU process restart restacking Chromium's
// windows — buries a healthy surface, and it is the reason the deliberate-bury
// check that used to live here no longer observes a buried state at all: the
// surface heals before the next read can see it.
//
// So the bury now drives the recovery rather than the detector. The buried
// state is not observable even in principle: WM_WINDOWPOSCHANGED is sent, not
// posted, so the host's handler runs and re-raises the leaf before our
// SetWindowPos call returns. What makes the assertion meaningful is not
// catching the surface mid-fall but that SetWindowPos genuinely demoted it —
// setChildZOrder throws if the call fails — and it is nonetheless found back on
// top. Against a host without this recovery the same bury leaves the leaf at
// the bottom indefinitely, which is what it did before the host gained it. The
// poll is belt-and-braces in case a future host defers the re-raise.
//
// What this no longer proves is that the occlusion check can see a bad state.
// That evidence moved to occlusion.test.ts, which feeds the same computation
// synthetic window lists that are unambiguously occluded.
test("re-raises itself when something buries it in the z-order", async () => {
  const sessionId = await openRawTcpTab(launched.page, echo.port);
  await waitForSurface(launched.page, sessionId);

  const parentHwnd = await mainWindowHwnd(launched.app);
  const [surface] = ghosttySurfaceHwnds(parentHwnd);
  expect(surface).toBeDefined();
  expect(surfaceOcclusion(parentHwnd, surface).occluders).toEqual([]);

  setChildZOrder(surface, "bottom");

  await expect
    .poll(() => surfaceOcclusion(parentHwnd, surface).zIndex, { timeout: 15_000 })
    .toBe(0);

  const healed = surfaceOcclusion(parentHwnd, surface);
  expect(healed.occluders, describeOcclusion(healed)).toEqual([]);
});

// A resize is the moment the reported blank terminal actually appeared, so the
// surface being unoccluded afterwards is worth asserting on its own terms.
//
// It is only an end-state assertion, though, and the name says so. It cannot
// attribute the outcome to the bounds-sync re-assert specifically: the host now
// re-raises on any WM_WINDOWPOSCHANGED where it is not first, so a surface that
// came out of a resize unoccluded may have been placed correctly by the bounds
// sync or healed immediately after, and nothing observable from out here
// separates the two. What it does still catch is the failure that matters —
// finishing a real resize with the terminal invisible.
test("stays unoccluded through a real window resize", async () => {
  const sessionId = await openRawTcpTab(launched.page, echo.port);
  await waitForSurface(launched.page, sessionId);

  const parentHwnd = await mainWindowHwnd(launched.app);
  const [surface] = ghosttySurfaceHwnds(parentHwnd);
  expect(surface).toBeDefined();

  const surfaceWidth = (): number => {
    const child = childWindowsInZOrder(parentHwnd).find((entry) => entry.hwnd === surface);
    if (child === undefined) {
      throw new Error(`surface ${surface} is no longer a child of ${parentHwnd}`);
    }
    return child.rect.right - child.rect.left;
  };

  const widthBefore = surfaceWidth();
  expect(widthBefore).toBeGreaterThan(0);

  await launched.app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    // A maximized window ignores setBounds on Windows, and the harness does not
    // promise one state or the other.
    if (win.isMaximized()) win.unmaximize();
    const bounds = win.getBounds();
    win.setBounds({ ...bounds, width: bounds.width - 160 });
  });

  // The leaf's own rect changing is the proof the resize actually reached the
  // host as a bounds frame. Without it this test could pass having asserted
  // nothing more than that a surface nobody had touched was still fine.
  await expect.poll(surfaceWidth, { timeout: 15_000 }).not.toBe(widthBefore);

  const after = surfaceOcclusion(parentHwnd, surface);
  expect(after.occluders, describeOcclusion(after)).toEqual([]);
  expect(after.zIndex).toBe(0);
});
