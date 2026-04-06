import { describe, expect, it, vi } from "vitest";

import {
  createHostMonitor,
  type HostMonitorEvent
} from "./hostMonitor";

function createDeferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

async function flushMicrotasks(times = 1): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await Promise.resolve();
  }
}

describe("createHostMonitor", () => {
  it("is idempotent for repeated start/stop and uses one interval", async () => {
    const intervalHandle = {} as NodeJS.Timeout;
    const setIntervalFn = vi.fn(
      (_callback: () => void, _intervalMs: number) => intervalHandle
    );
    const clearIntervalFn = vi.fn();
    const probe = vi.fn(async (target) => {
      return {
        targetId: target.id,
        status: "up" as const,
        checkedAt: 100,
        latencyMs: 5
      };
    });
    const monitor = createHostMonitor({
      probe,
      now: () => 1,
      setIntervalFn,
      clearIntervalFn
    });
    const events: HostMonitorEvent[] = [];

    monitor.onEvent((event) => {
      events.push(event);
    });
    monitor.addTarget({
      id: "h1",
      host: "host-1"
    });

    monitor.start();
    monitor.start();
    await flushMicrotasks(2);

    expect(setIntervalFn).toHaveBeenCalledTimes(1);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(events).toEqual([
      {
        targetId: "h1",
        status: "checking",
        checkedAt: 1
      },
      {
        targetId: "h1",
        status: "up",
        checkedAt: 100,
        latencyMs: 5
      }
    ]);

    const intervalCallback = setIntervalFn.mock.calls[0]?.[0];
    if (typeof intervalCallback !== "function") {
      throw new Error("interval callback was not registered");
    }
    intervalCallback();
    await flushMicrotasks(2);
    expect(probe).toHaveBeenCalledTimes(2);

    monitor.stop();
    monitor.stop();
    expect(clearIntervalFn).toHaveBeenCalledTimes(1);
    expect(clearIntervalFn).toHaveBeenCalledWith(intervalHandle);
  });

  it("suppresses late probe results after stop", async () => {
    const pendingProbe = createDeferred<HostMonitorEvent>();
    const probe = vi.fn(async () => pendingProbe.promise);
    const monitor = createHostMonitor({
      probe,
      now: () => 2,
      setIntervalFn: vi.fn(() => ({} as NodeJS.Timeout)),
      clearIntervalFn: vi.fn()
    });
    const events: HostMonitorEvent[] = [];

    monitor.onEvent((event) => {
      events.push(event);
    });
    monitor.addTarget({
      id: "h2",
      host: "host-2"
    });

    monitor.start();
    await flushMicrotasks(2);
    monitor.stop();

    pendingProbe.resolve({
      targetId: "h2",
      status: "up",
      checkedAt: 200,
      latencyMs: 10
    });
    await flushMicrotasks(2);

    expect(events).toEqual([
      {
        targetId: "h2",
        status: "checking",
        checkedAt: 2
      }
    ]);
  });

  it("coalesces overlapping interval ticks while a probe is in-flight", async () => {
    const firstProbe = createDeferred<HostMonitorEvent>();
    let probeCalls = 0;
    const probe = vi.fn(async () => {
      probeCalls += 1;
      if (probeCalls === 1) {
        return firstProbe.promise;
      }

      return {
        targetId: "h3",
        status: "up" as const,
        checkedAt: 300,
        latencyMs: 1
      };
    });
    const setIntervalFn = vi.fn(
      (_callback: () => void, _intervalMs: number) => ({} as NodeJS.Timeout)
    );
    const monitor = createHostMonitor({
      probe,
      now: () => 3,
      setIntervalFn,
      clearIntervalFn: vi.fn()
    });
    const events: HostMonitorEvent[] = [];

    monitor.onEvent((event) => {
      events.push(event);
    });
    monitor.addTarget({
      id: "h3",
      host: "host-3"
    });

    monitor.start();
    await flushMicrotasks(2);
    expect(probe).toHaveBeenCalledTimes(1);

    const intervalCallback = setIntervalFn.mock.calls[0]?.[0];
    if (typeof intervalCallback !== "function") {
      throw new Error("interval callback was not registered");
    }
    intervalCallback();
    intervalCallback();
    expect(probe).toHaveBeenCalledTimes(1);

    firstProbe.resolve({
      targetId: "h3",
      status: "up",
      checkedAt: 250,
      latencyMs: 2
    });
    await flushMicrotasks(5);

    expect(probe).toHaveBeenCalledTimes(2);
    expect(events.filter((event) => event.status === "checking")).toHaveLength(2);
    expect(events.filter((event) => event.status === "up")).toHaveLength(2);
  });
});
