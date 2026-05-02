export const TERMINAL_FOCUS_REQUEST_EVENT = "hypershell:terminal-focus-request";

export type TerminalFocusRequestDetail = {
  sessionId: string | null;
};

type TerminalFocusDispatchTarget = Pick<EventTarget, "dispatchEvent">;

function createTerminalFocusEvent(
  detail: TerminalFocusRequestDetail
): CustomEvent<TerminalFocusRequestDetail> {
  if (typeof CustomEvent === "function") {
    return new CustomEvent<TerminalFocusRequestDetail>(
      TERMINAL_FOCUS_REQUEST_EVENT,
      { detail }
    );
  }

  const event = new Event(TERMINAL_FOCUS_REQUEST_EVENT) as CustomEvent<TerminalFocusRequestDetail>;
  Object.defineProperty(event, "detail", { value: detail });
  return event;
}

export function requestTerminalFocus(
  sessionId: string | null,
  target?: TerminalFocusDispatchTarget
): void {
  const focusTarget =
    target ?? (typeof window !== "undefined" ? window : null);

  focusTarget?.dispatchEvent(createTerminalFocusEvent({ sessionId }));
}

export function shouldHandleTerminalFocusRequest(
  requestedSessionId: string | null | undefined,
  currentSessionId: string | null
): boolean {
  return !requestedSessionId || requestedSessionId === currentSessionId;
}
