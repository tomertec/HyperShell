import { useEffect, useState } from "react";

import { formatLastActive } from "./claudeResumeTime";

export interface ClaudeResumePromptProps {
  claudeSessionId: string;
  onResume: () => void;
  onFresh: () => void;
}

interface SessionInfo {
  title: string | null;
  lastActiveAt: string;
}

/**
 * Offered when a restored tab was running a Claude Code conversation.
 *
 * Resolves the conversation before asking: `claude --resume` on a session that
 * no longer exists prints "No conversation found" and exits, which would leave
 * the restored tab with a dead shell. A missing conversation therefore skips
 * the prompt entirely and opens a fresh session.
 */
export function ClaudeResumePrompt({
  claudeSessionId,
  onResume,
  onFresh,
}: ClaudeResumePromptProps) {
  const [info, setInfo] = useState<SessionInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    const lookup = window.hypershell?.claudeSessionInfo;

    if (!lookup) {
      onFresh();
      return;
    }

    void lookup({ sessionId: claudeSessionId })
      .then((result) => {
        if (cancelled) {
          return;
        }

        if (!result.info) {
          onFresh();
          return;
        }

        setInfo({ title: result.info.title, lastActiveAt: result.info.lastActiveAt });
      })
      .catch(() => {
        if (!cancelled) {
          onFresh();
        }
      });

    return () => {
      cancelled = true;
    };
  }, [claudeSessionId, onFresh]);

  if (!info) {
    return null;
  }

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-base-900/80 backdrop-blur-sm">
      <div className="max-w-sm rounded-lg border border-border bg-base-800 p-4 shadow-lg">
        <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
          Claude session
        </p>
        <p className="mt-2 text-sm text-text-primary">
          {info.title ?? "Untitled session"}
        </p>
        <p className="mt-1 text-xs text-text-muted">
          last active {formatLastActive(info.lastActiveAt)}
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onResume}
            className="flex-1 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent/90"
          >
            Resume it
          </button>
          <button
            type="button"
            onClick={onFresh}
            className="flex-1 rounded-md border border-border bg-base-700 px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-base-600 hover:text-text-primary"
          >
            Fresh shell
          </button>
        </div>
      </div>
    </div>
  );
}
