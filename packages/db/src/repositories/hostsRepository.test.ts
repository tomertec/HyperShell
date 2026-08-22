import { HOST_OPTION_DEFAULTS } from "@hypershell/shared";
import { describe, expect, it } from "vitest";

import { openDatabase } from "../index";
import {
  createHostsRepository,
  createHostsRepositoryFromDatabase,
  normalizeHostInput
} from "./hostsRepository";

describe("hostsRepository", () => {
  it("creates and lists hosts", () => {
    const repo = createHostsRepository(":memory:");

    repo.create({
      id: "host-1",
      name: "web-01",
      hostname: "web-01.example.com",
      port: 22
    });

    expect(repo.list()).toHaveLength(1);
  });

  it("removes a host by id", () => {
    const repo = createHostsRepository();
    repo.create({ id: "h1", name: "test", hostname: "example.com" });
    expect(repo.remove("h1")).toBe(true);
    expect(repo.list()).toHaveLength(0);
  });

  it("returns false when removing a non-existent host", () => {
    const repo = createHostsRepository();
    expect(repo.remove("nonexistent")).toBe(false);
  });

  it("stores and retrieves advanced SSH fields", () => {
    const repo = createHostsRepository();
    const host = repo.create({
      id: "h1",
      name: "bastion",
      hostname: "bastion.example.com",
      proxyJump: "jump@gateway:22",
      proxyJumpHostIds: JSON.stringify(["gw-1"]),
      keepAliveInterval: 60,
      autoReconnect: true,
      reconnectMaxAttempts: 10,
      reconnectBaseInterval: 2,
    });

    expect(host.proxyJump).toBe("jump@gateway:22");
    expect(host.proxyJumpHostIds).toBe(JSON.stringify(["gw-1"]));
    expect(host.keepAliveInterval).toBe(60);
    expect(host.autoReconnect).toBe(true);
    expect(host.reconnectMaxAttempts).toBe(10);
    expect(host.reconnectBaseInterval).toBe(2);
  });

  it("defaults advanced SSH fields when not provided", () => {
    const repo = createHostsRepository();
    const host = repo.create({
      id: "h2",
      name: "simple",
      hostname: "simple.example.com",
    });

    expect(host.proxyJump).toBeNull();
    expect(host.proxyJumpHostIds).toBeNull();
    expect(host.keepAliveInterval).toBeNull();
    expect(host.hostProfileId).toBeNull();
    expect(host.autoReconnect).toBe(false);
    expect(host.reconnectMaxAttempts).toBe(5);
    expect(host.reconnectBaseInterval).toBe(1);
  });

  it("defaults shell integration to enabled", () => {
    const repo = createHostsRepository();
    const host = repo.create({ id: "h3", name: "hermes", hostname: "hermes", username: "tomer" });

    expect(repo.get(host.id)?.shellIntegration).toBe(true);
  });

  it("persists a shell integration opt-out", () => {
    const repo = createHostsRepository();
    const host = repo.create({
      id: "h4",
      name: "hermes",
      hostname: "hermes",
      username: "tomer",
      shellIntegration: false,
    });

    expect(host.shellIntegration).toBe(false);
    expect(repo.get(host.id)?.shellIntegration).toBe(false);
  });

  // createHostsRepository falls back to an in-memory store when SQLite throws,
  // so the tests above stay green even if migration 017 never ran. Go through
  // the database-backed factory directly to prove the column exists.
  it("stores shell integration in the migrated hosts table", () => {
    const repo = createHostsRepositoryFromDatabase(openDatabase(":memory:"));

    expect(repo.create({ id: "h5", name: "on", hostname: "on" }).shellIntegration).toBe(true);
    expect(
      repo.create({ id: "h6", name: "off", hostname: "off", shellIntegration: false })
        .shellIntegration
    ).toBe(false);
  });
});

describe("host option defaults", () => {
  // Default site #1 is the SQL DDL. This pins it to the module that owns
  // the other five sites, so the six can no longer drift silently.
  it("hosts table DDL defaults agree with HOST_OPTION_DEFAULTS", () => {
    const db = openDatabase(":memory:");
    db.prepare(
      "INSERT INTO hosts (id, name, hostname) VALUES ('raw', 'raw', 'raw.example.com')"
    ).run();
    const repo = createHostsRepositoryFromDatabase(db);
    expect(repo.get("raw")).toMatchObject(HOST_OPTION_DEFAULTS);
    db.close();
  });

  it("normalizeHostInput fills every option from HOST_OPTION_DEFAULTS", () => {
    expect(
      normalizeHostInput({ id: "n1", name: "n", hostname: "n.example.com" })
    ).toMatchObject(HOST_OPTION_DEFAULTS);
  });

  it("normalizeHostInput nulls the nullable fields and keeps explicit values", () => {
    const record = normalizeHostInput({
      id: "n2",
      name: "n",
      hostname: "n.example.com",
      notes: "hi",
      shellIntegration: false,
    });
    expect(record.username).toBeNull();
    expect(record.groupId).toBeNull();
    expect(record.sortOrder).toBeNull();
    expect(record.keepAliveInterval).toBeNull();
    expect(record.notes).toBe("hi");
    expect(record.shellIntegration).toBe(false);
  });
});
