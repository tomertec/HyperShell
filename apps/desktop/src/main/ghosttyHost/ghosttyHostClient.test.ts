import { describe, expect, test, vi } from "vitest";
import { createGhosttyHostClient, type GhosttyHostClient } from "./ghosttyHostClient";
import type { GhosttyHostProcess } from "./hostProcess";
import { FrameType, type Frame } from "./protocol";

interface FakeHost {
  host: GhosttyHostProcess;
  sendCalls: Array<{ type: number; surfaceId: number; payload: Buffer }>;
}

function makeFakeHost(): FakeHost {
  const sendCalls: Array<{ type: number; surfaceId: number; payload: Buffer }> = [];
  const host: GhosttyHostProcess = {
    start: vi.fn(async () => {}),
    send: vi.fn((type: number, surfaceId: number, payload: Buffer | string) => {
      const buf = typeof payload === "string" ? Buffer.from(payload) : payload;
      sendCalls.push({ type, surfaceId, payload: buf });
    }),
    stop: vi.fn(),
    isAlive: vi.fn(() => true)
  };
  return { host, sendCalls };
}

/** Simulates the host delivering a decoded frame to the client, the same way
 *  a real GhosttyHostProcess's `onFrame` callback would (wired by the caller
 *  that constructs both host and client — see ghosttyHostClient.ts's header
 *  comment on `onFrame`/`onRestart`). */
function injectFrame(client: GhosttyHostClient, frame: Frame): void {
  client.onFrame(frame);
}

describe("createGhosttyHostClient", () => {
  test("createSurface sends 0x02 with the expected JSON payload and registers the mapping", () => {
    const { host, sendCalls } = makeFakeHost();
    const writeSession = vi.fn();
    const getGlobalConfig = vi.fn(() => "global-config-text");
    const client = createGhosttyHostClient({
      host,
      writeSession,
      resizeSession: vi.fn(),
      emitGhosttyEvent: vi.fn(),
      getBroadcastTargets: () => null,
      getGlobalConfig
    });

    client.createSurface("session-1", "0xDEADBEEF", { x: 0, y: 0, w: 800, h: 600 });

    expect(sendCalls).toHaveLength(1);
    expect(sendCalls[0]!.type).toBe(FrameType.createSurface);
    expect(sendCalls[0]!.surfaceId).toBe(1);
    expect(JSON.parse(sendCalls[0]!.payload.toString())).toEqual({
      parentHwnd: "0xDEADBEEF",
      x: 0,
      y: 0,
      w: 800,
      h: 600,
      config: "global-config-text"
    });

    // Registration: a frame addressed to the assigned surfaceId routes back
    // to this sessionId.
    injectFrame(client, { type: FrameType.input, surfaceId: 1, payload: Buffer.from("ls\n") });
    expect(writeSession).toHaveBeenCalledWith("session-1", "ls\n");
  });

  test("an injected input frame writes to the frame's own session when broadcast targets is null", () => {
    const { host, sendCalls } = makeFakeHost();
    const writeSession = vi.fn();
    const client = createGhosttyHostClient({
      host,
      writeSession,
      resizeSession: vi.fn(),
      emitGhosttyEvent: vi.fn(),
      getBroadcastTargets: () => null,
      getGlobalConfig: () => ""
    });

    client.createSurface("session-1", "hwnd", { x: 0, y: 0, w: 1, h: 1 });
    const surfaceId = sendCalls[0]!.surfaceId;

    injectFrame(client, { type: FrameType.input, surfaceId, payload: Buffer.from("ls\n") });

    expect(writeSession).toHaveBeenCalledTimes(1);
    expect(writeSession).toHaveBeenCalledWith("session-1", "ls\n");
  });

  test("an injected input frame fans out to every broadcast target", () => {
    const { host, sendCalls } = makeFakeHost();
    const writeSession = vi.fn();
    const client = createGhosttyHostClient({
      host,
      writeSession,
      resizeSession: vi.fn(),
      emitGhosttyEvent: vi.fn(),
      getBroadcastTargets: () => ["session-a", "session-b", "session-c"],
      getGlobalConfig: () => ""
    });

    client.createSurface("session-1", "hwnd", { x: 0, y: 0, w: 1, h: 1 });
    const surfaceId = sendCalls[0]!.surfaceId;

    injectFrame(client, { type: FrameType.input, surfaceId, payload: Buffer.from("ls\n") });

    expect(writeSession).toHaveBeenCalledTimes(3);
    expect(writeSession).toHaveBeenNthCalledWith(1, "session-a", "ls\n");
    expect(writeSession).toHaveBeenNthCalledWith(2, "session-b", "ls\n");
    expect(writeSession).toHaveBeenNthCalledWith(3, "session-c", "ls\n");
  });

  test("an injected gridSize frame resizes the session and emits a grid event", () => {
    const { host, sendCalls } = makeFakeHost();
    const resizeSession = vi.fn();
    const emitGhosttyEvent = vi.fn();
    const client = createGhosttyHostClient({
      host,
      writeSession: vi.fn(),
      resizeSession,
      emitGhosttyEvent,
      getBroadcastTargets: () => null,
      getGlobalConfig: () => ""
    });

    client.createSurface("session-1", "hwnd", { x: 0, y: 0, w: 1, h: 1 });
    const surfaceId = sendCalls[0]!.surfaceId;

    injectFrame(client, {
      type: FrameType.gridSize,
      surfaceId,
      payload: Buffer.from(JSON.stringify({ cols: 80, rows: 24, cellW: 9, cellH: 18 }))
    });

    expect(resizeSession).toHaveBeenCalledTimes(1);
    expect(resizeSession).toHaveBeenCalledWith("session-1", 80, 24);
    expect(emitGhosttyEvent).toHaveBeenCalledWith({ kind: "grid", sessionId: "session-1", cols: 80, rows: 24 });
  });

  test("a simulated restart resends global config and recreates every registered surface", () => {
    const { host, sendCalls } = makeFakeHost();
    const getGlobalConfig = vi.fn(() => "fresh-config");
    const client = createGhosttyHostClient({
      host,
      writeSession: vi.fn(),
      resizeSession: vi.fn(),
      emitGhosttyEvent: vi.fn(),
      getBroadcastTargets: () => null,
      getGlobalConfig
    });

    client.createSurface("session-1", "hwnd-1", { x: 0, y: 0, w: 100, h: 100 });
    client.createSurface("session-2", "hwnd-2", { x: 10, y: 10, w: 200, h: 200 });
    sendCalls.length = 0; // discard the two createSurface calls from setup above

    client.onRestart();

    const configFrames = sendCalls.filter((c) => c.type === FrameType.updateConfig);
    expect(configFrames).toHaveLength(1);
    expect(configFrames[0]!.surfaceId).toBe(0);
    expect(configFrames[0]!.payload.toString()).toBe("fresh-config");

    const createFrames = sendCalls.filter((c) => c.type === FrameType.createSurface);
    expect(createFrames).toHaveLength(2);
    const payloads = createFrames.map((c) => JSON.parse(c.payload.toString()) as Record<string, unknown>);
    expect(payloads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ parentHwnd: "hwnd-1", x: 0, y: 0, w: 100, h: 100 }),
        expect.objectContaining({ parentHwnd: "hwnd-2", x: 10, y: 10, w: 200, h: 200 })
      ])
    );
  });

  test("setVisible sends 0x05 with a {visible} object payload", () => {
    const { host, sendCalls } = makeFakeHost();
    const client = createGhosttyHostClient({
      host,
      writeSession: vi.fn(),
      resizeSession: vi.fn(),
      emitGhosttyEvent: vi.fn(),
      getBroadcastTargets: () => null,
      getGlobalConfig: () => ""
    });

    client.createSurface("session-1", "hwnd", { x: 0, y: 0, w: 1, h: 1 });
    sendCalls.length = 0;

    client.setVisible("session-1", false);

    expect(sendCalls).toHaveLength(1);
    expect(sendCalls[0]!.type).toBe(FrameType.setVisible);
    expect(JSON.parse(sendCalls[0]!.payload.toString())).toEqual({ visible: false });
  });

  test("sendCommand sends 0x0A with a {cmd} object payload", () => {
    const { host, sendCalls } = makeFakeHost();
    const client = createGhosttyHostClient({
      host,
      writeSession: vi.fn(),
      resizeSession: vi.fn(),
      emitGhosttyEvent: vi.fn(),
      getBroadcastTargets: () => null,
      getGlobalConfig: () => ""
    });

    client.createSurface("session-1", "hwnd", { x: 0, y: 0, w: 1, h: 1 });
    sendCalls.length = 0;

    client.sendCommand("session-1", "clear");

    expect(sendCalls).toHaveLength(1);
    expect(sendCalls[0]!.type).toBe(FrameType.command);
    expect(JSON.parse(sendCalls[0]!.payload.toString())).toEqual({ cmd: "clear" });
  });

  test("guard hidden composes with a tab-visible surface: it is hidden", () => {
    const { host, sendCalls } = makeFakeHost();
    const client = createGhosttyHostClient({
      host,
      writeSession: vi.fn(),
      resizeSession: vi.fn(),
      emitGhosttyEvent: vi.fn(),
      getBroadcastTargets: () => null,
      getGlobalConfig: () => ""
    });

    client.createSurface("session-1", "hwnd", { x: 0, y: 0, w: 1, h: 1 });
    sendCalls.length = 0;

    client.setOverlayVisible(false);

    expect(sendCalls).toHaveLength(1);
    expect(sendCalls[0]!.type).toBe(FrameType.setVisible);
    expect(JSON.parse(sendCalls[0]!.payload.toString())).toEqual({ visible: false });
  });

  test("releasing the guard reshows tab-visible surfaces but leaves tab-hidden surfaces hidden", () => {
    const { host, sendCalls } = makeFakeHost();
    const client = createGhosttyHostClient({
      host,
      writeSession: vi.fn(),
      resizeSession: vi.fn(),
      emitGhosttyEvent: vi.fn(),
      getBroadcastTargets: () => null,
      getGlobalConfig: () => ""
    });

    client.createSurface("session-1", "hwnd-1", { x: 0, y: 0, w: 1, h: 1 }); // stays tab-visible
    client.createSurface("session-2", "hwnd-2", { x: 0, y: 0, w: 1, h: 1 });
    client.setVisible("session-2", false); // hidden by its own tab state
    client.setOverlayVisible(true); // guard already released; only the hide below matters
    client.setOverlayVisible(false); // guard hides both
    sendCalls.length = 0;

    client.setOverlayVisible(true); // guard releases

    const bySurface = new Map(sendCalls.map((c) => [c.surfaceId, JSON.parse(c.payload.toString())]));
    expect(bySurface.get(1)).toEqual({ visible: true }); // session-1: tab-visible -> reappears
    expect(bySurface.get(2)).toEqual({ visible: false }); // session-2: still tab-hidden
  });

  test("a replay surface is exempt from the overlay guard and stays visible while it hides everything else", () => {
    const { host, sendCalls } = makeFakeHost();
    const client = createGhosttyHostClient({
      host,
      writeSession: vi.fn(),
      resizeSession: vi.fn(),
      emitGhosttyEvent: vi.fn(),
      getBroadcastTargets: () => null,
      getGlobalConfig: () => ""
    });

    client.createSurface("session-1", "hwnd-1", { x: 0, y: 0, w: 1, h: 1 });
    const replaySessionId = client.createReplaySurface("hwnd-2", { x: 0, y: 0, w: 1, h: 1 });
    sendCalls.length = 0;

    client.setOverlayVisible(false);

    // The ordinary surface got hidden...
    expect(sendCalls).toHaveLength(1);
    expect(sendCalls[0]!.surfaceId).toBe(1);
    expect(JSON.parse(sendCalls[0]!.payload.toString())).toEqual({ visible: false });

    // ...but the exempt replay surface never received a setVisible frame at
    // all, since the guard doesn't touch it.
    expect(replaySessionId).toBe("replay:1");
    expect(sendCalls.some((c) => c.surfaceId === 2)).toBe(false);
  });

  test("sessionClosed sends {} for a null exitCode and {exitCode} for a number", () => {
    const { host, sendCalls } = makeFakeHost();
    const client = createGhosttyHostClient({
      host,
      writeSession: vi.fn(),
      resizeSession: vi.fn(),
      emitGhosttyEvent: vi.fn(),
      getBroadcastTargets: () => null,
      getGlobalConfig: () => ""
    });

    client.createSurface("session-1", "hwnd", { x: 0, y: 0, w: 1, h: 1 });
    sendCalls.length = 0;

    client.sessionClosed("session-1", null);
    client.sessionClosed("session-1", 0);

    expect(sendCalls).toHaveLength(2);
    expect(JSON.parse(sendCalls[0]!.payload.toString())).toEqual({});
    expect(JSON.parse(sendCalls[1]!.payload.toString())).toEqual({ exitCode: 0 });
  });
});

function makeClient(overrides: Partial<Parameters<typeof createGhosttyHostClient>[0]> = {}) {
  const { host, sendCalls } = makeFakeHost();
  const client = createGhosttyHostClient({
    host,
    writeSession: vi.fn(),
    resizeSession: vi.fn(),
    emitGhosttyEvent: vi.fn(),
    getBroadcastTargets: () => null,
    getGlobalConfig: () => "",
    ...overrides
  });
  return { client, sendCalls };
}

// Surface creation is asynchronous renderer-side (it awaits the host start),
// while visibility/bounds/focus are synchronous. On a cold start with restored
// tabs, every hidden tab's setVisible(false) lands before its surface exists.
describe("calls that arrive before the surface does", () => {
  test("setVisible(false) before createSurface leaves the new surface hidden", () => {
    const { client, sendCalls } = makeClient();

    client.setVisible("session-1", false);
    expect(sendCalls).toHaveLength(0);

    client.createSurface("session-1", "hwnd", { x: 0, y: 0, w: 10, h: 10 });

    expect(sendCalls).toHaveLength(2);
    expect(sendCalls[0]!.type).toBe(FrameType.createSurface);
    expect(sendCalls[1]!.type).toBe(FrameType.setVisible);
    expect(JSON.parse(sendCalls[1]!.payload.toString())).toEqual({ visible: false });
  });

  test("a surface created while the overlay guard is up is hidden immediately", () => {
    const { client, sendCalls } = makeClient();
    client.setOverlayVisible(false);
    sendCalls.length = 0;

    client.createSurface("session-1", "hwnd", { x: 0, y: 0, w: 10, h: 10 });

    expect(sendCalls.map((c) => c.type)).toEqual([FrameType.createSurface, FrameType.setVisible]);
    expect(JSON.parse(sendCalls[1]!.payload.toString())).toEqual({ visible: false });
  });

  test("a pending setBounds wins over the create call's own bounds", () => {
    const { client, sendCalls } = makeClient();

    client.setBounds("session-1", { x: 5, y: 6, w: 70, h: 80 });
    client.createSurface("session-1", "hwnd", { x: 0, y: 0, w: 10, h: 10 });

    const payload = JSON.parse(sendCalls[0]!.payload.toString());
    expect(payload).toMatchObject({ x: 5, y: 6, w: 70, h: 80 });
  });

  test("a pending focus is delivered once the surface exists", () => {
    const { client, sendCalls } = makeClient();

    client.focus("session-1");
    client.createSurface("session-1", "hwnd", { x: 0, y: 0, w: 10, h: 10 });

    expect(sendCalls.some((c) => c.type === FrameType.focus)).toBe(true);
  });

  test("pending state is consumed once, not replayed onto a later surface", () => {
    const { client, sendCalls } = makeClient();

    client.setVisible("session-1", false);
    client.createSurface("session-1", "hwnd", { x: 0, y: 0, w: 10, h: 10 });
    client.destroySurface("session-1");
    sendCalls.length = 0;

    client.createSurface("session-1", "hwnd", { x: 0, y: 0, w: 10, h: 10 });
    expect(sendCalls.map((c) => c.type)).toEqual([FrameType.createSurface]);
  });
});

describe("surface lifecycle", () => {
  test("re-registering a session destroys the surface it replaces", () => {
    const { client, sendCalls } = makeClient();

    client.createSurface("session-1", "hwnd", { x: 0, y: 0, w: 10, h: 10 });
    const firstSurfaceId = sendCalls[0]!.surfaceId;
    sendCalls.length = 0;

    client.createSurface("session-1", "hwnd", { x: 0, y: 0, w: 10, h: 10 });

    const destroy = sendCalls.find((c) => c.type === FrameType.destroySurface);
    expect(destroy?.surfaceId).toBe(firstSurfaceId);
  });

  test("onHostDead reports a crash to every live session", () => {
    const emitGhosttyEvent = vi.fn();
    const { client } = makeClient({ emitGhosttyEvent });

    client.createSurface("session-1", "hwnd", { x: 0, y: 0, w: 1, h: 1 });
    client.createSurface("session-2", "hwnd", { x: 0, y: 0, w: 1, h: 1 });
    emitGhosttyEvent.mockClear();

    client.onHostDead("host exited (code 1)");

    expect(emitGhosttyEvent).toHaveBeenCalledTimes(2);
    expect(emitGhosttyEvent).toHaveBeenCalledWith({
      kind: "crashed",
      sessionId: "session-1",
      error: "host exited (code 1)"
    });
  });

  test("onHostDead forgets the surfaces, so a retry does not destroy an id no host knows", () => {
    const { client, sendCalls } = makeClient();
    client.createSurface("session-1", "hwnd", { x: 0, y: 0, w: 1, h: 1 });
    client.onHostDead("host exited");
    sendCalls.length = 0;

    client.createSurface("session-1", "hwnd", { x: 0, y: 0, w: 1, h: 1 });

    expect(sendCalls.map((c) => c.type)).toEqual([FrameType.createSurface]);
  });
});

describe("frames from the host", () => {
  test("a malformed JSON payload is dropped instead of thrown", () => {
    const emitGhosttyEvent = vi.fn();
    const resizeSession = vi.fn();
    const { client, sendCalls } = makeClient({ emitGhosttyEvent, resizeSession });
    client.createSurface("session-1", "hwnd", { x: 0, y: 0, w: 1, h: 1 });
    const surfaceId = sendCalls[0]!.surfaceId;
    emitGhosttyEvent.mockClear();

    expect(() =>
      injectFrame(client, {
        type: FrameType.gridSize,
        surfaceId,
        payload: Buffer.from("{not json")
      })
    ).not.toThrow();
    expect(resizeSession).not.toHaveBeenCalled();
    expect(emitGhosttyEvent).not.toHaveBeenCalled();
  });

  test("a gridSize frame with non-numeric dimensions never reaches resize", () => {
    const emitGhosttyEvent = vi.fn();
    const resizeSession = vi.fn();
    const { client, sendCalls } = makeClient({ emitGhosttyEvent, resizeSession });
    client.createSurface("session-1", "hwnd", { x: 0, y: 0, w: 1, h: 1 });
    const surfaceId = sendCalls[0]!.surfaceId;

    injectFrame(client, {
      type: FrameType.gridSize,
      surfaceId,
      payload: Buffer.from(JSON.stringify({ cols: "80", rows: null }))
    });

    expect(resizeSession).not.toHaveBeenCalled();
  });
});

describe("feedData", () => {
  test("splits payloads larger than the 1 MiB frame cap", () => {
    const { client, sendCalls } = makeClient();
    client.createSurface("session-1", "hwnd", { x: 0, y: 0, w: 1, h: 1 });
    sendCalls.length = 0;

    // An oversize frame kills the connection outright (wire protocol, Limits),
    // so a burst of output has to be split rather than sent whole.
    const data = "x".repeat(1024 * 1024 + 10);
    client.feedData("session-1", data);

    expect(sendCalls).toHaveLength(2);
    expect(sendCalls[0]!.payload.length).toBe(1024 * 1024);
    expect(sendCalls[1]!.payload.length).toBe(10);
    expect(Buffer.concat(sendCalls.map((c) => c.payload)).toString()).toBe(data);
  });
});
