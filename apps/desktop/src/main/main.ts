import { app, ipcMain } from "electron";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { createHostMonitor } from "./monitoring/hostMonitor";
import { registerIpc } from "./ipc/registerIpc";
import { createAppMenu } from "./menu/createAppMenu";
import { createTray } from "./tray/createTray";
import { createMainWindow } from "./windows/createMainWindow";
import { createMainProcessLifecycle } from "./mainLifecycle";

function getRendererUrl(): string {
  if (process.env.SSHTERM_RENDERER_URL) {
    return process.env.SSHTERM_RENDERER_URL;
  }

  const bundledRendererEntry = path.join(
    import.meta.dirname,
    "..",
    "renderer",
    "index.html"
  );

  if (existsSync(bundledRendererEntry)) {
    return pathToFileURL(bundledRendererEntry).toString();
  }

  return "http://localhost:5173";
}

const mainProcessLifecycle = createMainProcessLifecycle({
  app,
  ipcMain,
  createMainWindow,
  createTray,
  createHostMonitor,
  registerIpc,
  getRendererUrl
});

async function bootstrap(): Promise<void> {
  createAppMenu();
  await mainProcessLifecycle.bootstrap();
}

void bootstrap();

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
