import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createTransferManifest, type PersistedTransfer } from "./transferManifest";

describe("transferManifest", () => {
  let dir: string;

  beforeEach(() => {
    dir = join(tmpdir(), `manifest-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function makeEntry(overrides: Partial<PersistedTransfer> = {}): PersistedTransfer {
    return {
      transferId: "tx-001",
      type: "download",
      localPath: "C:\\tmp\\file.bin",
      remotePath: "/home/user/file.bin",
      totalBytes: 1_000_000,
      bytesTransferred: 500_000,
      remoteMtime: "2026-04-10T00:00:00Z",
      remoteSize: 1_000_000,
      sftpSessionId: "sftp-1",
      batchId: "batch-1",
      interruptedAt: new Date().toISOString(),
      ...overrides,
    };
  }

  it("saves and loads entries", () => {
    const manifest = createTransferManifest(dir);
    manifest.save(makeEntry());
    const entries = manifest.load();
    expect(entries).toHaveLength(1);
    expect(entries[0].transferId).toBe("tx-001");
  });

  it("removes an entry by transferId", () => {
    const manifest = createTransferManifest(dir);
    manifest.save(makeEntry({ transferId: "tx-001" }));
    manifest.save(makeEntry({ transferId: "tx-002" }));
    manifest.remove("tx-001");
    const entries = manifest.load();
    expect(entries).toHaveLength(1);
    expect(entries[0].transferId).toBe("tx-002");
  });

  it("prunes entries older than maxAge", () => {
    const manifest = createTransferManifest(dir);
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    manifest.save(makeEntry({ transferId: "tx-old", interruptedAt: old }));
    manifest.save(makeEntry({ transferId: "tx-new" }));
    manifest.prune(7 * 24 * 60 * 60 * 1000);
    const entries = manifest.load();
    expect(entries).toHaveLength(1);
    expect(entries[0].transferId).toBe("tx-new");
  });

  it("returns empty array when no manifest file exists", () => {
    const manifest = createTransferManifest(dir);
    expect(manifest.load()).toEqual([]);
  });

  it("overwrites existing entry with same transferId", () => {
    const manifest = createTransferManifest(dir);
    manifest.save(makeEntry({ bytesTransferred: 100 }));
    manifest.save(makeEntry({ bytesTransferred: 200 }));
    const entries = manifest.load();
    expect(entries).toHaveLength(1);
    expect(entries[0].bytesTransferred).toBe(200);
  });
});
