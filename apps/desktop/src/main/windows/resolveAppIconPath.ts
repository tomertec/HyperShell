import { app } from "electron";
import { existsSync } from "node:fs";
import path from "node:path";

export function resolveAppIconPath(): string | undefined {
  const iconPath = path.join(
    process.resourcesPath || app.getAppPath(),
    "assets",
    "app-icon.png"
  );

  return existsSync(iconPath) ? iconPath : undefined;
}
