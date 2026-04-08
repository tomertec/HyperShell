import { describe, expect, it } from "vitest";

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
});
