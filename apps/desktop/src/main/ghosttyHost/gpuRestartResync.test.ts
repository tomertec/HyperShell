import { describe, expect, test, vi } from "vitest";
import { watchGpuRestart, type ProcessGoneEmitter } from "./gpuRestartResync";

type Listener = (...args: unknown[]) => void;

function makeFakeApp(): ProcessGoneEmitter & {
  emit(event: string, ...args: unknown[]): void;
  listenerCount(event: string): number;
} {
  const listeners = new Map<string, Set<Listener>>();
  return {
    on(event: string, listener: Listener) {
      const set = listeners.get(event) ?? new Set<Listener>();
      set.add(listener);
      listeners.set(event, set);
      return this;
    },
    removeListener(event: string, listener: Listener) {
      listeners.get(event)?.delete(listener);
      return this;
    },
    emit(event: string, ...args: unknown[]) {
      for (const listener of [...(listeners.get(event) ?? [])]) {
        listener(...args);
      }
    },
    listenerCount(event: string) {
      return listeners.get(event)?.size ?? 0;
    }
  } as ProcessGoneEmitter & {
    emit(event: string, ...args: unknown[]): void;
    listenerCount(event: string): number;
  };
}

describe("watchGpuRestart", () => {
  test("a GPU child-process-gone re-syncs the surfaces", () => {
    const app = makeFakeApp();
    const resync = vi.fn();
    watchGpuRestart(app, resync);

    app.emit("child-process-gone", {}, { type: "GPU", reason: "crashed" });

    expect(resync).toHaveBeenCalledTimes(1);
  });

  test("a non-GPU child process going away is ignored", () => {
    const app = makeFakeApp();
    const resync = vi.fn();
    watchGpuRestart(app, resync);

    app.emit("child-process-gone", {}, { type: "Utility", reason: "clean-exit" });
    app.emit("child-process-gone", {}, { type: "Zygote", reason: "crashed" });

    expect(resync).not.toHaveBeenCalled();
  });

  test("render-process-gone re-syncs the surfaces", () => {
    const app = makeFakeApp();
    const resync = vi.fn();
    watchGpuRestart(app, resync);

    app.emit("render-process-gone", {}, {}, { reason: "crashed", exitCode: 1 });

    expect(resync).toHaveBeenCalledTimes(1);
  });

  test("a throwing resync does not escape the event handler", () => {
    const app = makeFakeApp();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const resync = vi.fn(() => {
      throw new Error("host is gone");
    });
    watchGpuRestart(app, resync);

    expect(() => app.emit("child-process-gone", {}, { type: "GPU" })).not.toThrow();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  test("the returned unsubscribe drops both listeners", () => {
    const app = makeFakeApp();
    const resync = vi.fn();
    const stop = watchGpuRestart(app, resync);

    stop();

    expect(app.listenerCount("child-process-gone")).toBe(0);
    expect(app.listenerCount("render-process-gone")).toBe(0);
    app.emit("child-process-gone", {}, { type: "GPU" });
    expect(resync).not.toHaveBeenCalled();
  });
});
