import { describe, expect, test, vi } from "vitest";
import { routeSessionEvent, type RouteSessionEventDeps } from "./routeSessionEvent";

function makeDeps(overrides: Partial<RouteSessionEventDeps> = {}): RouteSessionEventDeps {
  return {
    emitSessionEvent: vi.fn(),
    feedData: vi.fn(),
    sessionClosed: vi.fn(),
    sessionLogger: { onSessionData: vi.fn() },
    recorder: { onSessionData: vi.fn(), stop: vi.fn(async () => null) },
    claudeSessionBinder: { handleProcessTitle: vi.fn(), forget: vi.fn() },
    recordConnected: vi.fn(),
    recordFailedAttempt: vi.fn(),
    markDisconnected: vi.fn(),
    sessionErrorMessages: { set: vi.fn(), delete: vi.fn() },
    recordedFailedAttemptSessions: { delete: vi.fn() },
    sessionHostCache: { delete: vi.fn() },
    rendererSessions: { forget: vi.fn() },
    hasSession: vi.fn(() => false),
    ...overrides
  };
}

describe("routeSessionEvent", () => {
  test("a data event feeds the ghostty client and taps logger/recorder, but does not emit to the renderer", () => {
    const deps = makeDeps();

    routeSessionEvent({ type: "data", sessionId: "s1", data: "x" }, deps);

    expect(deps.feedData).toHaveBeenCalledWith("s1", "x");
    expect(deps.sessionLogger.onSessionData).toHaveBeenCalledWith("s1", "x");
    expect(deps.recorder.onSessionData).toHaveBeenCalledWith("s1", "x");
    expect(deps.emitSessionEvent).not.toHaveBeenCalled();
  });

  test("a data event for a session with no ghostty surface still logs/records without throwing", () => {
    // feedData is fire-and-forget on an unregistered session (Task 3's
    // registry behavior) — a fake that mimics that no-op must not stop the
    // logger/recorder taps from running.
    const deps = makeDeps({ feedData: vi.fn(() => {}) });

    expect(() => routeSessionEvent({ type: "data", sessionId: "unknown", data: "y" }, deps)).not.toThrow();

    expect(deps.sessionLogger.onSessionData).toHaveBeenCalledWith("unknown", "y");
    expect(deps.recorder.onSessionData).toHaveBeenCalledWith("unknown", "y");
  });

  test("a status event emits to the renderer and does not feed the ghostty client", () => {
    const deps = makeDeps();

    routeSessionEvent({ type: "status", sessionId: "s1", state: "connected" }, deps);

    expect(deps.emitSessionEvent).toHaveBeenCalledWith({ type: "status", sessionId: "s1", state: "connected" });
    expect(deps.feedData).not.toHaveBeenCalled();
    expect(deps.recordConnected).toHaveBeenCalledWith("s1");
  });

  test("a status event with state failed records a failed attempt", () => {
    const deps = makeDeps();

    routeSessionEvent({ type: "status", sessionId: "s1", state: "failed" }, deps);

    expect(deps.recordFailedAttempt).toHaveBeenCalledWith("s1");
    expect(deps.recordConnected).not.toHaveBeenCalled();
  });

  test("an exit event emits to the renderer and also notifies the ghostty client via sessionClosed", () => {
    const deps = makeDeps();

    routeSessionEvent({ type: "exit", sessionId: "s1", exitCode: 1 }, deps);

    expect(deps.emitSessionEvent).toHaveBeenCalledWith({ type: "exit", sessionId: "s1", exitCode: 1 });
    expect(deps.sessionClosed).toHaveBeenCalledWith("s1", 1);
    expect(deps.feedData).not.toHaveBeenCalled();
  });

  test("an exit event runs the full recovery-bookkeeping and claude-binder cleanup", () => {
    const deps = makeDeps();

    routeSessionEvent({ type: "exit", sessionId: "s1", exitCode: null }, deps);

    expect(deps.claudeSessionBinder.forget).toHaveBeenCalledWith("s1");
    expect(deps.markDisconnected).toHaveBeenCalledWith("s1");
    expect(deps.recordedFailedAttemptSessions.delete).toHaveBeenCalledWith("s1");
    expect(deps.sessionErrorMessages.delete).toHaveBeenCalledWith("s1");
    expect(deps.sessionHostCache.delete).toHaveBeenCalledWith("s1");
    expect(deps.sessionClosed).toHaveBeenCalledWith("s1", null);
  });

  test("an exit event's deferred finalize reaps a session the manager no longer has", async () => {
    vi.useFakeTimers();
    try {
      const deps = makeDeps({ hasSession: vi.fn(() => false) });

      routeSessionEvent({ type: "exit", sessionId: "s1", exitCode: 0 }, deps);
      expect(deps.rendererSessions.forget).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(0);

      expect(deps.rendererSessions.forget).toHaveBeenCalledWith("s1");
      expect(deps.recorder.stop).toHaveBeenCalledWith({ sessionId: "s1" });
    } finally {
      vi.useRealTimers();
    }
  });

  test("an exit event's deferred finalize leaves a still-reconnecting session alone", async () => {
    vi.useFakeTimers();
    try {
      const deps = makeDeps({ hasSession: vi.fn(() => true) });

      routeSessionEvent({ type: "exit", sessionId: "s1", exitCode: 0 }, deps);
      await vi.advanceTimersByTimeAsync(0);

      expect(deps.rendererSessions.forget).not.toHaveBeenCalled();
      expect(deps.recorder.stop).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  test("an error event records the error message and a failed attempt, and emits to the renderer", () => {
    const deps = makeDeps();

    routeSessionEvent({ type: "error", sessionId: "s1", message: "boom" }, deps);

    expect(deps.emitSessionEvent).toHaveBeenCalledWith({ type: "error", sessionId: "s1", message: "boom" });
    expect(deps.sessionErrorMessages.set).toHaveBeenCalledWith("s1", "boom");
    expect(deps.recordFailedAttempt).toHaveBeenCalledWith("s1", "boom");
  });

  test("a process-title event notifies the claude session binder and emits to the renderer", () => {
    const deps = makeDeps();

    routeSessionEvent({ type: "process-title", sessionId: "s1", name: "claude" }, deps);

    expect(deps.emitSessionEvent).toHaveBeenCalledWith({ type: "process-title", sessionId: "s1", name: "claude" });
    expect(deps.claudeSessionBinder.handleProcessTitle).toHaveBeenCalledWith("s1", "claude");
  });
});
