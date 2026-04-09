import {
  ipcChannels,
  saveWorkspaceRequestSchema,
  loadWorkspaceRequestSchema,
  removeWorkspaceRequestSchema,
  workspaceLayoutSchema,
} from "@hypershell/shared";
import { createWorkspaceRepository } from "@hypershell/db";
import type { IpcMainInvokeEvent } from "electron";
import type { IpcMainLike } from "./registerIpc";

type WorkspaceRepoLike = ReturnType<typeof createWorkspaceRepository>;

export function registerWorkspaceIpc(
  ipcMain: IpcMainLike,
  getDb: () => unknown
): void {
  const repo = createWorkspaceRepository(getDb() as Parameters<typeof createWorkspaceRepository>[0]);

  ipcMain.handle(
    ipcChannels.workspace.save,
    (_event: IpcMainInvokeEvent, request: unknown) => {
      const parsed = saveWorkspaceRequestSchema.parse(request);
      repo.save(parsed.name, parsed.layout);
      return { success: true };
    }
  );

  ipcMain.handle(
    ipcChannels.workspace.load,
    (_event: IpcMainInvokeEvent, request: unknown) => {
      const parsed = loadWorkspaceRequestSchema.parse(request);
      return repo.load(parsed.name) ?? null;
    }
  );

  ipcMain.handle(ipcChannels.workspace.list, () => {
    return repo.list();
  });

  ipcMain.handle(
    ipcChannels.workspace.remove,
    (_event: IpcMainInvokeEvent, request: unknown) => {
      const parsed = removeWorkspaceRequestSchema.parse(request);
      const removed = repo.remove(parsed.name);
      if (!removed) throw new Error(`Workspace "${parsed.name}" not found`);
      return { success: true };
    }
  );

  ipcMain.handle(
    ipcChannels.workspace.saveLast,
    (_event: IpcMainInvokeEvent, request: unknown) => {
      const parsed = workspaceLayoutSchema.parse(request);
      repo.save("__last__", parsed);
      return { success: true };
    }
  );

  ipcMain.handle(ipcChannels.workspace.loadLast, () => {
    return repo.load("__last__") ?? null;
  });
}
