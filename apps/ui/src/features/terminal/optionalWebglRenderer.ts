import type { ITerminalAddon, Terminal } from "@xterm/xterm";

type OptionalWebglAddon = ITerminalAddon & {
  onContextLoss(listener: () => void): { dispose(): void };
};

type CreateWebglAddon = () => Promise<OptionalWebglAddon>;

const createWebglAddon: CreateWebglAddon = async () => {
  const { WebglAddon } = await import("@xterm/addon-webgl");
  return new WebglAddon();
};

export async function loadOptionalWebglRenderer(
  terminal: Pick<Terminal, "loadAddon">,
  createAddon: CreateWebglAddon = createWebglAddon
): Promise<boolean> {
  let addon: OptionalWebglAddon | undefined;

  try {
    addon = await createAddon();
    addon.onContextLoss(() => addon?.dispose());
    terminal.loadAddon(addon);
    return true;
  } catch {
    addon?.dispose();
    return false;
  }
}
