import Database from "better-sqlite3";
import { readFileSync } from "node:fs";

export type SqliteDatabase = InstanceType<typeof Database>;

export function openDatabase(databasePath = ":memory:"): SqliteDatabase {
  const initSchemaSql = readFileSync(
    new URL("./migrations/001_init.sql", import.meta.url),
    "utf8"
  );
  const sftpBookmarksSql = readFileSync(
    new URL("./migrations/002_sftp_bookmarks.sql", import.meta.url),
    "utf8"
  );
  const hostAuthFieldsSql = readFileSync(
    new URL("./migrations/003_host_auth_fields.sql", import.meta.url),
    "utf8"
  );
  const advancedSshSql = readFileSync(
    new URL("./migrations/006_advanced_ssh.sql", import.meta.url),
    "utf8"
  );
  const sessionRecordingsSql = readFileSync(
    new URL("./migrations/008_session_recordings.sql", import.meta.url),
    "utf8"
  );
  const connectionHistorySql = readFileSync(
    new URL("./migrations/009_connection_history.sql", import.meta.url),
    "utf8"
  );
  const savedSessionsSql = readFileSync(
    new URL("./migrations/010_saved_sessions.sql", import.meta.url),
    "utf8"
  );
  const hostProfilesSql = readFileSync(
    new URL("./migrations/011_host_profiles.sql", import.meta.url),
    "utf8"
  );
  const hostEnvVarsSql = readFileSync(
    new URL("./migrations/012_host_env_vars.sql", import.meta.url),
    "utf8"
  );

  const db = new Database(databasePath);

  // Performance pragmas — safe for single-process desktop app.
  // WAL persists on the DB file after first run; re-issuing is a no-op.
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("cache_size = -8000");
  db.pragma("temp_store = MEMORY");
  db.pragma("foreign_keys = ON");
  db.exec(initSchemaSql);
  db.exec(sftpBookmarksSql);

  // Migration 003: add identity_file and auth fields to hosts table.
  // Each ALTER TABLE is wrapped individually — SQLite errors if the column
  // already exists, which is expected on databases that ran a prior version.
  try {
    db.exec("ALTER TABLE hosts ADD COLUMN identity_file TEXT");
  } catch {
    // Column already exists — safe to ignore.
  }
  for (const statement of hostAuthFieldsSql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)) {
    try {
      db.exec(statement);
    } catch {
      // Column already exists — safe to ignore.
    }
  }

  // Migration 004: add is_favorite column to hosts table.
  try {
    db.exec("ALTER TABLE hosts ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0");
  } catch {
    // Column already exists — safe to ignore.
  }

  // Migration 005: sort_order and color
  for (const stmt of [
    "ALTER TABLE hosts ADD COLUMN sort_order INTEGER",
    "ALTER TABLE host_groups ADD COLUMN sort_order INTEGER",
    "ALTER TABLE hosts ADD COLUMN color TEXT"
  ]) {
    try { db.exec(stmt); } catch {}
  }

  // Migration 006: advanced SSH fields + host_port_forwards table
  for (const statement of advancedSshSql.split(";").map((s) => s.trim()).filter((s) => s.length > 0)) {
    try { db.exec(statement); } catch {}
  }

  // Migration 007: host fingerprints table
  const hostFingerprintsSql = readFileSync(
    new URL("./migrations/007_host_fingerprints.sql", import.meta.url),
    "utf8"
  );
  db.exec(hostFingerprintsSql);

  // Migration 008: session recordings table
  db.exec(sessionRecordingsSql);

  // Migration 009: connection history table
  db.exec(connectionHistorySql);

  // Migration 010: saved session recovery snapshots
  db.exec(savedSessionsSql);

  // Migration 011: host profiles + host_profile_id link on hosts
  for (const statement of hostProfilesSql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)) {
    try {
      db.exec(statement);
    } catch {
      // Table/column already exists — safe to ignore.
    }
  }

  // Migration 012: per-host environment variables
  db.exec(hostEnvVarsSql);

  // Migration 012b: add color to tags (Task 2.10)
  try {
    db.exec("ALTER TABLE tags ADD COLUMN color TEXT");
  } catch {
    // Column already exists — safe to ignore.
  }

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
