import {
  ipcChannels,
  getSettingRequestSchema,
  updateSettingRequestSchema,
  type GetSettingRequest,
  type UpdateSettingRequest,
  type SettingRecord
} from "@sshterm/shared";
import type { IpcMainInvokeEvent } from "electron";
import type { IpcMainLike } from "./registerIpc";

type DbLike = {
  prepare(sql: string): {
    get(...args: unknown[]): unknown;
    run(...args: unknown[]): unknown;
    all(): unknown[];
  };
};

type SettingsRepoLike = {
  get(key: string): SettingRecord | undefined;
  set(key: string, value: string): SettingRecord;
  list(): SettingRecord[];
};

function createSettingsRepo(getDb: () => unknown): SettingsRepoLike {
  const db = getDb() as DbLike | null;

  if (!db) {
    const store = new Map<string, string>();
    return {
      get(key: string): SettingRecord | undefined {
        const value = store.get(key);
        return value !== undefined ? { key, value } : undefined;
      },
      set(key: string, value: string): SettingRecord {
        store.set(key, value);
        return { key, value };
      },
      list(): SettingRecord[] {
        return Array.from(store.entries(), ([key, value]) => ({ key, value }));
      }
    };
  }

  const getSetting = db.prepare("SELECT key, value FROM app_settings WHERE key = ?");
  const upsertSetting = db.prepare(`
    INSERT INTO app_settings (key, value) VALUES (@key, @value)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `);
  const listSettings = db.prepare("SELECT key, value FROM app_settings ORDER BY key");

  return {
    get(key: string): SettingRecord | undefined {
      const row = getSetting.get(key) as { key: string; value: string } | undefined;
      return row ? { key: row.key, value: row.value } : undefined;
    },
    set(key: string, value: string): SettingRecord {
      upsertSetting.run({ key, value });
      return { key, value };
    },
    list(): SettingRecord[] {
      return listSettings.all() as SettingRecord[];
    }
  };
}

export function registerSettingsIpc(ipcMain: IpcMainLike, getDb: () => unknown): void {
  const repo = createSettingsRepo(getDb);

  ipcMain.handle(ipcChannels.settings.get, (_event: IpcMainInvokeEvent, request: GetSettingRequest) => {
    const parsed = getSettingRequestSchema.parse(request);
    return repo.get(parsed.key) ?? null;
  });

  ipcMain.handle(ipcChannels.settings.update, (_event: IpcMainInvokeEvent, request: UpdateSettingRequest) => {
    const parsed = updateSettingRequestSchema.parse(request);
    return repo.set(parsed.key, parsed.value);
  });
}
