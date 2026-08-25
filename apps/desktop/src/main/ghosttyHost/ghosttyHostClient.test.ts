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
      bounds: { x: 0, y: 0, w: 800, h: 600 },
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
    expect(JSON.parse(configFrames[0]!.payload.toString())).toEqual({ config: "fresh-config" });

    const createFrames = sendCalls.filter((c) => c.type === FrameType.createSurface);
    expect(createFrames).toHaveLength(2);
    const payloads = createFrames.map((c) => JSON.parse(c.payload.toString()) as Record<string, unknown>);
    expect(payloads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ parentHwnd: "hwnd-1", bounds: { x: 0, y: 0, w: 100, h: 100 } }),
        expect.objectContaining({ parentHwnd: "hwnd-2", bounds: { x: 10, y: 10, w: 200, h: 200 } })
      ])
    );
  });
});
