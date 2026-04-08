import {
  createHostEnvVarRepositoryFromDatabase,
  type SqliteDatabase,
} from "@sshterm/db";
import {
  ipcChannels,
  listHostEnvVarsRequestSchema,
  replaceHostEnvVarsRequestSchema,
  type ListHostEnvVarsRequest,
  type ReplaceHostEnvVarsRequest,
} from "@sshterm/shared";
import type { IpcMainInvokeEvent } from "electron";
import type { IpcMainLike } from "./registerIpc";

export function registerHostEnvVarIpc(
  ipcMain: IpcMainLike,
  getDb: () => SqliteDatabase
): void {
  type HostEnvVarRepoLike = Pick<
    ReturnType<typeof createHostEnvVarRepositoryFromDatabase>,
    "listByHost" | "replaceForHost"
  >;

  const repo: HostEnvVarRepoLike = (() => {
    try {
      const db = getDb();
      if (db && typeof (db as { prepare?: unknown }).prepare === "function") {
        return createHostEnvVarRepositoryFromDatabase(db);
      }
    } catch {
      // Fall through to in-memory fallback.
    }

    const byHost = new Map<string, Array<{
      id: string;
      hostId: string;
      name: string;
      value: string;
      isEnabled: boolean;
      sortOrder: number;
      createdAt: string;
    }>>();

    return {
      listByHost(hostId: string) {
        return [...(byHost.get(hostId) ?? [])].sort(
          (left, right) => left.sortOrder - right.sortOrder
        );
      },
      replaceForHost(hostId: string, envVars) {
        const now = new Date().toISOString();
        const next = envVars.map((item, index) => ({
          id: item.id ?? `env-${hostId}-${index}`,
          hostId,
          name: item.name,
          value: item.value ?? "",
          isEnabled: item.isEnabled ?? true,
          sortOrder: item.sortOrder ?? index,
          createdAt: now,
        }));
        byHost.set(hostId, next);
        return next;
      },
    };
  })();

  ipcMain.handle(
    ipcChannels.hostEnvVars.list,
    (_event: IpcMainInvokeEvent, request: ListHostEnvVarsRequest) => {
      const parsed = listHostEnvVarsRequestSchema.parse(request);
      return repo.listByHost(parsed.hostId);
    }
  );

  ipcMain.handle(
    ipcChannels.hostEnvVars.replace,
    (_event: IpcMainInvokeEvent, request: ReplaceHostEnvVarsRequest) => {
      const parsed = replaceHostEnvVarsRequestSchema.parse(request);
      return repo.replaceForHost(
        parsed.hostId,
        parsed.envVars.map((item, index) => ({
          ...item,
          hostId: parsed.hostId,
          sortOrder: item.sortOrder ?? index,
        }))
      );
    }
  );
}
