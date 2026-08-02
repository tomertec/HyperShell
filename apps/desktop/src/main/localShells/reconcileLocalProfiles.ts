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
}

/**
 * Inserts rows for shells we have never seen, and flips availability for rows whose
 * shell appeared or vanished. Never mutates a user-editable field: a renamed or
 * recoloured detected profile survives every pass, and a hidden one is a tombstone
 * that must not be re-inserted.
 */
export function reconcileLocalProfiles(
  store: LocalProfileStore,
  detected: DetectedShell[],
  createId: () => string
): ReconcileSummary {
  const summary: ReconcileSummary = {
    inserted: [],
    markedUnavailable: [],
    markedAvailable: []
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
