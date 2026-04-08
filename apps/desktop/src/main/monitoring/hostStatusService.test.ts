import { describe, expect, it, vi } from "vitest";

import {
  createHostStatusService,
  type HostStatusEvent,
} from "./hostStatusService";

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

describe("createHostStatusService", () => {
  it("probes active targets and emits status events", async () => {
    const intervalHandle = {} as ReturnType<typeof setInterval>;
    const setIntervalFn = vi.fn(
      (_callback: () => void, _intervalMs: number) => intervalHandle
    );
    const clearIntervalFn = vi.fn();
    const probe = vi.fn(async () => ({ online: true, latencyMs: 12 }));
    const events: HostStatusEvent[] = [];
    const service = createHostStatusService({
      probe,
      now: () => Date.parse("2026-04-08T11:00:00.000Z"),
      setIntervalFn,
      clearIntervalFn,
    });

    service.onStatus((event) => {
      events.push(event);
    });
    service.setTargets([
      {
        hostId: "host-1",
        hostname: "host-1.example.com",
        port: 22,
      },
    ]);

    service.start();
    await flushMicrotasks(3);

    expect(setIntervalFn).toHaveBeenCalledTimes(1);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(events).toEqual([
      {
        hostId: "host-1",
        online: true,
        latencyMs: 12,
        checkedAt: "2026-04-08T11:00:00.000Z",
      },
    ]);

    const intervalCallback = setIntervalFn.mock.calls[0]?.[0];
    if (typeof intervalCallback !== "function") {
      throw new Error("Interval callback was not registered");
    }

    intervalCallback();
    await flushMicrotasks(3);
    expect(probe).toHaveBeenCalledTimes(2);

    service.stop();
    expect(clearIntervalFn).toHaveBeenCalledTimes(1);
    expect(clearIntervalFn).toHaveBeenCalledWith(intervalHandle);
  });

  it("replaces targets and skips malformed entries", async () => {
    const probe = vi.fn(async () => ({ online: false, latencyMs: null }));
    const service = createHostStatusService({
      probe,
      setIntervalFn: vi.fn(() => ({} as ReturnType<typeof setInterval>)),
      clearIntervalFn: vi.fn(),
    });

    service.start();
    await flushMicrotasks(2);
    expect(probe).toHaveBeenCalledTimes(0);

    service.setTargets([
      {
        hostId: "host-1",
        hostname: "host-1.example.com",
        port: 22,
      },
      {
        hostId: "",
        hostname: "ignored.example.com",
        port: 22,
      },
      {
        hostId: "host-2",
        hostname: "ignored-port.example.com",
        port: 0,
      },
    ]);
    await flushMicrotasks(3);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(probe).toHaveBeenLastCalledWith({
      hostId: "host-1",
      hostname: "host-1.example.com",
      port: 22,
    });

    service.setTargets([
      {
        hostId: "host-2",
        hostname: "host-2.example.com",
        port: 2222,
      },
    ]);
    await flushMicrotasks(3);

    expect(probe).toHaveBeenCalledTimes(2);
    expect(probe).toHaveBeenLastCalledWith({
      hostId: "host-2",
      hostname: "host-2.example.com",
      port: 2222,
    });
  });

  it("suppresses late probe results after stop", async () => {
    const pendingProbe = createDeferred<{ online: boolean; latencyMs: number | null }>();
    const probe = vi.fn(async () => pendingProbe.promise);
    const events: HostStatusEvent[] = [];
    const service = createHostStatusService({
      probe,
      setIntervalFn: vi.fn(() => ({} as ReturnType<typeof setInterval>)),
      clearIntervalFn: vi.fn(),
    });
    service.onStatus((event) => {
      events.push(event);
    });
    service.setTargets([
      {
        hostId: "host-3",
        hostname: "host-3.example.com",
        port: 22,
      },
    ]);

    service.start();
    await flushMicrotasks(2);
    service.stop();

    pendingProbe.resolve({ online: true, latencyMs: 7 });
    await flushMicrotasks(3);

    expect(events).toHaveLength(0);
  });
});
