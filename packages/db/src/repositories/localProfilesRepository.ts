import type { LocalProfileIcon } from "@hypershell/shared";
import type { SqliteDatabase } from "../index";
import { openDatabase } from "../index";

export type LocalProfileRecord = {
  id: string;
  name: string;
  executable: string;
  args: string[];
  startingDirectory: string | null;
  icon: LocalProfileIcon;
  color: string | null;
  elevated: boolean;
  source: "user" | "detected";
  detectKey: string | null;
  isAvailable: boolean;
  isHidden: boolean;
  sortOrder: number;
};

export type LocalProfileInput = {
  id: string;
  name: string;
  executable: string;
  args?: string[];
  startingDirectory?: string | null;
  icon?: LocalProfileIcon;
  color?: string | null;
  elevated?: boolean;
  source?: "user" | "detected";
  detectKey?: string | null;
  isAvailable?: boolean;
  isHidden?: boolean;
  sortOrder?: number;
};

export type LocalProfileEnvVar = {
  name: string;
  value: string;
  isEnabled: boolean;
};

type LocalProfileRow = {
  id: string;
  name: string;
  executable: string;
  args_json: string;
  starting_directory: string | null;
  icon: string;
  color: string | null;
  elevated: number;
  source: string;
  detect_key: string | null;
  is_available: number;
  is_hidden: number;
  sort_order: number;
};

const PROFILE_COLUMNS = `
  id, name, executable, args_json, starting_directory, icon, color,
  elevated, source, detect_key, is_available, is_hidden, sort_order
`;

function parseArgs(argsJson: string): string[] {
  try {
    const parsed = JSON.parse(argsJson) as unknown;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function mapRow(row: LocalProfileRow): LocalProfileRecord {
  return {
    id: row.id,
    name: row.name,
    executable: row.executable,
    args: parseArgs(row.args_json),
    startingDirectory: row.starting_directory,
    icon: row.icon as LocalProfileIcon,
    color: row.color,
    elevated: row.elevated !== 0,
    source: row.source === "detected" ? "detected" : "user",
    detectKey: row.detect_key,
    isAvailable: row.is_available !== 0,
    isHidden: row.is_hidden !== 0,
    sortOrder: row.sort_order
  };
}

export function createLocalProfilesRepository(databasePath = ":memory:") {
  return createLocalProfilesRepositoryFromDatabase(openDatabase(databasePath));
}

export function createLocalProfilesRepositoryFromDatabase(db: SqliteDatabase) {
  const upsertProfile = db.prepare(`
    INSERT INTO local_profiles (
      id, name, executable, args_json, starting_directory, icon, color,
      elevated, source, detect_key, is_available, is_hidden, sort_order
    )
    VALUES (
      @id, @name, @executable, @argsJson, @startingDirectory, @icon, @color,
      @elevated, @source, @detectKey, @isAvailable, @isHidden, @sortOrder
    )
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      executable = excluded.executable,
      args_json = excluded.args_json,
      starting_directory = excluded.starting_directory,
      icon = excluded.icon,
      color = excluded.color,
      elevated = excluded.elevated,
      source = excluded.source,
      detect_key = excluded.detect_key,
      is_available = excluded.is_available,
      is_hidden = excluded.is_hidden,
      sort_order = excluded.sort_order,
      updated_at = CURRENT_TIMESTAMP
  `);

  const selectById = db.prepare(`SELECT ${PROFILE_COLUMNS} FROM local_profiles WHERE id = ?`);
  const selectByDetectKey = db.prepare(
    `SELECT ${PROFILE_COLUMNS} FROM local_profiles WHERE detect_key = ?`
  );
  const selectAll = db.prepare(`
    SELECT ${PROFILE_COLUMNS} FROM local_profiles
    ORDER BY sort_order ASC, name COLLATE NOCASE ASC
  `);
  const deleteProfile = db.prepare(`DELETE FROM local_profiles WHERE id = ?`);
  const updateHidden = db.prepare(
    `UPDATE local_profiles SET is_hidden = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  );
  const updateAvailable = db.prepare(
    `UPDATE local_profiles SET is_available = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  );
  const updateSortOrder = db.prepare(
    `UPDATE local_profiles SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  );

  const deleteEnvVars = db.prepare(`DELETE FROM local_profile_env_vars WHERE profile_id = ?`);
  const insertEnvVar = db.prepare(`
    INSERT INTO local_profile_env_vars (id, profile_id, name, value, is_enabled, sort_order)
    VALUES (@id, @profileId, @name, @value, @isEnabled, @sortOrder)
  `);
  const selectEnvVars = db.prepare(`
    SELECT name, value, is_enabled FROM local_profile_env_vars
    WHERE profile_id = ? ORDER BY sort_order ASC, name ASC
  `);

  function get(id: string): LocalProfileRecord | undefined {
    const row = selectById.get(id) as LocalProfileRow | undefined;
    return row ? mapRow(row) : undefined;
  }

  return {
    create(input: LocalProfileInput): LocalProfileRecord {
      upsertProfile.run({
        id: input.id,
        name: input.name,
        executable: input.executable,
        argsJson: JSON.stringify(input.args ?? []),
        startingDirectory: input.startingDirectory ?? null,
        icon: input.icon ?? "terminal",
        color: input.color ?? null,
        elevated: input.elevated ? 1 : 0,
        source: input.source ?? "user",
        detectKey: input.detectKey ?? null,
        isAvailable: input.isAvailable === false ? 0 : 1,
        isHidden: input.isHidden ? 1 : 0,
        sortOrder: input.sortOrder ?? 0
      });

      const created = get(input.id);
      if (!created) {
        throw new Error(`Local profile ${input.id} was not persisted`);
      }

      return created;
    },
    get,
    getByDetectKey(detectKey: string): LocalProfileRecord | undefined {
      const row = selectByDetectKey.get(detectKey) as LocalProfileRow | undefined;
      return row ? mapRow(row) : undefined;
    },
    list(): LocalProfileRecord[] {
      return (selectAll.all() as LocalProfileRow[]).map(mapRow);
    },
    remove(id: string): boolean {
      return deleteProfile.run(id).changes > 0;
    },
    setHidden(id: string, hidden: boolean): void {
      updateHidden.run(hidden ? 1 : 0, id);
    },
    setAvailable(id: string, available: boolean): void {
      updateAvailable.run(available ? 1 : 0, id);
    },
    reorder(items: Array<{ id: string; sortOrder: number }>): void {
      const run = db.transaction((rows: Array<{ id: string; sortOrder: number }>) => {
        for (const row of rows) {
          updateSortOrder.run(row.sortOrder, row.id);
        }
      });
      run(items);
    },
    listEnvVars(profileId: string): LocalProfileEnvVar[] {
      const rows = selectEnvVars.all(profileId) as Array<{
        name: string;
        value: string;
        is_enabled: number;
      }>;

      return rows.map((row) => ({
        name: row.name,
        value: row.value,
        isEnabled: row.is_enabled !== 0
      }));
    },
    replaceEnvVars(profileId: string, vars: LocalProfileEnvVar[]): void {
      const run = db.transaction((rows: LocalProfileEnvVar[]) => {
        deleteEnvVars.run(profileId);
        rows.forEach((row, index) => {
          insertEnvVar.run({
            id: `${profileId}:${index}:${row.name}`,
            profileId,
            name: row.name,
            value: row.value,
            isEnabled: row.isEnabled ? 1 : 0,
            sortOrder: index
          });
        });
      });
      run(vars);
    }
  };
}
