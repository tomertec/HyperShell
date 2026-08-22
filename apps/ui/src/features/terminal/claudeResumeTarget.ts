/**
 * Decides whether a restored tab should offer to reattach to the Claude Code
 * conversation it was running, and to which one.
 *
 * The two kinds of tab resume by different mechanisms, so they qualify by
 * different rules:
 *
 * - A Claude profile launches `claude` itself. Only its 'new' mode owns a
 *   private conversation worth naming; a 'continue' profile re-resolves the
 *   newest conversation for its folder on its own, so handing it a stored id
 *   would drag it back to an old one.
 * - Any other local profile is a shell the user typed `claude` into. It has no
 *   launch args to carry a conversation, so the id is reattached by typing
 *   `claude --resume` at its prompt (see main's claudeResumeCommand.ts).
 *
 * Remote transports never qualify: the conversation, if any, is running on the
 * far end where none of this applies.
 */
export interface ClaudeResumeTargetInput {
  transport: "ssh" | "serial" | "sftp" | "telnet" | "local" | undefined;
  profile: { claudeSession: boolean; claudeSessionMode: "continue" | "new" } | undefined;
  claudeSessionId: string | undefined;
}

export function resolveClaudeResumeSessionId({
  transport,
  profile,
  claudeSessionId,
}: ClaudeResumeTargetInput): string | undefined {
  if (transport !== "local" || !claudeSessionId || !profile) {
    return undefined;
  }

  if (profile.claudeSession) {
    return profile.claudeSessionMode === "new" ? claudeSessionId : undefined;
  }

  return claudeSessionId;
}
