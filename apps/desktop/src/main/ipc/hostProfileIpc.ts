import {
  createHostProfileRepository,
  createHostProfileRepositoryFromDatabase,
  type HostProfileInput,
  type HostProfileRecord,
  type SqliteDatabase,
} from "@hypershell/db";
import {
  ipcChannels,
  removeHostProfileRequestSchema,
  upsertHostProfileRequestSchema,
  type RemoveHostProfileRequest,
  type UpsertHostProfileRequest,
} from "@hypershell/shared";
import type { IpcMainInvokeEvent } from "electron";
import type { IpcMainLike } from "./registerIpc";

type HostProfilesRepoLike = {
  create(input: HostProfileInput): HostProfileRecord;
  list(): HostProfileRecord[];
  remove(id: string): boolean;
};

export function registerHostProfileIpc(
  ipcMain: IpcMainLike,
  getDatabase: () => SqliteDatabase
): void {
  const repo: HostProfilesRepoLike = (() => {
    try {
      const db = getDatabase();
      if (db && typeof (db as { prepare?: unknown }).prepare === "function") {
        return createHostProfileRepositoryFromDatabase(db);
      }
    } catch {
      // Fall through to in-memory fallback.
    }
    return createHostProfileRepository(":memory:");
  })();

  ipcMain.handle(ipcChannels.hostProfiles.list, () => {
    return repo.list();
  });

  ipcMain.handle(
    ipcChannels.hostProfiles.upsert,
    (_event: IpcMainInvokeEvent, request: UpsertHostProfileRequest) => {
      const parsed = upsertHostProfileRequestSchema.parse(request);
      return repo.create(parsed);
    }
  );

  ipcMain.handle(
    ipcChannels.hostProfiles.remove,
    (_event: IpcMainInvokeEvent, request: RemoveHostProfileRequest) => {
      const parsed = removeHostProfileRequestSchema.parse(request);
      repo.remove(parsed.id);
    }
  );
}
