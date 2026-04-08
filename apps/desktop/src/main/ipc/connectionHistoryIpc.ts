import {
  createConnectionHistoryRepositoryFromDatabase,
  type SqliteDatabase,
} from "@sshterm/db";
import {
  ipcChannels,
  connectionHistoryRecordSchema,
  connectionHistoryListByHostRequestSchema,
  connectionHistoryListRecentRequestSchema,
} from "@sshterm/shared";
import { z } from "zod";

import type { IpcMainLike } from "./registerIpc";

const connectionHistoryRecordArraySchema = z.array(connectionHistoryRecordSchema);

export function registerConnectionHistoryIpc(
  ipcMain: IpcMainLike,
  getDatabase: () => SqliteDatabase
): void {
  const repo = createConnectionHistoryRepositoryFromDatabase(getDatabase());

  ipcMain.handle(
    ipcChannels.connectionHistory.listByHost,
    async (_event: unknown, request: unknown) => {
      const parsed = connectionHistoryListByHostRequestSchema.parse(request);
      const rows = repo.listByHost(parsed.hostId, parsed.limit ?? 200);
      return connectionHistoryRecordArraySchema.parse(rows);
    }
  );

  ipcMain.handle(
    ipcChannels.connectionHistory.listRecent,
    async (_event: unknown, request: unknown) => {
      const parsed = connectionHistoryListRecentRequestSchema.parse(request ?? {});
      const rows = repo.listRecent(parsed.limit ?? 200);
      return connectionHistoryRecordArraySchema.parse(rows);
    }
  );
}
