import { describe, expect, it, vi } from "vitest";

import {
  createAsyncOperationGuard,
  mapSessionEvent,
  resolveConnectAttempt
} from "./terminalSessionModel";

describe("mapSessionEvent", () => {
  it("ignores events for other sessions", () => {
    expect(
      mapSessionEvent("session-a", {
        type: "status",
        sessionId: "session-b",
        state: "connected"
      })
    ).toEqual({ handled: false });
  });

  it("maps status events into state transitions", () => {
    expect(
      mapSessionEvent("session-a", {
        type: "status",
        sessionId: "session-a",
        state: "reconnecting"
      })
    ).toEqual({
      handled: true,
      state: "reconnecting"
    });
  });

  it("marks exits as disconnected and clears the active session id", () => {
    expect(
      mapSessionEvent("session-a", {
        type: "exit",
        sessionId: "session-a",
        exitCode: 0
      })
    ).toEqual({
      handled: true,
      state: "disconnected",
      clearSessionId: true,
      exitCode: 0
    });
  });

  it("surfaces the exit code on an exit event", () => {
    const effect = mapSessionEvent("session-1", {
      type: "exit",
      sessionId: "session-1",
      exitCode: 0
    });

    expect(effect.state).toBe("disconnected");
    expect(effect.clearSessionId).toBe(true);
    expect(effect.exitCode).toBe(0);
  });

  it("surfaces a non-zero exit code", () => {
    const effect = mapSessionEvent("session-1", {
      type: "exit",
      sessionId: "session-1",
      exitCode: 1
    });

    expect(effect.exitCode).toBe(1);
  });

  it("maps error events to failed state with message", () => {
    expect(
      mapSessionEvent("session-a", {
        type: "error",
        sessionId: "session-a",
        message: "permission denied"
      })
    ).toEqual({
      handled: true,
      state: "failed",
      errorMessage: "permission denied"
    });
  });
});

describe("mapSessionEvent process-title", () => {
  it("passes the process name through for the current session", () => {
    expect(mapSessionEvent("s1", { type: "process-title", sessionId: "s1", name: "llmtop" })).toEqual({
      handled: true,
      processTitle: "llmtop"
    });
  });

  it("passes null through so the renderer can clear it", () => {
    expect(mapSessionEvent("s1", { type: "process-title", sessionId: "s1", name: null })).toEqual({
      handled: true,
      processTitle: null
    });
  });

  it("ignores events for another session", () => {
    expect(mapSessionEvent("s1", { type: "process-title", sessionId: "s2", name: "llmtop" })).toEqual({
      handled: false
    });
  });
});

describe("createAsyncOperationGuard", () => {
  it("accepts only the latest issued token", () => {
    const guard = createAsyncOperationGuard();
    const first = guard.issueToken();
    const second = guard.issueToken();

    expect(guard.isCurrent(first)).toBe(false);
    expect(guard.isCurrent(second)).toBe(true);
  });

  it("invalidates all pending tokens on teardown", () => {
    const guard = createAsyncOperationGuard();
    const first = guard.issueToken();

    guard.invalidate();

    expect(guard.isCurrent(first)).toBe(false);
    expect(guard.isCurrent(guard.issueToken())).toBe(false);
  });
});

describe("resolveConnectAttempt", () => {
  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  it("returns the session when the attempt is still current", async () => {
    const closeSession = vi.fn();

    await expect(
      resolveConnectAttempt({
        openSession: async () => ({ sessionId: "session-a", state: "connected" }),
        isStale: () => false,
        closeSession
      })
    ).resolves.toEqual({ sessionId: "session-a", state: "connected" });

    expect(closeSession).not.toHaveBeenCalled();
  });

  it("closes the session when the pane unmounted while openSession was in flight", async () => {
    const pending = deferred<{ sessionId: string; state: "connected" }>();
    const closeSession = vi.fn();
    const guard = createAsyncOperationGuard();
    const attemptId = guard.issueToken();
    let mounted = true;

    const attempt = resolveConnectAttempt({
      openSession: () => pending.promise,
      isStale: () => !mounted || !guard.isCurrent(attemptId),
      closeSession
    });

    // Pane unmounts (and the cleanup invalidates the guard) before the
    // main process finishes opening the session.
    mounted = false;
    guard.invalidate();
    pending.resolve({ sessionId: "session-a", state: "connected" });

    await expect(attempt).resolves.toBeNull();
    expect(closeSession).toHaveBeenCalledWith("session-a");
  });

  it("closes the session when a newer attempt superseded it", async () => {
    const pending = deferred<{ sessionId: string; state: "connected" }>();
    const closeSession = vi.fn();
    const guard = createAsyncOperationGuard();
    const attemptId = guard.issueToken();

    const attempt = resolveConnectAttempt({
      openSession: () => pending.promise,
      isStale: () => !guard.isCurrent(attemptId),
      closeSession
    });

    // A second connect() (or a disconnect()) issues a newer token first.
    guard.issueToken();
    pending.resolve({ sessionId: "session-a", state: "connected" });

    await expect(attempt).resolves.toBeNull();
    expect(closeSession).toHaveBeenCalledWith("session-a");
  });

  it("propagates openSession failures without closing anything", async () => {
    const closeSession = vi.fn();

    await expect(
      resolveConnectAttempt({
        openSession: async () => {
          throw new Error("permission denied");
        },
        isStale: () => true,
        closeSession
      })
    ).rejects.toThrow("permission denied");

    expect(closeSession).not.toHaveBeenCalled();
  });
});
