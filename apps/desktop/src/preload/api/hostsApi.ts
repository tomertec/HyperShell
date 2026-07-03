import {
  exportHostsRequestSchema,
  hostFingerprintRecordSchema,
  hostFingerprintLookupRequestSchema,
  hostFingerprintTrustRequestSchema,
  hostFingerprintRemoveRequestSchema,
  hostRecordSchema,
  hostStatusTargetsRequestSchema,
  hostStatusEventSchema,
  importSshConfigResponseSchema,
  importSshManagerRequestSchema,
  importSshManagerResponseSchema,
  ipcChannels,
  removeHostRequestSchema,
  reorderHostsRequestSchema,
  scanPuttyResponseSchema,
  scanSshManagerResponseSchema,
  upsertHostRequestSchema,
  type ExportHostsRequest,
  type HostFingerprintRecord,
  type HostFingerprintLookupRequest,
  type HostFingerprintTrustRequest,
  type HostFingerprintRemoveRequest,
  type HostRecord,
  type HostStatusTargetsRequest,
  type HostStatusEvent,
  type ImportSshManagerRequest,
  type ImportSshManagerResponse,
  type RemoveHostRequest,
  type ReorderHostsRequest,
  type ScanPuttyResponse,
  type ScanSshManagerResponse,
  type UpsertHostRequest,
} from "@hypershell/shared";
import { z } from "zod";
import { createSubscription } from "./subscription";
import type { PreloadIpcRenderer, PreloadLogger } from "./types";

export interface HostsApi {
  listHosts(): Promise<HostRecord[]>;
  setHostStatusTargets(request: HostStatusTargetsRequest): Promise<void>;
  onHostStatus(listener: (event: HostStatusEvent) => void): () => void;
  upsertHost(request: UpsertHostRequest): Promise<HostRecord>;
  removeHost(request: RemoveHostRequest): Promise<void>;
  reorderHosts(request: ReorderHostsRequest): Promise<{ success: boolean }>;
  importSshConfig(): Promise<{ imported: number; hosts: HostRecord[] }>;
  scanPuttySessions(): Promise<ScanPuttyResponse>;
  scanSshManager(): Promise<ScanSshManagerResponse>;
  importSshManager(request: ImportSshManagerRequest): Promise<ImportSshManagerResponse>;
  exportHosts(request: ExportHostsRequest): Promise<{ exported: number }>;
  hostFingerprintLookup(request: HostFingerprintLookupRequest): Promise<HostFingerprintRecord | null>;
  hostFingerprintTrust(request: HostFingerprintTrustRequest): Promise<HostFingerprintRecord>;
  hostFingerprintRemove(request: HostFingerprintRemoveRequest): Promise<void>;
}

const hostRecordArraySchema = z.array(hostRecordSchema);
const reorderHostsResponseSchema = z.object({ success: z.boolean() });

export function createHostsApi(
  ipcRenderer: PreloadIpcRenderer,
  logger: PreloadLogger
): HostsApi {
  return {
    async listHosts(): Promise<HostRecord[]> {
      const result = await ipcRenderer.invoke(ipcChannels.hosts.list);
      return hostRecordArraySchema.parse(result);
    },
    async setHostStatusTargets(request: HostStatusTargetsRequest): Promise<void> {
      const parsed = hostStatusTargetsRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.hosts.setStatusTargets, parsed);
    },
    onHostStatus: createSubscription(
      ipcRenderer,
      logger,
      ipcChannels.hosts.status,
      "onHostStatus",
      "host status",
      hostStatusEventSchema
    ),
    async upsertHost(request: UpsertHostRequest): Promise<HostRecord> {
      const parsed = upsertHostRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.hosts.upsert, parsed);
      return hostRecordSchema.parse(result);
    },
    async removeHost(request: RemoveHostRequest): Promise<void> {
      const parsed = removeHostRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.hosts.remove, parsed);
    },
    async reorderHosts(request: ReorderHostsRequest): Promise<{ success: boolean }> {
      const parsed = reorderHostsRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.hosts.reorder, parsed);
      return reorderHostsResponseSchema.parse(result);
    },
    async importSshConfig(): Promise<{ imported: number; hosts: HostRecord[] }> {
      const result = await ipcRenderer.invoke(ipcChannels.hosts.importSshConfig);
      return importSshConfigResponseSchema.parse(result);
    },
    async scanPuttySessions(): Promise<ScanPuttyResponse> {
      const result = await ipcRenderer.invoke(ipcChannels.hosts.scanPutty);
      return scanPuttyResponseSchema.parse(result);
    },
    async scanSshManager(): Promise<ScanSshManagerResponse> {
      const result = await ipcRenderer.invoke(ipcChannels.hosts.scanSshManager);
      return scanSshManagerResponseSchema.parse(result);
    },
    async importSshManager(request: ImportSshManagerRequest): Promise<ImportSshManagerResponse> {
      const parsed = importSshManagerRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.hosts.importSshManager, parsed);
      return importSshManagerResponseSchema.parse(result);
    },
    // Host export
    async exportHosts(request: ExportHostsRequest): Promise<{ exported: number }> {
      const raw = await ipcRenderer.invoke(ipcChannels.hosts.exportHosts, exportHostsRequestSchema.parse(request));
      return z.object({ exported: z.number() }).parse(raw);
    },
    // Host fingerprint verification
    async hostFingerprintLookup(request: HostFingerprintLookupRequest): Promise<HostFingerprintRecord | null> {
      const raw = await ipcRenderer.invoke(ipcChannels.hostFingerprint.lookup, hostFingerprintLookupRequestSchema.parse(request));
      if (!raw) return null;
      return hostFingerprintRecordSchema.parse(raw);
    },
    async hostFingerprintTrust(request: HostFingerprintTrustRequest): Promise<HostFingerprintRecord> {
      const raw = await ipcRenderer.invoke(ipcChannels.hostFingerprint.trust, hostFingerprintTrustRequestSchema.parse(request));
      return hostFingerprintRecordSchema.parse(raw);
    },
    async hostFingerprintRemove(request: HostFingerprintRemoveRequest): Promise<void> {
      await ipcRenderer.invoke(ipcChannels.hostFingerprint.remove, hostFingerprintRemoveRequestSchema.parse(request));
    },
  };
}
