import type { LocalProfileIcon } from "@hypershell/shared";
import type { DetectedShell } from "@hypershell/session-core";

/** The narrow slice of the local profiles repository reconciliation needs. */
export type StoredProfile = {
  id: string;
  name: string;
  executable: string;
  detectKey: string | null;
  source: "user" | "detected";
  isAvailable: boolean;
  isHidden: boolean;
  sortOrder: number;
};

export interface LocalProfileStore {
  list(): StoredProfile[];
  create(input: {
    id: string;
    name: string;
    executable: string;
    args: string[];
    icon: LocalProfileIcon;
    source: "detected";
    detectKey: string;
    sortOrder: number;
  }): unknown;
  setAvailable(id: string, available: boolean): void;
}

export interface ReconcileSummary {
  inserted: string[];
  markedUnavailable: string[];
  markedAvailable: string[];
  /** Detect keys whose insert threw — most often a UNIQUE name collision. */
  skipped: Array<{ detectKey: string; reason: string }>;
}

/**
 * Inserts rows for shells we have never seen, and flips availability for rows whose
 * shell appeared or vanished. Never mutates a user-editable field: a renamed or
 * recoloured detected profile survives every pass, and a hidden one is a tombstone
 * that must not be re-inserted.
 *
 * A single failing insert is recorded and skipped rather than aborting the pass.
 * `local_profiles.name` is UNIQUE while the upsert only conflicts on `id`, so a
 * user-created profile named e.g. "PowerShell" (invisible to the detect-key map,
 * because user rows have no detect key) makes the matching detected shell's
 * insert throw. That must not cost the user every other shell — and, since this
 * runs during startup, must not escape at all. Skipping is preferred over
 * inventing a disambiguated name: the user's own profile stays authoritative and
 * no name they never chose appears in their sidebar.
 */
export function reconcileLocalProfiles(
  store: LocalProfileStore,
  detected: DetectedShell[],
  createId: () => string
): ReconcileSummary {
  const summary: ReconcileSummary = {
    inserted: [],
    markedUnavailable: [],
    markedAvailable: [],
    skipped: []
  };

  const existing = store.list();
  const byDetectKey = new Map(
    existing
      .filter((row) => row.detectKey !== null)
      .map((row) => [row.detectKey as string, row])
  );
  const detectedKeys = new Set(detected.map((shell) => shell.detectKey));
  let nextSortOrder = existing.reduce((max, row) => Math.max(max, row.sortOrder), 0);

  for (const shell of detected) {
    const row = byDetectKey.get(shell.detectKey);

    if (!row) {
      const id = createId();
      nextSortOrder += 1;
      try {
        store.create({
          id,
          name: shell.name,
          executable: shell.executable,
          args: shell.args,
          icon: shell.icon,
          source: "detected",
          detectKey: shell.detectKey,
          sortOrder: nextSortOrder
        });
      } catch (error) {
        summary.skipped.push({
          detectKey: shell.detectKey,
          reason: error instanceof Error ? error.message : String(error)
        });
        continue;
      }
      // Track newly inserted row so duplicate detectKeys in one pass don't create duplicates
      const newRow: StoredProfile = {
        id,
        name: shell.name,
        executable: shell.executable,
        detectKey: shell.detectKey,
        source: "detected",
        isAvailable: true,
        isHidden: false,
        sortOrder: nextSortOrder
      };
      byDetectKey.set(shell.detectKey, newRow);
      summary.inserted.push(id);
      continue;
    }

    if (!row.isAvailable) {
      store.setAvailable(row.id, true);
      summary.markedAvailable.push(row.id);
    }
  }

  for (const row of existing) {
    if (row.source !== "detected" || row.detectKey === null) {
      continue;
    }

    if (!detectedKeys.has(row.detectKey) && row.isAvailable) {
      store.setAvailable(row.id, false);
      summary.markedUnavailable.push(row.id);
    }
  }

  return summary;
}
