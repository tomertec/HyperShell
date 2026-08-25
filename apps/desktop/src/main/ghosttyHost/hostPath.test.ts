import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveGhosttyHostPath } from "./hostPath";

describe("resolveGhosttyHostPath", () => {
  const originalEnvPath = process.env.GHOSTTY_HOST_PATH;
  const originalResourcesPath = process.resourcesPath;

  beforeEach(() => {
    delete process.env.GHOSTTY_HOST_PATH;
    // @ts-expect-error resourcesPath only exists inside a packaged Electron
    // process; plain Node leaves it undefined, which is what we're stubbing.
    delete process.resourcesPath;
  });

  afterEach(() => {
    if (originalEnvPath === undefined) {
      delete process.env.GHOSTTY_HOST_PATH;
    } else {
      process.env.GHOSTTY_HOST_PATH = originalEnvPath;
    }
    // @ts-expect-error see above — restoring the pre-test stub state.
    process.resourcesPath = originalResourcesPath;
  });

  it("prefers GHOSTTY_HOST_PATH when set, ignoring resourcesPath", () => {
    process.env.GHOSTTY_HOST_PATH = "C:\\dev\\ghostty-host\\ghostty-host.exe";
    // @ts-expect-error stubbing the Electron-only property for this branch.
    process.resourcesPath = "C:\\packaged\\resources";

    expect(resolveGhosttyHostPath()).toBe("C:\\dev\\ghostty-host\\ghostty-host.exe");
  });

  it("falls back to resourcesPath/ghostty-host/ghostty-host.exe when the env var is unset", () => {
    // @ts-expect-error stubbing the Electron-only property.
    process.resourcesPath = "C:\\packaged\\resources";

    expect(resolveGhosttyHostPath()).toBe(
      path.join("C:\\packaged\\resources", "ghostty-host", "ghostty-host.exe")
    );
  });

  it("throws a clear error when neither GHOSTTY_HOST_PATH nor resourcesPath is set", () => {
    // Plain Node (this test process) has no process.resourcesPath — that's
    // an Electron-only property. Silently joining `undefined` into a path
    // would produce the literal string "undefined/ghostty-host/..." instead
    // of failing, so this is a deliberate throw rather than a latent bug.
    expect(() => resolveGhosttyHostPath()).toThrow(/GHOSTTY_HOST_PATH/);
  });
});
