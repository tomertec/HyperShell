import { BrowserWindow } from "electron";
import path from "node:path";
import { resolveAppIconPath } from "./resolveAppIconPath";
import { attachWindowSecurityGuards } from "./windowSecurity";

export interface CreateEditorWindowOptions {
  sftpSessionId: string;
  parentWindow: BrowserWindow;
  rendererUrl: string;
}

export function createEditorWindow(options: CreateEditorWindowOptions): BrowserWindow {
  const { sftpSessionId, parentWindow, rendererUrl } = options;
  const preloadPath = path.join(__dirname, "..", "preload", "index.cjs");
  const iconPath = resolveAppIconPath();

  const win = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 600,
    minHeight: 400,
    title: "HyperShell Editor",
    backgroundColor: "#07111f",
    parent: parentWindow,
    modal: false,
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Build editor URL — handle both file:// (production) and http:// (dev)
  const url = new URL(rendererUrl);
  url.searchParams.set("window", "editor");
  url.searchParams.set("sftpSessionId", sftpSessionId);
  attachWindowSecurityGuards(win, rendererUrl);
  void win.loadURL(url.toString());

  return win;
}
