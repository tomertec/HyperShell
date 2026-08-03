import { describe, it, expect } from "vitest";
import { createWindowsProcessTreeProvider } from "./windowsProcessTree";

describe("createWindowsProcessTreeProvider", () => {
  it("resolves null off Windows without loading the native module", async () => {
    let loaded = false;
    const provider = createWindowsProcessTreeProvider({
      platform: "linux",
      load: () => {
        loaded = true;
        throw new Error("should not load");
      }
    });

    await expect(provider(123)).resolves.toBeNull();
    expect(loaded).toBe(false);
  });

  it("maps the native tree shape onto ProcessNode", async () => {
    const provider = createWindowsProcessTreeProvider({
      platform: "win32",
      load: () => ({
        getProcessTree(rootPid, callback) {
          expect(rootPid).toBe(4242);
          callback({
            pid: 4242,
            name: "pwsh.exe",
            children: [{ pid: 4300, name: "llmtop.exe" }]
          });
        }
      })
    });

    await expect(provider(4242)).resolves.toEqual({
      pid: 4242,
      name: "pwsh.exe",
      children: [{ pid: 4300, name: "llmtop.exe", children: [] }]
    });
  });

  it("resolves null when the native module yields no tree", async () => {
    const provider = createWindowsProcessTreeProvider({
      platform: "win32",
      load: () => ({
        getProcessTree(_rootPid, callback) {
          callback(undefined);
        }
      })
    });

    await expect(provider(1)).resolves.toBeNull();
  });

  it("resolves null when the native module fails to load", async () => {
    const provider = createWindowsProcessTreeProvider({
      platform: "win32",
      load: () => {
        throw new Error("MODULE_NOT_FOUND");
      }
    });

    await expect(provider(1)).resolves.toBeNull();
  });
});
