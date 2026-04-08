import { describe, it, expect } from "vitest";
import { exportHostsToJson, exportHostsToCsv } from "./hostsIpc";

const sampleHost = {
  id: "h1",
  name: "web-1",
  hostname: "192.168.1.1",
  port: 22,
  username: "admin",
  identityFile: null,
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
});
