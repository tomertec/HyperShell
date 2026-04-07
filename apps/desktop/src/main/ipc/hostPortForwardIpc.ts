import {
  ipcChannels,
  listHostPortForwardsRequestSchema,
  upsertHostPortForwardRequestSchema,
  removeHostPortForwardRequestSchema,
  reorderHostPortForwardsRequestSchema,
} from "@sshterm/shared";
import type { IpcMainInvokeEvent } from "electron";
import type { IpcMainLike } from "./registerIpc";
import { createHostPortForwardsRepositoryFromDatabase } from "@sshterm/db";
import type { SqliteDatabase } from "@sshterm/db";

export function registerHostPortForwardIpc(
  ipcMain: IpcMainLike,
  getDb: () => SqliteDatabase
): () => void {
  let repo: ReturnType<typeof createHostPortForwardsRepositoryFromDatabase> | null = null;

  function getRepo() {
    if (!repo) {
      repo = createHostPortForwardsRepositoryFromDatabase(getDb());
    }
    return repo;
  }

  ipcMain.handle(ipcChannels.hostPortForward.list, (_event: IpcMainInvokeEvent, request: unknown) => {
    const parsed = listHostPortForwardsRequestSchema.parse(request);
    return getRepo().listForHost(parsed.hostId);
  });

  ipcMain.handle(ipcChannels.hostPortForward.upsert, (_event: IpcMainInvokeEvent, request: unknown) => {
    const parsed = upsertHostPortForwardRequestSchema.parse(request);
    return getRepo().create(parsed);
  });

  ipcMain.handle(ipcChannels.hostPortForward.remove, (_event: IpcMainInvokeEvent, request: unknown) => {
    const parsed = removeHostPortForwardRequestSchema.parse(request);
    return getRepo().remove(parsed.id);
  });

  ipcMain.handle(ipcChannels.hostPortForward.reorder, (_event: IpcMainInvokeEvent, request: unknown) => {
    const parsed = reorderHostPortForwardsRequestSchema.parse(request);
    return getRepo().updateSortOrders(parsed.items);
  });

  return () => {
    // No cleanup needed for DB-backed handlers
  };
}
