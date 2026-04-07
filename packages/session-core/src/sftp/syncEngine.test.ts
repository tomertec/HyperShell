import { describe, it, expect, vi } from "vitest";
import { createSyncEngine, type SyncConfig } from "./syncEngine";

function createMockTransport() {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
    stat: vi.fn().mockResolvedValue({
      name: "test",
      path: "/test",
      size: 0,
      modifiedAt: new Date().toISOString(),
      isDirectory: false,
      permissions: 0o644,
      owner: 0,
      group: 0,
    }),
    mkdir: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(Buffer.from("")),
    writeFile: vi.fn().mockResolvedValue(undefined),
    createReadStream: vi.fn(),
    createWriteStream: vi.fn(),
    onEvent: vi.fn().mockReturnValue(() => {}),
  };
}

describe("syncEngine", () => {
  it("creates a sync engine with empty list", () => {
    const engine = createSyncEngine();
    expect(engine.list()).toEqual([]);
  });

  it("start creates a sync job and returns syncId", () => {
    const engine = createSyncEngine();
    const transport = createMockTransport();
    const config: SyncConfig = {
      localPath: "/tmp/local",
      remotePath: "/home/user/remote",
      direction: "local-to-remote",
      excludePatterns: [],
      deleteOrphans: false,
    };
    const syncId = engine.start(transport as any, config);
    expect(syncId).toBeTruthy();
    expect(typeof syncId).toBe("string");
    expect(engine.list()).toHaveLength(1);
    expect(engine.list()[0].syncId).toBe(syncId);
    expect(engine.list()[0].status).toBe("idle");
  });

  it("stop removes a sync job", () => {
    const engine = createSyncEngine();
    const transport = createMockTransport();
    const syncId = engine.start(transport as any, {
      localPath: "/tmp",
      remotePath: "/home",
      direction: "remote-to-local",
      excludePatterns: [],
      deleteOrphans: false,
    });
    expect(engine.list()).toHaveLength(1);
    engine.stop(syncId);
    expect(engine.list()).toHaveLength(0);
  });

  it("list returns status for all active syncs", () => {
    const engine = createSyncEngine();
    const transport = createMockTransport();
    const config: SyncConfig = {
      localPath: "/tmp",
      remotePath: "/home",
      direction: "bidirectional",
      excludePatterns: [],
      deleteOrphans: false,
    };
    engine.start(transport as any, config);
    engine.start(transport as any, config);
    expect(engine.list()).toHaveLength(2);
  });

  it("onEvent registers and unregisters listeners", () => {
    const engine = createSyncEngine();
    const listener = vi.fn();
    const unsubscribe = engine.onEvent(listener);
    expect(typeof unsubscribe).toBe("function");
    unsubscribe();
  });

  it("stop on nonexistent syncId is a no-op", () => {
    const engine = createSyncEngine();
    expect(() => engine.stop("nonexistent")).not.toThrow();
  });
});
