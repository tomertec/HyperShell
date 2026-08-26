// Shared scaffolding for the two ghostty Electron E2E specs. Everything here
// exists because a native ghostty surface is a real Win32 child window that
// Chromium cannot see or reach: Playwright's keyboard goes through CDP into
// Blink, which never touches the HWND the terminal actually listens on. So the
// two specs drive the surface the same way the Zig host's own harness does —
// PostMessageW straight at the leaf window — and observe the result on the
// Node side of the echo server, because `data` session events no longer reach
// the renderer at all (routeSessionEvent.ts reroutes them into feedData).
import { expect, type ElectronApplication, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createServer, type Server, type Socket } from "node:net";

/**
 * The real ghostty-host.exe is built out of the Zig host repo and is not
 * checked in here, so these specs are opt-in: point `GHOSTTY_HOST_PATH` at the
 * binary (playwright.electron.config.ts resolves and existence-checks it) and
 * they run; leave it unset and they skip rather than fail on a machine that
 * has no host to talk to.
 */
export const ghosttyHostPath = process.env.GHOSTTY_HOST_PATH ?? null;

/**
 * A throwaway TCP echo server standing in for a remote host — same rationale
 * as session-lifecycle.spec.ts (telnet `raw` is a plain socket passthrough,
 * the one transport that needs no external binary and no hardware), with two
 * additions these specs need: it keeps every byte it received, and it can be
 * told to push arbitrary bytes back so a test can hand the terminal an OSC
 * title sequence at a moment of its choosing.
 */
export interface EchoServer {
  port: number;
  server: Server;
  sockets: Socket[];
  /** Everything the server has received from the app, concatenated. */
  received: () => string;
  /** Push raw bytes to every connected client. */
  send: (data: string) => void;
  close: () => Promise<void>;
}

export function startEchoServer(): Promise<EchoServer> {
  return new Promise((resolve, reject) => {
    const sockets: Socket[] = [];
    let received = "";

    const server = createServer((socket) => {
      sockets.push(socket);
      socket.on("data", (chunk) => {
        received += chunk.toString("utf8");
      });
      socket.on("error", () => {
        // The app going away mid-test is not this server's problem.
      });
    });

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("Echo server did not bind a TCP port"));
        return;
      }
      resolve({
        port: address.port,
        server,
        sockets,
        received: () => received,
        send: (data) => {
          for (const socket of sockets) {
            socket.write(Buffer.from(data, "utf8"));
          }
        },
        close: async () => {
          for (const socket of sockets) {
            socket.destroy();
          }
          await new Promise<void>((done) => server.close(() => done()));
        }
      });
    });
  });
}

/** An OSC 0 "set window title" sequence, BEL-terminated. Spelled with \u
 *  escapes so the control bytes stay visible in the source. */
export function oscTitle(title: string): string {
  return `\u001b]0;${title}\u0007`;
}

// ---------------------------------------------------------------- Win32

// user32 entry points the specs need, compiled once per PowerShell call.
// EncodedCommand (UTF-16LE base64) is used instead of -Command so none of the
// C# below has to survive a second round of shell quoting.
const PS_PRELUDE = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
[StructLayout(LayoutKind.Sequential)]
public struct HsRect { public int Left; public int Top; public int Right; public int Bottom; }
public static class HsWin32 {
  [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern IntPtr FindWindowExW(IntPtr parent, IntPtr after, string cls, string title);
  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool PostMessageW(IntPtr hwnd, uint msg, IntPtr wparam, IntPtr lparam);
  [DllImport("user32.dll", SetLastError = true)]
  public static extern uint MapVirtualKeyW(uint code, uint mapType);
  [DllImport("user32.dll", SetLastError = true)]
  public static extern IntPtr GetWindow(IntPtr hwnd, uint cmd);
  // CharSet.Unicode is load-bearing: the default marshals the StringBuilder as
  // ANSI into GetClassNameA, and a UTF-16 class name read back that way comes
  // out as its first character alone.
  [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern int GetClassNameW(IntPtr hwnd, StringBuilder buffer, int max);
  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool GetWindowRect(IntPtr hwnd, out HsRect rect);
  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool IsWindow(IntPtr hwnd);
  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool SetWindowPos(IntPtr hwnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
}
'@
`;

function powershell(script: string): string {
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  return execFileSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
    // A timeout is not optional here. This is synchronous, so it blocks the
    // worker's event loop, and Playwright's own test timeout cannot fire while
    // it does — a wedged PowerShell (Get-CimInstance against a stuck WMI
    // service is the realistic one) would hang the run instead of failing it.
    // Every script here is a handful of user32 calls or one CIM query; 15s is
    // far past slow and well short of a hang.
    { encoding: "utf8", windowsHide: true, timeout: 15_000, killSignal: "SIGKILL" }
  ).trim();
}

function splitList(output: string): string[] {
  return output.length === 0 ? [] : output.split(",").map((value) => value.trim());
}

/** The HWND of the app's one BrowserWindow, as the decimal string the ghostty
 *  IPC layer itself uses (ghosttyIpc.ts resolveParentHwnd). */
export async function mainWindowHwnd(app: ElectronApplication): Promise<string> {
  return await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    return win.getNativeWindowHandle().readBigUInt64LE(0).toString();
  });
}

/**
 * Every ghostty surface currently parented into `parentHwnd`. The host creates
 * each surface as a WS_CHILD of the embedder's window in its own registered
 * class (`GhosttyWindow`), so class-scoped FindWindowExW enumeration finds
 * exactly the surfaces and nothing Chromium owns.
 */
export function ghosttySurfaceHwnds(parentHwnd: string): string[] {
  return splitList(
    powershell(`${PS_PRELUDE}
$parent = [IntPtr]::new([int64]${parentHwnd})
$child = [IntPtr]::Zero
$found = New-Object System.Collections.ArrayList
while ($true) {
  $child = [HsWin32]::FindWindowExW($parent, $child, 'GhosttyWindow', $null)
  if ($child -eq [IntPtr]::Zero) { break }
  [void]$found.Add($child.ToInt64())
}
$found -join ','`)
  );
}

/** A child window of the Electron window, as read out of the parent's z-order. */
export interface ChildWindow {
  /** Position in the parent's child z-order; 0 is topmost. */
  zIndex: number;
  hwnd: string;
  className: string;
  visible: boolean;
  /** Screen coordinates, as GetWindowRect reports them. */
  rect: { left: number; top: number; right: number; bottom: number };
}

/**
 * Every child of `parentHwnd` in z-order, topmost first. GW_CHILD (5) hands
 * back the child at the top of the z-order and GW_HWNDNEXT (2) walks down from
 * there, so the index each window lands on *is* its stacking position — which
 * is the whole point: a surface can be alive, visible and correctly positioned
 * and still show nothing because Chromium's own child windows sit above it.
 *
 * Every user32 return value below is checked and throws on failure, because in
 * this helper a swallowed failure degrades into a *passing* test: a discarded
 * GetWindowRect leaves the zero-initialised RECT in place, that sibling's
 * computed overlap is 0, `surfaceOcclusion` filters it out, and the surface
 * reads as unoccluded while the bug is present. A loud failure is the only
 * acceptable outcome for a check whose whole job is to not pass vacuously.
 */
export function childWindowsInZOrder(parentHwnd: string): ChildWindow[] {
  const output = powershell(`${PS_PRELUDE}
$parent = [IntPtr]::new([int64]${parentHwnd})
$child = [HsWin32]::GetWindow($parent, 5)
$i = 0
while ($child -ne [IntPtr]::Zero) {
  # Read the next sibling before touching this one, so a window destroyed while
  # its own properties are being read cannot truncate the walk and silently
  # hide the siblings below it.
  $next = [HsWin32]::GetWindow($child, 2)
  $sb = New-Object System.Text.StringBuilder 256
  if ([HsWin32]::GetClassNameW($child, $sb, $sb.Capacity) -eq 0) {
    throw "GetClassNameW failed for child $($child.ToInt64())"
  }
  $r = New-Object HsRect
  if (-not [HsWin32]::GetWindowRect($child, [ref]$r)) {
    # Deliberately fatal even for the destroyed-mid-enumeration race, which
    # IsWindow distinguishes only to make the message diagnosable. Skipping a
    # gone window would be defensible on its own terms, but it would put a
    # silent "this sibling is not an occluder" path back into the one helper
    # that must never produce one — and these children (Chromium's render
    # widget, the D3D window, the ghostty leaf) are long-lived, so the race is
    # theoretical while the vacuous pass would be permanent.
    $live = [HsWin32]::IsWindow($child)
    throw "GetWindowRect failed for child $($child.ToInt64()) (IsWindow=$live)"
  }
  $vis = [HsWin32]::IsWindowVisible($child)
  "$i|$($child.ToInt64())|$vis|$($r.Left)|$($r.Top)|$($r.Right)|$($r.Bottom)|$($sb.ToString())"
  $i++
  $child = $next
}`);

  if (output.length === 0) {
    return [];
  }
  return output.split(/\r?\n/).map((line) => {
    const [zIndex, hwnd, visible, left, top, right, bottom, ...rest] = line.split("|");
    return {
      zIndex: Number(zIndex),
      hwnd: hwnd.trim(),
      className: rest.join("|").trim(),
      visible: visible.trim() === "True",
      rect: {
        left: Number(left),
        top: Number(top),
        right: Number(right),
        bottom: Number(bottom)
      }
    };
  });
}

/** A visible sibling stacked above the surface and overlapping its rect. */
export interface Occluder {
  hwnd: string;
  className: string;
  /** Overlapping area as a percentage of the surface's own area. */
  overlapPercent: number;
}

export interface SurfaceOcclusion {
  /** The surface's own position in the parent's child z-order; 0 is topmost. */
  zIndex: number;
  /** How many children the parent has, for context in a failure message. */
  siblingCount: number;
  occluders: Occluder[];
}

/**
 * Where `surfaceHwnd` sits in its parent's child z-order, and what visible
 * sibling above it covers it. This is the one health signal the original blank
 * terminal did not trip: the session was connected, the host alive, the HWND
 * present, visible and correctly positioned, and every event flowing — the
 * surface was simply at the bottom of the stack with
 * Chrome_RenderWidgetHostHWND painted over 100% of it.
 */
export function surfaceOcclusion(parentHwnd: string, surfaceHwnd: string): SurfaceOcclusion {
  const children = childWindowsInZOrder(parentHwnd);
  const surface = children.find((child) => child.hwnd === surfaceHwnd);
  if (surface === undefined) {
    throw new Error(
      `surface ${surfaceHwnd} is not a child of ${parentHwnd}; found ` +
        `[${children.map((child) => `${child.hwnd} ${child.className}`).join(", ")}]`
    );
  }

  const surfaceArea =
    Math.max(0, surface.rect.right - surface.rect.left) *
    Math.max(0, surface.rect.bottom - surface.rect.top);

  const occluders = children
    .filter((child) => child.zIndex < surface.zIndex && child.visible)
    .map((child) => {
      const width = Math.max(
        0,
        Math.min(child.rect.right, surface.rect.right) - Math.max(child.rect.left, surface.rect.left)
      );
      const height = Math.max(
        0,
        Math.min(child.rect.bottom, surface.rect.bottom) - Math.max(child.rect.top, surface.rect.top)
      );
      return {
        hwnd: child.hwnd,
        className: child.className,
        overlapPercent:
          surfaceArea === 0 ? 0 : Math.round(((width * height) / surfaceArea) * 100)
      };
    })
    .filter((occluder) => occluder.overlapPercent > 0);

  return { zIndex: surface.zIndex, siblingCount: children.length, occluders };
}

/** Renders an occlusion result as the failure message a reader can act on —
 *  the occluding window classes are the signal that names this exact bug. */
export function describeOcclusion(occlusion: SurfaceOcclusion): string {
  const stack = occlusion.occluders
    .map((occluder) => `${occluder.className} (${occluder.overlapPercent}% of the surface)`)
    .join(", ");
  return (
    `ghostty surface is at z-index ${occlusion.zIndex} of ${occlusion.siblingCount} children ` +
    `and is covered by: ${stack}`
  );
}

/**
 * Restacks a window within its parent. Used only to prove the occlusion check
 * can fail — burying the surface reproduces the blank-terminal state exactly,
 * without touching the app's own code paths.
 */
export function setChildZOrder(hwnd: string, position: "top" | "bottom"): void {
  // HWND_TOP = 0, HWND_BOTTOM = 1; SWP_NOSIZE|SWP_NOMOVE|SWP_NOACTIVATE = 0x13.
  const insertAfter = position === "top" ? 0 : 1;
  powershell(`${PS_PRELUDE}
$ok = [HsWin32]::SetWindowPos([IntPtr]::new([int64]${hwnd}), [IntPtr]::new(${insertAfter}), 0, 0, 0, 0, 0x13)
if (-not $ok) { throw "SetWindowPos failed" }`);
}

/**
 * Types `text` at a ghostty surface by posting the WM_KEYDOWN/WM_KEYUP pair a
 * real keyboard would produce, scan code and transition bits included. Posted
 * rather than injected on purpose: SendInput targets the foreground thread's
 * focus window, which a CI session may not have at all, whereas an unmodified
 * key carries no modifier state and needs none — the same trade-off the Zig
 * host's own harness makes for its keyboard check.
 *
 * Restricted to [a-z0-9] because those characters are their own virtual-key
 * codes; anything else would need a layout-aware mapping this does not do.
 */
export function typeIntoSurface(hwnd: string, text: string): void {
  if (!/^[a-z0-9]+$/.test(text)) {
    throw new Error(`typeIntoSurface only handles [a-z0-9]; got ${JSON.stringify(text)}`);
  }

  powershell(`${PS_PRELUDE}
$hwnd = [IntPtr]::new([int64]${hwnd})
foreach ($ch in '${text}'.ToUpper().ToCharArray()) {
  $vk = [uint32][char]$ch
  $sc = [HsWin32]::MapVirtualKeyW($vk, 0)
  $down = [int64]1 -bor ([int64]$sc -shl 16)
  $up = $down -bor 3221225472
  [void][HsWin32]::PostMessageW($hwnd, 0x0100, [IntPtr]::new([int64]$vk), [IntPtr]::new($down))
  Start-Sleep -Milliseconds 25
  [void][HsWin32]::PostMessageW($hwnd, 0x0101, [IntPtr]::new([int64]$vk), [IntPtr]::new($up))
  Start-Sleep -Milliseconds 25
}`);
}

/**
 * PID of the Electron main process — asked of the app itself rather than read
 * off `app.process().pid`, which is the process Playwright spawned and not the
 * one that ends up running main: they differ, and only the latter is the
 * parent of the host process below.
 */
export function mainProcessPid(app: ElectronApplication): Promise<number> {
  return app.evaluate(() => process.pid);
}

/**
 * PIDs of ghostty-host.exe processes spawned by this app instance. Scoped by
 * parent PID rather than matched by image name alone so a developer's own
 * HyperShell (or a second suite) running alongside is never the one killed.
 */
export function ghosttyHostPids(electronMainPid: number): string[] {
  return splitList(
    powershell(
      `(Get-CimInstance Win32_Process -Filter "Name='ghostty-host.exe'" |` +
        ` Where-Object { $_.ParentProcessId -eq ${electronMainPid} } |` +
        ` ForEach-Object { $_.ProcessId }) -join ','`
    )
  );
}

export function killProcess(pid: string): void {
  powershell(`Stop-Process -Id ${pid} -Force`);
}

// ------------------------------------------------------------- app driving

/** Session and ghostty event shapes, as the collectors below store them. */
export interface CollectedSessionEvent {
  type: string;
  sessionId: string;
  state?: string;
}

export interface CollectedGhosttyEvent {
  kind: string;
  sessionId: string;
  cols?: number;
  rows?: number;
  title?: string;
}

/**
 * Starts recording both event streams in the renderer. Must run before a tab
 * is opened: `data` events aside, everything these specs assert on — status
 * transitions, grid sizes, titles — is delivered once and never replayed.
 */
export async function collectEvents(page: Page): Promise<void> {
  await page.evaluate(() => {
    const sessionEvents: unknown[] = [];
    const ghosttyEvents: unknown[] = [];
    const target = window as unknown as {
      __sessionEvents: unknown[];
      __ghosttyEvents: unknown[];
    };
    target.__sessionEvents = sessionEvents;
    target.__ghosttyEvents = ghosttyEvents;
    window.hypershell.onSessionEvent((event) => sessionEvents.push(event));
    window.hypershell.onGhosttyEvent((event) => ghosttyEvents.push(event));
  });
}

export function sessionEvents(page: Page): Promise<CollectedSessionEvent[]> {
  return page.evaluate(
    () => (window as unknown as { __sessionEvents: CollectedSessionEvent[] }).__sessionEvents
  ) as Promise<CollectedSessionEvent[]>;
}

export function ghosttyEvents(page: Page): Promise<CollectedGhosttyEvent[]> {
  return page.evaluate(
    () => (window as unknown as { __ghosttyEvents: CollectedGhosttyEvent[] }).__ghosttyEvents
  ) as Promise<CollectedGhosttyEvent[]>;
}

/**
 * Opens a raw-TCP tab against `port` through the real UI — command palette,
 * then the quick-connect dialog — because everything under test hangs off a
 * mounted terminal pane: the surface is created by the pane's effect, and the
 * OSC title lands on a tab that has to exist in the layout store. Calling
 * `openSession` over the bridge would give a session with no pane and no tab.
 *
 * Returns the session id main assigned, which is not the placeholder id the
 * tab was created with (useTerminalSession swaps it in on connect).
 */
export async function openRawTcpTab(page: Page, port: number): Promise<string> {
  await page.keyboard.press("Control+Shift+P");
  const palette = page.getByRole("dialog", { name: "Command Palette" });
  await palette.getByPlaceholder("Search commands...").fill("Telnet");
  await palette.getByRole("button", { name: /Telnet \/ Raw TCP Connect/ }).click();

  await page.getByPlaceholder("192.168.1.1 or hostname").fill("127.0.0.1");
  await page.getByPlaceholder("Port", { exact: true }).fill(String(port));
  await page.getByRole("button", { name: "Raw TCP", exact: true }).click();
  await page.getByRole("button", { name: "Connect", exact: true }).click();

  await expect(page.getByTestId("ghostty-pane")).toBeAttached();

  const connectedSessionId = async (): Promise<string | undefined> =>
    (await sessionEvents(page)).find(
      (event) => event.type === "status" && event.state === "connected"
    )?.sessionId;

  await expect.poll(connectedSessionId, { timeout: 30_000 }).toBeDefined();

  const sessionId = await connectedSessionId();
  if (sessionId === undefined) {
    throw new Error("no session reported connected");
  }
  return sessionId;
}

/**
 * Waits until the host has actually built a surface for `sessionId`. The host
 * emits grid_size on create, so a grid event is the first moment a feed or a
 * keystroke can be expected to land somewhere — before it, `feedData` is a
 * legitimate no-op and posted keys have no window to go to.
 */
export async function waitForSurface(page: Page, sessionId: string): Promise<void> {
  await expect
    .poll(async () => {
      const events = await ghosttyEvents(page);
      return events.some((event) => event.kind === "grid" && event.sessionId === sessionId);
    }, { timeout: 30_000 })
    .toBe(true);
}
