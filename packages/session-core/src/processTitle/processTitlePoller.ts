import { pickForegroundName, type ProcessTreeProvider } from "./foregroundProcess";

export interface ProcessTitlePollerDeps {
  provider: ProcessTreeProvider;
  intervalMs?: number;
}

export interface ProcessTitlePoller {
  register(sessionId: string, pid: number): void;
  unregister(sessionId: string): void;
  onChange(listener: (sessionId: string, name: string | null) => void): () => void;
  stop(): void;
}

interface TrackedSession {
  pid: number;
  lastName: string | null;
}

const DEFAULT_INTERVAL_MS = 1000;

/**
 * Walks each registered pty's process tree on an interval and reports the
 * foreground program. The timer only runs while at least one session is
 * registered, so an all-SSH workspace costs nothing.
 */
export function createProcessTitlePoller(deps: ProcessTitlePollerDeps): ProcessTitlePoller {
  const intervalMs = deps.intervalMs ?? DEFAULT_INTERVAL_MS;
  const tracked = new Map<string, TrackedSession>();
  const listeners = new Set<(sessionId: string, name: string | null) => void>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let ticking = false;

  async function tick(): Promise<void> {
    // Guard against a slow provider overlapping the next interval.
    if (ticking) {
      return;
    }

    ticking = true;

    try {
      for (const [sessionId, session] of Array.from(tracked)) {
        let name: string | null = null;

        try {
          name = pickForegroundName(await deps.provider(session.pid));
        } catch {
          // A failed walk is not evidence the program exited — keep the last
          // name and try again next tick.
          continue;
        }

        // The session may have been unregistered while we awaited.
        const current = tracked.get(sessionId);
        if (!current || current.lastName === name) {
          continue;
        }

        current.lastName = name;
        for (const listener of listeners) {
          listener(sessionId, name);
        }
      }
    } finally {
      ticking = false;
    }
  }

  function startTimer(): void {
    if (timer !== null) {
      return;
    }

    timer = setInterval(() => {
      void tick();
    }, intervalMs);
  }

  function stopTimer(): void {
    if (timer === null) {
      return;
    }

    clearInterval(timer);
    timer = null;
  }

  return {
    register(sessionId, pid) {
      tracked.set(sessionId, { pid, lastName: null });
      startTimer();
    },

    unregister(sessionId) {
      tracked.delete(sessionId);
      if (tracked.size === 0) {
        stopTimer();
      }
    },

    onChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    stop() {
      tracked.clear();
      listeners.clear();
      stopTimer();
    }
  };
}
