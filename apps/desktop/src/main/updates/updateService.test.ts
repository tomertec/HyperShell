import { describe, expect, it, vi } from "vitest";
import type { UpdateState } from "@hypershell/shared";

import { createUpdateService, type UpdaterLike } from "./updateService";

function createFakeUpdater() {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const updater: UpdaterLike = {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    allowPrerelease: true,
    on(event, listener) {
      listeners.set(event, listener);
    },
    checkForUpdates: vi.fn().mockResolvedValue(undefined),
    downloadUpdate: vi.fn().mockResolvedValue(undefined),
    quitAndInstall: vi.fn()
  };
  const fire = (event: string, ...args: unknown[]) =>
    listeners.get(event)?.(...args);
  return { updater, fire };
}

function setup(overrides: Record<string, unknown> = {}) {
  const states: UpdateState[] = [];
  const { updater, fire } = createFakeUpdater();
  const service = createUpdateService({
    platform: "win32",
    isPackaged: true,
    getVersion: () => "0.1.9",
    emit: (state) => states.push(state),
    getUpdater: () => updater,
    ...overrides
  });
  return { service, updater, fire, states };
}

describe("createUpdateService (win32)", () => {
  it("configures the updater for notify-first behaviour on check", async () => {
    const { service, updater } = setup();
    await service.check();
    expect(updater.autoDownload).toBe(false);
    expect(updater.autoInstallOnAppQuit).toBe(false);
    expect(updater.allowPrerelease).toBe(false);
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it("emits available state on update-available", async () => {
    const { service, fire, states } = setup();
    await service.check();
    fire("update-available", { version: "0.2.0" });
    const last = states.at(-1);
    expect(last?.status).toBe("available");
    expect(last?.availableVersion).toBe("0.2.0");
  });

  it("emits downloading progress then downloaded", async () => {
    const { service, fire, states } = setup();
    await service.check();
    fire("download-progress", { percent: 41.6 });
    fire("update-downloaded", { version: "0.2.0" });
    expect(states.at(-2)).toMatchObject({ status: "downloading", progressPercent: 42 });
    expect(states.at(-1)).toMatchObject({ status: "downloaded", availableVersion: "0.2.0" });
  });

  it("emits up-to-date on update-not-available", async () => {
    const { service, fire, states } = setup();
    await service.check();
    fire("update-not-available", {});
    expect(states.at(-1)?.status).toBe("up-to-date");
  });

  it("emits error on updater error", async () => {
    const { service, fire, states } = setup();
    await service.check();
    fire("error", new Error("network down"));
    expect(states.at(-1)).toMatchObject({ status: "error", error: "network down" });
  });

  it("is a no-op when not packaged", async () => {
    const { service, updater } = setup({ isPackaged: false });
    await service.check();
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
    expect(service.getState().status).toBe("idle");
  });

  it("schedules an initial check on start", () => {
    vi.useFakeTimers();
    const { service, updater } = setup();
    service.start();
    vi.advanceTimersByTime(10_000);
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

describe("createUpdateService (darwin)", () => {
  it("emits manual-available when the API reports a newer version", async () => {
    const states: UpdateState[] = [];
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: "v0.3.0",
        html_url: "https://example/releases/v0.3.0"
      })
    });
    const service = createUpdateService({
      platform: "darwin",
      isPackaged: true,
      getVersion: () => "0.1.9",
      emit: (state) => states.push(state),
      fetchFn: fetchFn as unknown as typeof fetch,
      releaseApiUrl: "https://example/api"
    });

    await service.check({ manual: true });

    expect(fetchFn).toHaveBeenCalledWith("https://example/api", expect.anything());
    expect(states.at(-1)).toMatchObject({
      status: "manual-available",
      availableVersion: "0.3.0",
      releaseUrl: "https://example/releases/v0.3.0"
    });
  });

  it("emits up-to-date when the API version is not newer", async () => {
    const states: UpdateState[] = [];
    const service = createUpdateService({
      platform: "darwin",
      isPackaged: true,
      getVersion: () => "0.9.0",
      emit: (state) => states.push(state),
      fetchFn: (async () => ({
        ok: true,
        json: async () => ({ tag_name: "v0.3.0", html_url: "x" })
      })) as unknown as typeof fetch,
      releaseApiUrl: "https://example/api"
    });

    await service.check({ manual: true });
    expect(states.at(-1)?.status).toBe("up-to-date");
  });
});
