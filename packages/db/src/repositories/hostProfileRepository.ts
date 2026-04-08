import type { SqliteDatabase } from "../index";
import { openDatabase } from "../index";

export type HostProfileRecord = {
  id: string;
  name: string;
  description: string | null;
  defaultPort: number;
  defaultUsername: string | null;
  authMethod: string;
  identityFile: string | null;
  proxyJump: string | null;
  keepAliveInterval: number | null;
  createdAt: string;
  updatedAt: string;
};

export type HostProfileInput = {
  id: string;
  name: string;
  description?: string | null;
  defaultPort?: number;
  defaultUsername?: string | null;
  authMethod?: string | null;
  identityFile?: string | null;
  proxyJump?: string | null;
  keepAliveInterval?: number | null;
};

type HostProfileRow = {
  id: string;
  name: string;
  description: string | null;
  default_port: number | null;
  default_username: string | null;
  auth_method: string | null;
  identity_file: string | null;
  proxy_jump: string | null;
  keep_alive_interval: number | null;
  created_at: string;
  updated_at: string;
};

function mapRow(row: HostProfileRow): HostProfileRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    defaultPort: row.default_port ?? 22,
    defaultUsername: row.default_username ?? null,
    authMethod: row.auth_method ?? "default",
    identityFile: row.identity_file ?? null,
    proxyJump: row.proxy_jump ?? null,
    keepAliveInterval: row.keep_alive_interval ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createHostProfileRepository(databasePath = ":memory:") {
  try {
    return createHostProfileRepositoryFromDatabase(openDatabase(databasePath));
  } catch (error) {
    if (databasePath !== ":memory:") {
      throw error;
    }
    return createInMemoryHostProfileRepository();
  }
}

export function createHostProfileRepositoryFromDatabase(db: SqliteDatabase) {
  const upsertHostProfile = db.prepare(`
    INSERT INTO host_profiles (
      id,
      name,
      description,
      default_port,
      default_username,
      auth_method,
      identity_file,
      proxy_jump,
      keep_alive_interval
    )
    VALUES (
      @id,
      @name,
      @description,
      @defaultPort,
      @defaultUsername,
      @authMethod,
      @identityFile,
      @proxyJump,
      @keepAliveInterval
    )
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      default_port = excluded.default_port,
      default_username = excluded.default_username,
      auth_method = excluded.auth_method,
      identity_file = excluded.identity_file,
      proxy_jump = excluded.proxy_jump,
      keep_alive_interval = excluded.keep_alive_interval,
      updated_at = CURRENT_TIMESTAMP
  `);

  const listHostProfiles = db.prepare(`
    SELECT
      id,
      name,
      description,
      default_port,
      default_username,
      auth_method,
      identity_file,
      proxy_jump,
      keep_alive_interval,
      created_at,
      updated_at
    FROM host_profiles
    ORDER BY name COLLATE NOCASE ASC
  `);

  const getHostProfileById = db.prepare(`
    SELECT
      id,
      name,
      description,
      default_port,
      default_username,
      auth_method,
      identity_file,
      proxy_jump,
      keep_alive_interval,
      created_at,
      updated_at
    FROM host_profiles
    WHERE id = ?
  `);

  const deleteHostProfile = db.prepare(`DELETE FROM host_profiles WHERE id = ?`);

  return {
    create(input: HostProfileInput): HostProfileRecord {
      const normalized = {
        ...input,
        description: input.description ?? null,
        defaultPort: input.defaultPort ?? 22,
        defaultUsername: input.defaultUsername ?? null,
        authMethod: input.authMethod ?? "default",
        identityFile: input.identityFile ?? null,
        proxyJump: input.proxyJump ?? null,
        keepAliveInterval: input.keepAliveInterval ?? null,
      };

      upsertHostProfile.run(normalized);
      const row = getHostProfileById.get(input.id) as HostProfileRow | undefined;
      if (!row) {
        throw new Error(`Host profile ${input.id} was not persisted`);
      }
      return mapRow(row);
    },
    get(id: string): HostProfileRecord | undefined {
      const row = getHostProfileById.get(id) as HostProfileRow | undefined;
      return row ? mapRow(row) : undefined;
    },
    list(): HostProfileRecord[] {
      return (listHostProfiles.all() as HostProfileRow[]).map(mapRow);
    },
    remove(id: string): boolean {
      const result = deleteHostProfile.run(id);
      return result.changes > 0;
    },
  };
}

function createInMemoryHostProfileRepository() {
  const profiles = new Map<string, HostProfileRecord>();

  return {
    create(input: HostProfileInput): HostProfileRecord {
      const existing = profiles.get(input.id);
      const createdAt = existing?.createdAt ?? new Date().toISOString();
      const record: HostProfileRecord = {
        id: input.id,
        name: input.name,
        description: input.description ?? null,
        defaultPort: input.defaultPort ?? 22,
        defaultUsername: input.defaultUsername ?? null,
        authMethod: input.authMethod ?? "default",
        identityFile: input.identityFile ?? null,
        proxyJump: input.proxyJump ?? null,
        keepAliveInterval: input.keepAliveInterval ?? null,
        createdAt,
        updatedAt: new Date().toISOString(),
      };
      profiles.set(record.id, record);
      return record;
    },
    get(id: string): HostProfileRecord | undefined {
      return profiles.get(id);
    },
    list(): HostProfileRecord[] {
      return Array.from(profiles.values()).sort((left, right) =>
        left.name.localeCompare(right.name)
      );
    },
    remove(id: string): boolean {
      return profiles.delete(id);
    },
  };
}
