import {
  ipcChannels,
  upsertGroupRequestSchema,
  removeGroupRequestSchema,
  type UpsertGroupRequest,
  type RemoveGroupRequest
} from "@sshterm/shared";
import type { IpcMainInvokeEvent } from "electron";
import type { IpcMainLike } from "./registerIpc";

type GroupsRepoLike = {
  create(input: { id: string; name: string; description?: string | null }): { id: string; name: string; description: string | null };
  list(): { id: string; name: string; description: string | null }[];
  remove(id: string): boolean;
};

export function registerGroupsIpc(ipcMain: IpcMainLike, getRepo: () => GroupsRepoLike): void {
  ipcMain.handle(ipcChannels.groups.list, () => {
    return getRepo().list();
  });

  ipcMain.handle(ipcChannels.groups.upsert, (_event: IpcMainInvokeEvent, request: UpsertGroupRequest) => {
    const parsed = upsertGroupRequestSchema.parse(request);
    return getRepo().create({
      id: parsed.id,
      name: parsed.name,
      description: parsed.description ?? null
    });
  });

  ipcMain.handle(ipcChannels.groups.remove, (_event: IpcMainInvokeEvent, request: RemoveGroupRequest) => {
    const parsed = removeGroupRequestSchema.parse(request);
    getRepo().remove(parsed.id);
  });
}
