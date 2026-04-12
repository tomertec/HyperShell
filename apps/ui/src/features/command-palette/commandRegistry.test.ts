import { describe, it, expect } from "vitest";
import { createCommands, type CommandContext } from "./commandRegistry";

function makeMockContext(): CommandContext {
  return {
    getActiveSessionId: () => "session-1",
    getPaneCount: () => 2,
    splitPane: () => {},
    closePane: () => {},
    activatePrevPane: () => {},
    activateNextPane: () => {},
    isBroadcastEnabled: () => false,
    toggleBroadcast: () => {},
    openSettings: () => {},
    toggleSnippets: () => {},
    openQuickConnect: () => {},
    openHostModal: () => {},
    openImportSshConfig: () => {},
    openImportPutty: () => {},
    openImportSshManager: () => {},
    getActiveHost: () => null,
    openSftpForHost: () => {},
    hasActiveSession: () => true,
    disconnectActiveSession: () => {},
    reconnectActiveSession: () => {},
    openWorkspaceMenu: () => {},
    createBackup: () => {},
    restoreBackup: () => {},
    openKeyManager: () => {},
    reloadWindow: () => {},
    openTunnelManager: () => {},
    openTelnetDialog: () => {},
    openSerialModal: () => {},
  };
}

describe("commandRegistry", () => {
  it("creates commands with unique IDs", () => {
    const commands = createCommands(makeMockContext());
    const ids = commands.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all commands have valid categories", () => {
    const validCategories = [
      "Navigation", "Layout", "Session", "Host", "SFTP",
      "Workspace", "Port Forwarding", "Broadcast",
      "Backup", "SSH Keys", "Dev/Debug",
    ];
    const commands = createCommands(makeMockContext());
    for (const cmd of commands) {
      expect(validCategories).toContain(cmd.category);
    }
  });

  it("visible() returns boolean for all commands", () => {
    const commands = createCommands(makeMockContext());
    for (const cmd of commands) {
      expect(typeof cmd.visible()).toBe("boolean");
    }
  });

  it("toggle commands have dynamic titles", () => {
    const ctx = makeMockContext();
    ctx.isBroadcastEnabled = () => true;
    const commands = createCommands(ctx);
    const broadcast = commands.find((c) => c.id === "broadcast.toggle");
    expect(broadcast?.title).toContain("Disable");
  });

  it("session commands are hidden when no active session", () => {
    const ctx = makeMockContext();
    ctx.hasActiveSession = () => false;
    ctx.getActiveSessionId = () => null;
    const commands = createCommands(ctx);
    const disconnect = commands.find((c) => c.id === "session.disconnect");
    expect(disconnect?.visible()).toBe(false);
  });
});
