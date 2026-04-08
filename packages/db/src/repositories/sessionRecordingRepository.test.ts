import { beforeEach, describe, expect, it } from "vitest";

import { openDatabase, type SqliteDatabase } from "../index";
import { createSessionRecordingRepositoryFromDatabase } from "./sessionRecordingRepository";

describe("SessionRecordingRepository", () => {
  let db: SqliteDatabase;
  let repo: ReturnType<typeof createSessionRecordingRepositoryFromDatabase>;

  beforeEach(() => {
    db = openDatabase();
    repo = createSessionRecordingRepositoryFromDatabase(db);
  });

  it("creates and retrieves a recording", () => {
    const created = repo.create({
      id: "rec-1",
      hostId: "host-1",
      title: "My session",
      fileName: "session.cast",
      width: 120,
      height: 40,
      startedAt: "2026-04-08T10:00:00.000Z",
    });

    expect(created.id).toBe("rec-1");
    expect(created.hostId).toBe("host-1");
    expect(created.endedAt).toBeNull();

    const loaded = repo.get("rec-1");
    expect(loaded?.title).toBe("My session");
  });

  it("marks a recording complete", () => {
    repo.create({
      id: "rec-1",
      title: "Complete me",
      fileName: "complete.cast",
      width: 80,
      height: 24,
      startedAt: "2026-04-08T10:00:00.000Z",
    });

    const completed = repo.complete("rec-1", {
      endedAt: "2026-04-08T10:05:00.000Z",
      durationMs: 300_000,
      fileSizeBytes: 4096,
      eventCount: 42,
    });

    expect(completed).toBeDefined();
    expect(completed?.durationMs).toBe(300_000);
    expect(completed?.eventCount).toBe(42);
  });

  it("lists newest recordings first", () => {
    repo.create({
      id: "rec-older",
      title: "Older",
      fileName: "older.cast",
      width: 80,
      height: 24,
      startedAt: "2026-04-08T09:00:00.000Z",
    });
    repo.create({
      id: "rec-newer",
      title: "Newer",
      fileName: "newer.cast",
      width: 80,
      height: 24,
      startedAt: "2026-04-08T10:00:00.000Z",
    });

    const list = repo.list();
    expect(list).toHaveLength(2);
    expect(list[0]?.id).toBe("rec-newer");
    expect(list[1]?.id).toBe("rec-older");
  });

  it("removes a recording", () => {
    repo.create({
      id: "rec-1",
      title: "Delete me",
      fileName: "delete.cast",
      width: 80,
      height: 24,
      startedAt: "2026-04-08T10:00:00.000Z",
    });

    expect(repo.remove("rec-1")).toBe(true);
    expect(repo.get("rec-1")).toBeUndefined();
  });
});
