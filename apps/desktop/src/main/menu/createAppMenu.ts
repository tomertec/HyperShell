import { app, Menu } from "electron";

/**
 * Creates and sets the application menu.
 * On macOS, adds the standard app-name menu (About, Hide, Quit)
 * and Window menu (Minimize, Zoom, Close).
 * The menu is hidden on Windows (custom titlebar) but accelerators still work.
 */
export function createAppMenu(): void {
  const isMac = process.platform === "darwin";

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const },
            ],
          },
        ]
      : []),
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        {
          label: "Zoom In",
          accelerator: "CmdOrCtrl+Shift+=",
          role: "zoomIn",
        },
        {
          label: "Zoom Out",
          accelerator: "CmdOrCtrl+Shift+-",
          role: "zoomOut",
        },
        {
          label: "Reset Zoom",
          accelerator: "CmdOrCtrl+Shift+0",
          role: "resetZoom",
        },
        { type: "separator" },
        {
          label: "Toggle Developer Tools",
          accelerator: "F12",
          role: "toggleDevTools",
        },
        {
          label: "Reload",
          accelerator: "CmdOrCtrl+Shift+R",
          role: "reload",
        },
      ],
    },
    ...(isMac
      ? [
          {
            label: "Window",
            submenu: [
              { role: "minimize" as const },
              { role: "zoom" as const },
              { type: "separator" as const },
              { role: "close" as const },
              { type: "separator" as const },
              { role: "front" as const },
            ],
          },
        ]
      : []),
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
