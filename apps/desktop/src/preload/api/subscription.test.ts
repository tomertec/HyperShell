import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { createSubscription } from "./subscription";
import type { PreloadIpcRenderer, PreloadLogger } from "./types";

function fakeIpc() {
  const handlers = new Map<string, (e: unknown, p: unknown) => void>();
  return {
    on: vi.fn((ch: string, h) => handlers.set(ch, h)),
    removeListener: vi.fn((ch: string) => handlers.delete(ch)),
    invoke: vi.fn(),
    send: vi.fn(),
    emit: (ch: string, payload: unknown) => handlers.get(ch)?.(null, payload),
  } as unknown as PreloadIpcRenderer & { emit: (ch: string, p: unknown) => void };
}
const logger: PreloadLogger = { warn: vi.fn(), error: vi.fn() };

describe("createSubscription", () => {
  it("delivers a schema-valid payload to the listener", () => {
    const ipc = fakeIpc();
    const listener = vi.fn();
    const sub = createSubscription(ipc, logger, "chan", "onThing", z.object({ n: z.number() }));
    sub(listener);
    ipc.emit("chan", { n: 5 });
    expect(listener).toHaveBeenCalledWith({ n: 5 });
  });

  it("drops (warns, no throw) on an invalid payload", () => {
    const ipc = fakeIpc();
    const listener = vi.fn();
    createSubscription(ipc, logger, "chan", "onThing", z.object({ n: z.number() }))(listener);
    ipc.emit("chan", { n: "nope" });
    expect(listener).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it("passes payload through untouched when no schema is given", () => {
    const ipc = fakeIpc();
    const listener = vi.fn();
    createSubscription(ipc, logger, "chan", "onQuickConnect")(listener);
    ipc.emit("chan", undefined);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("swallows a throwing listener and logs error", () => {
    const ipc = fakeIpc();
    createSubscription(ipc, logger, "chan", "onThing")(() => { throw new Error("boom"); });
    expect(() => ipc.emit("chan", {})).not.toThrow();
    expect(logger.error).toHaveBeenCalled();
  });

  it("returns an unsubscribe that removes the listener", () => {
    const ipc = fakeIpc();
    const listener = vi.fn();
    const unsub = createSubscription(ipc, logger, "chan", "onThing")(listener);
    unsub();
    ipc.emit("chan", {});
    expect(listener).not.toHaveBeenCalled();
  });
});
