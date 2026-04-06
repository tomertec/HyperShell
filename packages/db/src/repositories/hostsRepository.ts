import type { SqliteDatabase } from "../index";
import { openDatabase } from "../index";

export type HostRecord = {
  id: string;
  name: string;
  hostname: string;
  port: number;
  username: string | null;
  authProfileId: string | null;
  groupId: string | null;
  notes: string | null;
};

export type HostInput = {
  id: string;
  name: string;
  hostname: string;
  port?: number;
  username?: string | null;
  authProfileId?: string | null;
  groupId?: string | null;
  notes?: string | null;
};

type HostRow = {
  id: string;
  name: string;
  hostname: string;
  port: number;
  username: string | null;
  auth_profile_id: string | null;
  group_id: string | null;
  notes: string | null;
};

function mapRow(row: HostRow): HostRecord {
  return {
    id: row.id,
    name: row.name,
    hostname: row.hostname,
    port: row.port,
    username: row.username,
    authProfileId: row.auth_profile_id,
    groupId: row.group_id,
    notes: row.notes
  };
}

export function createHostsRepository(databasePath = ":memory:") {
  try {
    return createHostsRepositoryFromDatabase(openDatabase(databasePath));
  } catch (error) {
    if (databasePath !== ":memory:") {
      throw error;
    }

    return createInMemoryHostsRepository();
  }
}

export function createHostsRepositoryFromDatabase(db: SqliteDatabase) {
  const insertHost = db.prepare(`
    INSERT INTO hosts (
      id, name, hostname, port, username, auth_profile_id, group_id, notes
    )
    VALUES (
      @id, @name, @hostname, @port, @username, @authProfileId, @groupId, @notes
    )
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      hostname = excluded.hostname,
      port = excluded.port,
      username = excluded.username,
      auth_profile_id = excluded.auth_profile_id,
      group_id = excluded.group_id,
      notes = excluded.notes,
      updated_at = CURRENT_TIMESTAMP
  `);

  const listHosts = db.prepare(`
    SELECT
      id, name, hostname, port, username, auth_profile_id, group_id, notes
    FROM hosts
    ORDER BY name COLLATE NOCASE ASC
  `);
  const getHostById = db
    .prepare(
      `
        SELECT
          id, name, hostname, port, username, auth_profile_id, group_id, notes
        FROM hosts
        WHERE id = ?
      `
    );

  return {
    create(input: HostInput): HostRecord {
      const normalized = {
        ...input,
        port: input.port ?? 22,
        username: input.username ?? null,
        authProfileId: input.authProfileId ?? null,
        groupId: input.groupId ?? null,
        notes: input.notes ?? null
      };

      insertHost.run(normalized);
      const row = getHostById.get(input.id) as HostRow | undefined;
      if (!row) {
        throw new Error(`Host ${input.id} was not persisted`);
      }

      return mapRow(row);
    },
    get(id: string): HostRecord | undefined {
      const row = getHostById.get(id) as HostRow | undefined;

      return row ? mapRow(row) : undefined;
    },
    list(): HostRecord[] {
      return (listHosts.all() as HostRow[]).map(mapRow);
    }
  };
}

function createInMemoryHostsRepository() {
  const hosts = new Map<string, HostRecord>();

  return {
    create(input: HostInput): HostRecord {
      const record: HostRecord = {
        id: input.id,
        name: input.name,
        hostname: input.hostname,
        port: input.port ?? 22,
        username: input.username ?? null,
        authProfileId: input.authProfileId ?? null,
        groupId: input.groupId ?? null,
        notes: input.notes ?? null
      };

      hosts.set(record.id, record);
      return record;
    },
    get(id: string): HostRecord | undefined {
      return hosts.get(id);
    },
    list(): HostRecord[] {
      return Array.from(hosts.values()).sort((left, right) =>
        left.name.localeCompare(right.name)
      );
    }
  };
}
