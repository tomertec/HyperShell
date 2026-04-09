import { describe, expect, it, vi } from "vitest";

import {
  createSftpTransport,
  type SftpConnectionOptions
} from "./sftpTransport";

describe("createSftpTransport", () => {
  const validOptions: SftpConnectionOptions = {
    hostname: "example.com",
    port: 22,
    username: "testuser",
    authMethod: "password",
    password: "testpass"
  };

  it("creates a transport handle with SFTP operations", () => {
    const transport = createSftpTransport("test-session", validOptions);

    expect(transport).toBeDefined();
    expect(transport.connect).toBeTypeOf("function");
    expect(transport.disconnect).toBeTypeOf("function");
    expect(transport.list).toBeTypeOf("function");
    expect(transport.stat).toBeTypeOf("function");
    expect(transport.chmod).toBeTypeOf("function");
    expect(transport.mkdir).toBeTypeOf("function");
    expect(transport.rename).toBeTypeOf("function");
    expect(transport.remove).toBeTypeOf("function");
    expect(transport.readFile).toBeTypeOf("function");
    expect(transport.writeFile).toBeTypeOf("function");
    expect(transport.createReadStream).toBeTypeOf("function");
    expect(transport.createWriteStream).toBeTypeOf("function");
  });

  it("ends the SFTP channel before releasing pooled connections", async () => {
    const sftpEnd = vi.fn();
    const sftpWrapper = {
      end: sftpEnd,
    };

    const fakeClient = {
      sftp(callback: (error: Error | undefined, session?: unknown) => void) {
        callback(undefined, sftpWrapper);
      },
    };

    const release = vi.fn();
    const pool = {
      acquire: vi.fn().mockResolvedValue({
        connectionId: "conn-1",
        consumerId: "consumer-1",
        client: fakeClient,
      }),
      release,
      destroy() {},
      destroyAll() {},
      getStats() {
        return [];
      },
    };

    const transport = createSftpTransport("test-session", validOptions, {
      pool: pool as never,
    });

    await transport.connect();
    transport.disconnect();

    expect(sftpEnd).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledWith("conn-1", "consumer-1");
  });
});
