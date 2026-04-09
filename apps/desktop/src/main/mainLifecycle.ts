import { ipcChannels } from "@hypershell/shared";
import type {
  IpcMainLike,
  RegisterIpcOptions
} from "./ipc/registerIpc";
import { editorWindowManager } from "./windows/editorWindowManager";
import type { TrayWindowLike } from "./tray/createTray";

interface ElectronAppLike {
  whenReady(): Promise<void>;
  on(event: "activate", listener: () => void): void;
  on(event: "before-quit", listener: () => void): void;
  quit(): void;
}

interface TrayLike {
  destroy(): void;
}

interface HostMonitorLike {
  start(): void;
  stop(): void;
}

export interface MainProcessLifecycleDeps {
  app: ElectronAppLike;
  ipcMain: IpcMainLike;
  createMainWindow: () => TrayWindowLike & {
    loadURL(url: string): Promise<void> | void;
  };
  createTray: (window: TrayWindowLike) => TrayLike;
  createHostMonitor: () => HostMonitorLike;
  registerIpc: (ipcMain: IpcMainLike, options: RegisterIpcOptions) => () => void;
  getRendererUrl: () => string;
}

export interface MainProcessLifecycle {
  bootstrap(): Promise<void>;
  activate(): void;
  beforeQuit(): void;
}

export function createMainProcessLifecycle(
  deps: MainProcessLifecycleDeps
): MainProcessLifecycle {
  let mainWindow:
    | (TrayWindowLike & { loadURL(url: string): Promise<void> | void })
    | null = null;
  let mainTray: TrayLike | null = null;
  let unregisterIpc: (() => void) | null = null;
  let hostMonitor: HostMonitorLike | null = null;
  let isWired = false;
  let isBootstrapped = false;
  let isCleaningUp = false;

  function createAndLoadMainWindow(): TrayWindowLike & {
    loadURL(url: string): Promise<void> | void;
  } {
    const window = deps.createMainWindow();
    void window.loadURL(deps.getRendererUrl());
    mainWindow = window;
    return window;
  }

  function stopCurrentResources(): void {
    unregisterIpc?.();
    unregisterIpc = null;
    hostMonitor?.stop();
    hostMonitor = null;
    mainTray?.destroy();
    mainTray = null;
    editorWindowManager.closeAll();
    mainWindow = null;
    isBootstrapped = false;
  }

  function activate(): void {
    if (!mainWindow || mainWindow.isDestroyed()) {
      const nextWindow = createAndLoadMainWindow();
      mainTray?.destroy();
      mainTray = deps.createTray(nextWindow);
    }
  }

  function beforeQuit(): void {
    if (isCleaningUp) {
      return;
    }

    isCleaningUp = true;
    stopCurrentResources();
  }

  async function bootstrap(): Promise<void> {
    await deps.app.whenReady();

    if (!isWired) {
      deps.app.on("activate", activate);
      deps.app.on("before-quit", beforeQuit);
      isWired = true;
    }

    if (isBootstrapped) {
      beforeQuit();
    }

    isCleaningUp = false;

    unregisterIpc = deps.registerIpc(deps.ipcMain, {
      emitSessionEvent: (event: unknown) => {
        mainWindow?.webContents.send(ipcChannels.session.event, event);
      },
      emitSftpEvent: (event: unknown) => {
        mainWindow?.webContents.send(ipcChannels.sftp.event, event);
      },
      emitKeyboardInteractive: (event: unknown) => {
        mainWindow?.webContents.send(ipcChannels.sftp.keyboardInteractive, event);
      },
      emitHostStatusEvent: (event: unknown) => {
        mainWindow?.webContents.send(ipcChannels.hosts.status, event);
      },
    });
    hostMonitor = deps.createHostMonitor();

    const window = createAndLoadMainWindow();
    editorWindowManager.setParentWindow(window as unknown as import("electron").BrowserWindow);
    editorWindowManager.setRendererUrl(deps.getRendererUrl());
    mainTray = deps.createTray(window);
    hostMonitor.start();
    isBootstrapped = true;
  }

  return {
    bootstrap,
    activate,
    beforeQuit
  };
}
