import {
  ipcChannels,
  upsertSerialProfileRequestSchema,
  removeSerialProfileRequestSchema,
  type UpsertSerialProfileRequest,
  type RemoveSerialProfileRequest
} from "@sshterm/shared";
import type { SerialProfileInput, SerialProfileRecord } from "@sshterm/db";
import type { IpcMainInvokeEvent } from "electron";
import type { IpcMainLike } from "./registerIpc";

type SerialProfilesRepoLike = {
  create(input: SerialProfileInput): SerialProfileRecord;
  list(): SerialProfileRecord[];
  remove(id: string): boolean;
};

export function registerSerialProfilesIpc(ipcMain: IpcMainLike, getRepo: () => SerialProfilesRepoLike): void {
  ipcMain.handle(ipcChannels.serialProfiles.list, () => {
    return getRepo().list();
  });

  ipcMain.handle(ipcChannels.serialProfiles.upsert, (_event: IpcMainInvokeEvent, request: UpsertSerialProfileRequest) => {
    const parsed = upsertSerialProfileRequestSchema.parse(request);
    return getRepo().create(parsed);
  });

  ipcMain.handle(ipcChannels.serialProfiles.remove, (_event: IpcMainInvokeEvent, request: RemoveSerialProfileRequest) => {
    const parsed = removeSerialProfileRequestSchema.parse(request);
    getRepo().remove(parsed.id);
  });

  ipcMain.handle(ipcChannels.serialProfiles.listPorts, async () => {
    const { SerialPort } = await import("serialport");
    return SerialPort.list();
  });
}
