import {
  ipcChannels,
  getSettingRequestSchema,
  updateSettingRequestSchema,
  settingRecordSchema,
  type GetSettingRequest,
  type UpdateSettingRequest,
  type SettingRecord,
} from "@hypershell/shared";
import type { PreloadIpcRenderer, PreloadLogger } from "./types";

export interface SettingsApi {
  getSetting(request: GetSettingRequest): Promise<SettingRecord | null>;
  updateSetting(request: UpdateSettingRequest): Promise<SettingRecord>;
}

export function createSettingsApi(
  ipcRenderer: PreloadIpcRenderer,
  _logger: PreloadLogger
): SettingsApi {
  return {
    async getSetting(request: GetSettingRequest): Promise<SettingRecord | null> {
      const parsed = getSettingRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.settings.get, parsed);
      return result === null ? null : settingRecordSchema.parse(result);
    },
    async updateSetting(request: UpdateSettingRequest): Promise<SettingRecord> {
      const parsed = updateSettingRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.settings.update, parsed);
      return settingRecordSchema.parse(result);
    },
  };
}
