import { describe, it, expect, vi } from "vitest";
import { createWriteStream, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { buildTempPath, createSyncEngine, type SyncConfig } from "./syncEngine";

// node:fs is a built-in whose ESM namespace is non-configurable, so
// vi.spyOn(fs, "createWriteStream") throws. Replacing the module instead
// (real implementation preserved via importOriginal, just call-tracked) lets
// the "randomized temp file name" test below assert on the path syncEngine
// actually opened, without changing behavior for any other test in this file.
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, createWriteStream: vi.fn(actual.createWriteStream) };
});

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
    chmod: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(Buffer.from("")),
    writeFile: vi.fn().mockResolvedValue(undefined),
    upload: vi.fn().mockResolvedValue(undefined),
    createReadStream: vi.fn(),
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

describe("remote-to-local sync", () => {
  function remoteFile(name: string, size: number) {
    return {
      name,
      path: `/remote/${name}`,
      size,
      modifiedAt: new Date().toISOString(),
      isDirectory: false,
      permissions: 0o644,
      owner: 0,
      group: 0,
    };
  }

  it("streams files larger than the editor read limit instead of buffering them", async () => {
    const engine = createSyncEngine();
    const transport = createMockTransport();
    const localPath = mkdtempSync(path.join(tmpdir(), "hypershell-sync-test-"));
    const big = remoteFile("big.bin", 25 * 1024 * 1024);

    transport.list.mockResolvedValue([big]);
    transport.createReadStream.mockImplementation(() => Readable.from([Buffer.alloc(1024)]));

    try {
      const syncId = engine.start(transport as any, {
        localPath,
        remotePath: "/remote",
        direction: "remote-to-local",
        excludePatterns: [],
        deleteOrphans: false,
      });

      await engine.runOnce(syncId);

      expect(transport.readFile).not.toHaveBeenCalled();
      expect(transport.createReadStream).toHaveBeenCalledWith(big.path);
      expect(readFileSync(path.join(localPath, "big.bin"))).toHaveLength(1024);
    } finally {
      rmSync(localPath, { recursive: true, force: true });
    }
  });

  it("keeps syncing after one file fails to download", async () => {
    const engine = createSyncEngine();
    const transport = createMockTransport();
    const localPath = mkdtempSync(path.join(tmpdir(), "hypershell-sync-test-"));

    transport.list.mockResolvedValue([remoteFile("bad.bin", 10), remoteFile("good.bin", 10)]);
    transport.createReadStream
      .mockImplementationOnce(() => {
        const stream = new Readable({ read() {} });
        queueMicrotask(() => stream.destroy(new Error("permission denied")));
        return stream;
      })
      .mockImplementation(() => Readable.from([Buffer.alloc(10)]));

    try {
      const syncId = engine.start(transport as any, {
        localPath,
        remotePath: "/remote",
        direction: "remote-to-local",
        excludePatterns: [],
        deleteOrphans: false,
      });

      await engine.runOnce(syncId);

      const status = engine.list().find((s) => s.syncId === syncId);
      expect(status?.status).not.toBe("error");
      expect(transport.createReadStream).toHaveBeenCalledTimes(2);
      expect(status?.lastError).toContain("bad.bin");
      const entries = readdirSync(localPath);
      expect(entries).not.toContain("bad.bin");
      expect(entries.some((name) => name.endsWith(".tmp"))).toBe(false);
      expect(readFileSync(path.join(localPath, "good.bin"))).toHaveLength(10);
    } finally {
      rmSync(localPath, { recursive: true, force: true });
    }
  });

  it("never downloads a temp file stranded by an interrupted run", async () => {
    const engine = createSyncEngine();
    const transport = createMockTransport();
    const localPath = mkdtempSync(path.join(tmpdir(), "hypershell-sync-test-"));

    transport.list.mockResolvedValue([remoteFile("big.bin.hypershell-sync-0123456789ab.tmp", 10)]);
    transport.createReadStream.mockImplementation(() => Readable.from([Buffer.alloc(10)]));

    try {
      const syncId = engine.start(transport as any, {
        localPath,
        remotePath: "/remote",
        direction: "remote-to-local",
        excludePatterns: [],
        deleteOrphans: false,
      });

      await engine.runOnce(syncId);

      expect(transport.createReadStream).not.toHaveBeenCalled();
      expect(readdirSync(localPath)).toHaveLength(0);
    } finally {
      rmSync(localPath, { recursive: true, force: true });
    }
  });

  it("uses a randomized temp file name so concurrent downloads of the same file can't collide", async () => {
    const engine = createSyncEngine();
    const transport = createMockTransport();
    const localPath = mkdtempSync(path.join(tmpdir(), "hypershell-sync-test-"));
    const mockedCreateWriteStream = vi.mocked(createWriteStream);
    mockedCreateWriteStream.mockClear();

    transport.list.mockResolvedValue([remoteFile("shared.bin", 10)]);
    transport.createReadStream.mockImplementation(() => Readable.from([Buffer.alloc(10)]));

    try {
      const syncId = engine.start(transport as any, {
        localPath,
        remotePath: "/remote",
        direction: "remote-to-local",
        excludePatterns: [],
        deleteOrphans: false,
      });

      await engine.runOnce(syncId);

      expect(mockedCreateWriteStream).toHaveBeenCalledTimes(1);
      const tempPath = mockedCreateWriteStream.mock.calls[0][0] as string;
      // A fixed temp name would let a second, racing sync run (concurrent
      // syncs, or a restart overlapping an in-flight run) overwrite this
      // file's in-progress download; the random suffix rules that out.
      expect(tempPath).toMatch(/shared\.bin\.hypershell-sync-[0-9a-f]{12}\.tmp$/);
    } finally {
      rmSync(localPath, { recursive: true, force: true });
    }
  });
});

describe("buildTempPath", () => {
  it("treats a backslash in a remote file name as an ordinary character", () => {
    // POSIX filenames may contain backslashes. Splitting on one would compute
    // the 255-byte truncation budget against only the fragment after it, so a
    // long backslash-bearing name could overflow the filename ceiling.
    const name = `weird\\${"x".repeat(250)}.txt`;
    const tempPath = buildTempPath(`/remote/${name}`, "remote");

    const tempName = tempPath.slice("/remote/".length);
    expect(tempName).not.toContain("/");
    expect(Buffer.byteLength(tempName)).toBeLessThanOrEqual(255);
    expect(tempName).toMatch(/^weird\\x+\.hypershell-sync-[0-9a-f]{12}\.tmp$/);
  });

  it("keeps a local Windows path's directory intact", () => {
    const tempPath = buildTempPath("C:\\work\\notes.txt", "local");

    expect(tempPath).toMatch(
      /^C:\\work\\notes\.txt\.hypershell-sync-[0-9a-f]{12}\.tmp$/
    );
  });
});

describe("local-to-remote sync", () => {
  function startUpload(engine: ReturnType<typeof createSyncEngine>, transport: any, localPath: string) {
    // A rejected stat is the cheapest way to force needsUpload: it is the
    // "remote file does not exist yet" branch.
    transport.stat.mockRejectedValue(new Error("no such file"));
    return engine.start(transport, {
      localPath,
      remotePath: "/remote",
      direction: "local-to-remote",
      excludePatterns: [],
      deleteOrphans: false,
    });
  }

  it("delegates uploads to transport.upload, which owns the write invariant", async () => {
    const engine = createSyncEngine();
    const transport = createMockTransport();
    const localPath = mkdtempSync(path.join(tmpdir(), "hypershell-sync-test-"));

    try {
      writeFileSync(path.join(localPath, "notes.txt"), "content");

      await engine.runOnce(startUpload(engine, transport, localPath));

      // Temp-and-rename, mode preservation, and cleanup are the transport's
      // guarantee (sftpTransport.upload.test.ts) — sync only states intent.
      expect(transport.upload).toHaveBeenCalledWith(
        path.join(localPath, "notes.txt"),
        "/remote/notes.txt"
      );
      expect(engine.list()[0].filesSynced).toBe(1);
    } finally {
      rmSync(localPath, { recursive: true, force: true });
    }
  });

  it("records a failure and keeps the run alive when an upload fails", async () => {
    const engine = createSyncEngine();
    const transport = createMockTransport();
    const localPath = mkdtempSync(path.join(tmpdir(), "hypershell-sync-test-"));

    try {
      writeFileSync(path.join(localPath, "notes.txt"), "content");
      transport.upload.mockRejectedValue(new Error("no space left on device"));

      await engine.runOnce(startUpload(engine, transport, localPath));

      expect(engine.list()[0].status).toBe("idle");
      expect(engine.list()[0].lastError).toContain("notes.txt");
      expect(engine.list()[0].lastError).toContain("no space left on device");
    } finally {
      rmSync(localPath, { recursive: true, force: true });
    }
  });

  it("never uploads a temp file stranded by an interrupted run", async () => {
    const engine = createSyncEngine();
    const transport = createMockTransport();
    const localPath = mkdtempSync(path.join(tmpdir(), "hypershell-sync-test-"));

    try {
      // One stranded by a killed sync run, one by the transport's own atomic
      // writes (e.g. a paused transfer-queue upload) — neither is content.
      writeFileSync(path.join(localPath, "notes.txt.hypershell-sync-0123456789ab.tmp"), "partial");
      writeFileSync(path.join(localPath, ".notes.txt.hypershell-upload.tmp"), "partial");
      writeFileSync(path.join(localPath, ".notes.txt.hypershell-0123456789ab.tmp"), "partial");

      await engine.runOnce(startUpload(engine, transport, localPath));

      expect(transport.upload).not.toHaveBeenCalled();
      expect(engine.list()[0].filesSynced).toBe(0);
    } finally {
      rmSync(localPath, { recursive: true, force: true });
    }
  });
});

describe("bidirectional sync", () => {
  function remoteFile(name: string, size: number) {
    return {
      name,
      path: `/remote/${name}`,
      size,
      modifiedAt: new Date().toISOString(),
      isDirectory: false,
      permissions: 0o644,
      owner: 0,
      group: 0,
    };
  }

  it("still performs downloads after an upload fails", async () => {
    const engine = createSyncEngine();
    const transport = createMockTransport();
    const localPath = mkdtempSync(path.join(tmpdir(), "hypershell-sync-test-"));

    try {
      writeFileSync(path.join(localPath, "local-bad.txt"), "local content");

      // Force needsUpload/needsDownload true for both directions, and make
      // the upload fail.
      transport.stat.mockRejectedValue(new Error("remote stat failed"));
      transport.upload.mockRejectedValue(new Error("no space left on device"));
      transport.list.mockResolvedValue([remoteFile("remote-good.bin", 10)]);
      transport.createReadStream.mockImplementation(() => Readable.from([Buffer.alloc(10)]));

      const syncId = engine.start(transport as any, {
        localPath,
        remotePath: "/remote",
        direction: "bidirectional",
        excludePatterns: [],
        deleteOrphans: false,
      });

      await engine.runOnce(syncId);

      const status = engine.list().find((s) => s.syncId === syncId);
      expect(status?.status).not.toBe("error");
      expect(transport.upload).toHaveBeenCalledTimes(1);
      expect(transport.createReadStream).toHaveBeenCalledTimes(1);
      expect(status?.lastError).toContain("local-bad.txt");
      expect(readFileSync(path.join(localPath, "remote-good.bin"))).toHaveLength(10);
    } finally {
      rmSync(localPath, { recursive: true, force: true });
    }
  });
});
