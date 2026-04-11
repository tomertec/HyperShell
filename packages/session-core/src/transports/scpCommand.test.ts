import { describe, expect, it } from "vitest";

import { buildScpCommand } from "./scpCommand";

describe("buildScpCommand", () => {
  it("builds download args with key file", () => {
    const result = buildScpCommand({
      hostname: "web-01.example.com",
      username: "admin",
      port: 2222,
      privateKeyPath: "C:/keys/id_ed25519",
      direction: "download",
      remotePath: "/var/log/app.log",
      localPath: "C:/Users/tomer/app.log"
    });

    expect(result.command).toBeTypeOf("string");
    expect(result.command.length).toBeGreaterThan(0);

    // -i flag for key file
    const iIndex = result.args.indexOf("-i");
    expect(iIndex).toBeGreaterThan(-1);
    expect(result.args[iIndex + 1]).toBe("C:/keys/id_ed25519");

    // -P flag for port (uppercase, unlike ssh's -p)
    const pIndex = result.args.indexOf("-P");
    expect(pIndex).toBeGreaterThan(-1);
    expect(result.args[pIndex + 1]).toBe("2222");

    // source is user@host:/remote for download
    expect(result.args).toContain("admin@web-01.example.com:/var/log/app.log");
    // target is local path
    expect(result.args).toContain("C:/Users/tomer/app.log");

    // source before target
    const srcIndex = result.args.indexOf("admin@web-01.example.com:/var/log/app.log");
    const dstIndex = result.args.indexOf("C:/Users/tomer/app.log");
    expect(srcIndex).toBeLessThan(dstIndex);

    // no -tt (not a PTY command)
    expect(result.args).not.toContain("-tt");
  });

  it("builds upload args with local before remote", () => {
    const result = buildScpCommand({
      hostname: "web-01.example.com",
      username: "deploy",
      direction: "upload",
      remotePath: "/srv/app/bundle.tar.gz",
      localPath: "C:/build/bundle.tar.gz"
    });

    // local path is the source for upload
    expect(result.args).toContain("C:/build/bundle.tar.gz");
    expect(result.args).toContain("deploy@web-01.example.com:/srv/app/bundle.tar.gz");

    const srcIndex = result.args.indexOf("C:/build/bundle.tar.gz");
    const dstIndex = result.args.indexOf("deploy@web-01.example.com:/srv/app/bundle.tar.gz");
    expect(srcIndex).toBeLessThan(dstIndex);
  });

  it("omits -P when port is not specified", () => {
    const result = buildScpCommand({
      hostname: "simple.host",
      direction: "download",
      remotePath: "/tmp/file.txt",
      localPath: "/home/user/file.txt"
    });

    expect(result.args).not.toContain("-P");
  });

  it("includes -J when proxyJump is specified", () => {
    const result = buildScpCommand({
      hostname: "internal.host",
      username: "user",
      proxyJump: "bastion.example.com",
      direction: "download",
      remotePath: "/etc/config",
      localPath: "/tmp/config"
    });

    const jIndex = result.args.indexOf("-J");
    expect(jIndex).toBeGreaterThan(-1);
    expect(result.args[jIndex + 1]).toBe("bastion.example.com");
  });

  it("always includes BatchMode=yes and StrictHostKeyChecking=no", () => {
    const result = buildScpCommand({
      hostname: "any.host",
      direction: "upload",
      remotePath: "/tmp/x",
      localPath: "/tmp/x"
    });

    // Check -o BatchMode=yes
    const args = result.args;
    let foundBatchMode = false;
    let foundStrictHostKey = false;
    for (let i = 0; i < args.length - 1; i++) {
      if (args[i] === "-o" && args[i + 1] === "BatchMode=yes") foundBatchMode = true;
      if (args[i] === "-o" && args[i + 1] === "StrictHostKeyChecking=no") foundStrictHostKey = true;
    }
    expect(foundBatchMode).toBe(true);
    expect(foundStrictHostKey).toBe(true);
  });

  it("throws on invalid proxyJump format", () => {
    expect(() =>
      buildScpCommand({
        hostname: "host",
        proxyJump: "bastion; rm -rf /",
        direction: "download",
        remotePath: "/tmp/x",
        localPath: "/tmp/x"
      })
    ).toThrow("Invalid proxyJump format");
  });

  it("uses bare hostname when username is not provided", () => {
    const result = buildScpCommand({
      hostname: "bare.host",
      direction: "download",
      remotePath: "/tmp/data",
      localPath: "/local/data"
    });

    expect(result.args).toContain("bare.host:/tmp/data");
    expect(result.args).not.toContain("@");
  });
});
