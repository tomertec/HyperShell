import { describe, it, expect, vi } from "vitest";
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

  it("requests command lines and maps a resolved CLI display name", async () => {
    let flags: number | undefined;
    const provider = createWindowsProcessTreeProvider({
      platform: "win32",
      resolveNodeCliName: (name, commandLine) =>
        name === "node.exe" && commandLine?.includes("pi-coding-agent") ? "pi" : null,
      load: () => ({
        getProcessTree(rootPid, callback, requestedFlags) {
          expect(rootPid).toBe(4242);
          flags = requestedFlags;
          callback({
            pid: 4242,
            name: "pwsh.exe",
            commandLine: "pwsh.exe",
            children: [
              {
                pid: 4300,
                name: "node.exe",
                commandLine:
                  "node C:\\nvm4w\\nodejs\\node_modules\\@earendil-works\\pi-coding-agent\\dist\\cli.js"
              }
            ]
          });
        }
      })
    });

    const tree = await provider(4242);

    expect(flags).toBe(2);
    expect(tree).toEqual({
      pid: 4242,
      name: "pwsh.exe",
      children: [{ pid: 4300, name: "node.exe", displayName: "pi", children: [] }]
    });
    expect(JSON.stringify(tree)).not.toContain("commandLine");
  });

  it("omits displayName when CLI resolution has no answer", async () => {
    const provider = createWindowsProcessTreeProvider({
      platform: "win32",
      resolveNodeCliName: () => null,
      load: () => ({
        getProcessTree(_rootPid, callback) {
          callback({
            pid: 1,
            name: "pwsh.exe",
            children: [{ pid: 2, name: "node.exe", commandLine: "node --inspect" }]
          });
        }
      })
    });

    await expect(provider(1)).resolves.toEqual({
      pid: 1,
      name: "pwsh.exe",
      children: [{ pid: 2, name: "node.exe", children: [] }]
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

  it("resolves null when the native module never invokes its callback", async () => {
    vi.useFakeTimers();
    try {
      const provider = createWindowsProcessTreeProvider({
        platform: "win32",
        load: () => ({
          getProcessTree() {
            // never calls back — simulates a hung native call
          }
        })
      });

      const result = provider(1);
      await vi.advanceTimersByTimeAsync(2000);

      await expect(result).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
