import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionEvent } from "@hypershell/shared";
import { getShell, hasShell } from "../../lib/shell";

import { layoutStore } from "../layout/layoutStore";
import { sessionStateStore } from "../sessions/sessionStateStore";
import {
  normalizeTerminalFontSize,
  settingsStore,
} from "../settings/settingsStore";
import { getNextTerminalFontSize } from "./terminalFontSize";
import {
  createAsyncOperationGuard,
  mapSessionEvent,
  resolveConnectAttempt,
  type TerminalSessionState
} from "./terminalSessionModel";
import { sanitizeTitle } from "./titleSanitizer";

export type { TerminalSessionState } from "./terminalSessionModel";

const DEFAULT_GRID_COLS = 120;
const DEFAULT_GRID_ROWS = 40;

export interface UseTerminalSessionInput {
  transport: "ssh" | "serial" | "telnet" | "local";
  profileId: string;
  sessionId?: string;
  autoConnect?: boolean;
  telnetOptions?: { hostname: string; port: number; mode: "telnet" | "raw"; terminalType?: string };
  tmuxAttachTarget?: string;
  /** Resume this Claude Code conversation instead of starting a new one. */
  claudeResumeSessionId?: string;
  fontSize: number;
  onFontSizeChange: (fontSize: number) => void;
  onSessionOpened?: (sessionId: string) => void;
  /**
   * Reports the Claude session id main assigned, so the tab can persist it.
   * Carries the terminal session id because `onSessionOpened` has just replaced
   * it — the caller's captured tab id is stale by this point.
   */
  onClaudeSessionId?: (sessionId: string, claudeSessionId: string) => void;
  onExit?: (exitCode: number | null) => void;
}

export interface UseTerminalSessionResult {
  sessionId: string | null;
  state: TerminalSessionState;
  fontSize: number;
  setFontSize: (fontSize: number) => void;
  increaseFontSize: () => void;
  decreaseFontSize: () => void;
  resetFontSize: () => void;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  write: (data: string) => void;
  /** Feeds the latest ghostty-reported grid size back in, so the next
   * connect() (a reconnect, typically) seeds openSession with the real
   * terminal size instead of the DEFAULT_GRID_COLS/ROWS fallback. */
  reportGridSize: (cols: number, rows: number) => void;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.length > 0) {
    return error;
  }

  return "Unknown terminal session error";
}

function logAsyncError(context: string, error: unknown): void {
  console.warn(`[hypershell] ${context}`, error);
}

export function useTerminalSession(
  input: UseTerminalSessionInput
): UseTerminalSessionResult {
  const sessionIdRef = useRef<string | null>(input.sessionId ?? null);
  const fontSizeRef = useRef(input.fontSize);
  const onFontSizeChangeRef = useRef(input.onFontSizeChange);
  const mountedRef = useRef(true);
  const asyncOperationGuardRef = useRef(createAsyncOperationGuard());
  // input.onExit is a fresh closure every render — keep the latest one in a
  // ref rather than depending on it directly, so applySessionEvent (and the
  // onSessionEvent subscription that depends on it) doesn't get recreated on
  // every render.
  const onExitRef = useRef(input.onExit);
  const pendingSessionEventsRef = useRef<SessionEvent[]>([]);
  const eventUnsubscribeRef = useRef<(() => void) | null>(null);
  const tmuxAttachSentRef = useRef(false);
  // Seeds connect()'s openSession cols/rows. Ghostty determines the real grid
  // from its own pixel bounds + font metrics after a surface exists, so this
  // is only ever a best-effort initial size (and, on a reconnect, the last
  // size ghostty actually reported).
  const lastGridRef = useRef<{ cols: number; rows: number }>({
    cols: DEFAULT_GRID_COLS,
    rows: DEFAULT_GRID_ROWS
  });
  const [state, setState] = useState<TerminalSessionState>(
    input.sessionId ? "connecting" : "idle"
  );
  fontSizeRef.current = input.fontSize;
  onFontSizeChangeRef.current = input.onFontSizeChange;

  const setStateSafe = useCallback((nextState: TerminalSessionState): void => {
    if (!mountedRef.current) {
      return;
    }

    setState(nextState);

    const sessionId = sessionIdRef.current;
    if (sessionId) {
      sessionStateStore.getState().setSessionState(sessionId, nextState);
    }
  }, []);

  const writeTerminalError = useCallback((error: unknown): void => {
    if (!mountedRef.current) {
      return;
    }

    logAsyncError("session error", toErrorMessage(error));
  }, []);

  const setFontSize = useCallback((fontSize: number): void => {
    const normalizedFontSize = normalizeTerminalFontSize(fontSize);
    fontSizeRef.current = normalizedFontSize;
    onFontSizeChangeRef.current(normalizedFontSize);
  }, []);

  const increaseFontSize = useCallback((): void => {
    const nextFontSize = getNextTerminalFontSize(
      "increase",
      fontSizeRef.current,
      settingsStore.getState().settings.terminal.fontSize
    );
    fontSizeRef.current = nextFontSize;
    onFontSizeChangeRef.current(nextFontSize);
  }, []);

  const decreaseFontSize = useCallback((): void => {
    const nextFontSize = getNextTerminalFontSize(
      "decrease",
      fontSizeRef.current,
      settingsStore.getState().settings.terminal.fontSize
    );
    fontSizeRef.current = nextFontSize;
    onFontSizeChangeRef.current(nextFontSize);
  }, []);

  const resetFontSize = useCallback((): void => {
    const nextFontSize = getNextTerminalFontSize(
      "reset",
      fontSizeRef.current,
      settingsStore.getState().settings.terminal.fontSize
    );
    fontSizeRef.current = nextFontSize;
    onFontSizeChangeRef.current(nextFontSize);
  }, []);

  const sendSessionWrite = useCallback((sessionId: string, data: string): void => {
    if (!hasShell()) {
      return;
    }

    void getShell().writeSession({ sessionId, data }).catch((error) => {
      if (sessionId === sessionIdRef.current) {
        setStateSafe("failed");
        writeTerminalError(error);
      }
      logAsyncError("writeSession failed", error);
    });
  }, [setStateSafe, writeTerminalError]);

  const applySessionEvent = useCallback((event: SessionEvent): void => {
    const effect = mapSessionEvent(sessionIdRef.current, event);
    if (!effect.handled) {
      return;
    }

    if (effect.state) {
      setStateSafe(effect.state);
    }

    if (effect.state === "connected" && input.tmuxAttachTarget && sessionIdRef.current && !tmuxAttachSentRef.current) {
      tmuxAttachSentRef.current = true;
      const safeName = `'${input.tmuxAttachTarget.replace(/'/g, "'\\''")}'`;
      const cmd = `tmux attach -t ${safeName}\r`;
      void getShell().writeSession({
        sessionId: sessionIdRef.current,
        data: cmd,
      });
    }

    if (effect.clearSessionId) {
      sessionIdRef.current = null;
    }

    if (effect.exitCode !== undefined) {
      onExitRef.current?.(effect.exitCode ?? null);
    }

    if (effect.claudeSessionId !== undefined && sessionIdRef.current) {
      layoutStore
        .getState()
        .setTabClaudeSessionId(sessionIdRef.current, effect.claudeSessionId);
    }

    if (effect.processTitle !== undefined && sessionIdRef.current) {
      layoutStore
        .getState()
        .setTabProcessTitle(
          sessionIdRef.current,
          effect.processTitle === null ? null : sanitizeTitle(effect.processTitle)
        );
    }

    if (effect.errorMessage) {
      logAsyncError("session error", effect.errorMessage);
    }
  }, [setStateSafe, input.tmuxAttachTarget]);

  useEffect(() => {
    const asyncOperationGuard = asyncOperationGuardRef.current;
    return () => {
      mountedRef.current = false;
      asyncOperationGuard.invalidate();
      pendingSessionEventsRef.current = [];

      // Clean up event listener if still active
      eventUnsubscribeRef.current?.();
      eventUnsubscribeRef.current = null;

      const sessionId = sessionIdRef.current;
      if (sessionId) {
        sessionStateStore.getState().removeSession(sessionId);
        // Close the session on the main process side
        getShell().closeSession({ sessionId }).catch((error) => {
          logAsyncError("closeSession on unmount failed", error);
        });
        sessionIdRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!input.sessionId) {
      return;
    }

    asyncOperationGuardRef.current.issueToken();
    sessionIdRef.current = input.sessionId;
    // Only set "connecting" if the session hasn't already advanced
    // (e.g. session events may have set "connected" before this effect runs).
    const existing = sessionStateStore.getState().sessions[input.sessionId];
    if (!existing || existing.state === "connecting") {
      setStateSafe("connecting");
    }
    if (pendingSessionEventsRef.current.length > 0) {
      const queued = pendingSessionEventsRef.current;
      pendingSessionEventsRef.current = [];
      for (const event of queued) {
        applySessionEvent(event);
      }
    }
  }, [applySessionEvent, input.sessionId, setStateSafe]);

  useEffect(() => {
    onExitRef.current = input.onExit;
  }, [input.onExit]);

  const onSessionOpened = input.onSessionOpened;
  const onClaudeSessionId = input.onClaudeSessionId;

  const connect = useCallback(async (): Promise<void> => {
    if (!hasShell()) {
      return;
    }

    const attemptId = asyncOperationGuardRef.current.issueToken();
    setStateSafe("connecting");
    try {
      const { cols, rows } = lastGridRef.current;
      const result = await resolveConnectAttempt({
        openSession: () =>
          getShell().openSession({
            transport: input.transport,
            profileId: input.profileId,
            cols,
            rows,
            tmuxAttach: Boolean(input.tmuxAttachTarget),
            ...(input.claudeResumeSessionId
              ? { claudeResumeSessionId: input.claudeResumeSessionId }
              : {}),
            ...(input.telnetOptions ? { telnetOptions: input.telnetOptions } : {})
          }),
        isStale: () =>
          !mountedRef.current ||
          !asyncOperationGuardRef.current.isCurrent(attemptId),
        closeSession: (sessionId) => {
          getShell().closeSession({ sessionId }).catch((error) => {
            logAsyncError("closeSession for stale connect attempt failed", error);
          });
        }
      });

      if (!result) {
        return;
      }

      sessionIdRef.current = result.sessionId;
      onSessionOpened?.(result.sessionId);
      if (result.claudeSessionId) {
        onClaudeSessionId?.(result.sessionId, result.claudeSessionId);
      }
      // Only apply the IPC result state if the event listener hasn't
      // already advanced past it (e.g. "connected" arrived before the
      // openSession promise resolved).
      const currentStoreState = sessionStateStore.getState().sessions[result.sessionId]?.state;
      if (currentStoreState !== "connected") {
        setStateSafe(result.state);
      }

      if (pendingSessionEventsRef.current.length > 0) {
        const queued = pendingSessionEventsRef.current;
        pendingSessionEventsRef.current = [];
        for (const event of queued) {
          applySessionEvent(event);
        }
      }
    } catch (error) {
      if (
        !mountedRef.current ||
        !asyncOperationGuardRef.current.isCurrent(attemptId)
      ) {
        return;
      }

      setStateSafe("failed");
      writeTerminalError(error);
    }
  }, [
    applySessionEvent,
    onSessionOpened,
    onClaudeSessionId,
    input.claudeResumeSessionId,
    input.profileId,
    input.telnetOptions,
    input.tmuxAttachTarget,
    input.transport,
    setStateSafe,
    writeTerminalError
  ]);

  const disconnect = useCallback(async (): Promise<void> => {
    asyncOperationGuardRef.current.issueToken();
    const sessionId = sessionIdRef.current;
    if (!sessionId || !hasShell()) {
      setStateSafe("disconnected");
      return;
    }

    try {
      await getShell().closeSession({ sessionId });
      if (!mountedRef.current) {
        return;
      }

      setStateSafe("disconnected");
      sessionIdRef.current = null;
    } catch (error) {
      if (!mountedRef.current) {
        return;
      }

      setStateSafe("failed");
      writeTerminalError(error);
    }
  }, [setStateSafe, writeTerminalError]);

  const write = useCallback((data: string): void => {
    const sessionId = sessionIdRef.current;

    if (sessionId) {
      sendSessionWrite(sessionId, data);
    }
  }, [sendSessionWrite]);

  const reportGridSize = useCallback((cols: number, rows: number): void => {
    lastGridRef.current = { cols, rows };
  }, []);

  useEffect(() => {
    if (input.autoConnect === false || sessionIdRef.current) {
      return;
    }

    void connect();
  }, [connect, input.autoConnect]);

  useEffect(() => {
    if (!hasShell()) {
      return;
    }

    const unsubscribe = getShell().onSessionEvent((event) => {
      if (!sessionIdRef.current) {
        const queue = pendingSessionEventsRef.current;
        queue.push(event);
        if (queue.length > 200) {
          queue.splice(0, queue.length - 200);
        }
        return;
      }

      applySessionEvent(event);
    });

    eventUnsubscribeRef.current = unsubscribe;

    return () => {
      unsubscribe();
      eventUnsubscribeRef.current = null;
    };
  }, [applySessionEvent]);

  return {
    sessionId: sessionIdRef.current,
    state,
    fontSize: input.fontSize,
    setFontSize,
    increaseFontSize,
    decreaseFontSize,
    resetFontSize,
    connect,
    disconnect,
    write,
    reportGridSize
  };
}
