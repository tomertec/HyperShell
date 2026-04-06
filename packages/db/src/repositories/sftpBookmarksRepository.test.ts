import { beforeEach, describe, expect, it } from "vitest";

import { openDatabase, type SqliteDatabase } from "../index";
import { createHostsRepositoryFromDatabase } from "./hostsRepository";
import { createSftpBookmarksRepository } from "./sftpBookmarksRepository";

describe("SftpBookmarksRepository", () => {
  let db: SqliteDatabase;
  let hostId: string;
  let repo: ReturnType<typeof createSftpBookmarksRepository>;

  beforeEach(() => {
    db = openDatabase();
    repo = createSftpBookmarksRepository(db);
    hostId = "host-1";

    const hostsRepo = createHostsRepositoryFromDatabase(db);
    hostsRepo.create({
      id: hostId,
      name: "test-host",
      hostname: "example.com"
    });
  });

  it("creates and lists bookmarks for a host", () => {
    repo.upsert({ hostId, name: "Logs", remotePath: "/var/log" });
    repo.upsert({ hostId, name: "Config", remotePath: "/etc" });

    const bookmarks = repo.list(hostId);
    expect(bookmarks).toHaveLength(2);
    expect(bookmarks[0]?.name).toBe("Logs");
    expect(bookmarks[0]?.remotePath).toBe("/var/log");
  });

  it("updates existing bookmark", () => {
    const bookmark = repo.upsert({ hostId, name: "Logs", remotePath: "/var/log" });
    repo.upsert({
      id: bookmark.id,
      hostId,
      name: "Logs Updated",
      remotePath: "/var/log/nginx"
    });

    const bookmarks = repo.list(hostId);
    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0]?.name).toBe("Logs Updated");
    expect(bookmarks[0]?.remotePath).toBe("/var/log/nginx");
  });

  it("removes bookmark", () => {
    const bookmark = repo.upsert({ hostId, name: "Logs", remotePath: "/var/log" });
    expect(repo.remove(bookmark.id)).toBe(true);

    const bookmarks = repo.list(hostId);
    expect(bookmarks).toHaveLength(0);
  });

  it("reorders bookmarks", () => {
    const first = repo.upsert({ hostId, name: "A", remotePath: "/a" });
    const second = repo.upsert({ hostId, name: "B", remotePath: "/b" });
    const third = repo.upsert({ hostId, name: "C", remotePath: "/c" });

    repo.reorder([third.id, first.id, second.id]);

    const bookmarks = repo.list(hostId);
    expect(bookmarks[0]?.name).toBe("C");
    expect(bookmarks[1]?.name).toBe("A");
    expect(bookmarks[2]?.name).toBe("B");
  });

  it("cascades delete when host is removed", () => {
    repo.upsert({ hostId, name: "Logs", remotePath: "/var/log" });
    db.prepare("DELETE FROM hosts WHERE id = ?").run(hostId);

    const bookmarks = repo.list(hostId);
    expect(bookmarks).toHaveLength(0);
  });
});
