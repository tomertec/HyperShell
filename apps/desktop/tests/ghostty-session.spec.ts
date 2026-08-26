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

// The occlusion assertion above passes because the bug is fixed, which on its
// own proves nothing about whether it would have caught the bug. This puts the
// surface back into the exact bad state — bottom of the parent's child z-order,
// nothing else changed — and requires the check to notice. If someone ever
// weakens the helper into something that always returns an empty list, this
// test fails and the one above keeps quietly passing.
test("detects a ghostty surface buried under Chromium's child windows", async () => {
  const sessionId = await openRawTcpTab(launched.page, echo.port);
  await waitForSurface(launched.page, sessionId);

  const parentHwnd = await mainWindowHwnd(launched.app);
  const [surface] = ghosttySurfaceHwnds(parentHwnd);
  expect(surface).toBeDefined();
  expect(surfaceOcclusion(parentHwnd, surface).occluders).toEqual([]);

  try {
    setChildZOrder(surface, "bottom");
    const buried = surfaceOcclusion(parentHwnd, surface);

    // Every Chromium sibling is now above it, and the ones that matter cover
    // the whole surface — the reported symptom, reproduced.
    expect(buried.zIndex).toBeGreaterThan(0);
    expect(buried.occluders.length).toBeGreaterThan(0);
    expect(buried.occluders.some((occluder) => occluder.overlapPercent >= 99)).toBe(true);
    expect(buried.occluders.map((occluder) => occluder.className)).toContain(
      "Chrome_RenderWidgetHostHWND"
    );
  } finally {
    // Restore before anything else runs. Each test gets a fresh app, so this
    // cannot leak across the file, but a buried surface would poison the rest
    // of this test either way.
    setChildZOrder(surface, "top");
  }

  const restored = surfaceOcclusion(parentHwnd, surface);
  expect(restored.occluders, describeOcclusion(restored)).toEqual([]);
  expect(restored.zIndex).toBe(0);
});
