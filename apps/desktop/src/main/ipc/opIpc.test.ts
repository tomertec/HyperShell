import { describe, expect, it, vi, beforeEach } from "vitest";
import { registerOpIpc } from "./opIpc";

function createMockIpcMain() {
  const handlers = new Map<string, Function>();
  return {
    handle(channel: string, handler: Function) {
      handlers.set(channel, handler);
    },
    invoke(channel: string, ...args: unknown[]) {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`No handler for ${channel}`);
      return handler({}, ...args);
    },
  };
}

// We mock execFile to avoid needing real `op` CLI in tests
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));
vi.mock("node:util", () => ({
  promisify: (fn: Function) => fn,
}));

import { execFile } from "node:child_process";
const mockExecFile = vi.mocked(execFile);

describe("opIpc", () => {
  let ipcMain: ReturnType<typeof createMockIpcMain>;

  beforeEach(() => {
    ipcMain = createMockIpcMain();
    vi.clearAllMocks();
    registerOpIpc(ipcMain as any);
  });

  it("lists vaults", async () => {
    mockExecFile.mockResolvedValue({
      stdout: JSON.stringify([{ id: "abc", name: "Personal" }]),
      stderr: "",
    } as any);

    const result = await ipcMain.invoke("op:list-vaults");
    expect(result).toEqual([{ id: "abc", name: "Personal" }]);
  });

  it("lists items for a vault", async () => {
    mockExecFile.mockResolvedValue({
      stdout: JSON.stringify([{ id: "item1", title: "Server Login", category: "LOGIN" }]),
      stderr: "",
    } as any);

    const result = await ipcMain.invoke("op:list-items", { vaultId: "abc" });
    expect(result).toEqual([{ id: "item1", title: "Server Login", category: "LOGIN" }]);
  });

  it("gets fields for an item", async () => {
    mockExecFile.mockResolvedValue({
      stdout: JSON.stringify({
        fields: [
          { id: "f1", label: "username", type: "STRING", value: "admin" },
          { id: "f2", label: "password", type: "CONCEALED", value: "secret" },
        ],
      }),
      stderr: "",
    } as any);

    const result = await ipcMain.invoke("op:get-item-fields", { itemId: "item1" });
    expect(result).toEqual([
      { id: "f1", label: "username", type: "STRING" },
      { id: "f2", label: "password", type: "CONCEALED" },
    ]);
  });

  it("throws when op CLI is not found", async () => {
    const err = new Error("spawn op ENOENT") as NodeJS.ErrnoException;
    err.code = "ENOENT";
    mockExecFile.mockRejectedValue(err);

    await expect(ipcMain.invoke("op:list-vaults")).rejects.toThrow(
      /1Password CLI.*not found/i
    );
  });
});
