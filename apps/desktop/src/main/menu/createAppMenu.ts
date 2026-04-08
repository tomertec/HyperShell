import { Menu } from "electron";

/**
 * Creates and sets the application menu with zoom controls.
 * Since HyperShell uses a custom titlebar, the menu is hidden,
 * but the accelerators still work for keyboard shortcuts.
 */
export function createAppMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "View",
      submenu: [
        {
          label: "Zoom In",
          accelerator: "CmdOrCtrl+Shift+=",
          role: "zoomIn"
        },
        {
          label: "Zoom Out",
          accelerator: "CmdOrCtrl+Shift+-",
          role: "zoomOut"
        },
        {
          label: "Reset Zoom",
          accelerator: "CmdOrCtrl+Shift+0",
          role: "resetZoom"
        },
        { type: "separator" },
        {
          label: "Toggle Developer Tools",
          accelerator: "F12",
          role: "toggleDevTools"
        },
        {
          label: "Reload",
          accelerator: "CmdOrCtrl+Shift+R",
          role: "reload"
        }
      ]
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
