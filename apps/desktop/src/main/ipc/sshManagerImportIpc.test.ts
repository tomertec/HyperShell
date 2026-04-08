import { describe, it, expect } from "vitest";
import { mapAuthType, parseHostRow, parseGroupRow, parseSnippetRow } from "./sshManagerImportIpc";

describe("mapAuthType", () => {
  it("maps SshAgent (0) to default", () => {
    expect(mapAuthType(0)).toBe("default");
  });

  it("maps PrivateKeyFile (1) to keyfile", () => {
    expect(mapAuthType(1)).toBe("keyfile");
  });

  it("maps Password (2) to password", () => {
    expect(mapAuthType(2)).toBe("password");
  });

  it("maps Kerberos (3) to default", () => {
    expect(mapAuthType(3)).toBe("default");
  });

  it("maps OnePassword (4) to op-reference", () => {
    expect(mapAuthType(4)).toBe("op-reference");
  });

  it("maps unknown values to default", () => {
    expect(mapAuthType(99)).toBe("default");
    expect(mapAuthType(-1)).toBe("default");
  });
});

describe("parseHostRow", () => {
  it("parses a full host row", () => {
    const result = parseHostRow({
      Id: "abc-123",
      DisplayName: "My Server",
      Hostname: "example.com",
      Port: 2222,
      Username: "admin",
      AuthType: 1,
      PrivateKeyPath: "C:\\Users\\me\\.ssh\\id_rsa",
      OnePasswordReference: null,
      GroupId: "group-1",
      Notes: "Production server",
      IsFavorite: 1,
      SortOrder: 5,
      KeepAliveIntervalSeconds: 30,
      ConnectionType: 0,
    });

    expect(result).toEqual({
      id: "abc-123",
      displayName: "My Server",
      hostname: "example.com",
      port: 2222,
      username: "admin",
      authType: 1,
      privateKeyPath: "C:\\Users\\me\\.ssh\\id_rsa",
      opReference: null,
      groupId: "group-1",
      notes: "Production server",
      isFavorite: true,
      sortOrder: 5,
      keepAliveIntervalSeconds: 30,
    });
  });

  it("handles null/missing fields with defaults", () => {
    const result = parseHostRow({
      Id: "xyz",
      DisplayName: null,
      Hostname: "server.local",
      Port: null,
      Username: null,
      AuthType: null,
      PrivateKeyPath: null,
      OnePasswordReference: null,
      GroupId: null,
      Notes: null,
      IsFavorite: null,
      SortOrder: null,
      KeepAliveIntervalSeconds: null,
      ConnectionType: null,
    });

    expect(result.displayName).toBe("server.local");
    expect(result.port).toBe(22);
    expect(result.authType).toBe(0);
    expect(result.isFavorite).toBe(false);
    expect(result.sortOrder).toBe(0);
  });

  it("falls back displayName to 'Unknown' when both are null", () => {
    const result = parseHostRow({
      Id: "x",
      DisplayName: null,
      Hostname: null,
      Port: null,
      Username: null,
      AuthType: null,
      PrivateKeyPath: null,
      OnePasswordReference: null,
      GroupId: null,
      Notes: null,
      IsFavorite: null,
      SortOrder: null,
      KeepAliveIntervalSeconds: null,
      ConnectionType: null,
    });
    expect(result.displayName).toBe("Unknown");
    expect(result.hostname).toBe("");
  });
});

describe("parseGroupRow", () => {
  it("parses a group row", () => {
    const result = parseGroupRow({
      Id: "g-1",
      Name: "Production",
      Description: "Prod servers",
    });

    expect(result).toEqual({
      id: "g-1",
      name: "Production",
      description: "Prod servers",
    });
  });

  it("handles null name", () => {
    const result = parseGroupRow({
      Id: "g-2",
      Name: null,
      Description: null,
    });
    expect(result.name).toBe("Unnamed");
    expect(result.description).toBeNull();
  });
});

describe("parseSnippetRow", () => {
  it("parses a snippet row", () => {
    const result = parseSnippetRow({
      Id: "s-1",
      Name: "Restart nginx",
      Command: "sudo systemctl restart nginx",
      Category: "Server",
      SortOrder: 2,
    });

    expect(result).toEqual({
      id: "s-1",
      name: "Restart nginx",
      command: "sudo systemctl restart nginx",
      category: "Server",
      sortOrder: 2,
    });
  });

  it("handles null fields", () => {
    const result = parseSnippetRow({
      Id: "s-2",
      Name: null,
      Command: null,
      Category: null,
      SortOrder: null,
    });
    expect(result.name).toBe("Unnamed");
    expect(result.command).toBe("");
    expect(result.sortOrder).toBe(0);
  });
});
