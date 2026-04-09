import {
  createTagRepository,
  createTagRepositoryFromDatabase,
  type SqliteDatabase,
} from "@hypershell/db";
import {
  getHostTagsRequestSchema,
  ipcChannels,
  removeTagRequestSchema,
  setHostTagsRequestSchema,
  upsertTagRequestSchema,
  type GetHostTagsRequest,
  type RemoveTagRequest,
  type SetHostTagsRequest,
  type UpsertTagRequest,
} from "@hypershell/shared";
import type { IpcMainInvokeEvent } from "electron";
import type { IpcMainLike } from "./registerIpc";

type TagRepoLike = {
  list(): Array<{ id: string; name: string; color: string | null }>;
  upsert(input: {
    id: string;
    name: string;
    color?: string | null;
  }): { id: string; name: string; color: string | null };
  remove(id: string): boolean;
  getHostTags(hostId: string): Array<{ id: string; name: string; color: string | null }>;
  setHostTags(
    hostId: string,
    tagIds: string[]
  ): Array<{ id: string; name: string; color: string | null }>;
};

export function registerTagIpc(
  ipcMain: IpcMainLike,
  getDatabase: () => SqliteDatabase
): void {
  const repo: TagRepoLike = (() => {
    try {
      const db = getDatabase();
      if (db && typeof (db as { prepare?: unknown }).prepare === "function") {
        return createTagRepositoryFromDatabase(db);
      }
    } catch {
      // Fall through to in-memory fallback.
    }
    return createTagRepository(":memory:");
  })();

  ipcMain.handle(ipcChannels.tags.list, () => {
    return repo.list();
  });

  ipcMain.handle(
    ipcChannels.tags.upsert,
    (_event: IpcMainInvokeEvent, request: UpsertTagRequest) => {
      const parsed = upsertTagRequestSchema.parse(request);
      return repo.upsert({
        id: parsed.id,
        name: parsed.name,
        color: parsed.color ?? null,
      });
    }
  );

  ipcMain.handle(
    ipcChannels.tags.remove,
    (_event: IpcMainInvokeEvent, request: RemoveTagRequest) => {
      const parsed = removeTagRequestSchema.parse(request);
      repo.remove(parsed.id);
    }
  );

  ipcMain.handle(
    ipcChannels.tags.getHostTags,
    (_event: IpcMainInvokeEvent, request: GetHostTagsRequest) => {
      const parsed = getHostTagsRequestSchema.parse(request);
      return repo.getHostTags(parsed.hostId);
    }
  );

  ipcMain.handle(
    ipcChannels.tags.setHostTags,
    (_event: IpcMainInvokeEvent, request: SetHostTagsRequest) => {
      const parsed = setHostTagsRequestSchema.parse(request);
      return repo.setHostTags(parsed.hostId, parsed.tagIds);
    }
  );
}
