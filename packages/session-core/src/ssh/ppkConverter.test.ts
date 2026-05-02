import { describe, it, expect, vi, beforeEach } from "vitest";
import { join, sep } from "node:path";
import { isPpkFile, getConvertedKeyPath, convertPpkToOpenSsh } from "./ppkConverter";

// Mock node modules
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  access: vi.fn(),
}));

import { execFile } from "node:child_process";
import { readFile, writeFile, access } from "node:fs/promises";

// Build a promisify-compatible mock for execFile
function mockExecFileSuccess(stdout: string) {
  (execFile as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (_cmd: string, _args: string[], callback: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
      callback(null, { stdout, stderr: "" });
    }
  );
}

function mockExecFileSequence(results: Array<{ stdout?: string; error?: Error }>) {
  let callIndex = 0;
  (execFile as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (_cmd: string, _args: string[], callback: (err: Error | null, result?: { stdout: string; stderr: string }) => void) => {
      const result = results[callIndex++];
      if (result?.error) {
        callback(result.error);
      } else {
        callback(null, { stdout: result?.stdout ?? "", stderr: "" });
      }
    }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("isPpkFile", () => {
  it("returns true for PPK v2 header", async () => {
    (readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      "PuTTY-User-Key-File-2: ssh-rsa\nEncryption: none\n"
    );
    expect(await isPpkFile("/path/to/key.ppk")).toBe(true);
  });

  it("returns true for PPK v3 header", async () => {
    (readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      "PuTTY-User-Key-File-3: ssh-ed25519\nEncryption: none\n"
    );
    expect(await isPpkFile("/path/to/key.ppk")).toBe(true);
  });

  it("returns false for OpenSSH key", async () => {
    (readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      "-----BEGIN OPENSSH PRIVATE KEY-----\ndata\n"
    );
    expect(await isPpkFile("/path/to/key")).toBe(false);
  });

  it("returns false when file cannot be read", async () => {
    (readFile as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("ENOENT")
    );
    expect(await isPpkFile("/nonexistent")).toBe(false);
  });
});

describe("getConvertedKeyPath", () => {
  it("replaces .ppk extension with _openssh", () => {
    const input = join("C:", "Users", "me", ".ssh", "mykey.ppk");
    const expected = join("C:", "Users", "me", ".ssh", "mykey_openssh");
    expect(getConvertedKeyPath(input)).toBe(expected);
  });

  it("handles simple paths", () => {
    const input = ["home", "user", ".ssh", "mykey.ppk"].join(sep);
    const expected = ["home", "user", ".ssh", "mykey_openssh"].join(sep);
    expect(getConvertedKeyPath(input)).toBe(expected);
  });
});

describe("convertPpkToOpenSsh", () => {
  const ppkPath = join("home", "user", ".ssh", "mykey.ppk");
  const expectedOutput = join("home", "user", ".ssh", "mykey_openssh");
  const ppkContent = "PuTTY-User-Key-File-2: ssh-rsa\nEncryption: none\n";
  const opensshKey = "-----BEGIN OPENSSH PRIVATE KEY-----\nkeydata\n-----END OPENSSH PRIVATE KEY-----";

  it("converts successfully with ssh-keygen", async () => {
    (access as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(ppkContent);
    (writeFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    mockExecFileSuccess(opensshKey);

    const result = await convertPpkToOpenSsh(ppkPath);

    expect(result.success).toBe(true);
    expect(result.outputPath).toBe(expectedOutput);
    expect(result.tool).toBe("ssh-keygen");
    expect(writeFile).toHaveBeenCalledWith(
      expectedOutput,
      opensshKey + "\n",
      { mode: 0o600 }
    );
  });

  it("falls back to puttygen when ssh-keygen fails", async () => {
    (access as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(ppkContent);
    mockExecFileSequence([
      { error: new Error("ssh-keygen: unsupported key format") },
      { stdout: "" }, // puttygen writes to file, no stdout
    ]);

    const result = await convertPpkToOpenSsh(ppkPath);

    expect(result.success).toBe(true);
    expect(result.outputPath).toBe(expectedOutput);
    expect(result.tool).toBe("puttygen");
  });

  it("returns error when both tools fail", async () => {
    (access as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(ppkContent);
    mockExecFileSequence([
      { error: new Error("ssh-keygen failed") },
      { error: new Error("puttygen not found") },
    ]);

    const result = await convertPpkToOpenSsh(ppkPath);

    expect(result.success).toBe(false);
    expect(result.tool).toBe("none");
    expect(result.error).toContain("Neither ssh-keygen nor puttygen");
  });

  it("returns error when file not found", async () => {
    (access as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("ENOENT")
    );

    const result = await convertPpkToOpenSsh(ppkPath);

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("returns error when file is not PPK format", async () => {
    (access as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      "-----BEGIN OPENSSH PRIVATE KEY-----\ndata\n"
    );

    const result = await convertPpkToOpenSsh(ppkPath);

    expect(result.success).toBe(false);
    expect(result.error).toContain("not appear to be in PuTTY PPK format");
  });
});
