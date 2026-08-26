import type { RecordingFrame } from "@hypershell/shared";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createReplayDriver } from "./replayDriver";
import type { GhosttyHostClient } from "./ghosttyHostClient";

const FRAMES: RecordingFrame[] = [
  [0.1, "o", "a"],
  [0.3, "o", "b"],
  [0.6, "o", "c"]
];

function makeFakeClient(): GhosttyHostClient {
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
    createReplaySurface: vi.fn(() => "replay:1"),
    dispose: vi.fn(),
    onFrame: vi.fn(),
    onRestart: vi.fn(),
    onHostDead: vi.fn()
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createReplayDriver", () => {
  test("open loads frames and creates a replay surface, returning its id", async () => {
    const client = makeFakeClient();
    const getFrames = vi.fn(async () => FRAMES);
    const driver = createReplayDriver({ client, getFrames });

    const replayId = await driver.open("rec-1", "0xHWND", { x: 0, y: 0, w: 800, h: 600 });

    expect(getFrames).toHaveBeenCalledWith("rec-1");
    expect(client.createReplaySurface).toHaveBeenCalledWith("0xHWND", { x: 0, y: 0, w: 800, h: 600 });
    expect(replayId).toBe("replay:1");
  });

  test("play feeds frames through client.feedData in timestamp order", async () => {
    const client = makeFakeClient();
    const driver = createReplayDriver({ client, getFrames: async () => FRAMES });
    const replayId = await driver.open("rec-1", "0xHWND", { x: 0, y: 0, w: 1, h: 1 });

    driver.control(replayId, "play");
    expect(client.feedData).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(100); // frame 0 at t=0.1s
    expect(client.feedData).toHaveBeenNthCalledWith(1, replayId, "a");

    await vi.advanceTimersByTimeAsync(200); // frame 1 at t=0.3s (delta 0.2s)
    expect(client.feedData).toHaveBeenNthCalledWith(2, replayId, "b");

    await vi.advanceTimersByTimeAsync(300); // frame 2 at t=0.6s (delta 0.3s)
    expect(client.feedData).toHaveBeenNthCalledWith(3, replayId, "c");
    expect(client.feedData).toHaveBeenCalledTimes(3);
  });

  test("pause stops the feed", async () => {
    const client = makeFakeClient();
    const driver = createReplayDriver({ client, getFrames: async () => FRAMES });
    const replayId = await driver.open("rec-1", "0xHWND", { x: 0, y: 0, w: 1, h: 1 });

    driver.control(replayId, "play");
    await vi.advanceTimersByTimeAsync(100); // frame 0 fires
    expect(client.feedData).toHaveBeenCalledTimes(1);

    driver.control(replayId, "pause");
    await vi.advanceTimersByTimeAsync(10_000); // well past every remaining frame

    expect(client.feedData).toHaveBeenCalledTimes(1);
  });

  test("seek clears the surface then instantly feeds the prefix up to frameIndex", async () => {
    const client = makeFakeClient();
    const driver = createReplayDriver({ client, getFrames: async () => FRAMES });
    const replayId = await driver.open("rec-1", "0xHWND", { x: 0, y: 0, w: 1, h: 1 });

    driver.control(replayId, "seek", 2);

    expect(client.sendCommand).toHaveBeenCalledWith(replayId, "clear");
    expect(client.feedData).toHaveBeenNthCalledWith(1, replayId, "a");
    expect(client.feedData).toHaveBeenNthCalledWith(2, replayId, "b");
    expect(client.feedData).toHaveBeenCalledTimes(2); // not frame index 2 ("c") — exclusive upper bound

    // sendCommand ordered before the feeds it clears the way for.
    const commandOrder = (client.sendCommand as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!;
    const firstFeedOrder = (client.feedData as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!;
    expect(commandOrder).toBeLessThan(firstFeedOrder);
  });

  test("playing after a seek resumes from the sought position", async () => {
    const client = makeFakeClient();
    const driver = createReplayDriver({ client, getFrames: async () => FRAMES });
    const replayId = await driver.open("rec-1", "0xHWND", { x: 0, y: 0, w: 1, h: 1 });

    driver.control(replayId, "seek", 2); // frames "a","b" already fed
    (client.feedData as ReturnType<typeof vi.fn>).mockClear();

    driver.control(replayId, "play");
    await vi.advanceTimersByTimeAsync(300); // delta between frame 1 and frame 2 timestamps
    expect(client.feedData).toHaveBeenCalledTimes(1);
    expect(client.feedData).toHaveBeenCalledWith(replayId, "c");
  });

  test("close destroys the surface and cancels any pending playback", async () => {
    const client = makeFakeClient();
    const driver = createReplayDriver({ client, getFrames: async () => FRAMES });
    const replayId = await driver.open("rec-1", "0xHWND", { x: 0, y: 0, w: 1, h: 1 });

    driver.control(replayId, "play");
    driver.close(replayId);

    expect(client.destroySurface).toHaveBeenCalledWith(replayId);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(client.feedData).not.toHaveBeenCalled();
  });

  test("control and close on an unknown replayId are safe no-ops", async () => {
    const client = makeFakeClient();
    const driver = createReplayDriver({ client, getFrames: async () => FRAMES });

    expect(() => driver.control("replay:999", "play")).not.toThrow();
    expect(() => driver.control("replay:999", "seek", 1)).not.toThrow();
    expect(() => driver.close("replay:999")).not.toThrow();
    expect(client.feedData).not.toHaveBeenCalled();
    expect(client.destroySurface).not.toHaveBeenCalled();
  });
});
