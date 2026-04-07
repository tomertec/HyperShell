import { describe, expect, it, vi } from "vitest";
import { createNetworkMonitor } from "./networkMonitor";

describe("networkMonitor", () => {
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
});
