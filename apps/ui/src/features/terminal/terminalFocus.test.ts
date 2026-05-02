import { describe, expect, it } from "vitest";

import {
  TERMINAL_FOCUS_REQUEST_EVENT,
  requestTerminalFocus,
  shouldHandleTerminalFocusRequest,
} from "./terminalFocus";

describe("terminalFocus", () => {
  it("dispatches a focus request for the active session", () => {
    const dispatchedEvents: Event[] = [];

    requestTerminalFocus("session-1", {
      dispatchEvent: (event: Event) => {
        dispatchedEvents.push(event);
        return true;
      }
    });

    expect(dispatchedEvents).toHaveLength(1);
    const event = dispatchedEvents[0] as CustomEvent<{ sessionId: string | null }>;
    expect(event.type).toBe(TERMINAL_FOCUS_REQUEST_EVENT);
    expect(event.detail).toEqual({ sessionId: "session-1" });
  });

  it("handles only matching session-specific focus requests", () => {
    expect(shouldHandleTerminalFocusRequest("session-1", "session-1")).toBe(true);
    expect(shouldHandleTerminalFocusRequest("session-1", "session-2")).toBe(false);
  });

  it("allows untargeted focus requests", () => {
    expect(shouldHandleTerminalFocusRequest(null, "session-1")).toBe(true);
    expect(shouldHandleTerminalFocusRequest(undefined, null)).toBe(true);
  });
});
