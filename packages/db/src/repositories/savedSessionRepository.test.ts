import { beforeEach, describe, expect, it } from "vitest";

import { openDatabase, type SqliteDatabase } from "../index";
import { createHostsRepositoryFromDatabase } from "./hostsRepository";
import { createSavedSessionRepositoryFromDatabase } from "./savedSessionRepository";

describe("SavedSessionRepository", () => {
  let db: SqliteDatabase;
  let repo: ReturnType<typeof createSavedSessionRepositoryFromDatabase>;

  beforeEach(() => {
    db = openDatabase();
    createHostsRepositoryFromDatabase(db).create({
      id: "host-1",
      name: "web-01",
      hostname: "web-01.example.com",
      port: 22,
      username: "admin",
    });
    repo = createSavedSessionRepositoryFromDatabase(db);
  });

  it("stores recoverable sessions and resolves host names", () => {
    repo.replaceAll([
      {
        id: "session-1",
        hostId: "host-1",
        transport: "ssh",
        profileId: "host-1",
        title: "web-01",
      },
      {
        id: "session-2",
        transport: "serial",
        profileId: "COM3",
        title: "Serial COM3",
      },
    ]);

    const saved = repo.listRecoverable(10);
    expect(saved).toHaveLength(2);
    expect(saved[0]?.id).toBe("session-2");
    expect(saved[1]).toMatchObject({
      id: "session-1",
      hostId: "host-1",
      hostName: "web-01",
      transport: "ssh",
      profileId: "host-1",
      title: "web-01",
      wasGraceful: false,
    });
  });

  it("replaces previous snapshots on each save", () => {
    repo.replaceAll([
      {
        id: "session-old",
        transport: "serial",
        profileId: "COM9",
        title: "Serial COM9",
      },
    ]);
    repo.replaceAll([
      {
        id: "session-new",
        transport: "ssh",
        hostId: "host-1",
        profileId: "host-1",
        title: "web-01",
      },
    ]);

    const saved = repo.listRecoverable(10);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.id).toBe("session-new");
  });

  it("marks saved sessions as graceful and hides them from recovery", () => {
    repo.replaceAll([
      {
        id: "session-1",
        hostId: "host-1",
        transport: "ssh",
        profileId: "host-1",
        title: "web-01",
      },
    ]);

    const changed = repo.markAllGraceful();
    expect(changed).toBe(1);
    expect(repo.listRecoverable()).toEqual([]);
  });

  it("clears all saved state rows", () => {
    repo.replaceAll([
      {
        id: "session-1",
        hostId: "host-1",
        transport: "ssh",
        profileId: "host-1",
        title: "web-01",
      },
      {
        id: "session-2",
        transport: "serial",
        profileId: "COM1",
        title: "Serial COM1",
      },
    ]);

    const cleared = repo.clearAll();
    expect(cleared).toBe(2);
    expect(repo.listRecoverable()).toHaveLength(0);
  });
});
