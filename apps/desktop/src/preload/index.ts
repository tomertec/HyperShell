import { contextBridge, ipcRenderer, webUtils } from "electron";

import { createDesktopApi } from "./desktopApi";

export const desktopApi = createDesktopApi(ipcRenderer, console, webUtils);

contextBridge.exposeInMainWorld("hypershell", desktopApi);
