import { describe, expect, it, vi, beforeEach } from "vitest";
import { registerSshConfigIpc } from "./sshConfigIpc";

vi.mock("node:fs", () => ({
  readFileSync: vi.fn(() => { throw Object.assign(new Error("ENOENT"), { code: "ENOENT" }); })
}));

function createMockIpcMain() {
  const handlers = new Map<string, Function>();
  return {
    handle(channel: string, handler: Function) { handlers.set(channel, handler); },
    removeHandler(channel: string) { handlers.delete(channel); },
    invoke(channel: string, ...args: unknown[]) {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`No handler for ${channel}`);
      return handler({}, ...args);
    }
  };
}

describe("sshConfigIpc", () => {
  it("returns empty when config file is missing", async () => {
    const ipc = createMockIpcMain();
    const repo = { create: vi.fn() };
    registerSshConfigIpc(ipc, () => repo);
    const result = await ipc.invoke("hosts:import-ssh-config");
    expect(result).toEqual({ imported: 0, hosts: [] });
  });
});
