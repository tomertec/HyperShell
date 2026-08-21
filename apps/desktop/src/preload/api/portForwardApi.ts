import {
  ipcChannels,
  hostPortForwardRecordSchema,
  listHostPortForwardsRequestSchema,
  upsertHostPortForwardRequestSchema,
  removeHostPortForwardRequestSchema,
  reorderHostPortForwardsRequestSchema,
  connectionPoolStatsSchema,
  startPortForwardRequestSchema,
  startPortForwardResponseSchema,
  stopPortForwardRequestSchema,
  listPortForwardsResponseSchema,
  type PortForwardRecord,
  type StartPortForwardRequest,
  type StartPortForwardResponse,
  type StopPortForwardRequest,
  type HostPortForwardRecord,
  type UpsertHostPortForwardRequest,
  type ListHostPortForwardsRequest,
  type RemoveHostPortForwardRequest,
  type ReorderHostPortForwardsRequest,
  type ConnectionPoolStats,
} from "@hypershell/shared";
import { z } from "zod";
import type { PreloadIpcRenderer, PreloadLogger } from "./types";

export interface PortForwardApi {
  // Host port forwards
  hostPortForwardList(request: ListHostPortForwardsRequest): Promise<HostPortForwardRecord[]>;
  hostPortForwardUpsert(request: UpsertHostPortForwardRequest): Promise<HostPortForwardRecord>;
  hostPortForwardRemove(request: RemoveHostPortForwardRequest): Promise<boolean>;
  hostPortForwardReorder(request: ReorderHostPortForwardsRequest): Promise<void>;
  // Running port forwards
  startPortForward(request: StartPortForwardRequest): Promise<StartPortForwardResponse>;
  stopPortForward(request: StopPortForwardRequest): Promise<void>;
  listPortForwards(): Promise<PortForwardRecord[]>;
  // Connection pool
  connectionPoolStats(): Promise<ConnectionPoolStats[]>;
}

const hostPortForwardRecordArraySchema = z.array(hostPortForwardRecordSchema);
const connectionPoolStatsArraySchema = z.array(connectionPoolStatsSchema);
const booleanResponseSchema = z.boolean();

export function createPortForwardApi(
  ipcRenderer: PreloadIpcRenderer,
  _logger: PreloadLogger
): PortForwardApi {
  return {
    // Host port forwards
    async hostPortForwardList(request: ListHostPortForwardsRequest): Promise<HostPortForwardRecord[]> {
      const parsed = listHostPortForwardsRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.hostPortForward.list, parsed);
      return hostPortForwardRecordArraySchema.parse(result);
    },
    async hostPortForwardUpsert(request: UpsertHostPortForwardRequest): Promise<HostPortForwardRecord> {
      const parsed = upsertHostPortForwardRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.hostPortForward.upsert, parsed);
      return hostPortForwardRecordSchema.parse(result);
    },
    async hostPortForwardRemove(request: RemoveHostPortForwardRequest): Promise<boolean> {
      const parsed = removeHostPortForwardRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.hostPortForward.remove, parsed);
      return booleanResponseSchema.parse(result);
    },
    async hostPortForwardReorder(request: ReorderHostPortForwardsRequest): Promise<void> {
      const parsed = reorderHostPortForwardsRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.hostPortForward.reorder, parsed);
    },
    // Running port forwards
    async startPortForward(
      request: StartPortForwardRequest
    ): Promise<StartPortForwardResponse> {
      const parsed = startPortForwardRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.portForward.start, parsed);
      return startPortForwardResponseSchema.parse(result);
    },
    async stopPortForward(request: StopPortForwardRequest): Promise<void> {
      const parsed = stopPortForwardRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.portForward.stop, parsed);
    },
    async listPortForwards(): Promise<PortForwardRecord[]> {
      const result = await ipcRenderer.invoke(ipcChannels.portForward.list);
      return listPortForwardsResponseSchema.parse(result);
    },
    // Connection pool stats
    async connectionPoolStats(): Promise<ConnectionPoolStats[]> {
      const result = await ipcRenderer.invoke(ipcChannels.connectionPool.stats);
      return connectionPoolStatsArraySchema.parse(result);
    },
  };
}
