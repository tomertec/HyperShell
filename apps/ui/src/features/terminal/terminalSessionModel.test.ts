import { describe, expect, it } from "vitest";

import {
  createAsyncOperationGuard,
  mapSessionEvent
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
      clearSessionId: true
    });
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
