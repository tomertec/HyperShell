import { describe, it, expect } from "vitest";
import { exportHostsToJson, exportHostsToCsv, exportHostsToSshConfig } from "./hostExport";

const sampleHost = {
  id: "h1",
  name: "web-1",
  hostname: "192.168.1.1",
  port: 22,
  username: "admin",
  identityFile: null,
  hostProfileId: null,
  authProfileId: null,
  groupId: null,
  notes: "production server",
  authMethod: "default" as const,
  agentKind: "system" as const,
  opReference: null,
  isFavorite: false,
  sortOrder: null,
  color: null,
  proxyJump: null,
  proxyJumpHostIds: null,
  keepAliveInterval: null,
  autoReconnect: false,
  reconnectMaxAttempts: 5,
  reconnectBaseInterval: 1,
  tmuxDetect: false,
};

describe("host export", () => {
  it("exports to JSON format", () => {
    const json = exportHostsToJson([sampleHost]);
    const parsed = JSON.parse(json);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe("web-1");
    expect(parsed[0].hostname).toBe("192.168.1.1");
  });

  it("exports to CSV format", () => {
    const csv = exportHostsToCsv([sampleHost]);
    const lines = csv.split("\n");
    expect(lines[0]).toContain("name");
    expect(lines[0]).toContain("hostname");
    expect(lines[1]).toContain("web-1");
    expect(lines[1]).toContain("192.168.1.1");
  });

  it("handles CSV fields with commas in notes", () => {
    const hostWithComma = { ...sampleHost, notes: "server, production" };
    const csv = exportHostsToCsv([hostWithComma]);
    expect(csv).toContain('"server, production"');
  });

  it("exports to SSH config format", () => {
    const config = exportHostsToSshConfig([{
      ...sampleHost,
      identityFile: "~/.ssh/id_ed25519",
      proxyJump: "bastion",
      keepAliveInterval: 30,
    }]);
    expect(config).toContain("Host web-1");
    expect(config).toContain("HostName 192.168.1.1");
    expect(config).toContain("Port 22");
    expect(config).toContain("User admin");
    expect(config).toContain("IdentityFile ~/.ssh/id_ed25519");
    expect(config).toContain("ProxyJump bastion");
    expect(config).toContain("ServerAliveInterval 30");
  });
});
