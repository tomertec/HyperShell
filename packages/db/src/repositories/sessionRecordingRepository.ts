import type { SqliteDatabase } from "../index";
import { openDatabase } from "../index";

export type SessionRecordingRecord = {
  id: string;
  hostId: string | null;
  title: string;
  fileName: string;
  width: number;
  height: number;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  fileSizeBytes: number | null;
  eventCount: number | null;
  createdAt: string;
};

export type SessionRecordingInput = {
  id: string;
  hostId?: string | null;
  title: string;
  fileName: string;
  width: number;
  height: number;
  startedAt: string;
};

export type CompleteSessionRecordingInput = {
  endedAt: string;
  durationMs: number;
  fileSizeBytes: number;
  eventCount: number;
};

type SessionRecordingRow = {
  id: string;
  host_id: string | null;
  title: string;
  file_name: string;
  width: number;
  height: number;
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  file_size_bytes: number | null;
  event_count: number | null;
  created_at: string;
};

function mapRow(row: SessionRecordingRow): SessionRecordingRecord {
  return {
    id: row.id,
    hostId: row.host_id,
    title: row.title,
    fileName: row.file_name,
    width: row.width,
    height: row.height,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationMs: row.duration_ms,
    fileSizeBytes: row.file_size_bytes,
    eventCount: row.event_count,
    createdAt: row.created_at,
  };
}

export function createSessionRecordingRepository(databasePath = ":memory:") {
  return createSessionRecordingRepositoryFromDatabase(openDatabase(databasePath));
}

export function createSessionRecordingRepositoryFromDatabase(db: SqliteDatabase) {
  const insert = db.prepare(`
    INSERT INTO session_recordings (
      id, host_id, title, file_name, width, height, started_at
    ) VALUES (
      @id, @hostId, @title, @fileName, @width, @height, @startedAt
    )
  `);

  const markComplete = db.prepare(`
    UPDATE session_recordings
    SET ended_at = @endedAt,
        duration_ms = @durationMs,
        file_size_bytes = @fileSizeBytes,
        event_count = @eventCount
    WHERE id = @id
  `);

  const byId = db.prepare(`
    SELECT id, host_id, title, file_name, width, height, started_at,
           ended_at, duration_ms, file_size_bytes, event_count, created_at
    FROM session_recordings
    WHERE id = ?
  `);

  const list = db.prepare(`
    SELECT id, host_id, title, file_name, width, height, started_at,
           ended_at, duration_ms, file_size_bytes, event_count, created_at
    FROM session_recordings
    ORDER BY started_at DESC, created_at DESC
    LIMIT ?
  `);

  const deleteById = db.prepare(`DELETE FROM session_recordings WHERE id = ?`);

  return {
    create(input: SessionRecordingInput): SessionRecordingRecord {
      insert.run({
        id: input.id,
        hostId: input.hostId ?? null,
        title: input.title,
        fileName: input.fileName,
        width: input.width,
        height: input.height,
        startedAt: input.startedAt,
      });

      const row = byId.get(input.id) as SessionRecordingRow | undefined;
      if (!row) {
        throw new Error(`Session recording ${input.id} was not persisted`);
      }
      return mapRow(row);
    },

    complete(id: string, input: CompleteSessionRecordingInput): SessionRecordingRecord | undefined {
      const result = markComplete.run({ id, ...input });
      if (result.changes === 0) {
        return undefined;
      }
      const row = byId.get(id) as SessionRecordingRow | undefined;
      return row ? mapRow(row) : undefined;
    },

    get(id: string): SessionRecordingRecord | undefined {
      const row = byId.get(id) as SessionRecordingRow | undefined;
      return row ? mapRow(row) : undefined;
    },

    list(limit = 200): SessionRecordingRecord[] {
      return (list.all(limit) as SessionRecordingRow[]).map(mapRow);
    },

    remove(id: string): boolean {
      const result = deleteById.run(id);
      return result.changes > 0;
    },
  };
}
