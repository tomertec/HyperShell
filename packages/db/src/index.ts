import Database from "better-sqlite3";
import { readFileSync } from "node:fs";

export type SqliteDatabase = InstanceType<typeof Database>;

function isIgnorableMigrationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return normalized.includes("already exists") || normalized.includes("duplicate column");
}

function readMigration(filename: string): string {
  return readFileSync(new URL(`./migrations/${filename}`, import.meta.url), "utf8");
}

/**
 * Run one migration statement-by-statement, tolerating "already exists" /
 * "duplicate column" from databases that ran a prior version. A single exec()
 * would abort at the first duplicate and silently skip the rest, leaving a
 * database with some of the migration's columns but not the others. Comment
 * lines are stripped before splitting on `;` — a `;` inside a comment would
 * otherwise cut a statement in half and produce a syntax error, which is not
 * an ignorable duplicate.
 */
function execGuardedStatements(db: SqliteDatabase, sql: string): void {
  const statements = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const statement of statements) {
    try {
      db.exec(statement);
    } catch (error) {
      if (!isIgnorableMigrationError(error)) {
        throw error;
      }
    }
  }
}

/**
 * Open a database and hand it to a repository factory, closing the handle if
 * that factory throws. Without this the handle stays open for the life of the
 * process while the caller falls back to an in-memory repository.
 */
export function withOpenDatabase<T>(
  databasePath: string,
  create: (db: SqliteDatabase) => T
): T {
  const db = openDatabase(databasePath);
  try {
    return create(db);
  } catch (error) {
    db.close();
    throw error;
  }
}

export function openDatabase(databasePath = ":memory:"): SqliteDatabase {
  const db = new Database(databasePath);

  // Performance pragmas — safe for single-process desktop app.
  // WAL persists on the DB file after first run; re-issuing is a no-op.
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("cache_size = -8000");
  db.pragma("temp_store = MEMORY");
  db.pragma("foreign_keys = ON");
  db.exec(readMigration("001_init.sql"));
  db.exec(readMigration("002_sftp_bookmarks.sql"));

  // Migration 003: add identity_file and auth fields to hosts table. The
  // identity_file ALTER is not in the .sql file — it covers databases created
  // before migration 001 included the column.
  execGuardedStatements(db, "ALTER TABLE hosts ADD COLUMN identity_file TEXT");
  execGuardedStatements(db, readMigration("003_host_auth_fields.sql"));

  // Migration 004: add is_favorite column to hosts table.
  execGuardedStatements(db, readMigration("004_favorites.sql"));

  // Migration 005: sort_order and color
  execGuardedStatements(db, readMigration("005_host_enhancements.sql"));

  // Migration 006: advanced SSH fields + host_port_forwards table
  execGuardedStatements(db, readMigration("006_advanced_ssh.sql"));

  // Migration 007: host fingerprints table
  db.exec(readMigration("007_host_fingerprints.sql"));

  // Migration 008: session recordings table
  db.exec(readMigration("008_session_recordings.sql"));

  // Migration 009: connection history table
  db.exec(readMigration("009_connection_history.sql"));

  // Migration 010: saved session recovery snapshots
  db.exec(readMigration("010_saved_sessions.sql"));

  // Migration 011: host profiles + host_profile_id link on hosts
  execGuardedStatements(db, readMigration("011_host_profiles.sql"));

  // Migration 012: per-host environment variables
  db.exec(readMigration("012_host_env_vars.sql"));

  // Migration 013: add color to tags (Task 2.10)
  execGuardedStatements(db, readMigration("013_tags_color.sql"));

  // Migration 014: tmux detection toggle per host
  execGuardedStatements(db, readMigration("014_tmux_detect.sql"));

  // Migration 015: local shell profiles + their environment variables
  db.exec(readMigration("015_local_profiles.sql"));

  // Migration 016: widen saved_sessions.transport CHECK to allow 'telnet' and
  // 'local'. SQLite can't ALTER a CHECK constraint, so this recreates the
  // table (preserving rows) when needed. Guarded by inspecting the stored
  // table DDL rather than just "does the table exist" — a fresh database
  // gets the widened CHECK directly from migration 010 above, so the DDL
  // already contains 'local' and this is a no-op for it. An existing
  // database still carries the old CHECK in its DDL and needs the recreate.
  const savedSessionsTableInfo = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'saved_sessions'")
    .get() as { sql?: string } | undefined;
  if (savedSessionsTableInfo?.sql && !savedSessionsTableInfo.sql.includes("'local'")) {
    db.transaction(() => {
      db.exec(readMigration("016_saved_sessions_transports.sql"));
    })();
  }

  // Migration 017: per-host shell integration opt-out. Defaults to 1 (enabled).
  execGuardedStatements(db, readMigration("017_shell_integration.sql"));

  // Migration 018: Claude session resume columns.
  execGuardedStatements(db, readMigration("018_claude_sessions.sql"));

  return db;
}

export * from "./repositories";
export type { SnippetRecord, SnippetInput } from "./repositories/snippetsRepository";
export { createSnippetsRepository, createSnippetsRepositoryFromDatabase } from "./repositories/snippetsRepository";
export type { HostFingerprintRecord, HostFingerprintInput } from "./repositories/hostFingerprintRepository";
export { createHostFingerprintRepository, createHostFingerprintRepositoryFromDatabase } from "./repositories/hostFingerprintRepository";
export type {
  SessionRecordingRecord,
  SessionRecordingInput,
  CompleteSessionRecordingInput
} from "./repositories/sessionRecordingRepository";
export {
  createSessionRecordingRepository,
  createSessionRecordingRepositoryFromDatabase
} from "./repositories/sessionRecordingRepository";
export type { ConnectionHistoryRecord } from "./repositories/connectionHistoryRepository";
export {
  createConnectionHistoryRepository,
  createConnectionHistoryRepositoryFromDatabase
} from "./repositories/connectionHistoryRepository";
export type {
  SavedSessionRecord,
  SavedSessionInput,
  SavedSessionTransport
} from "./repositories/savedSessionRepository";
export {
  createSavedSessionRepository,
  createSavedSessionRepositoryFromDatabase
} from "./repositories/savedSessionRepository";
export type {
  HostProfileRecord,
  HostProfileInput
} from "./repositories/hostProfileRepository";
export {
  createHostProfileRepository,
  createHostProfileRepositoryFromDatabase
} from "./repositories/hostProfileRepository";
export type {
  HostEnvVarRecord,
  HostEnvVarInput
} from "./repositories/hostEnvVarRepository";
export {
  createHostEnvVarRepositoryFromDatabase
} from "./repositories/hostEnvVarRepository";
export type {
  TagRecord,
  TagInput
} from "./repositories/tagRepository";
export {
  createTagRepository,
  createTagRepositoryFromDatabase
} from "./repositories/tagRepository";
