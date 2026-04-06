import { describe, expect, it } from "vitest";

import { parseSshConfig } from "./parseSshConfig";

describe("parseSshConfig", () => {
  it("parses named host blocks with common ssh options", () => {
    const result = parseSshConfig(`
Host web prod-web
  HostName web-01.example.com
  User admin
  Port 2222
  IdentityFile ~/.ssh/id_ed25519
  ProxyJump bastion.example.com
`);

    expect(result.hosts).toHaveLength(2);
    expect(result.hosts[0]).toMatchObject({
      alias: "web",
      hostName: "web-01.example.com",
      user: "admin",
      port: 2222,
      identityFile: "~/.ssh/id_ed25519",
      proxyJump: "bastion.example.com"
    });
  });

  it("ignores global wildcard host sections", () => {
    const result = parseSshConfig(`
Host *
  ForwardAgent yes

Host router
  HostName 10.0.0.1
`);

    expect(result.hosts).toHaveLength(1);
    expect(result.hosts[0]).toMatchObject({
      alias: "router",
      hostName: "10.0.0.1"
    });
  });
});
