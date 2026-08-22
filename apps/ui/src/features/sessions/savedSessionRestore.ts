import type { SavedSessionRecord } from "@hypershell/shared";

import type { LayoutTab } from "../layout/layoutStore";

/**
 * Whether a recovered session row can actually be reopened from what it
 * stores.
 *
 * Two transports have nothing to reopen — an SFTP row's session was a live
 * ssh2 connection that died with the app, and a telnet row carries no
 * `telnetOptions`, so there is nothing to dial. The recovery dialog must
 * filter on this *before* listing rows: a row it shows but Restore silently
 * drops reads as a broken promise.
 */
export function isRestorableSavedSession(session: SavedSessionRecord): boolean {
  return session.transport !== "sftp" && session.transport !== "telnet";
}

/**
 * Turns a recovered session row into a tab, or `null` when the row cannot be
 * reopened from what it stores.
 *
 * The transport has to survive the round trip: a saved row's `profileId` is
 * meaningful only to its own transport (a local profile UUID, a COM port, a
 * host id), and anything defaulted to SSH gets that string dialled as a
 * hostname.
 */
export function savedSessionToLayoutTab(
  session: SavedSessionRecord,
  sessionId: string
): LayoutTab | null {
  if (!isRestorableSavedSession(session)) {
    return null;
  }

  return {
    tabKey: sessionId,
    sessionId,
    title: session.title,
    transport: session.transport,
    profileId: session.profileId,
    hostId: session.hostId ?? undefined,
    claudeSessionId: session.claudeSessionId ?? undefined,
    preopened: false,
  };
}
