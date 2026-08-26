import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { watchSurfaceZOrder, type ResyncEventSources } from "./surfaceZOrderResync";

type Listener = (...args: never[]) => void;

interface FakeSource {
  on(event: string, listener: Listener): unknown;
  removeListener(event: string, listener: Listener): unknown;
  emit(event: string, ...args: unknown[]): void;
  listenerCount(event: string): number;
}

function makeFakeSource(): FakeSource {
  const listeners = new Map<string, Set<Listener>>();
  return {
    on(event, listener) {
      const set = listeners.get(event) ?? new Set<Listener>();
      set.add(listener);
      listeners.set(event, set);
      return this;
    },
    removeListener(event, listener) {
      listeners.get(event)?.delete(listener);
      return this;
    },
    emit(event, ...args) {
      for (const listener of [...(listeners.get(event) ?? [])]) {
        (listener as (...a: unknown[]) => void)(...args);
      }
    },
    listenerCount(event) {
      return listeners.get(event)?.size ?? 0;
    }
  };
}

function makeSources(): ResyncEventSources & {
  app: FakeSource;
  powerMonitor: FakeSource;
  screen: FakeSource;
} {
  return { app: makeFakeSource(), powerMonitor: makeFakeSource(), screen: makeFakeSource() };
}

/** Follow-ups scheduled per trigger, excluding the immediate re-sync. */
const FOLLOW_UPS_PER_TRIGGER = 3;
/** Every trigger fires once immediately plus one per bounded follow-up delay. */
const RESYNCS_PER_TRIGGER = FOLLOW_UPS_PER_TRIGGER + 1;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("watchSurfaceZOrder", () => {
  test("a GPU child-process-gone re-syncs immediately", () => {
    const sources = makeSources();
    const resync = vi.fn();
    watchSurfaceZOrder(sources, resync);

    sources.app.emit("child-process-gone", {}, { type: "GPU", reason: "crashed" });

    expect(resync).toHaveBeenCalledTimes(1);
  });

  test("a non-GPU child process going away is ignored", () => {
    const sources = makeSources();
    const resync = vi.fn();
    watchSurfaceZOrder(sources, resync);

    sources.app.emit("child-process-gone", {}, { type: "Utility", reason: "clean-exit" });
    sources.app.emit("child-process-gone", {}, { type: "Zygote", reason: "crashed" });

    vi.advanceTimersByTime(10_000);
    expect(resync).not.toHaveBeenCalled();
  });

  test("render-process-gone re-syncs, except on a clean exit", () => {
    const sources = makeSources();
    const resync = vi.fn();
    watchSurfaceZOrder(sources, resync);

    // App teardown, not a compositor rebuild.
    sources.app.emit("render-process-gone", {}, {}, { reason: "clean-exit", exitCode: 0 });
    expect(resync).not.toHaveBeenCalled();

    sources.app.emit("render-process-gone", {}, {}, { reason: "crashed", exitCode: 1 });
    expect(resync).toHaveBeenCalledTimes(1);
  });

  test.each([
    ["powerMonitor", "resume"],
    ["powerMonitor", "unlock-screen"],
    ["screen", "display-metrics-changed"],
    ["screen", "display-added"],
    ["screen", "display-removed"]
  ] as const)("%s %s re-syncs", (sourceName, event) => {
    const sources = makeSources();
    const resync = vi.fn();
    watchSurfaceZOrder(sources, resync);

    sources[sourceName].emit(event);

    expect(resync).toHaveBeenCalledTimes(1);
  });

  test("each trigger schedules a bounded set of follow-up re-syncs", () => {
    const sources = makeSources();
    const resync = vi.fn();
    watchSurfaceZOrder(sources, resync);

    sources.app.emit("child-process-gone", {}, { type: "GPU" });
    expect(resync).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(250);
    expect(resync).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(750);
    expect(resync).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(2_000);
    expect(resync).toHaveBeenCalledTimes(RESYNCS_PER_TRIGGER);

    // Bounded, not a poll: nothing more ever fires.
    vi.advanceTimersByTime(60_000);
    expect(resync).toHaveBeenCalledTimes(RESYNCS_PER_TRIGGER);
  });

  test("a burst of triggers restarts the schedule instead of stacking timers", () => {
    const sources = makeSources();
    const resync = vi.fn();
    watchSurfaceZOrder(sources, resync);

    // Five display events in quick succession — a plausible monitor hot-plug.
    for (let i = 0; i < 5; i += 1) {
      sources.screen.emit("display-metrics-changed");
    }
    expect(resync).toHaveBeenCalledTimes(5);

    vi.advanceTimersByTime(60_000);
    // Only the last trigger's follow-ups survive: 5 immediate + 3 follow-ups.
    expect(resync).toHaveBeenCalledTimes(5 + FOLLOW_UPS_PER_TRIGGER);
  });

  test("follow-up timers are unref'd, so they cannot hold the process open", () => {
    const sources = makeSources();
    const unref = vi.fn();
    const setTimeoutSpy = vi
      .spyOn(globalThis, "setTimeout")
      .mockImplementation(() => ({ unref }) as unknown as ReturnType<typeof setTimeout>);
    watchSurfaceZOrder(sources, vi.fn());

    sources.app.emit("child-process-gone", {}, { type: "GPU" });

    expect(setTimeoutSpy).toHaveBeenCalledTimes(FOLLOW_UPS_PER_TRIGGER);
    expect(unref).toHaveBeenCalledTimes(FOLLOW_UPS_PER_TRIGGER);
    setTimeoutSpy.mockRestore();
  });

  test("a throwing resync does not escape the event handler", () => {
    const sources = makeSources();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const resync = vi.fn(() => {
      throw new Error("host is gone");
    });
    watchSurfaceZOrder(sources, resync);

    expect(() => sources.app.emit("child-process-gone", {}, { type: "GPU" })).not.toThrow();
    // A throw in the immediate re-sync must not cancel the follow-ups either.
    expect(() => vi.advanceTimersByTime(10_000)).not.toThrow();
    expect(resync).toHaveBeenCalledTimes(RESYNCS_PER_TRIGGER);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  test("the returned unsubscribe drops every listener", () => {
    const sources = makeSources();
    const resync = vi.fn();
    const stop = watchSurfaceZOrder(sources, resync);

    stop();

    for (const [source, event] of [
      [sources.app, "child-process-gone"],
      [sources.app, "render-process-gone"],
      [sources.powerMonitor, "resume"],
      [sources.powerMonitor, "unlock-screen"],
      [sources.screen, "display-metrics-changed"],
      [sources.screen, "display-added"],
      [sources.screen, "display-removed"]
    ] as const) {
      expect(source.listenerCount(event)).toBe(0);
    }

    sources.app.emit("child-process-gone", {}, { type: "GPU" });
    sources.screen.emit("display-metrics-changed");
    expect(resync).not.toHaveBeenCalled();
  });

  test("the returned unsubscribe cancels follow-ups already in flight", () => {
    const sources = makeSources();
    const resync = vi.fn();
    const stop = watchSurfaceZOrder(sources, resync);

    sources.app.emit("child-process-gone", {}, { type: "GPU" });
    expect(resync).toHaveBeenCalledTimes(1);

    stop();

    vi.advanceTimersByTime(60_000);
    expect(resync).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
