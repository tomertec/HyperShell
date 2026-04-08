import { randomUUID } from "node:crypto";
import { openDatabase } from "../index";
import type { SqliteDatabase } from "../index";

export type ConnectionHistoryRecord = {
  id: string;
  hostId: string | null;
  hostName: string | null;
  connectedAt: string;
  disconnectedAt: string | null;
  wasSuccessful: boolean;
  errorMessage: string | null;
};

type ConnectionHistoryRow = {
  id: string;
  host_id: string | null;
  host_name: string | null;
  connected_at: string;
  disconnected_at: string | null;
  was_successful: number;
  error_message: string | null;
};

function mapRow(row: ConnectionHistoryRow): ConnectionHistoryRecord {
  return {
    id: row.id,
    hostId: row.host_id,
    hostName: row.host_name,
    connectedAt: row.connected_at,
    disconnectedAt: row.disconnected_at,
    wasSuccessful: row.was_successful === 1,
    errorMessage: row.error_message,
  };
}

export function createConnectionHistoryRepository(databasePath = ":memory:") {
  return createConnectionHistoryRepositoryFromDatabase(openDatabase(databasePath));
}

export function createConnectionHistoryRepositoryFromDatabase(db: SqliteDatabase) {
  const byId = db.prepare(`
    SELECT ch.id,
           ch.host_id,
           h.name AS host_name,
           ch.connected_at,
           ch.disconnected_at,
           ch.was_successful,
           ch.error_message
    FROM connection_history ch
    LEFT JOIN hosts h ON h.id = ch.host_id
    WHERE ch.id = ?
  `);

  const insert = db.prepare(`
    INSERT INTO connection_history (id, host_id, was_successful, error_message)
    VALUES (@id, @hostId, @wasSuccessful, @errorMessage)
  `);

  const markDisconnected = db.prepare(`
    UPDATE connection_history
    SET disconnected_at = @disconnectedAt
    WHERE id = @id AND disconnected_at IS NULL
  `);

  const listByHost = db.prepare(`
    SELECT ch.id,
           ch.host_id,
           h.name AS host_name,
           ch.connected_at,
           ch.disconnected_at,
           ch.was_successful,
           ch.error_message
    FROM connection_history ch
    LEFT JOIN hosts h ON h.id = ch.host_id
    WHERE ch.host_id = ?
    ORDER BY ch.connected_at DESC, ch.id DESC
    LIMIT ?
  `);

  const listRecent = db.prepare(`
    SELECT ch.id,
           ch.host_id,
           h.name AS host_name,
           ch.connected_at,
           ch.disconnected_at,
           ch.was_successful,
           ch.error_message
    FROM connection_history ch
    LEFT JOIN hosts h ON h.id = ch.host_id
    ORDER BY ch.connected_at DESC, ch.id DESC
    LIMIT ?
  `);

  const cleanup = db.prepare(`
    DELETE FROM connection_history
    WHERE julianday(connected_at) < julianday('now', ?)
  `);

  return {
    record(hostId: string | null, success: boolean, errorMessage?: string | null): ConnectionHistoryRecord {
      const id = randomUUID();
      insert.run({
        id,
        hostId,
        wasSuccessful: success ? 1 : 0,
        errorMessage: errorMessage ?? null,
      });
      const row = byId.get(id) as ConnectionHistoryRow | undefined;
      if (!row) {
        throw new Error(`Connection history ${id} was not persisted`);
      }
      return mapRow(row);
    },

    markDisconnected(id: string, disconnectedAt = new Date().toISOString()): boolean {
      const result = markDisconnected.run({ id, disconnectedAt });
      return result.changes > 0;
    },

    listByHost(hostId: string, limit = 100): ConnectionHistoryRecord[] {
      return (listByHost.all(hostId, limit) as ConnectionHistoryRow[]).map(mapRow);
    },

    listRecent(limit = 100): ConnectionHistoryRecord[] {
      return (listRecent.all(limit) as ConnectionHistoryRow[]).map(mapRow);
    },

    cleanup(olderThanDays: number): number {
      const normalizedDays = Math.max(1, Math.floor(olderThanDays));
      const result = cleanup.run(`-${normalizedDays} days`);
      return Number(result.changes);
    },
  };
}
