import { createSnippetsRepositoryFromDatabase } from "@hypershell/db";
import {
  ipcChannels,
  upsertSnippetRequestSchema,
  removeSnippetRequestSchema,
} from "@hypershell/shared";
import type { IpcMainLike } from "./registerIpc";
import type { SqliteDatabase } from "@hypershell/db";

export function registerSnippetsIpc(
  ipcMain: IpcMainLike,
  getDatabase: () => SqliteDatabase
) {
  const repo = createSnippetsRepositoryFromDatabase(getDatabase());

  ipcMain.handle(ipcChannels.snippets.list, async () => {
    return repo.list();
  });

  ipcMain.handle(ipcChannels.snippets.upsert, async (_event: unknown, request: unknown) => {
    const parsed = upsertSnippetRequestSchema.parse(request);
    return repo.create(parsed);
  });

  ipcMain.handle(ipcChannels.snippets.remove, async (_event: unknown, request: unknown) => {
    const parsed = removeSnippetRequestSchema.parse(request);
    repo.remove(parsed.id);
  });
}
