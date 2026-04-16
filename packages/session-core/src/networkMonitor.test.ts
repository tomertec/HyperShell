import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createNetworkMonitor } from "./networkMonitor";

const { mockResolve } = vi.hoisted(() => {
  const mockResolve = vi.fn().mockResolvedValue(["8.8.8.8"]);
  return { mockResolve };
});
vi.mock("node:dns/promises", () => ({
  default: { resolve: mockResolve },
  resolve: mockResolve,
}));

describe("networkMonitor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockResolve.mockReset().mockResolvedValue(["8.8.8.8"] as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts online by default", () => {
    const monitor = createNetworkMonitor({ probeIntervalMs: 0 });
    expect(monitor.isOnline()).toBe(true);
    monitor.dispose();
  });

  it("notifies on offline transition", () => {
    const monitor = createNetworkMonitor({ probeIntervalMs: 0 });
    const cb = vi.fn();
    monitor.onOffline(cb);

    monitor._setOnline(false);

    expect(cb).toHaveBeenCalledTimes(1);
    monitor.dispose();
  });

  it("notifies on online transition", () => {
    const monitor = createNetworkMonitor({ probeIntervalMs: 0 });
    const cb = vi.fn();
    monitor.onOnline(cb);

    monitor._setOnline(false);
    monitor._setOnline(true);

    expect(cb).toHaveBeenCalledTimes(1);
    monitor.dispose();
  });

  it("does not notify if state unchanged", () => {
    const monitor = createNetworkMonitor({ probeIntervalMs: 0 });
    const offCb = vi.fn();
    monitor.onOffline(offCb);

    monitor._setOnline(true); // already online
    expect(offCb).not.toHaveBeenCalled();
    monitor.dispose();
  });

  it("unsubscribe removes listener", () => {
    const monitor = createNetworkMonitor({ probeIntervalMs: 0 });
    const cb = vi.fn();
    const unsub = monitor.onOffline(cb);
    unsub();

    monitor._setOnline(false);
    expect(cb).not.toHaveBeenCalled();
    monitor.dispose();
  });

  it("dispose clears all listeners and timers", () => {
    const monitor = createNetworkMonitor({ probeIntervalMs: 0 });
    const cb = vi.fn();
    monitor.onOnline(cb);
    monitor.onOffline(cb);
    monitor.dispose();

    monitor._setOnline(false);
    monitor._setOnline(true);
    expect(cb).not.toHaveBeenCalled();
  });

  it("runs immediate probe on startup and transitions to offline when DNS fails", async () => {
    mockResolve.mockRejectedValue(new Error("ENOTFOUND"));
    const offlineCb = vi.fn();

    const monitor = createNetworkMonitor({ probeIntervalMs: 10_000 });
    monitor.onOffline(offlineCb);

    // probe() was called synchronously at creation but is async — flush the microtask
    await vi.advanceTimersByTimeAsync(0);

    expect(mockResolve).toHaveBeenCalledTimes(1);
    expect(monitor.isOnline()).toBe(false);
    expect(offlineCb).toHaveBeenCalledTimes(1);

    monitor.dispose();
  });

  it("immediate probe keeps online state when DNS succeeds", async () => {
    const offlineCb = vi.fn();

    const monitor = createNetworkMonitor({ probeIntervalMs: 10_000 });
    monitor.onOffline(offlineCb);

    await vi.advanceTimersByTimeAsync(0);

    expect(mockResolve).toHaveBeenCalledTimes(1);
    expect(monitor.isOnline()).toBe(true);
    expect(offlineCb).not.toHaveBeenCalled();

    monitor.dispose();
  });

  it("ignores stale probe completions when probes finish out of order", async () => {
    type Deferred<T> = {
      promise: Promise<T>;
      resolve: (value: T) => void;
      reject: (error: Error) => void;
    };
    const createDeferred = <T>(): Deferred<T> => {
      let resolve!: (value: T) => void;
      let reject!: (error: Error) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    };

    const firstProbe = createDeferred<string[]>();
    const secondProbe = createDeferred<string[]>();
    mockResolve
      .mockReset()
      .mockReturnValueOnce(firstProbe.promise as never)
      .mockReturnValueOnce(secondProbe.promise as never)
      .mockResolvedValue(["8.8.8.8"] as never);

    const offlineCb = vi.fn();
    const monitor = createNetworkMonitor({ probeIntervalMs: 5 });
    monitor.onOffline(offlineCb);

    await vi.advanceTimersByTimeAsync(5);
    secondProbe.resolve(["8.8.8.8"]);
    await Promise.resolve();
    expect(monitor.isOnline()).toBe(true);

    firstProbe.reject(new Error("late ENOTFOUND"));
    await vi.advanceTimersByTimeAsync(0);
    expect(monitor.isOnline()).toBe(true);
    expect(offlineCb).not.toHaveBeenCalled();

    monitor.dispose();
  });
});
