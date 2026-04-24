import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  pruneDragOutCache,
  resolveSafeDragOutPath,
  shouldStartNativeDragOut,
  stageSftpDragOutItem,
  verifyHostKey,
  type HostFingerprintLookup,
} from "./sftpIpc";

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

  it("removes files older than the TTL and keeps fresher ones", async () => {
    const now = Date.now();
    const stale = path.join(tempDir, "stale.bin");
    const fresh = path.join(tempDir, "fresh.bin");
    fs.writeFileSync(stale, "old");
    fs.writeFileSync(fresh, "new");
    const staleTime = new Date(now - 48 * 60 * 60 * 1000);
    fs.utimesSync(stale, staleTime, staleTime);

    await pruneDragOutCache(tempDir, 24 * 60 * 60 * 1000, now);

    expect(fs.existsSync(stale)).toBe(false);
    expect(fs.existsSync(fresh)).toBe(true);
  });

  it("recursively removes stale directories", async () => {
    const now = Date.now();
    const nested = path.join(tempDir, "remote-home");
    fs.mkdirSync(path.join(nested, "sub"), { recursive: true });
    fs.writeFileSync(path.join(nested, "sub", "file.txt"), "payload");
    const staleTime = new Date(now - 48 * 60 * 60 * 1000);
    fs.utimesSync(nested, staleTime, staleTime);

    await pruneDragOutCache(tempDir, 24 * 60 * 60 * 1000, now);

    expect(fs.existsSync(nested)).toBe(false);
  });

  it("is a no-op when the temp dir is missing", async () => {
    const missing = path.join(tempDir, "does-not-exist");
    await expect(pruneDragOutCache(missing, 1_000)).resolves.toBeUndefined();
  });
});

describe("stageSftpDragOutItem", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hypershell-drag-stage-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("stages a remote file through the active SFTP transport", async () => {
    const transport = {
      createReadStream: vi.fn(() => Readable.from([Buffer.from("remote payload")])),
    };

    const stagedPath = await stageSftpDragOutItem({
      transport: transport as any,
      tempDir,
      cacheKey: "sftp-1:/var/log/app.log",
      item: {
        remotePath: "/var/log/app.log",
        fileName: "app.log",
        isDirectory: false,
      },
    });

    expect(transport.createReadStream).toHaveBeenCalledWith("/var/log/app.log");
    expect(path.dirname(stagedPath)).toBe(path.resolve(tempDir));
    expect(path.basename(stagedPath)).toMatch(/^app-[a-f0-9]{12}\.log$/);
    expect(fs.readFileSync(stagedPath, "utf8")).toBe("remote payload");
  });

  it("recursively stages a remote directory", async () => {
    const transport = {
      list: vi.fn(async (remotePath: string) => {
        if (remotePath === "/home/user/project") {
          return [
            {
              name: "README.md",
              path: "/home/user/project/README.md",
              size: 7,
              modifiedAt: new Date(0).toISOString(),
              isDirectory: false,
              permissions: 0o644,
              owner: 0,
              group: 0,
            },
            {
              name: "src",
              path: "/home/user/project/src",
              size: 0,
              modifiedAt: new Date(0).toISOString(),
              isDirectory: true,
              permissions: 0o755,
              owner: 0,
              group: 0,
            },
          ];
        }

        if (remotePath === "/home/user/project/src") {
          return [
            {
              name: "main.ts",
              path: "/home/user/project/src/main.ts",
              size: 13,
              modifiedAt: new Date(0).toISOString(),
              isDirectory: false,
              permissions: 0o644,
              owner: 0,
              group: 0,
            },
          ];
        }

        return [];
      }),
      createReadStream: vi.fn((remotePath: string) =>
        Readable.from([remotePath.endsWith("README.md") ? "# readme" : "console.log(1)"])
      ),
    };

    const stagedPath = await stageSftpDragOutItem({
      transport: transport as any,
      tempDir,
      cacheKey: "sftp-1:/home/user/project",
      item: {
        remotePath: "/home/user/project",
        fileName: "project",
        isDirectory: true,
      },
    });

    expect(path.dirname(stagedPath)).toBe(path.resolve(tempDir));
    expect(path.basename(stagedPath)).toMatch(/^project-[a-f0-9]{12}$/);
    expect(fs.readFileSync(path.join(stagedPath, "README.md"), "utf8")).toBe("# readme");
    expect(fs.readFileSync(path.join(stagedPath, "src", "main.ts"), "utf8")).toBe("console.log(1)");
  });

  it("archives remote directories when preparing them for native drag-out", async () => {
    const transport = {
      list: vi.fn(async (remotePath: string) => {
        if (remotePath === "/home/user/project") {
          return [
            {
              name: "README.md",
              path: "/home/user/project/README.md",
              size: 7,
              modifiedAt: new Date(0).toISOString(),
              isDirectory: false,
              permissions: 0o644,
              owner: 0,
              group: 0,
            },
          ];
        }

        return [];
      }),
      createReadStream: vi.fn(() => Readable.from(["# readme"])),
    };

    const stagedPath = await stageSftpDragOutItem({
      transport: transport as any,
      tempDir,
      cacheKey: "sftp-1:/home/user/project",
      archiveDirectory: true,
      item: {
        remotePath: "/home/user/project",
        fileName: "project",
        isDirectory: true,
      },
    });

    expect(path.basename(stagedPath)).toMatch(/^project-[a-f0-9]{12}\.zip$/);
    expect(fs.statSync(stagedPath).isFile()).toBe(true);

    const zipBytes = fs.readFileSync(stagedPath);
    expect(zipBytes.subarray(0, 4).toString("hex")).toBe("504b0304");
    expect(zipBytes.toString("utf8")).toContain("project/README.md");
    expect(zipBytes.toString("utf8")).toContain("# readme");
  });

  it("archives readable directory contents and records unreadable children", async () => {
    const permissionDenied = Object.assign(new Error("Permission denied"), { code: 3 });
    const transport = {
      list: vi.fn(async (remotePath: string) => {
        if (remotePath === "/home/user/project") {
          return [
            {
              name: "public.txt",
              path: "/home/user/project/public.txt",
              size: 6,
              modifiedAt: new Date(0).toISOString(),
              isDirectory: false,
              permissions: 0o644,
              owner: 0,
              group: 0,
            },
            {
              name: "secret.txt",
              path: "/home/user/project/secret.txt",
              size: 6,
              modifiedAt: new Date(0).toISOString(),
              isDirectory: false,
              permissions: 0o600,
              owner: 0,
              group: 0,
            },
            {
              name: "private",
              path: "/home/user/project/private",
              size: 0,
              modifiedAt: new Date(0).toISOString(),
              isDirectory: true,
              permissions: 0o700,
              owner: 0,
              group: 0,
            },
          ];
        }

        if (remotePath === "/home/user/project/private") {
          throw permissionDenied;
        }

        return [];
      }),
      createReadStream: vi.fn((remotePath: string) => {
        if (remotePath === "/home/user/project/secret.txt") {
          return Readable.from((async function* () {
            throw permissionDenied;
          })());
        }

        return Readable.from(["public"]);
      }),
    };

    const stagedPath = await stageSftpDragOutItem({
      transport: transport as any,
      tempDir,
      cacheKey: "sftp-1:/home/user/project",
      archiveDirectory: true,
      item: {
        remotePath: "/home/user/project",
        fileName: "project",
        isDirectory: true,
      },
    });

    const zipText = fs.readFileSync(stagedPath).toString("utf8");
    expect(zipText).toContain("project/public.txt");
    expect(zipText).toContain("public");
    expect(zipText).toContain("HYPERSHELL_SKIPPED_FILES.txt");
    expect(zipText).toContain("/home/user/project/secret.txt");
    expect(zipText).toContain("/home/user/project/private");
    expect(zipText).toContain("Permission denied");
  });

  it("rejects unsafe names returned from remote directory listings", async () => {
    const transport = {
      list: vi.fn(async () => [
        {
          name: "../escape.txt",
          path: "/home/user/project/../escape.txt",
          size: 4,
          modifiedAt: new Date(0).toISOString(),
          isDirectory: false,
          permissions: 0o644,
          owner: 0,
          group: 0,
        },
      ]),
      createReadStream: vi.fn(() => Readable.from(["nope"])),
    };

    await expect(
      stageSftpDragOutItem({
        transport: transport as any,
        tempDir,
        cacheKey: "sftp-1:/home/user/project",
        item: {
          remotePath: "/home/user/project",
          fileName: "project",
          isDirectory: true,
        },
      })
    ).rejects.toThrow(/invalid drag-out filename/i);

    expect(transport.createReadStream).not.toHaveBeenCalled();
  });
});

describe("shouldStartNativeDragOut", () => {
  it("does not start native drag for an uncached directory", () => {
    expect(
      shouldStartNativeDragOut(
        {
          isDirectory: true,
        },
        false
      )
    ).toBe(false);
  });

  it("starts native drag for a directory that was already staged", () => {
    expect(
      shouldStartNativeDragOut(
        {
          isDirectory: true,
        },
        true
      )
    ).toBe(true);
  });

  it("does not start native drag for prepare-only requests", () => {
    expect(
      shouldStartNativeDragOut(
        {
          prepareOnly: true,
        },
        true
      )
    ).toBe(false);
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
