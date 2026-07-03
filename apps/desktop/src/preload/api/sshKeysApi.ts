import {
  ipcChannels,
  sshKeyInfoSchema,
  generateSshKeyRequestSchema,
  removeSshKeyRequestSchema,
  getFingerprintRequestSchema,
  convertPpkRequestSchema,
  convertPpkResponseSchema,
  type SshKeyInfo,
  type GenerateSshKeyRequest,
  type RemoveSshKeyRequest,
  type GetFingerprintRequest,
  type ConvertPpkRequest,
  type ConvertPpkResponse,
} from "@hypershell/shared";
import { z } from "zod";
import type { PreloadIpcRenderer, PreloadLogger } from "./types";

export interface SshKeysApi {
  sshKeysList(): Promise<SshKeyInfo[]>;
  sshKeysGenerate(request: GenerateSshKeyRequest): Promise<{ path: string }>;
  sshKeysGetFingerprint(request: GetFingerprintRequest): Promise<{ fingerprint: string | null }>;
  sshKeysRemove(request: RemoveSshKeyRequest): Promise<void>;
  sshKeysConvertPpk(request: ConvertPpkRequest): Promise<ConvertPpkResponse>;
}

const sshKeyInfoArraySchema = z.array(sshKeyInfoSchema);
const sshKeysGenerateResponseSchema = z.object({ path: z.string() });
const sshFingerprintResponseSchema = z.object({ fingerprint: z.string().nullable() });

export function createSshKeysApi(
  ipcRenderer: PreloadIpcRenderer,
  _logger: PreloadLogger
): SshKeysApi {
  return {
    async sshKeysList(): Promise<SshKeyInfo[]> {
      const result = await ipcRenderer.invoke(ipcChannels.sshKeys.list);
      return sshKeyInfoArraySchema.parse(result);
    },
    async sshKeysGenerate(request: GenerateSshKeyRequest): Promise<{ path: string }> {
      const parsed = generateSshKeyRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.sshKeys.generate, parsed);
      return sshKeysGenerateResponseSchema.parse(result);
    },
    async sshKeysGetFingerprint(request: GetFingerprintRequest): Promise<{ fingerprint: string | null }> {
      const parsed = getFingerprintRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.sshKeys.getFingerprint, parsed);
      return sshFingerprintResponseSchema.parse(result);
    },
    async sshKeysRemove(request: RemoveSshKeyRequest): Promise<void> {
      const parsed = removeSshKeyRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.sshKeys.remove, parsed);
    },
    async sshKeysConvertPpk(request: ConvertPpkRequest): Promise<ConvertPpkResponse> {
      const parsed = convertPpkRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.sshKeys.convertPpk, parsed);
      return convertPpkResponseSchema.parse(result);
    },
  };
}
