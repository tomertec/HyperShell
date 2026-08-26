import { describe, expect, it, vi, beforeEach } from "vitest";
import type { IpcMainInvokeEvent } from "electron";
import {
  ghosttyBoundsSchema,
  ghosttySurfaceCreateRequestSchema,
  ghosttyEventSchema,
  ghosttyOverlayGuardRequestSchema,
  ghosttyUpdateConfigRequestSchema,
  ghosttySurfaceConfigRequestSchema,
  ghosttyReplayOpenRequestSchema,
  ghosttyReplayControlRequestSchema,
  ghosttyReplayCloseRequestSchema,
  setBroadcastTargetsRequestSchema,
  ipcChannels
} from "@hypershell/shared";
import type { GhosttyHostClient } from "../ghosttyHost/ghosttyHostClient";
import type { ReplayDriver } from "../ghosttyHost/replayDriver";

const fromWebContents = vi.fn();
vi.mock("electron", () => ({
  BrowserWindow: {
    fromWebContents: (...args: unknown[]) => fromWebContents(...args)
  }
}));

import { registerGhosttyIpc, type RegisterGhosttyIpcOptions } from "./ghosttyIpc";

/** Stands in for the config blob the renderer's settings push produced — what
 *  a per-surface override has to be layered onto. */
const GLOBAL_BLOB = "font-family = Test Mono\nfont-size = 13";

function createFakeIpcMain() {
  const handlers = new Map<
    string,
    (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
  >();

  return {
    handle(
      channel: string,
      handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
    ) {
      handlers.set(channel, handler);
    },
    removeHandler(channel: string) {
      handlers.delete(channel);
    },
    invoke(channel: string, request?: unknown) {
      // Real Electron ipcMain.handle always resolves the invoking promise
      // (a synchronous throw inside the handler becomes a rejection, same as
      // an async handler's rejected promise) — mirror that here so a
      // schema.parse() throw is testable via `.rejects`.
      return Promise.resolve().then(() => {
        const handler = handlers.get(channel);
        if (!handler) {
          throw new Error(`No handler for channel ${channel}`);
        }
        return handler({ sender: {} } as IpcMainInvokeEvent, request);
      });
    },
    hasHandler(channel: string) {
      return handlers.has(channel);
    }
  };
}

function createFakeClient(): GhosttyHostClient {
  return {
    createSurface: vi.fn(),
    destroySurface: vi.fn(),
    setBounds: vi.fn(),
    resyncBounds: vi.fn(),
    setOverlayVisible: vi.fn(),
    setVisible: vi.fn(),
    focus: vi.fn(),
    feedData: vi.fn(),
    sessionClosed: vi.fn(),
    updateGlobalConfig: vi.fn(),
    updateSurfaceConfig: vi.fn(),
    sendCommand: vi.fn(),
    createReplaySurface: vi.fn(),
    dispose: vi.fn(),
    onFrame: vi.fn(),
    onRestart: vi.fn(),
    onHostDead: vi.fn()
  };
}

function createFakeReplayDriver(): ReplayDriver {
  return {
    open: vi.fn(async () => "replay:1"),
    control: vi.fn(),
    close: vi.fn()
  };
}

const validBounds = { x: 0, y: 0, w: 800, h: 600 };
const validTheme = {
  background: "#07111f",
  foreground: "#e5eefb",
  cursor: "#7dd3fc",
  selectionBackground: "#264759",
  selectionForeground: "#e5eefb",
  palette: [
    "#0f172a",
    "#ef4444",
    "#22c55e",
    "#eab308",
    "#38bdf8",
    "#c084fc",
    "#2dd4bf",
    "#e2e8f0",
    "#334155",
    "#f87171",
    "#4ade80",
    "#facc15",
    "#7dd3fc",
    "#d8b4fe",
    "#5eead4",
    "#f8fafc"
  ]
};

describe("ghostty schemas", () => {
  it("parses a valid surface-create request", () => {
    const parsed = ghosttySurfaceCreateRequestSchema.parse({
      sessionId: "s1",
      bounds: validBounds
    });
    expect(parsed.sessionId).toBe("s1");
  });

  it("rejects bounds with a negative width", () => {
    expect(() => ghosttyBoundsSchema.parse({ x: 0, y: 0, w: -1, h: 10 })).toThrow();
  });

  it("parses each valid ghostty event kind", () => {
    expect(
      ghosttyEventSchema.parse({ kind: "grid", sessionId: "s1", cols: 80, rows: 24 })
    ).toMatchObject({ kind: "grid" });
    expect(ghosttyEventSchema.parse({ kind: "bell", sessionId: "s1" })).toMatchObject({
      kind: "bell"
    });
    expect(
      ghosttyEventSchema.parse({ kind: "crashed", sessionId: "s1", error: "oops" })
    ).toMatchObject({ kind: "crashed", error: "oops" });
  });

  it("rejects an unknown event kind", () => {
    expect(() => ghosttyEventSchema.parse({ kind: "explode", sessionId: "s1" })).toThrow();
  });

  it("parses a valid overlay-guard request", () => {
    expect(ghosttyOverlayGuardRequestSchema.parse({ hidden: true })).toEqual({ hidden: true });
  });

  it("parses a valid update-config request", () => {
    const parsed = ghosttyUpdateConfigRequestSchema.parse({
      fontFamily: "monospace",
      fontSize: 13,
      cursorBlink: true,
      scrollback: 5000,
      theme: validTheme
    });
    expect(parsed.theme.palette).toHaveLength(16);
  });

  it("rejects a theme color that isn't #rrggbb hex", () => {
    expect(() =>
      ghosttyUpdateConfigRequestSchema.parse({
        fontFamily: "monospace",
        fontSize: 13,
        cursorBlink: true,
        scrollback: 5000,
        theme: { ...validTheme, background: "rgba(0,0,0,0.5)" }
      })
    ).toThrow();
  });

  it("rejects a palette with fewer than 16 entries", () => {
    expect(() =>
      ghosttyUpdateConfigRequestSchema.parse({
        fontFamily: "monospace",
        fontSize: 13,
        cursorBlink: true,
        scrollback: 5000,
        theme: { ...validTheme, palette: validTheme.palette.slice(0, 15) }
      })
    ).toThrow();
  });

  it("parses a valid set-broadcast-targets request", () => {
    expect(
      setBroadcastTargetsRequestSchema.parse({ enabled: true, targetSessionIds: ["a", "b"] })
    ).toEqual({ enabled: true, targetSessionIds: ["a", "b"] });
  });

  it("parses a valid surface-config request", () => {
    expect(
      ghosttySurfaceConfigRequestSchema.parse({ sessionId: "s1", config: "font-size = 13" })
    ).toEqual({ sessionId: "s1", config: "font-size = 13" });
  });

  it("parses a valid replay-open request", () => {
    const parsed = ghosttyReplayOpenRequestSchema.parse({ recordingId: "rec-1", bounds: validBounds });
    expect(parsed).toEqual({ recordingId: "rec-1", bounds: validBounds });
  });

  it("parses each valid replay-control action, with frameIndex only meaningful for seek", () => {
    expect(ghosttyReplayControlRequestSchema.parse({ replayId: "replay:1", action: "play" })).toEqual({
      replayId: "replay:1",
      action: "play"
    });
    expect(
      ghosttyReplayControlRequestSchema.parse({ replayId: "replay:1", action: "seek", frameIndex: 3 })
    ).toEqual({ replayId: "replay:1", action: "seek", frameIndex: 3 });
  });

  it("rejects an unknown replay-control action", () => {
    expect(() =>
      ghosttyReplayControlRequestSchema.parse({ replayId: "replay:1", action: "rewind" })
    ).toThrow();
  });

  it("parses a valid replay-close request", () => {
    expect(ghosttyReplayCloseRequestSchema.parse({ replayId: "replay:1" })).toEqual({
      replayId: "replay:1"
    });
  });
});

describe("registerGhosttyIpc handler delegation", () => {
  let ipcMain: ReturnType<typeof createFakeIpcMain>;
  let client: GhosttyHostClient;
  let replayDriver: ReplayDriver;
  let options: RegisterGhosttyIpcOptions;
  let setGlobalConfigBlob: ReturnType<typeof vi.fn>;
  let setBroadcastState: ReturnType<typeof vi.fn>;
  let ensureHostStarted: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fromWebContents.mockReset();
    fromWebContents.mockReturnValue({
      getNativeWindowHandle: () => {
        const buf = Buffer.alloc(8);
        buf.writeBigUInt64LE(BigInt(12345), 0);
        return buf;
      }
    });

    ipcMain = createFakeIpcMain();
    client = createFakeClient();
    replayDriver = createFakeReplayDriver();
    setGlobalConfigBlob = vi.fn();
    setBroadcastState = vi.fn();
    ensureHostStarted = vi.fn().mockResolvedValue(undefined);
    options = {
      client,
      replayDriver,
      ensureHostStarted,
      getGlobalConfigBlob: () => GLOBAL_BLOB,
      setGlobalConfigBlob,
      setBroadcastState
    };
    registerGhosttyIpc(ipcMain as any, options);
  });

  it("surfaceCreate resolves the parent HWND from the window and delegates to the client", async () => {
    await ipcMain.invoke(ipcChannels.ghostty.surfaceCreate, {
      sessionId: "s1",
      bounds: validBounds
    });

    expect(ensureHostStarted).toHaveBeenCalledTimes(1);
    expect(client.createSurface).toHaveBeenCalledWith("s1", "12345", validBounds, undefined);
  });

  it("surfaceCreate turns a per-tab fontSize into a surface config layered on the global blob", async () => {
    await ipcMain.invoke(ipcChannels.ghostty.surfaceCreate, {
      sessionId: "s1",
      bounds: validBounds,
      fontSize: 17
    });

    // The whole global config has to come along: a surface config replaces the
    // global one rather than extending it, so sending the override alone would
    // strip the surface's fonts, theme and scrollback.
    expect(client.createSurface).toHaveBeenCalledWith(
      "s1",
      "12345",
      validBounds,
      `${GLOBAL_BLOB}\nfont-size = 17`
    );
  });

  it("surfaceDestroy delegates to client.destroySurface", async () => {
    await ipcMain.invoke(ipcChannels.ghostty.surfaceDestroy, { sessionId: "s1" });
    expect(client.destroySurface).toHaveBeenCalledWith("s1");
  });

  it("surfaceBounds calls client.setBounds with the parsed args", async () => {
    await ipcMain.invoke(ipcChannels.ghostty.surfaceBounds, {
      sessionId: "s1",
      bounds: validBounds
    });
    expect(client.setBounds).toHaveBeenCalledWith("s1", validBounds);
  });

  it("surfaceVisible delegates to client.setVisible", async () => {
    await ipcMain.invoke(ipcChannels.ghostty.surfaceVisible, { sessionId: "s1", visible: false });
    expect(client.setVisible).toHaveBeenCalledWith("s1", false);
  });

  it("surfaceFocus delegates to client.focus", async () => {
    await ipcMain.invoke(ipcChannels.ghostty.surfaceFocus, { sessionId: "s1" });
    expect(client.focus).toHaveBeenCalledWith("s1");
  });

  it("surfaceCommand delegates to client.sendCommand", async () => {
    await ipcMain.invoke(ipcChannels.ghostty.surfaceCommand, { sessionId: "s1", command: "clear" });
    expect(client.sendCommand).toHaveBeenCalledWith("s1", "clear");
  });

  it("overlayGuard inverts hidden into client.setOverlayVisible", async () => {
    await ipcMain.invoke(ipcChannels.ghostty.overlayGuard, { hidden: true });
    expect(client.setOverlayVisible).toHaveBeenCalledWith(false);

    await ipcMain.invoke(ipcChannels.ghostty.overlayGuard, { hidden: false });
    expect(client.setOverlayVisible).toHaveBeenCalledWith(true);
  });

  it("updateConfig maps the resolved theme through ghosttyConfigFromSettings and calls the client", async () => {
    await ipcMain.invoke(ipcChannels.ghostty.updateConfig, {
      fontFamily: "monospace",
      fontSize: 13,
      cursorBlink: true,
      scrollback: 5000,
      theme: validTheme
    });

    expect(setGlobalConfigBlob).toHaveBeenCalledTimes(1);
    const blob = setGlobalConfigBlob.mock.calls[0][0] as string;
    expect(blob).toContain("font-family = monospace");
    // palette[0] must land on ANSI index 0 ("black"), confirming the
    // array->named-field mapping order matches ghosttyConfigFromSettings.ts.
    expect(blob).toContain(`palette = 0=${validTheme.palette[0]}`);
    expect(blob).toContain(`palette = 15=${validTheme.palette[15]}`);
    expect(client.updateGlobalConfig).toHaveBeenCalledTimes(1);
  });

  it("surfaceConfig layers the renderer's override onto the current global blob", async () => {
    await ipcMain.invoke(ipcChannels.ghostty.surfaceConfig, { sessionId: "s1", config: "font-size = 15" });
    expect(client.updateSurfaceConfig).toHaveBeenCalledWith(
      "s1",
      `${GLOBAL_BLOB}\nfont-size = 15`
    );
  });

  it("replayOpen resolves the parent HWND, ensures the host started, and returns the driver's replayId", async () => {
    const result = await ipcMain.invoke(ipcChannels.ghostty.replayOpen, {
      recordingId: "rec-1",
      bounds: validBounds
    });

    expect(ensureHostStarted).toHaveBeenCalledTimes(1);
    expect(replayDriver.open).toHaveBeenCalledWith("rec-1", "12345", validBounds);
    expect(result).toEqual({ replayId: "replay:1" });
  });

  it("replayControl delegates to the driver with the parsed action and frameIndex", async () => {
    await ipcMain.invoke(ipcChannels.ghostty.replayControl, {
      replayId: "replay:1",
      action: "seek",
      frameIndex: 4
    });
    expect(replayDriver.control).toHaveBeenCalledWith("replay:1", "seek", 4);
  });

  it("replayClose delegates to the driver", async () => {
    await ipcMain.invoke(ipcChannels.ghostty.replayClose, { replayId: "replay:1" });
    expect(replayDriver.close).toHaveBeenCalledWith("replay:1");
  });

  it("session:set-broadcast-targets delegates to setBroadcastState", async () => {
    await ipcMain.invoke(ipcChannels.session.broadcastTargets, {
      enabled: true,
      targetSessionIds: ["s1", "s2"]
    });
    expect(setBroadcastState).toHaveBeenCalledWith({ enabled: true, targetSessionIds: ["s1", "s2"] });
  });

  it("rejects an invalid request before touching the client", async () => {
    await expect(
      ipcMain.invoke(ipcChannels.ghostty.surfaceBounds, {
        sessionId: "s1",
        bounds: { x: 0, y: 0, w: -1, h: 10 }
      })
    ).rejects.toThrow();
    expect(client.setBounds).not.toHaveBeenCalled();
  });

  it("cleanup removes every handler it registered", async () => {
    const cleanup = registerGhosttyIpc(ipcMain as any, options);
    cleanup();
    await expect(ipcMain.invoke(ipcChannels.ghostty.surfaceBounds, {})).rejects.toThrow(
      /No handler/
    );
  });
});

describe("registerGhosttyIpc with an unavailable client", () => {
  it("fails loudly instead of silently no-oping", async () => {
    const ipcMain = createFakeIpcMain();
    registerGhosttyIpc(ipcMain as any, {
      client: null,
      replayDriver: null,
      ensureHostStarted: vi.fn().mockResolvedValue(undefined),
      getGlobalConfigBlob: () => "",
      setGlobalConfigBlob: vi.fn(),
      setBroadcastState: vi.fn()
    });

    await expect(
      ipcMain.invoke(ipcChannels.ghostty.surfaceDestroy, { sessionId: "s1" })
    ).rejects.toThrow(/ghostty is unavailable/);
  });

  it("replay channels also fail loudly when the driver is unavailable", async () => {
    const ipcMain = createFakeIpcMain();
    registerGhosttyIpc(ipcMain as any, {
      client: null,
      replayDriver: null,
      ensureHostStarted: vi.fn().mockResolvedValue(undefined),
      getGlobalConfigBlob: () => "",
      setGlobalConfigBlob: vi.fn(),
      setBroadcastState: vi.fn()
    });

    await expect(
      ipcMain.invoke(ipcChannels.ghostty.replayOpen, { recordingId: "rec-1", bounds: validBounds })
    ).rejects.toThrow(/ghostty is unavailable/);
    await expect(
      ipcMain.invoke(ipcChannels.ghostty.replayControl, { replayId: "replay:1", action: "play" })
    ).rejects.toThrow(/ghostty is unavailable/);
    await expect(
      ipcMain.invoke(ipcChannels.ghostty.replayClose, { replayId: "replay:1" })
    ).rejects.toThrow(/ghostty is unavailable/);
  });
});
