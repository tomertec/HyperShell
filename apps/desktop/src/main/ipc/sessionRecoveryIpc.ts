import {
  createSavedSessionRepositoryFromDatabase,
  type SqliteDatabase,
} from "@sshterm/db";
import {
  ipcChannels,
  sessionClearSavedStateResponseSchema,
  sessionLoadSavedStateResponseSchema,
  sessionSaveStateRequestSchema,
  sessionSaveStateResponseSchema,
} from "@sshterm/shared";

import type { IpcMainLike } from "./registerIpc";

export function registerSessionRecoveryIpc(
  ipcMain: IpcMainLike,
  getDatabase: () => SqliteDatabase
): void {
  const repo = createSavedSessionRepositoryFromDatabase(getDatabase());

  ipcMain.handle(
    ipcChannels.session.saveState,
    async (_event: unknown, request: unknown) => {
      const parsed = sessionSaveStateRequestSchema.parse(request);
      const saved = repo.replaceAll(
        parsed.sessions.map((session) => ({
          id: session.id,
          hostId: session.hostId ?? null,
          transport: session.transport,
          profileId: session.profileId,
          title: session.title,
        }))
      );
      return sessionSaveStateResponseSchema.parse({ saved });
    }
  );

  ipcMain.handle(ipcChannels.session.loadSavedState, async () => {
    const sessions = repo.listRecoverable(500);
    return sessionLoadSavedStateResponseSchema.parse({ sessions });
  });

  ipcMain.handle(ipcChannels.session.clearSavedState, async () => {
    const cleared = repo.clearAll();
    return sessionClearSavedStateResponseSchema.parse({ cleared });
  });
}
