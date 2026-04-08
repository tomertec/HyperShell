import { describe, it, expect } from "vitest";
import { parsePuttyRegistryOutput } from "./puttyImportIpc";

describe("parsePuttyRegistryOutput", () => {
  it("parses a single SSH session", () => {
    const stdout = [
      "HKEY_CURRENT_USER\\Software\\SimonTatham\\PuTTY\\Sessions\\myserver",
      "    HostName    REG_SZ    example.com",
      "    PortNumber    REG_DWORD    0x16",
      "    Protocol    REG_SZ    ssh",
      "    UserName    REG_SZ    admin",
      "    PublicKeyFile    REG_SZ    C:\\Users\\user\\.ssh\\id_rsa.ppk",
      "",
    ].join("\r\n");

    const sessions = parsePuttyRegistryOutput(stdout);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toEqual({
      name: "myserver",
      hostname: "example.com",
      port: 22,
      username: "admin",
      keyFile: "C:\\Users\\user\\.ssh\\id_rsa.ppk",
    });
  });

  it("parses multiple sessions", () => {
    const stdout = [
      "HKEY_CURRENT_USER\\Software\\SimonTatham\\PuTTY\\Sessions\\web-prod",
      "    HostName    REG_SZ    web.example.com",
      "    PortNumber    REG_DWORD    0x16",
      "    Protocol    REG_SZ    ssh",
      "    UserName    REG_SZ    deploy",
      "    PublicKeyFile    REG_SZ    ",
      "",
      "HKEY_CURRENT_USER\\Software\\SimonTatham\\PuTTY\\Sessions\\db-staging",
      "    HostName    REG_SZ    db.staging.internal",
      "    PortNumber    REG_DWORD    0xd431",
      "    Protocol    REG_SZ    ssh",
      "    UserName    REG_SZ    root",
      "    PublicKeyFile    REG_SZ    D:\\keys\\staging.ppk",
      "",
    ].join("\r\n");

    const sessions = parsePuttyRegistryOutput(stdout);
    expect(sessions).toHaveLength(2);
    expect(sessions[0].name).toBe("web-prod");
    expect(sessions[0].hostname).toBe("web.example.com");
    expect(sessions[0].keyFile).toBe("");
    expect(sessions[1].name).toBe("db-staging");
    expect(sessions[1].port).toBe(0xd431);
    expect(sessions[1].keyFile).toBe("D:\\keys\\staging.ppk");
  });

  it("skips Default%20Settings", () => {
    const stdout = [
      "HKEY_CURRENT_USER\\Software\\SimonTatham\\PuTTY\\Sessions\\Default%20Settings",
      "    HostName    REG_SZ    ",
      "    PortNumber    REG_DWORD    0x16",
      "    Protocol    REG_SZ    ssh",
      "    UserName    REG_SZ    ",
      "",
      "HKEY_CURRENT_USER\\Software\\SimonTatham\\PuTTY\\Sessions\\real-server",
      "    HostName    REG_SZ    real.example.com",
      "    PortNumber    REG_DWORD    0x16",
      "    Protocol    REG_SZ    ssh",
      "    UserName    REG_SZ    user",
      "",
    ].join("\r\n");

    const sessions = parsePuttyRegistryOutput(stdout);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].name).toBe("real-server");
  });

  it("skips non-SSH sessions (telnet, raw)", () => {
    const stdout = [
      "HKEY_CURRENT_USER\\Software\\SimonTatham\\PuTTY\\Sessions\\telnet-box",
      "    HostName    REG_SZ    telnet.example.com",
      "    PortNumber    REG_DWORD    0x17",
      "    Protocol    REG_SZ    telnet",
      "    UserName    REG_SZ    user",
      "",
      "HKEY_CURRENT_USER\\Software\\SimonTatham\\PuTTY\\Sessions\\raw-serial",
      "    HostName    REG_SZ    serial.example.com",
      "    PortNumber    REG_DWORD    0x16",
      "    Protocol    REG_SZ    raw",
      "    UserName    REG_SZ    user",
      "",
    ].join("\r\n");

    const sessions = parsePuttyRegistryOutput(stdout);
    expect(sessions).toHaveLength(0);
  });

  it("URL-decodes session names", () => {
    const stdout = [
      "HKEY_CURRENT_USER\\Software\\SimonTatham\\PuTTY\\Sessions\\My%20Server%20%282%29",
      "    HostName    REG_SZ    server2.example.com",
      "    PortNumber    REG_DWORD    0x16",
      "    Protocol    REG_SZ    ssh",
      "    UserName    REG_SZ    admin",
      "",
    ].join("\r\n");

    const sessions = parsePuttyRegistryOutput(stdout);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].name).toBe("My Server (2)");
  });

  it("defaults port to 22 when missing", () => {
    const stdout = [
      "HKEY_CURRENT_USER\\Software\\SimonTatham\\PuTTY\\Sessions\\no-port",
      "    HostName    REG_SZ    noport.example.com",
      "    Protocol    REG_SZ    ssh",
      "    UserName    REG_SZ    admin",
      "",
    ].join("\r\n");

    const sessions = parsePuttyRegistryOutput(stdout);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].port).toBe(22);
  });

  it("falls back to OS username when UserName is empty", () => {
    const stdout = [
      "HKEY_CURRENT_USER\\Software\\SimonTatham\\PuTTY\\Sessions\\no-user",
      "    HostName    REG_SZ    nouser.example.com",
      "    PortNumber    REG_DWORD    0x16",
      "    Protocol    REG_SZ    ssh",
      "    UserName    REG_SZ    ",
      "",
    ].join("\r\n");

    const sessions = parsePuttyRegistryOutput(stdout);
    expect(sessions).toHaveLength(1);
    // Should have a non-empty username (OS username fallback)
    expect(sessions[0].username.length).toBeGreaterThan(0);
  });

  it("skips sessions with empty hostname", () => {
    const stdout = [
      "HKEY_CURRENT_USER\\Software\\SimonTatham\\PuTTY\\Sessions\\empty-host",
      "    HostName    REG_SZ    ",
      "    PortNumber    REG_DWORD    0x16",
      "    Protocol    REG_SZ    ssh",
      "    UserName    REG_SZ    admin",
      "",
    ].join("\r\n");

    const sessions = parsePuttyRegistryOutput(stdout);
    expect(sessions).toHaveLength(0);
  });

  it("returns empty array for empty input", () => {
    expect(parsePuttyRegistryOutput("")).toEqual([]);
  });

  it("handles custom port (e.g., 2222 = 0x8ae)", () => {
    const stdout = [
      "HKEY_CURRENT_USER\\Software\\SimonTatham\\PuTTY\\Sessions\\custom-port",
      "    HostName    REG_SZ    custom.example.com",
      "    PortNumber    REG_DWORD    0x8ae",
      "    Protocol    REG_SZ    ssh",
      "    UserName    REG_SZ    user",
      "",
    ].join("\r\n");

    const sessions = parsePuttyRegistryOutput(stdout);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].port).toBe(2222);
  });
});
