import type { SqliteDatabase } from "../index";
import { openDatabase } from "../index";

export type HostRecord = {
  id: string;
  name: string;
  hostname: string;
  port: number;
  username: string | null;
  identityFile: string | null;
  authProfileId: string | null;
  groupId: string | null;
  notes: string | null;
  authMethod: string;
  agentKind: string;
  opReference: string | null;
  isFavorite: boolean;
  sortOrder: number | null;
  color: string | null;
};

export type HostInput = {
  id: string;
  name: string;
  hostname: string;
  port?: number;
  username?: string | null;
  identityFile?: string | null;
  authProfileId?: string | null;
  groupId?: string | null;
  notes?: string | null;
  authMethod?: string | null;
  agentKind?: string | null;
  opReference?: string | null;
  isFavorite?: boolean;
  sortOrder?: number | null;
  color?: string | null;
};

type HostRow = {
  id: string;
  name: string;
  hostname: string;
  port: number;
  username: string | null;
  identity_file: string | null;
  auth_profile_id: string | null;
  group_id: string | null;
  notes: string | null;
  auth_method: string | null;
  agent_kind: string | null;
  op_reference: string | null;
  is_favorite: number;
  sort_order: number | null;
  color: string | null;
};

function mapRow(row: HostRow): HostRecord {
  return {
    id: row.id,
    name: row.name,
    hostname: row.hostname,
    port: row.port,
    username: row.username,
    identityFile: row.identity_file,
    authProfileId: row.auth_profile_id,
    groupId: row.group_id,
    notes: row.notes,
    authMethod: row.auth_method ?? "default",
    agentKind: row.agent_kind ?? "system",
    opReference: row.op_reference ?? null,
    isFavorite: Boolean(row.is_favorite),
    sortOrder: row.sort_order ?? null,
    color: row.color ?? null
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
      id, name, hostname, port, username, identity_file, auth_profile_id, group_id, notes,
      auth_method, agent_kind, op_reference, is_favorite, sort_order, color
    )
    VALUES (
      @id, @name, @hostname, @port, @username, @identityFile, @authProfileId, @groupId, @notes,
      @authMethod, @agentKind, @opReference, @isFavorite, @sortOrder, @color
    )
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      hostname = excluded.hostname,
      port = excluded.port,
      username = excluded.username,
      identity_file = excluded.identity_file,
      auth_profile_id = excluded.auth_profile_id,
      group_id = excluded.group_id,
      notes = excluded.notes,
      auth_method = excluded.auth_method,
      agent_kind = excluded.agent_kind,
      op_reference = excluded.op_reference,
      is_favorite = excluded.is_favorite,
      sort_order = excluded.sort_order,
      color = excluded.color,
      updated_at = CURRENT_TIMESTAMP
  `);

  const listHosts = db.prepare(`
    SELECT
      id, name, hostname, port, username, identity_file, auth_profile_id, group_id, notes,
      auth_method, agent_kind, op_reference, is_favorite, sort_order, color
    FROM hosts
    ORDER BY COALESCE(sort_order, 999999) ASC, is_favorite DESC, name COLLATE NOCASE ASC
  `);
  const getHostById = db.prepare(
    `
      SELECT
        id, name, hostname, port, username, identity_file, auth_profile_id, group_id, notes,
        auth_method, agent_kind, op_reference, is_favorite, sort_order, color
      FROM hosts
      WHERE id = ?
    `
  );
  const deleteHost = db.prepare(`DELETE FROM hosts WHERE id = ?`);

  const updateSortOrder = db.prepare(`
    UPDATE hosts SET sort_order = @sortOrder, group_id = @groupId, updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `);

  return {
    create(input: HostInput): HostRecord {
      const normalized = {
        ...input,
        port: input.port ?? 22,
        username: input.username ?? null,
        identityFile: input.identityFile ?? null,
        authProfileId: input.authProfileId ?? null,
        groupId: input.groupId ?? null,
        notes: input.notes ?? null,
        authMethod: input.authMethod ?? "default",
        agentKind: input.agentKind ?? "system",
        opReference: input.opReference ?? null,
        isFavorite: input.isFavorite ? 1 : 0,
        sortOrder: input.sortOrder ?? null,
        color: input.color ?? null
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
    },
    remove(id: string): boolean {
      const result = deleteHost.run(id);
      return result.changes > 0;
    },
    updateSortOrders(items: Array<{ id: string; sortOrder: number; groupId: string | null }>): void {
      const tx = db.transaction(() => {
        for (const item of items) {
          updateSortOrder.run({ id: item.id, sortOrder: item.sortOrder, groupId: item.groupId });
        }
      });
      tx();
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
        identityFile: input.identityFile ?? null,
        authProfileId: input.authProfileId ?? null,
        groupId: input.groupId ?? null,
        notes: input.notes ?? null,
        authMethod: input.authMethod ?? "default",
        agentKind: input.agentKind ?? "system",
        opReference: input.opReference ?? null,
        isFavorite: input.isFavorite ?? false,
        sortOrder: input.sortOrder ?? null,
        color: input.color ?? null
      };

      hosts.set(record.id, record);
      return record;
    },
    get(id: string): HostRecord | undefined {
      return hosts.get(id);
    },
    list(): HostRecord[] {
      return Array.from(hosts.values()).sort((left, right) => {
        if (left.isFavorite !== right.isFavorite) {
          return left.isFavorite ? -1 : 1;
        }
        return left.name.localeCompare(right.name);
      });
    },
    remove(id: string): boolean {
      return hosts.delete(id);
    },
    updateSortOrders(items: Array<{ id: string; sortOrder: number; groupId: string | null }>): void {
      for (const item of items) {
        const host = hosts.get(item.id);
        if (host) {
          hosts.set(item.id, { ...host, sortOrder: item.sortOrder, groupId: item.groupId });
        }
      }
    }
  };
}
