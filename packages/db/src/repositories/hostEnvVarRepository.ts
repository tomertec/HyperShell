import { randomUUID } from "node:crypto";
import type { SqliteDatabase } from "../index";

export type HostEnvVarRecord = {
  id: string;
  hostId: string;
  name: string;
  value: string;
  isEnabled: boolean;
  sortOrder: number;
  createdAt: string;
};

export type HostEnvVarInput = {
  id?: string;
  hostId: string;
  name: string;
  value?: string;
  isEnabled?: boolean;
  sortOrder?: number;
};

type HostEnvVarRow = {
  id: string;
  host_id: string;
  name: string;
  value: string;
  is_enabled: number;
  sort_order: number | null;
  created_at: string;
};

const ENV_VAR_NAME_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;

function mapRow(row: HostEnvVarRow): HostEnvVarRecord {
  return {
    id: row.id,
    hostId: row.host_id,
    name: row.name,
    value: row.value,
    isEnabled: Boolean(row.is_enabled),
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at,
  };
}

function normalizeInput(
  input: HostEnvVarInput,
  fallbackSortOrder = 0
): HostEnvVarInput & { id: string; value: string; isEnabled: boolean; sortOrder: number } {
  return {
    ...input,
    id: input.id ?? randomUUID(),
    value: input.value ?? "",
    isEnabled: input.isEnabled ?? true,
    sortOrder: input.sortOrder ?? fallbackSortOrder,
  };
}

export function createHostEnvVarRepositoryFromDatabase(db: SqliteDatabase) {
  const upsertEnvVar = db.prepare(`
    INSERT INTO host_env_vars (
      id,
      host_id,
      name,
      value,
      is_enabled,
      sort_order
    )
    VALUES (
      @id,
      @hostId,
      @name,
      @value,
      @isEnabled,
      @sortOrder
    )
    ON CONFLICT(id) DO UPDATE SET
      host_id = excluded.host_id,
      name = excluded.name,
      value = excluded.value,
      is_enabled = excluded.is_enabled,
      sort_order = excluded.sort_order
  `);

  const getById = db.prepare(`
    SELECT
      id,
      host_id,
      name,
      value,
      is_enabled,
      sort_order,
      created_at
    FROM host_env_vars
    WHERE id = ?
  `);

  const listByHostStmt = db.prepare(`
    SELECT
      id,
      host_id,
      name,
      value,
      is_enabled,
      sort_order,
      created_at
    FROM host_env_vars
    WHERE host_id = ?
    ORDER BY sort_order ASC, created_at ASC, name COLLATE NOCASE ASC
  `);

  const deleteById = db.prepare(`DELETE FROM host_env_vars WHERE id = ?`);
  const deleteByHost = db.prepare(`DELETE FROM host_env_vars WHERE host_id = ?`);

  const listEnabledByHostStmt = db.prepare(`
    SELECT
      name,
      value
    FROM host_env_vars
    WHERE host_id = ? AND is_enabled = 1
    ORDER BY sort_order ASC, created_at ASC, name COLLATE NOCASE ASC
  `);

  const replaceForHostTx = db.transaction(
    (hostId: string, envVars: HostEnvVarInput[]): HostEnvVarRecord[] => {
      deleteByHost.run(hostId);
      const inserted: HostEnvVarRecord[] = [];

      for (let index = 0; index < envVars.length; index += 1) {
        const normalized = normalizeInput({ ...envVars[index], hostId }, index);
        upsertEnvVar.run({
          ...normalized,
          isEnabled: normalized.isEnabled ? 1 : 0,
        });
        const row = getById.get(normalized.id) as HostEnvVarRow | undefined;
        if (row) {
          inserted.push(mapRow(row));
        }
      }

      return inserted;
    }
  );

  return {
    upsert(input: HostEnvVarInput): HostEnvVarRecord {
      const normalized = normalizeInput(input);
      upsertEnvVar.run({
        ...normalized,
        isEnabled: normalized.isEnabled ? 1 : 0,
      });

      const row = getById.get(normalized.id) as HostEnvVarRow | undefined;
      if (!row) {
        throw new Error(`Host env var ${normalized.id} was not persisted`);
      }
      return mapRow(row);
    },
    listByHost(hostId: string): HostEnvVarRecord[] {
      return (listByHostStmt.all(hostId) as HostEnvVarRow[]).map(mapRow);
    },
    replaceForHost(hostId: string, envVars: HostEnvVarInput[]): HostEnvVarRecord[] {
      return replaceForHostTx(hostId, envVars);
    },
    remove(id: string): boolean {
      return deleteById.run(id).changes > 0;
    },
    toEnabledEnvMap(hostId: string): Record<string, string> {
      const rows = listEnabledByHostStmt.all(hostId) as Array<{
        name: string;
        value: string;
      }>;
      const envVars: Record<string, string> = {};
      for (const row of rows) {
        if (ENV_VAR_NAME_REGEX.test(row.name)) {
          envVars[row.name] = row.value;
        }
      }
      return envVars;
    },
  };
}
