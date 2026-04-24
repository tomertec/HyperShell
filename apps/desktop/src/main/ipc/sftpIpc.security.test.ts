import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { pruneDragOutCache, resolveSafeDragOutPath, verifyHostKey, type HostFingerprintLookup } from "./sftpIpc";

const { mockProbeHostKey } = vi.hoisted(() => {
  const mockProbeHostKey = vi.fn();
  return { mockProbeHostKey };
});
vi.mock("@hypershell/session-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hypershell/session-core")>();
  return { ...actual, probeHostKey: mockProbeHostKey };
});

describe("resolveSafeDragOutPath", () => {
  it("keeps valid filenames inside the temp directory", () => {
    const tempDir = path.join("tmp", "hypershell-drag");
    const result = resolveSafeDragOutPath(tempDir, "server.log");
    expect(result).toBe(path.resolve(tempDir, "server.log"));
  });

  it("rejects traversal and path separator payloads", () => {
    expect(() => resolveSafeDragOutPath("/tmp/hypershell-drag", "../escape.txt")).toThrow(/invalid drag-out filename/i);
    expect(() => resolveSafeDragOutPath("/tmp/hypershell-drag", "nested/escape.txt")).toThrow(/invalid drag-out filename/i);
  });
});

describe("pruneDragOutCache", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hypershell-drag-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("removes files older than the TTL and keeps fresher ones", () => {
    const now = Date.now();
    const stale = path.join(tempDir, "stale.bin");
    const fresh = path.join(tempDir, "fresh.bin");
    fs.writeFileSync(stale, "old");
    fs.writeFileSync(fresh, "new");
    const staleTime = new Date(now - 48 * 60 * 60 * 1000);
    fs.utimesSync(stale, staleTime, staleTime);

    pruneDragOutCache(tempDir, 24 * 60 * 60 * 1000, now);

    expect(fs.existsSync(stale)).toBe(false);
    expect(fs.existsSync(fresh)).toBe(true);
  });

  it("recursively removes stale directories", () => {
    const now = Date.now();
    const nested = path.join(tempDir, "remote-home");
    fs.mkdirSync(path.join(nested, "sub"), { recursive: true });
    fs.writeFileSync(path.join(nested, "sub", "file.txt"), "payload");
    const staleTime = new Date(now - 48 * 60 * 60 * 1000);
    fs.utimesSync(nested, staleTime, staleTime);

    pruneDragOutCache(tempDir, 24 * 60 * 60 * 1000, now);

    expect(fs.existsSync(nested)).toBe(false);
  });

  it("is a no-op when the temp dir is missing", () => {
    const missing = path.join(tempDir, "does-not-exist");
    expect(() => pruneDragOutCache(missing, 1_000)).not.toThrow();
  });
});

describe("verifyHostKey", () => {
  function makeMockRepo(overrides: Partial<HostFingerprintLookup> = {}): HostFingerprintLookup {
    return {
      findByHost: vi.fn().mockReturnValue([]),
      findByHostAndAlgorithm: vi.fn().mockReturnValue(undefined),
      upsert: vi.fn(),
      ...overrides,
    };
  }

  it("throws when probe fails and no trusted fingerprints exist", async () => {
    mockProbeHostKey.mockRejectedValue(new Error("Connection refused"));
    const repo = makeMockRepo();

    await expect(verifyHostKey("example.com", 22, repo, []))
      .rejects.toThrow(/unable to verify host key.*no previously trusted fingerprints/i);
  });

  it("falls back to trusted fingerprints when probe fails but trusted keys exist", async () => {
    mockProbeHostKey.mockRejectedValue(new Error("Connection refused"));
    const repo = makeMockRepo();

    // Should NOT throw — trusted fingerprints allow fallback
    await expect(verifyHostKey("example.com", 22, repo, ["SHA256:abc123"]))
      .resolves.toBeUndefined();
  });

  it("throws HostKeyVerificationError for new hosts", async () => {
    mockProbeHostKey.mockResolvedValue({ algorithm: "ssh-ed25519", fingerprint: "SHA256:newkey" });
    const repo = makeMockRepo();

    await expect(verifyHostKey("example.com", 22, repo, []))
      .rejects.toThrow(/hostKeyVerification/);
  });

  it("throws HostKeyVerificationError when key has changed", async () => {
    const fp = "SHA256:oldkey";
    mockProbeHostKey.mockResolvedValue({ algorithm: "ssh-ed25519", fingerprint: "SHA256:newkey" });
    const repo = makeMockRepo({
      findByHostAndAlgorithm: vi.fn().mockReturnValue({ id: "1", fingerprint: fp, isTrusted: true }),
    });

    await expect(verifyHostKey("example.com", 22, repo, [fp]))
      .rejects.toThrow(/hostKeyVerification/);
  });

  it("proceeds and updates last_seen for matching trusted key", async () => {
    const fp = "SHA256:goodkey";
    mockProbeHostKey.mockResolvedValue({ algorithm: "ssh-ed25519", fingerprint: fp });
    const upsert = vi.fn();
    const repo = makeMockRepo({
      findByHostAndAlgorithm: vi.fn().mockReturnValue({ id: "1", fingerprint: fp, isTrusted: true }),
      upsert,
    });

    await expect(verifyHostKey("example.com", 22, repo, [fp]))
      .resolves.toBeUndefined();
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ fingerprint: fp }));
  });
});
