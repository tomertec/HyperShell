import type { SavedSessionRecord } from "@hypershell/shared";

/**
 * What the recovery dialog shows in its Title column.
 *
 * A recovery row names a *session*, but everything it knows about one is its
 * profile: a local row is titled with the profile name and targeted with the
 * profile id. Two shells launched from the same profile therefore render as two
 * byte-identical rows, which reads as the dialog listing something twice.
 * Numbering the members of such a group says what is actually true — these are
 * two separate sessions of one profile.
 */
export function savedSessionTarget(session: SavedSessionRecord): string {
  return session.hostName ?? session.profileId;
}

export function resolveSavedSessionLabels(
  sessions: SavedSessionRecord[]
): string[] {
  // NUL-joined (spelled out as an escape — a raw NUL byte in source survives
  // neither every editor nor every diff tool) so ("a b", "c") and
  // ("a", "b c") stay distinct groups.
  const rowKey = (session: SavedSessionRecord) =>
    `${session.title}\u0000${savedSessionTarget(session)}`;

  const totals = new Map<string, number>();
  for (const session of sessions) {
    const key = rowKey(session);
    totals.set(key, (totals.get(key) ?? 0) + 1);
  }

  const seen = new Map<string, number>();
  return sessions.map((session) => {
    const key = rowKey(session);
    if ((totals.get(key) ?? 0) < 2) {
      return session.title;
    }

    const ordinal = (seen.get(key) ?? 0) + 1;
    seen.set(key, ordinal);
    return `${session.title} (${ordinal})`;
  });
}
