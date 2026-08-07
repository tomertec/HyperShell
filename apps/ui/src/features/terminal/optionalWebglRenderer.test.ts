import type { ITerminalAddon, Terminal } from "@xterm/xterm";
import { describe, expect, it, vi } from "vitest";

import { loadOptionalWebglRenderer } from "./optionalWebglRenderer";

function createFakeAddon() {
  let contextLoss: (() => void) | undefined;
  const addon = {
    activate: vi.fn(),
    dispose: vi.fn(),
    onContextLoss: vi.fn((listener: () => void) => {
      contextLoss = listener;
      return { dispose: vi.fn() };
    })
  } satisfies ITerminalAddon & {
    onContextLoss(listener: () => void): { dispose(): void };
  };

  return { addon, loseContext: () => contextLoss?.() };
}

describe("loadOptionalWebglRenderer", () => {
  it("loads the addon and disposes it when the WebGL context is lost", async () => {
    const { addon, loseContext } = createFakeAddon();
    const terminal = { loadAddon: vi.fn() } as unknown as Pick<Terminal, "loadAddon">;

    await expect(loadOptionalWebglRenderer(terminal, () => Promise.resolve(addon))).resolves.toBe(true);
    expect(terminal.loadAddon).toHaveBeenCalledWith(addon);

    loseContext();
    expect(addon.dispose).toHaveBeenCalledOnce();
  });

  it("keeps the DOM renderer when the addon factory rejects", async () => {
    const terminal = { loadAddon: vi.fn() } as unknown as Pick<Terminal, "loadAddon">;

    await expect(
      loadOptionalWebglRenderer(terminal, () => Promise.reject(new Error("WebGL unavailable")))
    ).resolves.toBe(false);
    expect(terminal.loadAddon).not.toHaveBeenCalled();
  });

  it("disposes a partially loaded addon when activation throws", async () => {
    const { addon } = createFakeAddon();
    const terminal = {
      loadAddon: vi.fn(() => {
        throw new Error("activation failed");
      })
    } as unknown as Pick<Terminal, "loadAddon">;

    await expect(loadOptionalWebglRenderer(terminal, () => Promise.resolve(addon))).resolves.toBe(false);
    expect(addon.dispose).toHaveBeenCalledOnce();
  });
});
