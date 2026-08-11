import { describe, expect, it, vi } from "vitest";

import {
  buildConnectConfig,
  createSftpTransport,
  type SftpConnectionOptions
} from "./sftpTransport";

describe("buildConnectConfig", () => {
  const baseOptions: SftpConnectionOptions = {
    hostname: "example.com",
    port: 22,
    username: "testuser",
    authMethod: "password",
    password: "testpass",
  };

  it("adds a hostVerifier when trusted fingerprints are provided", () => {
    const config = buildConnectConfig(baseOptions, undefined, {
      trustedHostFingerprints: ["SHA256:abc123"],
    });

    expect(config.hostVerifier).toBeTypeOf("function");
  });

  it("accepts only trusted SHA256 host fingerprints", () => {
    const config = buildConnectConfig(baseOptions, undefined, {
      trustedHostFingerprints: ["SHA256:T17j3bElrAp7GM9254XJ8U9Pwjzk4JP5vC2CcWW6mGM="],
    });

    const hostVerifier = config.hostVerifier as (key: Buffer) => boolean;
    expect(hostVerifier(Buffer.from("trusted-host-key"))).toBe(true);
    expect(hostVerifier(Buffer.from("different-host-key"))).toBe(false);
  });
});

describe("list", () => {
  const baseOptions: SftpConnectionOptions = {
    hostname: "example.com",
    port: 22,
    username: "testuser",
    authMethod: "password",
    password: "testpass",
  };

  async function connectWithListing(filenames: string[]) {
    const sftpWrapper = {
      readdir(
        _path: string,
        callback: (error: Error | undefined, entries: unknown[]) => void
      ) {
        callback(
          undefined,
          filenames.map((filename) => ({
            filename,
            longname: filename,
            attrs: { mode: 0o100644, size: 1, mtime: 0, uid: 0, gid: 0 },
          }))
        );
      },
      end() {},
    };

    const pool = {
      acquire: vi.fn().mockResolvedValue({
        connectionId: "conn-1",
        consumerId: "consumer-1",
        client: {
          sftp(callback: (error: Error | undefined, session?: unknown) => void) {
            callback(undefined, sftpWrapper);
          },
        },
      }),
      release: vi.fn(),
      destroy() {},
      destroyAll() {},
      getStats() {
        return [];
      },
    };

    const transport = createSftpTransport("test-session", baseOptions, {
      pool: pool as never,
    });
    await transport.connect();
    return transport;
  }

  it("drops entry names that a malicious server could use to escape the target directory", async () => {
    const transport = await connectWithListing([
      "safe.txt",
      "..",
      ".",
      "../escaped.txt",
      "..\\escaped.txt",
      "nested/child.txt",
      "with\0nul.txt",
    ]);

    const entries = await transport.list("/home/user");

    expect(entries.map((entry) => entry.name)).toEqual(["safe.txt"]);
  });

  it("keeps ordinary names containing dots", async () => {
    const transport = await connectWithListing(["...", "..hidden", "a..b"]);

    const entries = await transport.list("/home/user");

    expect(entries.map((entry) => entry.name)).toEqual(["...", "..hidden", "a..b"]);
  });
});
