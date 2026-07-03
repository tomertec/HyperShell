import {
  ipcChannels,
  upsertHostProfileRequestSchema,
  removeHostProfileRequestSchema,
  listHostEnvVarsRequestSchema,
  replaceHostEnvVarsRequestSchema,
  hostProfileRecordSchema,
  hostEnvVarRecordSchema,
  type HostProfileRecord,
  type UpsertHostProfileRequest,
  type RemoveHostProfileRequest,
  type HostEnvVarRecord,
  type ListHostEnvVarsRequest,
  type ReplaceHostEnvVarsRequest,
} from "@hypershell/shared";
import { z } from "zod";
import type { PreloadIpcRenderer, PreloadLogger } from "./types";

export interface HostProfilesApi {
  listHostProfiles(): Promise<HostProfileRecord[]>;
  upsertHostProfile(request: UpsertHostProfileRequest): Promise<HostProfileRecord>;
  removeHostProfile(request: RemoveHostProfileRequest): Promise<void>;
  listHostEnvVars(request: ListHostEnvVarsRequest): Promise<HostEnvVarRecord[]>;
  replaceHostEnvVars(
    request: ReplaceHostEnvVarsRequest
  ): Promise<HostEnvVarRecord[]>;
}

const hostProfileRecordArraySchema = z.array(hostProfileRecordSchema);
const hostEnvVarRecordArraySchema = z.array(hostEnvVarRecordSchema);

export function createHostProfilesApi(
  ipcRenderer: PreloadIpcRenderer,
  _logger: PreloadLogger
): HostProfilesApi {
  return {
    async listHostProfiles(): Promise<HostProfileRecord[]> {
      const result = await ipcRenderer.invoke(ipcChannels.hostProfiles.list);
      return hostProfileRecordArraySchema.parse(result);
    },
    async upsertHostProfile(request: UpsertHostProfileRequest): Promise<HostProfileRecord> {
      const parsed = upsertHostProfileRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.hostProfiles.upsert, parsed);
      return hostProfileRecordSchema.parse(result);
    },
    async removeHostProfile(request: RemoveHostProfileRequest): Promise<void> {
      const parsed = removeHostProfileRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.hostProfiles.remove, parsed);
    },
    async listHostEnvVars(request: ListHostEnvVarsRequest): Promise<HostEnvVarRecord[]> {
      const parsed = listHostEnvVarsRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.hostEnvVars.list, parsed);
      return hostEnvVarRecordArraySchema.parse(result);
    },
    async replaceHostEnvVars(
      request: ReplaceHostEnvVarsRequest
    ): Promise<HostEnvVarRecord[]> {
      const parsed = replaceHostEnvVarsRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.hostEnvVars.replace, parsed);
      return hostEnvVarRecordArraySchema.parse(result);
    },
  };
}
