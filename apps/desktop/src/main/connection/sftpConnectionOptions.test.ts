import { describe, expect, it } from "vitest";

import { parseEffectiveSshConfig } from "./sftpConnectionOptions";

// Real `ssh -G` output is lowercase, space-separated, one directive per line,
// and always lists every directive — including the ones set to "none".
const SAMPLE = `user tomer
hostname 10.10.10.20
port 2222
proxyjump bastion.example.com
identityagent none
identityfile ~/.ssh/id_ed25519
identityfile ~/.ssh/id_rsa
serveraliveinterval 0
`;

describe("parseEffectiveSshConfig", () => {
  it("reads the directives the SFTP transport needs", () => {
    expect(parseEffectiveSshConfig(SAMPLE)).toEqual({
      user: "tomer",
      hostname: "10.10.10.20",
      port: 2222,
      proxyJump: "bastion.example.com",
      identityFiles: ["~/.ssh/id_ed25519", "~/.ssh/id_rsa"]
    });
  });

  it("treats 'none' as absent for proxyjump, identityagent and identityfile", () => {
    const parsed = parseEffectiveSshConfig(
      ["proxyjump none", "identityagent none", "identityfile none"].join("\n")
    );

    expect(parsed.proxyJump).toBeUndefined();
    expect(parsed.identityAgent).toBeUndefined();
    expect(parsed.identityFiles).toEqual([]);
  });

  it("is case-insensitive on directive names and on 'none'", () => {
    const parsed = parseEffectiveSshConfig(
      ["HostName example.com", "ProxyJump NONE", "IdentityAgent None"].join("\n")
    );

    expect(parsed.hostname).toBe("example.com");
    expect(parsed.proxyJump).toBeUndefined();
    expect(parsed.identityAgent).toBeUndefined();
  });

  it("keeps identity files in the order OpenSSH lists them", () => {
    const parsed = parseEffectiveSshConfig(
      ["identityfile /a", "identityfile /b", "identityfile /c"].join("\n")
    );

    expect(parsed.identityFiles).toEqual(["/a", "/b", "/c"]);
  });

  it("preserves spaces in a value rather than truncating at the first one", () => {
    const parsed = parseEffectiveSshConfig(
      "identityfile C:\\Users\\Some User\\.ssh\\id_ed25519"
    );

    expect(parsed.identityFiles).toEqual([
      "C:\\Users\\Some User\\.ssh\\id_ed25519"
    ]);
  });

  it("ignores an unparseable port rather than emitting NaN", () => {
    expect(parseEffectiveSshConfig("port notanumber").port).toBeUndefined();
  });

  it("skips blank lines, valueless directives and unknown keys", () => {
    const parsed = parseEffectiveSshConfig(
      ["", "   ", "compression", "loglevel INFO", "user tomer"].join("\n")
    );

    expect(parsed).toEqual({ user: "tomer", identityFiles: [] });
  });

  it("handles CRLF output", () => {
    const parsed = parseEffectiveSshConfig("user tomer\r\nport 22\r\n");

    expect(parsed.user).toBe("tomer");
    expect(parsed.port).toBe(22);
  });

  it("returns an empty config for empty output", () => {
    expect(parseEffectiveSshConfig("")).toEqual({ identityFiles: [] });
  });
});
