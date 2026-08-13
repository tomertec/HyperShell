/**
 * Builds the launch args for a local profile flagged as a Claude Code launcher.
 *
 * The renderer is never allowed to supply an executable or raw args — it may
 * only pass a UUID, and only that UUID reaches the command line here, as the
 * value of `--resume`. A profile without `claudeSession` is left untouched even
 * if the renderer asks for a resume, so the flag is the sole gate.
 *
 * Two modes, because they answer different questions:
 *   'continue' → `--continue` picks up the newest conversation for the working
 *                directory whatever started it, so a tab reattaches to a session
 *                that was begun by typing `claude` into a PowerShell tab. It is
 *                safe with no prior conversation — Claude just starts a new one.
 *   'new'      → `--session-id <uuid>` gives the tab a private conversation that
 *                a later launch can reopen exactly via `--resume <uuid>`, which
 *                is what keeps two Claude tabs in one repo from colliding.
 */
export type ClaudeSessionMode = "continue" | "new";

export interface ClaudeLaunchProfile {
  args: string[];
  claudeSession: boolean;
  claudeSessionMode: ClaudeSessionMode;
}

export interface ClaudeLaunchArgs {
  args: string[];
  claudeSessionId?: string;
}

export function applyClaudeSessionArgs(
  profile: ClaudeLaunchProfile,
  requestedResumeSessionId: string | undefined,
  generateSessionId: () => string
): ClaudeLaunchArgs {
  if (!profile.claudeSession) {
    return { args: profile.args };
  }

  // Mode wins over a stored id: a profile switched to 'continue' must not be
  // dragged back to an old conversation by an id a tab persisted earlier.
  if (profile.claudeSessionMode === "continue") {
    return { args: [...profile.args, "--continue"] };
  }

  if (requestedResumeSessionId) {
    return {
      args: [...profile.args, "--resume", requestedResumeSessionId],
      claudeSessionId: requestedResumeSessionId,
    };
  }

  const sessionId = generateSessionId();
  return {
    args: [...profile.args, "--session-id", sessionId],
    claudeSessionId: sessionId,
  };
}
