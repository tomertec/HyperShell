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
  let repo: WorkspaceRepoLike | null = null;
  function getRepo(): WorkspaceRepoLike {
    if (!repo) {
      repo = createWorkspaceRepository(getDb() as Parameters<typeof createWorkspaceRepository>[0]);
    }
    return repo;
  }

  ipcMain.handle(
    ipcChannels.workspace.save,
    (_event: IpcMainInvokeEvent, request: unknown) => {
      const parsed = saveWorkspaceRequestSchema.parse(request);
      getRepo().save(parsed.name, parsed.layout);
      return { success: true };
    }
  );

  ipcMain.handle(
    ipcChannels.workspace.load,
    (_event: IpcMainInvokeEvent, request: unknown) => {
      const parsed = loadWorkspaceRequestSchema.parse(request);
      return getRepo().load(parsed.name) ?? null;
    }
  );

  ipcMain.handle(ipcChannels.workspace.list, () => {
    return getRepo().list();
  });

  ipcMain.handle(
    ipcChannels.workspace.remove,
    (_event: IpcMainInvokeEvent, request: unknown) => {
      const parsed = removeWorkspaceRequestSchema.parse(request);
      const removed = getRepo().remove(parsed.name);
      if (!removed) throw new Error(`Workspace "${parsed.name}" not found`);
      return { success: true };
    }
  );

  ipcMain.handle(
    ipcChannels.workspace.saveLast,
    (_event: IpcMainInvokeEvent, request: unknown) => {
      const parsed = workspaceLayoutSchema.parse(request);
      getRepo().save("__last__", parsed);
      return { success: true };
    }
  );

  ipcMain.handle(ipcChannels.workspace.loadLast, () => {
    return getRepo().load("__last__") ?? null;
  });
}
