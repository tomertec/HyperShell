import { describe, expect, it } from "vitest";
import { registerSettingsIpc } from "./settingsIpc";

function createMockIpcMain() {
  const handlers = new Map<string, Function>();
  return {
    handle(channel: string, handler: Function) {
      handlers.set(channel, handler);
    },
    removeHandler(channel: string) {
      handlers.delete(channel);
    },
    invoke(channel: string, ...args: unknown[]) {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`No handler for ${channel}`);
      return handler({}, ...args);
    }
  };
}

describe("settingsIpc", () => {
  it("returns null for unknown setting", async () => {
    const ipc = createMockIpcMain();
    registerSettingsIpc(ipc, () => null);
    const result = await ipc.invoke("settings:get", { key: "theme" });
    expect(result).toBeNull();
  });

  it("stores and retrieves a setting", async () => {
    const ipc = createMockIpcMain();
    registerSettingsIpc(ipc, () => null);
    await ipc.invoke("settings:update", { key: "theme", value: "dark" });
    const result = await ipc.invoke("settings:get", { key: "theme" });
    expect(result).toEqual({ key: "theme", value: "dark" });
  });
});
