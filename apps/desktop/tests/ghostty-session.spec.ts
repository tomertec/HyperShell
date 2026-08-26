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

  // The leaf's own rect, not the pane div's. computeOcclusion treats a
  // zero-area surface as unoccluded — correct, since it cannot divide by an
  // empty area — so a leaf collapsed to 0x0 would sail through the assertion
  // below on a technicality. Nothing else in this test looks at the leaf's size.
  const leaf = childWindowsInZOrder(parentHwnd).find((child) => child.hwnd === surfaces[0]);
  expect(leaf, `ghostty leaf ${surfaces[0]} is not a child of ${parentHwnd}`).toBeDefined();
  expect(leaf!.rect.right - leaf!.rect.left).toBeGreaterThan(0);
  expect(leaf!.rect.bottom - leaf!.rect.top).toBeGreaterThan(0);

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

// Besides placing the leaf on top at create time, the host handles
// WM_WINDOWPOSCHANGED and re-raises itself whenever it finds it is not first
// among its siblings. That is the behaviour under test here.
//
// Scope it precisely, because the message contract is narrower than it looks:
// WM_WINDOWPOSCHANGED goes to the window that moved. This test demotes the leaf
// itself, so the leaf is told and can recover — but when Chromium raises or
// recreates its *own* children, the leaf is never notified and would not heal.
// That trigger, a GPU-process restart restacking Chromium's windows, is handled
// app-side instead: 197815d wires Electron's `child-process-gone` to a bounds
// re-sync, which lands as the host's opSetBounds re-assert.
//
// The buried state is not observable even in principle: WM_WINDOWPOSCHANGED is
// sent, not posted, so the host's handler runs and re-raises the leaf before our
// own SetWindowPos call returns. So this cannot catch the surface mid-fall, and
// what it rests on instead is that the demotion really happened. SetWindowPos
// returning true does not establish that — it returns true for a no-op — hence
// the control below. Against a host without the recovery the same bury leaves
// the leaf at the bottom indefinitely, which is what it did before.
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

  const before = surfaceOcclusion(parentHwnd, surface);
  // Explicitly on top, not merely unoccluded: siblings above that happen not to
  // overlap would also yield an empty occluder list, and then the bury below
  // would have nothing to undo.
  expect(before.zIndex).toBe(0);
  expect(before.occluders, describeOcclusion(before)).toEqual([]);

  // Control: prove SetWindowPos(HWND_BOTTOM) actually demotes a window on this
  // run, using a sibling that has no self-heal of its own. Without this, an
  // inverted HWND_TOP/HWND_BOTTOM constant or a wrong flag would turn the bury
  // into a no-op and the assertion below would degrade into "a healthy surface
  // is healthy" — passing, while testing nothing.
  const siblings = childWindowsInZOrder(parentHwnd);
  const control = siblings.find((child) => child.className === "Chrome_RenderWidgetHostHWND");
  expect(
    control,
    `no Chrome_RenderWidgetHostHWND among [${siblings.map((s) => s.className).join(", ")}]`
  ).toBeDefined();
  const above = siblings[control!.zIndex - 1];

  setChildZOrder(control!.hwnd, "bottom");
  const demoted = childWindowsInZOrder(parentHwnd);
  expect(demoted[demoted.length - 1].hwnd).toBe(control!.hwnd);

  // Back exactly where it was — directly below whatever preceded it — rather
  // than to "top", which would park a Chromium window above the leaf that the
  // leaf is never told about and so would never heal from.
  setChildZOrder(control!.hwnd, { after: above.hwnd });
  expect(
    childWindowsInZOrder(parentHwnd).map((child) => child.hwnd),
    "control sibling was not restored to its original z-order position"
  ).toEqual(siblings.map((child) => child.hwnd));

  // Now the real subject: demote the leaf and require the host to undo it.
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
