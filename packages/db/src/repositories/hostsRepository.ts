import type { SqliteDatabase } from "../index";
import { openDatabase } from "../index";

export type HostRecord = {
  id: string;
  name: string;
  hostname: string;
  port: number;
  username: string | null;
  identityFile: string | null;
  hostProfileId: string | null;
  authProfileId: string | null;
  groupId: string | null;
  notes: string | null;
  authMethod: string;
  agentKind: string;
  opReference: string | null;
  isFavorite: boolean;
  sortOrder: number | null;
  color: string | null;
  proxyJump: string | null;
  proxyJumpHostIds: string | null;
  keepAliveInterval: number | null;
  autoReconnect: boolean;
  reconnectMaxAttempts: number;
  reconnectBaseInterval: number;
};

export type HostInput = {
  id: string;
  name: string;
  hostname: string;
  port?: number;
  username?: string | null;
  identityFile?: string | null;
  hostProfileId?: string | null;
  authProfileId?: string | null;
  groupId?: string | null;
  notes?: string | null;
  authMethod?: string | null;
  agentKind?: string | null;
  opReference?: string | null;
  isFavorite?: boolean;
  sortOrder?: number | null;
  color?: string | null;
  proxyJump?: string | null;
  proxyJumpHostIds?: string | null;
  keepAliveInterval?: number | null;
  autoReconnect?: boolean;
  reconnectMaxAttempts?: number;
  reconnectBaseInterval?: number;
};

type HostRow = {
  id: string;
  name: string;
  hostname: string;
  port: number;
  username: string | null;
  identity_file: string | null;
  host_profile_id: string | null;
  auth_profile_id: string | null;
  group_id: string | null;
  notes: string | null;
  auth_method: string | null;
  agent_kind: string | null;
  op_reference: string | null;
  is_favorite: number;
  sort_order: number | null;
  color: string | null;
  proxy_jump: string | null;
  proxy_jump_host_ids: string | null;
  keep_alive_interval: number | null;
  auto_reconnect: number;
  reconnect_max_attempts: number;
  reconnect_base_interval: number;
};

function mapRow(row: HostRow): HostRecord {
  return {
    id: row.id,
    name: row.name,
    hostname: row.hostname,
    port: row.port,
    username: row.username,
    identityFile: row.identity_file,
    hostProfileId: row.host_profile_id,
    authProfileId: row.auth_profile_id,
    groupId: row.group_id,
    notes: row.notes,
    authMethod: row.auth_method ?? "default",
    agentKind: row.agent_kind ?? "system",
    opReference: row.op_reference ?? null,
    isFavorite: Boolean(row.is_favorite),
    sortOrder: row.sort_order ?? null,
    color: row.color ?? null,
    proxyJump: row.proxy_jump ?? null,
    proxyJumpHostIds: row.proxy_jump_host_ids ?? null,
    keepAliveInterval: row.keep_alive_interval ?? null,
    autoReconnect: Boolean(row.auto_reconnect),
    reconnectMaxAttempts: row.reconnect_max_attempts ?? 5,
    reconnectBaseInterval: row.reconnect_base_interval ?? 1,
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
      id, name, hostname, port, username, identity_file, host_profile_id, auth_profile_id, group_id, notes,
      auth_method, agent_kind, op_reference, is_favorite, sort_order, color,
      proxy_jump, proxy_jump_host_ids, keep_alive_interval,
      auto_reconnect, reconnect_max_attempts, reconnect_base_interval
    )
    VALUES (
      @id, @name, @hostname, @port, @username, @identityFile, @hostProfileId, @authProfileId, @groupId, @notes,
      @authMethod, @agentKind, @opReference, @isFavorite, @sortOrder, @color,
      @proxyJump, @proxyJumpHostIds, @keepAliveInterval,
      @autoReconnect, @reconnectMaxAttempts, @reconnectBaseInterval
    )
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      hostname = excluded.hostname,
      port = excluded.port,
      username = excluded.username,
      identity_file = excluded.identity_file,
      host_profile_id = excluded.host_profile_id,
      auth_profile_id = excluded.auth_profile_id,
      group_id = excluded.group_id,
      notes = excluded.notes,
      auth_method = excluded.auth_method,
      agent_kind = excluded.agent_kind,
      op_reference = excluded.op_reference,
      is_favorite = excluded.is_favorite,
      sort_order = excluded.sort_order,
      color = excluded.color,
      proxy_jump = excluded.proxy_jump,
      proxy_jump_host_ids = excluded.proxy_jump_host_ids,
      keep_alive_interval = excluded.keep_alive_interval,
      auto_reconnect = excluded.auto_reconnect,
      reconnect_max_attempts = excluded.reconnect_max_attempts,
      reconnect_base_interval = excluded.reconnect_base_interval,
      updated_at = CURRENT_TIMESTAMP
  `);

  const listHosts = db.prepare(`
    SELECT
      id, name, hostname, port, username, identity_file, host_profile_id, auth_profile_id, group_id, notes,
      auth_method, agent_kind, op_reference, is_favorite, sort_order, color,
      proxy_jump, proxy_jump_host_ids, keep_alive_interval,
      auto_reconnect, reconnect_max_attempts, reconnect_base_interval
    FROM hosts
    ORDER BY COALESCE(sort_order, 999999) ASC, is_favorite DESC, name COLLATE NOCASE ASC
  `);
  const getHostById = db.prepare(
    `
      SELECT
        id, name, hostname, port, username, identity_file, host_profile_id, auth_profile_id, group_id, notes,
        auth_method, agent_kind, op_reference, is_favorite, sort_order, color,
        proxy_jump, proxy_jump_host_ids, keep_alive_interval,
        auto_reconnect, reconnect_max_attempts, reconnect_base_interval
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
        hostProfileId: input.hostProfileId ?? null,
        authProfileId: input.authProfileId ?? null,
        groupId: input.groupId ?? null,
        notes: input.notes ?? null,
        authMethod: input.authMethod ?? "default",
        agentKind: input.agentKind ?? "system",
        opReference: input.opReference ?? null,
        isFavorite: input.isFavorite ? 1 : 0,
        sortOrder: input.sortOrder ?? null,
        color: input.color ?? null,
        proxyJump: input.proxyJump ?? null,
        proxyJumpHostIds: input.proxyJumpHostIds ?? null,
        keepAliveInterval: input.keepAliveInterval ?? null,
        autoReconnect: input.autoReconnect ? 1 : 0,
        reconnectMaxAttempts: input.reconnectMaxAttempts ?? 5,
        reconnectBaseInterval: input.reconnectBaseInterval ?? 1,
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
        hostProfileId: input.hostProfileId ?? null,
        authProfileId: input.authProfileId ?? null,
        groupId: input.groupId ?? null,
        notes: input.notes ?? null,
        authMethod: input.authMethod ?? "default",
        agentKind: input.agentKind ?? "system",
        opReference: input.opReference ?? null,
        isFavorite: input.isFavorite ?? false,
        sortOrder: input.sortOrder ?? null,
        color: input.color ?? null,
        proxyJump: input.proxyJump ?? null,
        proxyJumpHostIds: input.proxyJumpHostIds ?? null,
        keepAliveInterval: input.keepAliveInterval ?? null,
        autoReconnect: input.autoReconnect ?? false,
        reconnectMaxAttempts: input.reconnectMaxAttempts ?? 5,
        reconnectBaseInterval: input.reconnectBaseInterval ?? 1,
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
