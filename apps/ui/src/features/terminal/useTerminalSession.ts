import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useStore } from "zustand";
import type { Terminal } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";
import type { SessionEvent } from "@sshterm/shared";

import { broadcastStore } from "../broadcast/broadcastStore";
import { sessionStateStore } from "../sessions/sessionStateStore";
import { settingsStore } from "../settings/settingsStore";
import { getTerminalOptions } from "./terminalTheme";
import {
  createAsyncOperationGuard,
  mapSessionEvent,
  type TerminalSessionState
} from "./terminalSessionModel";

export type { TerminalSessionState } from "./terminalSessionModel";

export interface UseTerminalSessionInput {
  transport: "ssh" | "serial";
  profileId: string;
  sessionId?: string;
  autoConnect?: boolean;
  onSessionOpened?: (sessionId: string) => void;
}

export interface UseTerminalSessionResult {
  containerRef: RefObject<HTMLDivElement | null>;
  terminal: Terminal | null;
  sessionId: string | null;
  state: TerminalSessionState;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  write: (data: string) => void;
  fit: () => void;
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
  console.warn(`[sshterm] ${context}`, error);
}

export function useTerminalSession(
  input: UseTerminalSessionInput
): UseTerminalSessionResult {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const terminalSettings = useStore(settingsStore, (s) => s.settings.terminal);
  const customThemes = useStore(settingsStore, (s) => s.settings.customThemes);
  const broadcastEnabled = useStore(broadcastStore, (store) => store.enabled);
  const broadcastTargets = useStore(
    broadcastStore,
    (store) => store.targetSessionIds
  );
  const sessionIdRef = useRef<string | null>(input.sessionId ?? null);
  const mountedRef = useRef(true);
  const asyncOperationGuardRef = useRef(createAsyncOperationGuard());
  const broadcastEnabledRef = useRef(broadcastEnabled);
  const broadcastTargetsRef = useRef<string[]>(broadcastTargets);
  const pendingSessionEventsRef = useRef<SessionEvent[]>([]);
  const eventUnsubscribeRef = useRef<(() => void) | null>(null);
  const [terminal, setTerminal] = useState<Terminal | null>(null);
  const [state, setState] = useState<TerminalSessionState>(
    input.sessionId ? "connecting" : "idle"
  );

  const applyTerminalBackground = useCallback((background: string): void => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    container.style.backgroundColor = background;

    const root = container.querySelector(".xterm") as HTMLElement | null;
    if (root) {
      root.style.backgroundColor = background;
    }

    const viewport = container.querySelector(".xterm-viewport") as HTMLElement | null;
    if (viewport) {
      viewport.style.backgroundColor = background;
    }

    const canvases = container.querySelectorAll(".xterm-screen canvas");
    for (const canvas of canvases) {
      (canvas as HTMLCanvasElement).style.backgroundColor = background;
    }
  }, []);

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

    terminalRef.current?.writeln(`\r\n[error] ${toErrorMessage(error)}`);
  }, []);

  const sendSessionWrite = useCallback((sessionId: string, data: string): void => {
    if (!window.sshterm?.writeSession) {
      return;
    }

    void window.sshterm.writeSession({ sessionId, data }).catch((error) => {
      if (sessionId === sessionIdRef.current) {
        setStateSafe("failed");
        writeTerminalError(error);
      }
      logAsyncError("writeSession failed", error);
    });
  }, [setStateSafe, writeTerminalError]);

  const sendSessionResize = useCallback(
    (sessionId: string, cols: number, rows: number): void => {
      if (!window.sshterm?.resizeSession) {
        return;
      }

      void window.sshterm.resizeSession({ sessionId, cols, rows }).catch((error) => {
        if (sessionId === sessionIdRef.current) {
          setStateSafe("failed");
          writeTerminalError(error);
        }
        logAsyncError("resizeSession failed", error);
      });
    },
    [setStateSafe, writeTerminalError]
  );

  const applySessionEvent = useCallback((event: SessionEvent): void => {
    const effect = mapSessionEvent(sessionIdRef.current, event);
    if (!effect.handled) {
      return;
    }

    if (effect.state) {
      setStateSafe(effect.state);
    }

    if (effect.clearSessionId) {
      sessionIdRef.current = null;
    }

    const instance = terminalRef.current;
    if (!instance) {
      return;
    }

    if (effect.data) {
      instance.write(effect.data);
    }

    if (effect.errorMessage) {
      instance.writeln(`\r\n[error] ${effect.errorMessage}`);
    }
  }, [setStateSafe]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      asyncOperationGuardRef.current.invalidate();
      pendingSessionEventsRef.current = [];

      // Clean up event listener if still active
      eventUnsubscribeRef.current?.();
      eventUnsubscribeRef.current = null;

      const sessionId = sessionIdRef.current;
      if (sessionId) {
        sessionStateStore.getState().removeSession(sessionId);
        // Close the session on the main process side
        window.sshterm?.closeSession?.({ sessionId })?.catch((error) => {
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
    broadcastEnabledRef.current = broadcastEnabled;
    broadcastTargetsRef.current = broadcastTargets;
  }, [broadcastEnabled, broadcastTargets]);

  useEffect(() => {
    let disposed = false;
    let disposeInput: { dispose(): void } | null = null;
    let instance: Terminal | null = null;
    let container: HTMLDivElement | null = null;
    let removeFocusListeners: (() => void) | null = null;

    void (async () => {
      const [{ Terminal: XTerm }, { FitAddon: FitAddonClass }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit")
      ]);
      if (disposed) {
        return;
      }

      const opts = getTerminalOptions({ ...terminalSettings, customThemes });
      instance = new XTerm(opts);
      const addon = new FitAddonClass();
      instance.loadAddon(addon);
      fitAddonRef.current = addon;
      terminalRef.current = instance;
      setTerminal(instance);

      container = containerRef.current;
      if (container) {
        instance.open(container);
        applyTerminalBackground(opts.theme.background);
        try { addon.fit(); } catch { /* container may not have dimensions yet */ }
        instance.focus();
        instance.writeln("sshterm ready.");

        const focusTerminal = () => {
          instance?.focus();
        };
        container.addEventListener("mousedown", focusTerminal);
        container.addEventListener("touchstart", focusTerminal, { passive: true });
        removeFocusListeners = () => {
          container?.removeEventListener("mousedown", focusTerminal);
          container?.removeEventListener("touchstart", focusTerminal);
        };
      }

      disposeInput = instance.onData((data) => {
        const activeSessionId = sessionIdRef.current;

        if (!activeSessionId || !window.sshterm?.writeSession) {
          return;
        }

        const targetSessionIds =
          broadcastEnabledRef.current && broadcastTargetsRef.current.length > 0
            ? broadcastTargetsRef.current
            : [activeSessionId];

        for (const sessionId of targetSessionIds) {
          sendSessionWrite(sessionId, data);
        }
      });
    })();

    return () => {
      disposed = true;
      disposeInput?.dispose();
      removeFocusListeners?.();
      instance?.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      setTerminal(null);
    };
  }, [applyTerminalBackground, sendSessionWrite]);

  const connect = useCallback(async (): Promise<void> => {
    const instance = terminalRef.current;
    if (!instance || !window.sshterm?.openSession) {
      return;
    }

    const attemptId = asyncOperationGuardRef.current.issueToken();
    setStateSafe("connecting");
    try {
      const cols = instance.cols || 120;
      const rows = instance.rows || 40;
      const result = await window.sshterm.openSession({
        transport: input.transport,
        profileId: input.profileId,
        cols,
        rows
      });

      if (
        !mountedRef.current ||
        !asyncOperationGuardRef.current.isCurrent(attemptId)
      ) {
        return;
      }

      sessionIdRef.current = result.sessionId;
      input.onSessionOpened?.(result.sessionId);
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
    input.onSessionOpened,
    input.profileId,
    input.transport,
    setStateSafe,
    writeTerminalError
  ]);

  const disconnect = useCallback(async (): Promise<void> => {
    asyncOperationGuardRef.current.issueToken();
    const sessionId = sessionIdRef.current;
    if (!sessionId || !window.sshterm?.closeSession) {
      setStateSafe("disconnected");
      return;
    }

    try {
      await window.sshterm.closeSession({ sessionId });
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

  const fit = useCallback((): void => {
    const instance = terminalRef.current;
    const addon = fitAddonRef.current;

    if (!instance || !addon) {
      return;
    }

    try {
      addon.fit();
    } catch {
      return;
    }

    const sessionId = sessionIdRef.current;
    if (sessionId) {
      sendSessionResize(sessionId, instance.cols, instance.rows);
    }
  }, [sendSessionResize]);

  useEffect(() => {
    const term = terminalRef.current;
    if (!term) return;
    const opts = getTerminalOptions({ ...terminalSettings, customThemes });
    const needsRefit =
      term.options.fontFamily !== opts.fontFamily ||
      term.options.fontSize !== opts.fontSize ||
      term.options.lineHeight !== opts.lineHeight;
    Object.assign(term.options, {
      fontFamily: opts.fontFamily,
      fontSize: opts.fontSize,
      lineHeight: opts.lineHeight,
      cursorBlink: opts.cursorBlink,
      scrollback: opts.scrollback,
      theme: opts.theme,
    });
    applyTerminalBackground(opts.theme.background);
    if (needsRefit) fit();
  }, [applyTerminalBackground, terminalSettings, customThemes, fit]);

  useEffect(() => {
    if (!terminal || input.autoConnect === false || sessionIdRef.current) {
      return;
    }

    void connect();
  }, [connect, input.autoConnect, terminal]);

  useEffect(() => {
    if (!window.sshterm?.onSessionEvent) {
      return;
    }

    const unsubscribe = window.sshterm.onSessionEvent((event) => {
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

  useEffect(() => {
    const onResize = () => {
      fit();
    };

    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, [fit]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let raf: number | null = null;
    const resizeObserver = new ResizeObserver(() => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        fit();
        raf = null;
      });
    });
    resizeObserver.observe(container);

    // Re-fit when the terminal becomes visible (e.g. tab switch).
    // visibility:hidden keeps layout dimensions, so ResizeObserver won't fire.
    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          requestAnimationFrame(() => fit());
        }
      },
      { threshold: 0.1 }
    );
    intersectionObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [fit]);

  return {
    containerRef,
    terminal,
    sessionId: sessionIdRef.current,
    state,
    connect,
    disconnect,
    write,
    fit
  };
}
