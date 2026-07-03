import {
  ipcChannels,
  upsertSerialProfileRequestSchema,
  removeSerialProfileRequestSchema,
  serialPortInfoSchema,
  serialProfileRecordSchema,
  type SerialProfileRecord,
  type UpsertSerialProfileRequest,
  type RemoveSerialProfileRequest,
  type SerialPortInfo,
} from "@hypershell/shared";
import { z } from "zod";
import type { PreloadIpcRenderer, PreloadLogger } from "./types";

export interface SerialApi {
  listSerialProfiles(): Promise<SerialProfileRecord[]>;
  upsertSerialProfile(request: UpsertSerialProfileRequest): Promise<SerialProfileRecord>;
  removeSerialProfile(request: RemoveSerialProfileRequest): Promise<void>;
  listSerialPorts(): Promise<SerialPortInfo[]>;
}

const serialProfileRecordArraySchema = z.array(serialProfileRecordSchema);
const serialPortInfoArraySchema = z.array(serialPortInfoSchema);

export function createSerialApi(
  ipcRenderer: PreloadIpcRenderer,
  _logger: PreloadLogger
): SerialApi {
  return {
    async listSerialProfiles(): Promise<SerialProfileRecord[]> {
      const result = await ipcRenderer.invoke(ipcChannels.serialProfiles.list);
      return serialProfileRecordArraySchema.parse(result);
    },
    async upsertSerialProfile(request: UpsertSerialProfileRequest): Promise<SerialProfileRecord> {
      const parsed = upsertSerialProfileRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.serialProfiles.upsert, parsed);
      return serialProfileRecordSchema.parse(result);
    },
    async removeSerialProfile(request: RemoveSerialProfileRequest): Promise<void> {
      const parsed = removeSerialProfileRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.serialProfiles.remove, parsed);
    },
    async listSerialPorts(): Promise<SerialPortInfo[]> {
      const result = await ipcRenderer.invoke(ipcChannels.serialProfiles.listPorts);
      return serialPortInfoArraySchema.parse(result);
    },
  };
}
