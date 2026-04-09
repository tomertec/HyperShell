import { contextBridge, ipcRenderer } from "electron";

import { createDesktopApi } from "./desktopApi";

export const desktopApi = createDesktopApi(ipcRenderer);

contextBridge.exposeInMainWorld("hypershell", desktopApi);
