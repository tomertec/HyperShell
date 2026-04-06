import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDir, "..", "..");
const uiDistDir = path.join(workspaceRoot, "apps", "ui", "dist");
const desktopRendererDir = path.join(
  workspaceRoot,
  "apps",
  "desktop",
  "dist",
  "renderer"
);

if (!existsSync(uiDistDir)) {
  throw new Error(
    `Renderer build output was not found at ${uiDistDir}. Run \`pnpm --filter @sshterm/ui run build\` first.`
  );
}

rmSync(desktopRendererDir, { recursive: true, force: true });
mkdirSync(desktopRendererDir, { recursive: true });
cpSync(uiDistDir, desktopRendererDir, { recursive: true });

console.log(`Synced renderer assets to ${desktopRendererDir}`);
