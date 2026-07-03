import {
  ipcChannels,
  updateStateSchema,
  type UpdateState,
} from "@hypershell/shared";
import { createSubscription } from "./subscription";
import type { PreloadIpcRenderer, PreloadLogger } from "./types";

export interface UpdateApi {
  checkForUpdates(): Promise<void>;
  downloadUpdate(): Promise<void>;
  installUpdate(): Promise<void>;
  openUpdateRelease(): Promise<void>;
  getUpdateState(): Promise<UpdateState>;
  onUpdateState(listener: (state: UpdateState) => void): () => void;
}

export function createUpdateApi(
  ipcRenderer: PreloadIpcRenderer,
  logger: PreloadLogger
): UpdateApi {
  return {
    async checkForUpdates(): Promise<void> {
      await ipcRenderer.invoke(ipcChannels.update.check);
    },
    async downloadUpdate(): Promise<void> {
      await ipcRenderer.invoke(ipcChannels.update.download);
    },
    async installUpdate(): Promise<void> {
      await ipcRenderer.invoke(ipcChannels.update.install);
    },
    async openUpdateRelease(): Promise<void> {
      await ipcRenderer.invoke(ipcChannels.update.openRelease);
    },
    async getUpdateState(): Promise<UpdateState> {
      const raw = await ipcRenderer.invoke(ipcChannels.update.getState);
      return updateStateSchema.parse(raw);
    },
    onUpdateState: createSubscription(
      ipcRenderer,
      logger,
      ipcChannels.update.state,
      "onUpdateState",
      "update state",
      updateStateSchema
    ),
  };
}
