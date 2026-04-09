import { BrowserWindow, dialog, screen } from "electron";
import path from "node:path";
import { getOrCreateSettingsRepo } from "../ipc/hostsIpc";
import { sessionManager } from "../ipc/registerIpc";
import { resolveAppIconPath } from "./resolveAppIconPath";

interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

const APP_SETTINGS_KEY = "app.settings";
const WINDOW_X_KEY = "window.x";
const WINDOW_Y_KEY = "window.y";
const WINDOW_WIDTH_KEY = "window.width";
const WINDOW_HEIGHT_KEY = "window.height";
const WINDOW_MAXIMIZED_KEY = "window.maximized";

const DEFAULT_WIDTH = 1440;
const DEFAULT_HEIGHT = 960;
const MIN_WIDTH = 1024;
const MIN_HEIGHT = 720;
const WINDOW_STATE_SAVE_DEBOUNCE_MS = 200;

function parseIntegerSetting(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return parsed;
}

function readWindowStateNumber(key: string): number | undefined {
  const value = getOrCreateSettingsRepo().get(key)?.value;
  return parseIntegerSetting(value);
}

function readWindowStateBoolean(key: string, fallback: boolean): boolean {
  const value = getOrCreateSettingsRepo().get(key)?.value;
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return fallback;
}

function loadWindowState(): WindowState {
  const width = readWindowStateNumber(WINDOW_WIDTH_KEY);
  const height = readWindowStateNumber(WINDOW_HEIGHT_KEY);
  const x = readWindowStateNumber(WINDOW_X_KEY);
  const y = readWindowStateNumber(WINDOW_Y_KEY);

  return {
    x,
    y,
    width: typeof width === "number" && width >= MIN_WIDTH ? width : DEFAULT_WIDTH,
    height: typeof height === "number" && height >= MIN_HEIGHT ? height : DEFAULT_HEIGHT,
    isMaximized: readWindowStateBoolean(WINDOW_MAXIMIZED_KEY, false)
  };
}

function hasPositiveOverlap(outer: Electron.Rectangle, inner: Electron.Rectangle): boolean {
  const left = Math.max(outer.x, inner.x);
  const top = Math.max(outer.y, inner.y);
  const right = Math.min(outer.x + outer.width, inner.x + inner.width);
  const bottom = Math.min(outer.y + outer.height, inner.y + inner.height);
  return right > left && bottom > top;
}

function isVisibleOnDisplay(bounds: Electron.Rectangle): boolean {
  const matchingDisplay = screen.getDisplayMatching(bounds);
  return hasPositiveOverlap(bounds, matchingDisplay.workArea);
}

function saveWindowState(bounds: Electron.Rectangle, isMaximized: boolean): void {
  const settings = getOrCreateSettingsRepo();
  settings.set(WINDOW_X_KEY, String(bounds.x));
  settings.set(WINDOW_Y_KEY, String(bounds.y));
  settings.set(WINDOW_WIDTH_KEY, String(bounds.width));
  settings.set(WINDOW_HEIGHT_KEY, String(bounds.height));
  settings.set(WINDOW_MAXIMIZED_KEY, String(isMaximized));
}

function persistWindowState(win: BrowserWindow): void {
  const isMaximized = win.isMaximized();
  const bounds = isMaximized ? win.getNormalBounds() : win.getBounds();
  saveWindowState(bounds, isMaximized);
}

function isConfirmOnCloseEnabled(): boolean {
  try {
    const row = getOrCreateSettingsRepo().get(APP_SETTINGS_KEY);
    if (!row?.value) {
      return true;
    }
    const parsed = JSON.parse(row.value) as { general?: { confirmOnClose?: boolean } };
    return parsed.general?.confirmOnClose !== false;
  } catch {
    return true;
  }
}

export function createMainWindow(): BrowserWindow {
  const preloadPath = path.join(__dirname, "..", "preload", "index.cjs");
  const iconPath = resolveAppIconPath();
  const state = loadWindowState();

  const windowOptions: Electron.BrowserWindowConstructorOptions = {
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    title: "HyperShell",
    backgroundColor: "#07111f",
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#0a1929",
      symbolColor: "#8899aa",
      height: 36
    },
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  };

  if (iconPath) {
    windowOptions.icon = iconPath;
  }

  if (state.x !== undefined && state.y !== undefined) {
    const bounds: Electron.Rectangle = {
      x: state.x,
      y: state.y,
      width: state.width,
      height: state.height
    };
    if (isVisibleOnDisplay(bounds)) {
      windowOptions.width = state.width;
      windowOptions.height = state.height;
      windowOptions.x = state.x;
      windowOptions.y = state.y;
    }
  }

  const win = new BrowserWindow(windowOptions);

  if (state.isMaximized) {
    win.maximize();
  }

  let saveTimer: NodeJS.Timeout | null = null;
  const queueWindowStateSave = (): void => {
    if (saveTimer) {
      clearTimeout(saveTimer);
    }
    saveTimer = setTimeout(() => {
      saveTimer = null;
      persistWindowState(win);
    }, WINDOW_STATE_SAVE_DEBOUNCE_MS);
  };
  const flushWindowStateSave = (): void => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    persistWindowState(win);
  };

  win.on("resize", queueWindowStateSave);
  win.on("move", queueWindowStateSave);
  win.on("maximize", queueWindowStateSave);
  win.on("unmaximize", queueWindowStateSave);
  win.on("closed", () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
  });

  let closeConfirmed = false;

  win.on("close", (event) => {
    // Save window state regardless of confirmation outcome.
    flushWindowStateSave();

    // Skip confirmation if already confirmed or no active sessions.
    if (closeConfirmed) {
      return;
    }

    const activeSessions = sessionManager.listSessions();
    const count = activeSessions.length;
    if (count === 0) {
      return;
    }

    if (!isConfirmOnCloseEnabled()) {
      return;
    }

    event.preventDefault();

    void dialog
      .showMessageBox(win, {
        type: "question",
        buttons: ["Close", "Cancel"],
        defaultId: 1,
        cancelId: 1,
        title: "Active Sessions",
        message: `You have ${count} active session${count > 1 ? "s" : ""}. Close anyway?`
      })
      .then(({ response }) => {
        if (response === 0) {
          closeConfirmed = true;
          win.close();
        }
      });
  });

  return win;
}
