import { afterEach, describe, expect, it, vi } from "vitest";

import { createFakeShell } from "./fakeShell";
import { getShell, hasShell, setShell } from "./shell";

type BridgeShape = NonNullable<Window["hypershell"]>;

function installBridge(bridge: Partial<BridgeShape> | undefined) {
  (window as { hypershell?: Partial<BridgeShape> }).hypershell = bridge;
}

afterEach(() => {
  setShell(null);
  delete (window as { hypershell?: unknown }).hypershell;
});

describe("getShell with no bridge (browser / Playwright without init script)", () => {
  it("reports no shell", () => {
    expect(hasShell()).toBe(false);
  });

  it("returns a promise-resolving stub so awaited calls yield undefined", async () => {
    await expect(getShell().listHosts()).resolves.toBeUndefined();
  });

  it("returns an unsubscribe function from on* listeners", () => {
    const unsubscribe = getShell().onSessionEvent(() => {});
    expect(typeof unsubscribe).toBe("function");
    expect(unsubscribe()).toBeUndefined();
  });
});

describe("getShell with a bridge", () => {
  it("forwards calls with arguments and results", async () => {
    const listHosts = vi.fn().mockResolvedValue([{ id: "h1" }]);
    installBridge({ listHosts });
    await expect(getShell().listHosts()).resolves.toEqual([{ id: "h1" }]);
    expect(hasShell()).toBe(true);
  });

  it("throws loudly when a declared method is missing from the bridge (preload drift)", () => {
    installBridge({});
    expect(() => getShell().startPortForward).toThrow(/startPortForward/);
  });

  it("does not throw on promise/react probe properties", () => {
    installBridge({});
    const shell = getShell() as unknown as Record<string, unknown>;
    expect(shell.then).toBeUndefined();
    expect(shell.$$typeof).toBeUndefined();
  });
});

describe("setShell override", () => {
  it("wins over the window bridge and counts as present", async () => {
    const { shell, calls } = createFakeShell({
      listHosts: vi.fn().mockResolvedValue([]),
    });
    setShell(shell);
    expect(hasShell()).toBe(true);
    await getShell().listHosts();
    expect(calls).toEqual([{ method: "listHosts", args: [] }]);
  });
});

describe("createFakeShell", () => {
  it("stubs unlisted methods to resolve undefined and records the call", async () => {
    const { shell, calls } = createFakeShell();
    await expect(shell.closeSession({ sessionId: "s1" })).resolves.toBeUndefined();
    expect(calls).toEqual([{ method: "closeSession", args: [{ sessionId: "s1" }] }]);
  });

  it("returns an unsubscribe function for unlisted on* listeners", () => {
    const { shell } = createFakeShell();
    const unsubscribe = shell.onUpdateState(() => {});
    expect(typeof unsubscribe).toBe("function");
  });

  it("throws on access when an override is explicitly undefined (drift simulation)", () => {
    const { shell } = createFakeShell({ sftpWriteFile: undefined });
    expect(() => shell.sftpWriteFile).toThrow(/sftpWriteFile/);
  });
});
