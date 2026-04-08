import { app, BrowserWindow, dialog, screen } from "electron";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { sessionManager } from "../ipc/registerIpc";
import { getOrCreateDatabase } from "../ipc/hostsIpc";

interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized?: boolean;
}

const STATE_FILE = "window-state.json";
const APP_SETTINGS_KEY = "app.settings";

type DbWithPrepare = {
  prepare(sql: string): {
    get(...args: unknown[]): unknown;
  };
};

function isConfirmOnCloseEnabled(): boolean {
  try {
    const db = getOrCreateDatabase() as DbWithPrepare | null;
    if (!db) {
      return true; // default to true if no DB
    }
    const row = db
      .prepare("SELECT value FROM app_settings WHERE key = ?")
      .get(APP_SETTINGS_KEY) as { value: string } | undefined;
    if (!row?.value) {
      return true; // default
    }
    const parsed = JSON.parse(row.value) as { general?: { confirmOnClose?: boolean } };
    // If the setting is explicitly false, return false; otherwise default to true
    return parsed.general?.confirmOnClose !== false;
  } catch {
    return true; // default to true on error
  }
}

function getStatePath(): string {
  return path.join(app.getPath("userData"), STATE_FILE);
}

function loadWindowState(): WindowState {
  const defaults: WindowState = { width: 1440, height: 960 };
  try {
    const raw = readFileSync(getStatePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<WindowState>;
    return {
      x: typeof parsed.x === "number" ? parsed.x : undefined,
      y: typeof parsed.y === "number" ? parsed.y : undefined,
      width: typeof parsed.width === "number" && parsed.width >= 1024 ? parsed.width : defaults.width,
      height: typeof parsed.height === "number" && parsed.height >= 720 ? parsed.height : defaults.height,
      isMaximized: typeof parsed.isMaximized === "boolean" ? parsed.isMaximized : false
    };
  } catch {
    return defaults;
  }
}

function isVisibleOnAnyDisplay(x: number, y: number, width: number, height: number): boolean {
  const displays = screen.getAllDisplays();
  return displays.some((display) => {
    const { x: dx, y: dy, width: dw, height: dh } = display.bounds;
    // At least 100px of the window must overlap with the display
    return x + width > dx + 100 && x < dx + dw - 100 && y + height > dy + 100 && y < dy + dh - 100;
  });
}

export function createMainWindow(): BrowserWindow {
  const preloadPath = path.join(__dirname, "..", "preload", "index.cjs");
  const state = loadWindowState();

  const windowOptions: Electron.BrowserWindowConstructorOptions = {
    width: state.width,
    height: state.height,
    minWidth: 1024,
    minHeight: 720,
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

  if (state.x !== undefined && state.y !== undefined &&
      isVisibleOnAnyDisplay(state.x, state.y, state.width, state.height)) {
    windowOptions.x = state.x;
    windowOptions.y = state.y;
  }

  const win = new BrowserWindow(windowOptions);

  if (state.isMaximized) {
    win.maximize();
  }

  // Track normal bounds so we can save them even when maximized
  let normalBounds = win.getBounds();
  win.on("resize", () => {
    if (!win.isMaximized()) {
      normalBounds = win.getBounds();
    }
  });
  win.on("move", () => {
    if (!win.isMaximized()) {
      normalBounds = win.getBounds();
    }
  });

  let closeConfirmed = false;

  win.on("close", (event) => {
    // Save window state regardless of confirmation outcome
    const isMaximized = win.isMaximized();
    const bounds = isMaximized ? normalBounds : win.getBounds();
    const windowState: WindowState = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      isMaximized
    };
    try {
      mkdirSync(path.dirname(getStatePath()), { recursive: true });
      writeFileSync(getStatePath(), JSON.stringify(windowState));
    } catch {
      // non-fatal
    }

    // Skip confirmation if already confirmed or no active sessions
    if (closeConfirmed) {
      return;
    }

    const activeSessions = sessionManager.listSessions();
    const count = activeSessions.length;
    if (count === 0) {
      return;
    }

    // Check the confirmOnClose setting from the database
    if (!isConfirmOnCloseEnabled()) {
      return;
    }

    // Prevent the close and show confirmation dialog
    event.preventDefault();

    void dialog
      .showMessageBox(win, {
        type: "question",
        buttons: ["Close", "Cancel"],
        defaultId: 1,
        cancelId: 1,
        title: "Active Sessions",
        message: `You have ${count} active session${count > 1 ? "s" : ""}. Close anyway?`,
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
