import { beforeEach, describe, expect, it } from "vitest";

import { openDatabase, type SqliteDatabase } from "../index";
import { createHostsRepositoryFromDatabase } from "./hostsRepository";
import { createConnectionHistoryRepositoryFromDatabase } from "./connectionHistoryRepository";

describe("ConnectionHistoryRepository", () => {
  let db: SqliteDatabase;
  let repo: ReturnType<typeof createConnectionHistoryRepositoryFromDatabase>;

  beforeEach(() => {
    db = openDatabase();
    createHostsRepositoryFromDatabase(db).create({
      id: "host-1",
      name: "web-01",
      hostname: "web-01.example.com",
      port: 22,
      username: "admin",
    });
    createHostsRepositoryFromDatabase(db).create({
      id: "host-2",
      name: "db-01",
      hostname: "db-01.example.com",
      port: 2222,
      username: "dba",
    });
    repo = createConnectionHistoryRepositoryFromDatabase(db);
  });

  it("records successful connections", () => {
    const created = repo.record("host-1", true);
    expect(created.hostId).toBe("host-1");
    expect(created.hostName).toBe("web-01");
    expect(created.wasSuccessful).toBe(true);
    expect(created.disconnectedAt).toBeNull();
    expect(created.errorMessage).toBeNull();
  });

  it("records failed connections with an error message", () => {
    const created = repo.record("host-1", false, "Permission denied");
    expect(created.wasSuccessful).toBe(false);
    expect(created.errorMessage).toBe("Permission denied");
  });

  it("marks a successful connection as disconnected", () => {
    const created = repo.record("host-1", true);
    const changed = repo.markDisconnected(created.id, "2026-04-08T13:00:00.000Z");
    expect(changed).toBe(true);

    const [latest] = repo.listByHost("host-1", 1);
    expect(latest?.disconnectedAt).toBe("2026-04-08T13:00:00.000Z");
  });

  it("lists host history with newest records first", () => {
    const older = repo.record("host-1", true);
    const newer = repo.record("host-1", false, "Network timeout");
    db.prepare("UPDATE connection_history SET connected_at = datetime('now', '-2 days') WHERE id = ?").run(older.id);

    const list = repo.listByHost("host-1", 10);
    expect(list).toHaveLength(2);
    expect(list[0]?.id).toBe(newer.id);
    expect(list[1]?.id).toBe(older.id);
  });

  it("lists recent history across hosts", () => {
    const a = repo.record("host-1", true);
    const b = repo.record("host-2", true);
    db.prepare("UPDATE connection_history SET connected_at = datetime('now', '-1 day') WHERE id = ?").run(a.id);

    const list = repo.listRecent(10);
    expect(list).toHaveLength(2);
    expect(list[0]?.id).toBe(b.id);
    expect(list[0]?.hostName).toBe("db-01");
  });

  it("cleans up old records", () => {
    const oldRecord = repo.record("host-1", true);
    const freshRecord = repo.record("host-1", true);
    db.prepare("UPDATE connection_history SET connected_at = datetime('now', '-120 days') WHERE id = ?").run(oldRecord.id);

    const removed = repo.cleanup(90);
    expect(removed).toBe(1);

    const remaining = repo.listByHost("host-1", 10);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe(freshRecord.id);
  });
});
