import { app, Menu, Tray, nativeImage, type NativeImage } from "electron";
import { existsSync } from "node:fs";
import path from "node:path";
import { ipcChannels } from "@hypershell/shared";

export interface TrayActions {
  showWindow: () => void;
  hideWindow: () => void;
  openQuickConnect: () => void;
}

export interface CreateTrayDeps {
  TrayClass?: new (icon: unknown) => TrayInstanceLike;
  MenuClass?: {
    buildFromTemplate(template: unknown[]): unknown;
  };
  nativeImageFactory?: {
    createEmpty(): string | NativeImage;
  };
  appRef?: {
    getAppPath(): string;
    quit(): void;
  };
  existsSyncFn?: typeof existsSync;
}

export interface TrayWindowLike {
  show(): void;
  hide(): void;
  isVisible(): boolean;
  isDestroyed(): boolean;
  webContents: {
    isDestroyed(): boolean;
    send(channel: string, ...args: unknown[]): void;
  };
}

interface TrayInstanceLike {
  setToolTip(text: string): void;
  setContextMenu(menu: unknown): void;
  on(event: "click", listener: () => void): void;
}

export function createTray(
  mainWindow: TrayWindowLike,
  actions: TrayActions = {
    showWindow: () => mainWindow.show(),
    hideWindow: () => mainWindow.hide(),
    openQuickConnect: () => {
      if (mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
        return;
      }

      mainWindow.webContents.send(ipcChannels.tray.quickConnect);
    }
  },
  deps: CreateTrayDeps = {}
): Tray {
  const TrayClass = deps.TrayClass ?? Tray;
  const MenuClass = deps.MenuClass ?? Menu;
  const nativeImageFactory = deps.nativeImageFactory ?? nativeImage;
  const appRef = deps.appRef ?? app;
  const existsSyncFn = deps.existsSyncFn ?? existsSync;

  const iconPath = path.join(
    process.resourcesPath || appRef.getAppPath(),
    "assets",
    process.platform === "win32" ? "tray.png" : "trayTemplate.png"
  );

  const tray = new TrayClass(
    existsSyncFn(iconPath) ? iconPath : nativeImageFactory.createEmpty()
  );
  tray.setToolTip("HyperShell");

  const rebuildMenu = () => {
    tray.setContextMenu(
      MenuClass.buildFromTemplate([
        {
          label: "Show",
          click: () => actions.showWindow()
        },
        {
          label: "Hide",
          click: () => actions.hideWindow()
        },
        {
          type: "separator"
        },
        {
          label: "Quick Connect",
          click: () => actions.openQuickConnect()
        },
        {
          type: "separator"
        },
        {
          label: "Quit",
          click: () => appRef.quit()
        }
      ])
    );
  };

  tray.on("click", () => {
    if (mainWindow.isVisible()) {
      actions.hideWindow();
      return;
    }

    actions.showWindow();
  });

  rebuildMenu();
  return tray as Tray;
}
