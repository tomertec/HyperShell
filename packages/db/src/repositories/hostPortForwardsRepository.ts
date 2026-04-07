import type { SqliteDatabase } from "../index";

export type HostPortForwardRecord = {
  id: string;
  hostId: string;
  name: string;
  protocol: "local" | "remote" | "dynamic";
  localAddress: string;
  localPort: number;
  remoteHost: string;
  remotePort: number;
  autoStart: boolean;
  sortOrder: number;
};

export type HostPortForwardInput = {
  id: string;
  hostId: string;
  name: string;
  protocol: "local" | "remote" | "dynamic";
  localAddress?: string;
  localPort: number;
  remoteHost?: string;
  remotePort?: number;
  autoStart?: boolean;
  sortOrder?: number;
};

type HostPortForwardRow = {
  id: string;
  host_id: string;
  name: string;
  protocol: string;
  local_address: string;
  local_port: number;
  remote_host: string;
  remote_port: number;
  auto_start: number;
  sort_order: number;
};

function mapRow(row: HostPortForwardRow): HostPortForwardRecord {
  return {
    id: row.id,
    hostId: row.host_id,
    name: row.name,
    protocol: row.protocol as "local" | "remote" | "dynamic",
    localAddress: row.local_address,
    localPort: row.local_port,
    remoteHost: row.remote_host,
    remotePort: row.remote_port,
    autoStart: Boolean(row.auto_start),
    sortOrder: row.sort_order,
  };
}

export function createHostPortForwardsRepositoryFromDatabase(db: SqliteDatabase) {
  const insert = db.prepare(`
    INSERT INTO host_port_forwards (
      id, host_id, name, protocol, local_address, local_port,
      remote_host, remote_port, auto_start, sort_order
    ) VALUES (
      @id, @hostId, @name, @protocol, @localAddress, @localPort,
      @remoteHost, @remotePort, @autoStart, @sortOrder
    )
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      protocol = excluded.protocol,
      local_address = excluded.local_address,
      local_port = excluded.local_port,
      remote_host = excluded.remote_host,
      remote_port = excluded.remote_port,
      auto_start = excluded.auto_start,
      sort_order = excluded.sort_order,
      updated_at = CURRENT_TIMESTAMP
  `);

  const listForHost = db.prepare(`
    SELECT id, host_id, name, protocol, local_address, local_port,
           remote_host, remote_port, auto_start, sort_order
    FROM host_port_forwards
    WHERE host_id = ?
    ORDER BY sort_order ASC, name COLLATE NOCASE ASC
  `);

  const getById = db.prepare(`
    SELECT id, host_id, name, protocol, local_address, local_port,
           remote_host, remote_port, auto_start, sort_order
    FROM host_port_forwards WHERE id = ?
  `);

  const deleteById = db.prepare(`DELETE FROM host_port_forwards WHERE id = ?`);

  const updateSortOrder = db.prepare(`
    UPDATE host_port_forwards SET sort_order = @sortOrder, updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `);

  return {
    create(input: HostPortForwardInput): HostPortForwardRecord {
      const normalized = {
        ...input,
        localAddress: input.localAddress ?? "127.0.0.1",
        remoteHost: input.remoteHost ?? "",
        remotePort: input.remotePort ?? 0,
        autoStart: input.autoStart ? 1 : 0,
        sortOrder: input.sortOrder ?? 0,
      };
      insert.run(normalized);
      const row = getById.get(input.id) as HostPortForwardRow;
      return mapRow(row);
    },

    update(input: HostPortForwardInput): HostPortForwardRecord {
      return this.create(input);
    },

    listForHost(hostId: string): HostPortForwardRecord[] {
      return (listForHost.all(hostId) as HostPortForwardRow[]).map(mapRow);
    },

    remove(id: string): boolean {
      return deleteById.run(id).changes > 0;
    },

    updateSortOrders(items: Array<{ id: string; sortOrder: number }>): void {
      const tx = db.transaction(() => {
        for (const item of items) {
          updateSortOrder.run({ id: item.id, sortOrder: item.sortOrder });
        }
      });
      tx();
    },
  };
}
