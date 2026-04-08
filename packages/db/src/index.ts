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

  const db = new Database(databasePath);

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

  return db;
}

export * from "./repositories";
export type { SnippetRecord, SnippetInput } from "./repositories/snippetsRepository";
export { createSnippetsRepository, createSnippetsRepositoryFromDatabase } from "./repositories/snippetsRepository";
export type { HostFingerprintRecord, HostFingerprintInput } from "./repositories/hostFingerprintRepository";
export { createHostFingerprintRepository, createHostFingerprintRepositoryFromDatabase } from "./repositories/hostFingerprintRepository";
