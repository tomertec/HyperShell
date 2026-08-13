import { openDatabase } from "../index";
import type { SqliteDatabase } from "../index";

export type SavedSessionTransport = "ssh" | "serial" | "sftp" | "telnet" | "local";

export type SavedSessionRecord = {
  id: string;
  hostId: string | null;
  hostName: string | null;
  transport: SavedSessionTransport;
  profileId: string;
  title: string;
  wasGraceful: boolean;
  savedAt: string;
  claudeSessionId: string | null;
};

export type SavedSessionInput = {
  id: string;
  hostId?: string | null;
  transport: SavedSessionTransport;
  profileId: string;
  title: string;
  claudeSessionId?: string | null;
};

type SavedSessionRow = {
  id: string;
  host_id: string | null;
  host_name: string | null;
  transport: SavedSessionTransport;
  profile_id: string;
  title: string;
  was_graceful: number;
  saved_at: string;
  claude_session_id: string | null;
};

function mapRow(row: SavedSessionRow): SavedSessionRecord {
  return {
    id: row.id,
    hostId: row.host_id,
    hostName: row.host_name,
    transport: row.transport,
    profileId: row.profile_id,
    title: row.title,
    wasGraceful: row.was_graceful === 1,
    savedAt: row.saved_at,
    claudeSessionId: row.claude_session_id,
  };
}

export function createSavedSessionRepository(databasePath = ":memory:") {
  return createSavedSessionRepositoryFromDatabase(openDatabase(databasePath));
}

export function createSavedSessionRepositoryFromDatabase(db: SqliteDatabase) {
  const clearAllStatement = db.prepare("DELETE FROM saved_sessions");

  const insertStatement = db.prepare(`
    INSERT INTO saved_sessions (
      id,
      host_id,
      transport,
      profile_id,
      title,
      was_graceful,
      saved_at,
      claude_session_id
    ) VALUES (
      @id,
      @hostId,
      @transport,
      @profileId,
      @title,
      0,
      @savedAt,
      @claudeSessionId
    )
  `);

  const listRecoverableStatement = db.prepare(`
    SELECT ss.id,
           ss.host_id,
           h.name AS host_name,
           ss.transport,
           ss.profile_id,
           ss.title,
           ss.was_graceful,
           ss.saved_at,
           ss.claude_session_id
    FROM saved_sessions ss
    LEFT JOIN hosts h ON h.id = ss.host_id
    WHERE ss.was_graceful = 0
    ORDER BY ss.saved_at DESC, ss.id DESC
    LIMIT ?
  `);

  const markAllGracefulStatement = db.prepare(`
    UPDATE saved_sessions
    SET was_graceful = 1
    WHERE was_graceful = 0
  `);

  const replaceAllStatement = db.transaction((sessions: SavedSessionInput[]) => {
    clearAllStatement.run();
    const savedAt = new Date().toISOString();
    for (const session of sessions) {
      insertStatement.run({
        id: session.id,
        hostId: session.hostId ?? null,
        transport: session.transport,
        profileId: session.profileId,
        title: session.title,
        savedAt,
        claudeSessionId: session.claudeSessionId ?? null,
      });
    }
  });

  return {
    replaceAll(sessions: SavedSessionInput[]): number {
      replaceAllStatement(sessions);
      return sessions.length;
    },

    listRecoverable(limit = 50): SavedSessionRecord[] {
      const normalizedLimit = Math.max(1, Math.floor(limit));
      return (listRecoverableStatement.all(normalizedLimit) as SavedSessionRow[]).map(
        mapRow
      );
    },

    markAllGraceful(): number {
      const result = markAllGracefulStatement.run();
      return Number(result.changes);
    },

    clearAll(): number {
      const result = clearAllStatement.run();
      return Number(result.changes);
    },
  };
}
