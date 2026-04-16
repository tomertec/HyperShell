import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { resolveSafeDragOutPath, verifyHostKey, type HostFingerprintLookup } from "./sftpIpc";

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
