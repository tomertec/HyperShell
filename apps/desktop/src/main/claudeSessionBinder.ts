/**
 * Works out which Claude Code conversation a local tab is running.
 *
 * A tab launched from a Claude profile gets its conversation id from the
 * command line (see ipc/claudeSessionArgs.ts). A conversation started by simply
 * typing `claude` at a PowerShell prompt has no such id — HyperShell only
 * learns that Claude is running at all, from the process-title poller. This
 * binder closes that gap by watching Claude's own session store: the tab is
 * bound to the conversation file that starts moving right after `claude`
 * appears in the tab's process tree.
 *
 * It is a correlation, not a fact, so it is deliberately conservative:
 *
 * - A file already bound to another tab is never stolen, so two tabs running
 *   Claude at once cannot collapse onto one conversation.
 * - A tab waiting for its first binding outranks a bound tab, because a new
 *   file is far more likely to be the conversation that just started than a
 *   second one inside a tab that already has its own.
 * - Only a same-directory file can replace an existing binding. That is the
 *   `/clear` case (Claude starts a fresh conversation in place, in the same
 *   project directory), and restricting it to that keeps an unrelated tab's
 *   new conversation from being adopted here.
 * - When Claude stops running in a tab the binding is dropped, so restoring
 *   that tab brings back a plain shell rather than reopening a conversation
 *   the user had already left.
 */

export interface ClaudeSessionFile {
  claudeSessionId: string;
  /** Claude's per-working-directory project folder — its encoding is opaque. */
  directory: string;
  mtimeMs: number;
}

export interface ClaudeSessionBinderDeps {
  /** Conversation files touched at or after `sinceMs`, newest last. */
  scanRecent: (sinceMs: number) => Promise<ClaudeSessionFile[]>;
  /** Starts watching the session store; returns null when watching is unavailable. */
  watch: (onChange: (file: ClaudeSessionFile) => void) => (() => void) | null;
  now?: () => number;
  /**
   * How far back a conversation file may have been touched and still count as
   * "started by this tab". The poller only notices `claude` up to a tick after
   * it launched, and Claude may have written its first line in between.
   */
  graceMs?: number;
}

export interface ClaudeSessionBinder {
  /** Feed every `process-title` event for a local session here. */
  handleProcessTitle: (sessionId: string, name: string | null) => void;
  /** Forget a session that has exited. Emits nothing — the tab is gone. */
  forget: (sessionId: string) => void;
  get: (sessionId: string) => string | undefined;
  onBinding: (
    listener: (sessionId: string, claudeSessionId: string | null) => void
  ) => () => void;
  dispose: () => void;
}

const DEFAULT_GRACE_MS = 5_000;

const CLAUDE_PROCESS_NAME = "claude";

interface BoundSession {
  claudeSessionId: string;
  directory: string;
}

export function createClaudeSessionBinder(
  deps: ClaudeSessionBinderDeps
): ClaudeSessionBinder {
  const now = deps.now ?? (() => Date.now());
  const graceMs = deps.graceMs ?? DEFAULT_GRACE_MS;
  const listeners = new Set<
    (sessionId: string, claudeSessionId: string | null) => void
  >();
  const bound = new Map<string, BoundSession>();
  /** sessionId → the moment Claude appeared, oldest first (Map keeps order). */
  const pending = new Map<string, number>();
  let stopWatching: (() => void) | null = null;

  function emit(sessionId: string, claudeSessionId: string | null): void {
    for (const listener of listeners) {
      listener(sessionId, claudeSessionId);
    }
  }

  function isClaimed(claudeSessionId: string): boolean {
    for (const session of bound.values()) {
      if (session.claudeSessionId === claudeSessionId) {
        return true;
      }
    }

    return false;
  }

  function bind(sessionId: string, file: ClaudeSessionFile): void {
    bound.set(sessionId, {
      claudeSessionId: file.claudeSessionId,
      directory: file.directory,
    });
    pending.delete(sessionId);
    emit(sessionId, file.claudeSessionId);
    stopWatchingIfIdle();
  }

  function offer(file: ClaudeSessionFile): void {
    if (isClaimed(file.claudeSessionId)) {
      return;
    }

    const waiting = pending.keys().next();
    if (!waiting.done) {
      bind(waiting.value, file);
      return;
    }

    // No tab is waiting, so this is a conversation replacing one already
    // running — `/clear`. Only the tab sitting in the same project directory
    // can own it.
    for (const [sessionId, session] of bound) {
      if (session.directory === file.directory) {
        bind(sessionId, file);
        return;
      }
    }
  }

  function startWatchingIfNeeded(): void {
    if (stopWatching || (pending.size === 0 && bound.size === 0)) {
      return;
    }

    stopWatching = deps.watch(offer);
  }

  function stopWatchingIfIdle(): void {
    if (!stopWatching || pending.size > 0 || bound.size > 0) {
      return;
    }

    stopWatching();
    stopWatching = null;
  }

  return {
    handleProcessTitle(sessionId, name) {
      if (name === CLAUDE_PROCESS_NAME) {
        if (bound.has(sessionId) || pending.has(sessionId)) {
          return;
        }

        const startedAt = now();
        pending.set(sessionId, startedAt);
        startWatchingIfNeeded();

        // The watcher only sees what happens from here on; Claude may already
        // have written its first line during the poller's tick.
        void deps
          .scanRecent(startedAt - graceMs)
          .then((files) => {
            if (!pending.has(sessionId)) {
              return;
            }

            for (const file of [...files].sort((a, b) => a.mtimeMs - b.mtimeMs)) {
              offer(file);
              if (!pending.has(sessionId)) {
                return;
              }
            }
          })
          .catch(() => {
            // No session store, or it is unreadable: the tab simply stays
            // unbound and restores as a plain shell.
          });

        return;
      }

      // Only an empty foreground — a shell sitting at its prompt — proves
      // Claude is gone. Any other name is usually a tool Claude itself
      // spawned, which is the deepest process for a moment and would
      // otherwise drop the binding several times a conversation.
      if (name !== null) {
        return;
      }

      const hadBinding = bound.delete(sessionId);
      const wasPending = pending.delete(sessionId);
      if (hadBinding) {
        emit(sessionId, null);
      }

      if (hadBinding || wasPending) {
        stopWatchingIfIdle();
      }
    },

    forget(sessionId) {
      bound.delete(sessionId);
      pending.delete(sessionId);
      stopWatchingIfIdle();
    },

    get(sessionId) {
      return bound.get(sessionId)?.claudeSessionId;
    },

    onBinding(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    dispose() {
      listeners.clear();
      bound.clear();
      pending.clear();
      stopWatching?.();
      stopWatching = null;
    },
  };
}
