import {
  ipcChannels,
  getLocalProfileEnvVarsRequestSchema,
  localProfileEnvVarSchema,
  localProfileRecordSchema,
  removeLocalProfileRequestSchema,
  reorderLocalProfilesRequestSchema,
  setLocalProfileHiddenRequestSchema,
  upsertLocalProfileRequestSchema,
  type GetLocalProfileEnvVarsRequest,
  type LocalProfileEnvVar,
  type LocalProfileRecord,
  type RemoveLocalProfileRequest,
  type ReorderLocalProfilesRequest,
  type SetLocalProfileHiddenRequest,
  type UpsertLocalProfileRequest
} from "@hypershell/shared";
import { z } from "zod";
import type { PreloadIpcRenderer, PreloadLogger } from "./types";

export interface LocalApi {
  listLocalProfiles(): Promise<LocalProfileRecord[]>;
  upsertLocalProfile(request: UpsertLocalProfileRequest): Promise<LocalProfileRecord>;
  removeLocalProfile(request: RemoveLocalProfileRequest): Promise<void>;
  setLocalProfileHidden(request: SetLocalProfileHiddenRequest): Promise<void>;
  reorderLocalProfiles(request: ReorderLocalProfilesRequest): Promise<void>;
  rescanLocalProfiles(): Promise<LocalProfileRecord[]>;
  getLocalProfileEnvVars(request: GetLocalProfileEnvVarsRequest): Promise<LocalProfileEnvVar[]>;
}

const localProfileRecordArraySchema = z.array(localProfileRecordSchema);
const localProfileEnvVarArraySchema = z.array(localProfileEnvVarSchema);

export function createLocalApi(
  ipcRenderer: PreloadIpcRenderer,
  _logger: PreloadLogger
): LocalApi {
  return {
    async listLocalProfiles(): Promise<LocalProfileRecord[]> {
      const result = await ipcRenderer.invoke(ipcChannels.localProfiles.list);
      return localProfileRecordArraySchema.parse(result);
    },
    async upsertLocalProfile(request: UpsertLocalProfileRequest): Promise<LocalProfileRecord> {
      const parsed = upsertLocalProfileRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.localProfiles.upsert, parsed);
      return localProfileRecordSchema.parse(result);
    },
    async removeLocalProfile(request: RemoveLocalProfileRequest): Promise<void> {
      const parsed = removeLocalProfileRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.localProfiles.remove, parsed);
    },
    async setLocalProfileHidden(request: SetLocalProfileHiddenRequest): Promise<void> {
      const parsed = setLocalProfileHiddenRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.localProfiles.setHidden, parsed);
    },
    async reorderLocalProfiles(request: ReorderLocalProfilesRequest): Promise<void> {
      const parsed = reorderLocalProfilesRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.localProfiles.reorder, parsed);
    },
    async rescanLocalProfiles(): Promise<LocalProfileRecord[]> {
      const result = await ipcRenderer.invoke(ipcChannels.localProfiles.rescan);
      return localProfileRecordArraySchema.parse(result);
    },
    async getLocalProfileEnvVars(
      request: GetLocalProfileEnvVarsRequest
    ): Promise<LocalProfileEnvVar[]> {
      const parsed = getLocalProfileEnvVarsRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.localProfiles.getEnvVars, parsed);
      return localProfileEnvVarArraySchema.parse(result);
    }
  };
}
