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

  const db = new Database(databasePath);

  db.pragma("foreign_keys = ON");
  db.exec(initSchemaSql);
  db.exec(sftpBookmarksSql);

  return db;
}

export * from "./repositories";
