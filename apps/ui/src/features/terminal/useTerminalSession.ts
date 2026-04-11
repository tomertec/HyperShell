import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useStore } from "zustand";
import type { Terminal } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";
import type { SearchAddon } from "@xterm/addon-search";
import type { SessionEvent } from "@hypershell/shared";

import { broadcastStore } from "../broadcast/broadcastStore";
import { sessionStateStore } from "../sessions/sessionStateStore";
import { settingsStore } from "../settings/settingsStore";
import { getTerminalOptions } from "./terminalTheme";
import { getTerminalClipboardAction } from "./terminalClipboard";
import { getTerminalFontSizeAction } from "./terminalFontSize";
import {
  createAsyncOperationGuard,
  mapSessionEvent,
  type TerminalSessionState
} from "./terminalSessionModel";

export type { TerminalSessionState } from "./terminalSessionModel";

export interface UseTerminalSessionInput {
  transport: "ssh" | "serial" | "telnet";
  profileId: string;
  sessionId?: string;
  autoConnect?: boolean;
  telnetOptions?: { hostname: string; port: number; mode: "telnet" | "raw"; terminalType?: string };
  tmuxAttachTarget?: string;
  onSessionOpened?: (sessionId: string) => void;
}

export interface UseTerminalSessionResult {
  containerRef: RefObject<HTMLDivElement | null>;
  terminal: Terminal | null;
  searchAddon: SearchAddon | null;
  searchVisible: boolean;
  setSearchVisible: (visible: boolean) => void;
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
  fit: () => void;
  focusTerminal: () => void;
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const [searchAddon, setSearchAddon] = useState<SearchAddon | null>(null);
  const [searchVisible, setSearchVisible] = useState(false);
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

  const writeClipboardText = useCallback(async (text: string): Promise<void> => {
    if (!text || !navigator.clipboard?.writeText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      logAsyncError("clipboard write failed", error);
    }
  }, []);

  const readClipboardText = useCallback(async (): Promise<string> => {
    if (!navigator.clipboard?.readText) {
      return "";
    }

    try {
      return await navigator.clipboard.readText();
    } catch (error) {
      logAsyncError("clipboard read failed", error);
      return "";
    }
  }, []);

  const setFontSize = useCallback((fontSize: number): void => {
    void settingsStore.getState().setTerminalFontSize(fontSize);
  }, []);

  const increaseFontSize = useCallback((): void => {
    void settingsStore.getState().changeTerminalFontSize(1);
  }, []);

  const decreaseFontSize = useCallback((): void => {
    void settingsStore.getState().changeTerminalFontSize(-1);
  }, []);

  const resetFontSize = useCallback((): void => {
    void settingsStore.getState().resetTerminalFontSize();
  }, []);

  const sendSessionWrite = useCallback((sessionId: string, data: string): void => {
    if (!window.hypershell?.writeSession) {
      return;
    }

    void window.hypershell.writeSession({ sessionId, data }).catch((error) => {
      if (sessionId === sessionIdRef.current) {
        setStateSafe("failed");
        writeTerminalError(error);
      }
      logAsyncError("writeSession failed", error);
    });
  }, [setStateSafe, writeTerminalError]);

  const sendSessionResize = useCallback(
    (sessionId: string, cols: number, rows: number): void => {
      if (!window.hypershell?.resizeSession) {
        return;
      }

      void window.hypershell.resizeSession({ sessionId, cols, rows }).catch((error) => {
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

    if (effect.state === "connected" && input.tmuxAttachTarget && sessionIdRef.current) {
      const cmd = `tmux attach -t ${input.tmuxAttachTarget}\r`;
      void window.hypershell?.writeSession?.({
        sessionId: sessionIdRef.current,
        data: cmd,
      });
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
  }, [setStateSafe, input.tmuxAttachTarget]);

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
        window.hypershell?.closeSession?.({ sessionId })?.catch((error) => {
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
      const [{ Terminal: XTerm }, { FitAddon: FitAddonClass }, { SearchAddon: SearchAddonClass }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
        import("@xterm/addon-search")
      ]);
      if (disposed) {
        return;
      }

      const opts = getTerminalOptions({ ...terminalSettings, customThemes });
      instance = new XTerm(opts);
      const addon = new FitAddonClass();
      const search = new SearchAddonClass();
      instance.loadAddon(addon);
      instance.loadAddon(search);
      fitAddonRef.current = addon;
      searchAddonRef.current = search;
      terminalRef.current = instance;
      setTerminal(instance);
      setSearchAddon(search);

      container = containerRef.current;
      if (container) {
        instance.open(container);
        applyTerminalBackground(opts.theme.background);
        try { addon.fit(); } catch { /* container may not have dimensions yet */ }
        instance.focus();
        instance.writeln("hypershell ready.");

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

      const isMacLike = /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
      instance.attachCustomKeyEventHandler((event) => {
        if (event.type !== "keydown") {
          return true;
        }

        // Ctrl+Shift+F (or Cmd+Shift+F on Mac) — toggle terminal search
        const searchMod = isMacLike ? event.metaKey : event.ctrlKey;
        if (searchMod && event.shiftKey && event.key.toLowerCase() === "f") {
          event.preventDefault();
          setSearchVisible((v) => !v);
          return false;
        }

        const fontSizeAction = getTerminalFontSizeAction({
          event,
          isMacLike
        });
        if (fontSizeAction) {
          event.preventDefault();
          if (fontSizeAction === "increase") {
            increaseFontSize();
          } else if (fontSizeAction === "decrease") {
            decreaseFontSize();
          } else {
            resetFontSize();
          }
          return false;
        }

        const action = getTerminalClipboardAction({
          event,
          hasSelection: instance?.hasSelection() ?? false,
          isMacLike
        });

        if (!action) {
          return true;
        }

        event.preventDefault();

        if (action === "copy") {
          const selection = instance?.getSelection() ?? "";
          if (selection) {
            void writeClipboardText(selection);
          }
          return false;
        }

        void (async () => {
          const clipboardText = await readClipboardText();
          if (clipboardText) {
            instance?.paste(clipboardText);
          }
        })();

        return false;
      });

      disposeInput = instance.onData((data) => {
        const activeSessionId = sessionIdRef.current;

        if (!activeSessionId || !window.hypershell?.writeSession) {
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
      searchAddonRef.current = null;
      setTerminal(null);
      setSearchAddon(null);
    };
  }, [
    applyTerminalBackground,
    decreaseFontSize,
    increaseFontSize,
    readClipboardText,
    resetFontSize,
    sendSessionWrite,
    writeClipboardText
  ]);

  const connect = useCallback(async (): Promise<void> => {
    const instance = terminalRef.current;
    if (!instance || !window.hypershell?.openSession) {
      return;
    }

    const attemptId = asyncOperationGuardRef.current.issueToken();
    setStateSafe("connecting");
    try {
      const cols = instance.cols || 120;
      const rows = instance.rows || 40;
      const result = await window.hypershell.openSession({
        transport: input.transport,
        profileId: input.profileId,
        cols,
        rows,
        ...(input.telnetOptions ? { telnetOptions: input.telnetOptions } : {})
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
    input.telnetOptions,
    input.transport,
    setStateSafe,
    writeTerminalError
  ]);

  const disconnect = useCallback(async (): Promise<void> => {
    asyncOperationGuardRef.current.issueToken();
    const sessionId = sessionIdRef.current;
    if (!sessionId || !window.hypershell?.closeSession) {
      setStateSafe("disconnected");
      return;
    }

    try {
      await window.hypershell.closeSession({ sessionId });
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
      term.options.lineHeight !== opts.lineHeight ||
      term.options.letterSpacing !== opts.letterSpacing;
    Object.assign(term.options, {
      fontFamily: opts.fontFamily,
      fontSize: opts.fontSize,
      lineHeight: opts.lineHeight,
      letterSpacing: opts.letterSpacing,
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
    if (!window.hypershell?.onSessionEvent) {
      return;
    }

    const unsubscribe = window.hypershell.onSessionEvent((event) => {
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

  const focusTerminal = useCallback((): void => {
    terminalRef.current?.focus();
  }, []);

  return {
    containerRef,
    terminal,
    searchAddon,
    searchVisible,
    setSearchVisible,
    sessionId: sessionIdRef.current,
    state,
    fontSize: terminalSettings.fontSize,
    setFontSize,
    increaseFontSize,
    decreaseFontSize,
    resetFontSize,
    connect,
    disconnect,
    write,
    fit,
    focusTerminal
  };
}
