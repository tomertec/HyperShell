import {
  connectionPoolStatsSchema,
  fsEntrySchema,
  fsGetDrivesResponseSchema,
  fsListRequestSchema,
  fsListResponseSchema,
  closeSessionRequestSchema,
  ipcChannels,
  openSessionRequestSchema,
  openSessionResponseSchema,
  resizeSessionRequestSchema,
  sessionEventSchema,
  upsertHostRequestSchema,
  removeHostRequestSchema,
  reorderHostsRequestSchema,
  writeSessionRequestSchema,
  getSettingRequestSchema,
  updateSettingRequestSchema,
  upsertGroupRequestSchema,
  removeGroupRequestSchema,
  upsertSerialProfileRequestSchema,
  removeSerialProfileRequestSchema,
  sftpBookmarkListRequestSchema,
  sftpBookmarkRemoveRequestSchema,
  sftpBookmarkReorderRequestSchema,
  sftpBookmarkSchema,
  sftpBookmarkUpsertRequestSchema,
  sftpConnectRequestSchema,
  sftpConnectResponseSchema,
  sftpDeleteRequestSchema,
  sftpDisconnectRequestSchema,
  sftpEventSchema,
  sftpEntrySchema,
  sftpListRequestSchema,
  sftpListResponseSchema,
  sftpMkdirRequestSchema,
  sftpReadFileRequestSchema,
  sftpReadFileResponseSchema,
  sftpRenameRequestSchema,
  sftpStatRequestSchema,
  sftpTransferCancelRequestSchema,
  sftpTransferListResponseSchema,
  sftpTransferResolveConflictRequestSchema,
  sftpTransferStartRequestSchema,
  sftpWriteFileRequestSchema,
  setSignalsRequestSchema,
  hostStatsRequestSchema,
  hostStatsResponseSchema,
  hostRecordSchema,
  hostPortForwardRecordSchema,
  importSshConfigResponseSchema,
  type HostStatsRequest,
  type HostStatsResponse,
  type CloseSessionRequest,
  type FsEntry,
  type FsGetDrivesResponse,
  type FsListRequest,
  type FsListResponse,
  type HostRecord,
  type OpenSessionRequest,
  type OpenSessionResponse,
  type ReorderHostsRequest,
  type RemoveHostRequest,
  type ResizeSessionRequest,
  type SessionEvent,
  type UpsertHostRequest,
  type WriteSessionRequest,
  type GetSettingRequest,
  type UpdateSettingRequest,
  type SettingRecord,
  type UpsertGroupRequest,
  type RemoveGroupRequest,
  type SerialProfileRecord,
  type UpsertSerialProfileRequest,
  type RemoveSerialProfileRequest,
  type SerialPortInfo,
  type SetSignalsRequest,
  type SftpEntry,
  type SftpBookmark,
  type SftpBookmarkListRequest,
  type SftpBookmarkRemoveRequest,
  type SftpBookmarkReorderRequest,
  type SftpBookmarkUpsertRequest,
  type SftpConnectRequest,
  type SftpConnectResponse,
  type SftpDeleteRequest,
  type SftpDisconnectRequest,
  type SftpEvent,
  type SftpListRequest,
  type SftpListResponse,
  type SftpMkdirRequest,
  type SftpReadFileRequest,
  type SftpReadFileResponse,
  type SftpRenameRequest,
  type SftpStatRequest,
  type SftpTransferCancelRequest,
  type SftpTransferListResponse,
  type SftpTransferResolveConflictRequest,
  type SftpTransferStartRequest,
  type SftpWriteFileRequest,
  type TransferJob,
  saveWorkspaceRequestSchema,
  loadWorkspaceRequestSchema,
  removeWorkspaceRequestSchema,
  serialPortInfoSchema,
  serialProfileRecordSchema,
  settingRecordSchema,
  groupRecordSchema,
  transferJobSchema,
  workspaceLayoutSchema,
  workspaceRecordSchema,
  sshKeyInfoSchema,
  generateSshKeyRequestSchema,
  removeSshKeyRequestSchema,
  getFingerprintRequestSchema,
  sftpSyncStatusSchema,
  sftpSyncStartRequestSchema,
  sftpSyncStopRequestSchema,
  sftpSyncEventSchema,
  listHostPortForwardsRequestSchema,
  upsertHostPortForwardRequestSchema,
  removeHostPortForwardRequestSchema,
  reorderHostPortForwardsRequestSchema,
  opListVaultsResponseSchema,
  opListItemsRequestSchema,
  opListItemsResponseSchema,
  opGetItemFieldsRequestSchema,
  opGetItemFieldsResponseSchema,
  type OpListVaultsResponse,
  type OpListItemsRequest,
  type OpListItemsResponse,
  type OpGetItemFieldsRequest,
  type OpGetItemFieldsResponse,
  editorOpenRequestSchema,
  editorOpenFileSchema,
  editorSessionClosedSchema,
  type EditorOpenRequest,
  type EditorOpenFile,
  type EditorSessionClosed,
  snippetRecordSchema,
  upsertSnippetRequestSchema,
  removeSnippetRequestSchema,
  startLoggingRequestSchema,
  stopLoggingRequestSchema,
  getLoggingStateRequestSchema,
  loggingStateResponseSchema,
  exportHostsRequestSchema,
  type SnippetRecord,
  type UpsertSnippetRequest,
  type RemoveSnippetRequest,
  type StartLoggingRequest,
  type StopLoggingRequest,
  type GetLoggingStateRequest,
  type LoggingStateResponse,
  type ExportHostsRequest,
  type SaveWorkspaceRequest,
  type LoadWorkspaceRequest,
  type RemoveWorkspaceRequest,
  type WorkspaceLayout,
  type WorkspaceRecord,
  type SshKeyInfo,
  type GenerateSshKeyRequest,
  type RemoveSshKeyRequest,
  type GetFingerprintRequest,
  type SftpSyncStartRequest,
  type SftpSyncStopRequest,
  type SftpSyncStatus,
  type SftpSyncEvent,
  type HostPortForwardRecord,
  type UpsertHostPortForwardRequest,
  type ListHostPortForwardsRequest,
  type RemoveHostPortForwardRequest,
  type ReorderHostPortForwardsRequest,
  type ConnectionPoolStats,
} from "@sshterm/shared";
import { z } from "zod";

export interface PreloadIpcRenderer {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  on(
    channel: string,
    listener: (event: unknown, ...args: unknown[]) => void
  ): void;
  removeListener(
    channel: string,
    listener: (event: unknown, ...args: unknown[]) => void
  ): void;
}

export interface PreloadLogger {
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
}

export interface DesktopApi {
  openSession(request: OpenSessionRequest): Promise<OpenSessionResponse>;
  resizeSession(request: ResizeSessionRequest): Promise<void>;
  writeSession(request: WriteSessionRequest): Promise<void>;
  closeSession(request: CloseSessionRequest): Promise<void>;
  onSessionEvent(listener: (event: SessionEvent) => void): () => void;
  onQuickConnect(listener: () => void): () => void;
  listHosts(): Promise<HostRecord[]>;
  upsertHost(request: UpsertHostRequest): Promise<HostRecord>;
  removeHost(request: RemoveHostRequest): Promise<void>;
  reorderHosts(request: ReorderHostsRequest): Promise<{ success: boolean }>;
  getSetting(request: GetSettingRequest): Promise<SettingRecord | null>;
  updateSetting(request: UpdateSettingRequest): Promise<SettingRecord>;
  importSshConfig(): Promise<{ imported: number; hosts: HostRecord[] }>;
  listGroups(): Promise<Array<{ id: string; name: string; description: string | null }>>;
  upsertGroup(request: UpsertGroupRequest): Promise<{ id: string; name: string; description: string | null }>;
  removeGroup(request: RemoveGroupRequest): Promise<void>;
  listSerialProfiles(): Promise<SerialProfileRecord[]>;
  upsertSerialProfile(request: UpsertSerialProfileRequest): Promise<SerialProfileRecord>;
  removeSerialProfile(request: RemoveSerialProfileRequest): Promise<void>;
  listSerialPorts(): Promise<SerialPortInfo[]>;
  setSessionSignals(request: SetSignalsRequest): Promise<void>;
  getHostStats(request: HostStatsRequest): Promise<HostStatsResponse>;
  sftpConnect(request: SftpConnectRequest): Promise<SftpConnectResponse>;
  sftpDisconnect(request: SftpDisconnectRequest): Promise<void>;
  sftpList(request: SftpListRequest): Promise<SftpListResponse>;
  sftpStat(request: SftpStatRequest): Promise<SftpEntry>;
  sftpMkdir(request: SftpMkdirRequest): Promise<void>;
  sftpRename(request: SftpRenameRequest): Promise<void>;
  sftpDelete(request: SftpDeleteRequest): Promise<void>;
  sftpReadFile(request: SftpReadFileRequest): Promise<SftpReadFileResponse>;
  sftpWriteFile(request: SftpWriteFileRequest): Promise<void>;
  sftpTransferStart(request: SftpTransferStartRequest): Promise<TransferJob[]>;
  sftpTransferCancel(request: SftpTransferCancelRequest): Promise<void>;
  sftpTransferList(): Promise<SftpTransferListResponse>;
  sftpTransferResolveConflict(request: SftpTransferResolveConflictRequest): Promise<void>;
  onSftpEvent(listener: (event: SftpEvent) => void): () => void;
  sftpBookmarksList(request: SftpBookmarkListRequest): Promise<SftpBookmark[]>;
  sftpBookmarksUpsert(request: SftpBookmarkUpsertRequest): Promise<SftpBookmark>;
  sftpBookmarksRemove(request: SftpBookmarkRemoveRequest): Promise<void>;
  sftpBookmarksReorder(request: SftpBookmarkReorderRequest): Promise<void>;
  fsList(request: FsListRequest): Promise<FsListResponse>;
  fsStat(request: FsListRequest): Promise<FsEntry>;
  fsGetHome(): Promise<{ path: string }>;
  fsGetDrives(): Promise<FsGetDrivesResponse>;
  fsListSshKeys(): Promise<string[]>;
  workspaceSave(request: SaveWorkspaceRequest): Promise<{ success: boolean }>;
  workspaceLoad(request: LoadWorkspaceRequest): Promise<WorkspaceRecord | null>;
  workspaceList(): Promise<WorkspaceRecord[]>;
  workspaceRemove(request: RemoveWorkspaceRequest): Promise<void>;
  workspaceSaveLast(layout: WorkspaceLayout): Promise<void>;
  workspaceLoadLast(): Promise<WorkspaceRecord | null>;
  sshKeysList(): Promise<SshKeyInfo[]>;
  sshKeysGenerate(request: GenerateSshKeyRequest): Promise<{ path: string }>;
  sshKeysGetFingerprint(request: GetFingerprintRequest): Promise<{ fingerprint: string | null }>;
  sshKeysRemove(request: RemoveSshKeyRequest): Promise<void>;
  sftpSyncStart(request: SftpSyncStartRequest): Promise<{ syncId: string }>;
  sftpSyncStop(request: SftpSyncStopRequest): Promise<void>;
  sftpSyncList(): Promise<{ syncs: SftpSyncStatus[] }>;
  onSftpSyncEvent(listener: (event: SftpSyncEvent) => void): () => void;
  // Host port forwards
  hostPortForwardList(request: ListHostPortForwardsRequest): Promise<HostPortForwardRecord[]>;
  hostPortForwardUpsert(request: UpsertHostPortForwardRequest): Promise<HostPortForwardRecord>;
  hostPortForwardRemove(request: RemoveHostPortForwardRequest): Promise<boolean>;
  hostPortForwardReorder(request: ReorderHostPortForwardsRequest): Promise<void>;
  // Connection pool
  connectionPoolStats(): Promise<ConnectionPoolStats[]>;
  // 1Password
  opListVaults(): Promise<OpListVaultsResponse>;
  opListItems(request: OpListItemsRequest): Promise<OpListItemsResponse>;
  opGetItemFields(request: OpGetItemFieldsRequest): Promise<OpGetItemFieldsResponse>;
  // Editor window
  editorOpen(request: EditorOpenRequest): Promise<void>;
  onEditorOpenFile(listener: (event: EditorOpenFile) => void): () => void;
  onEditorSessionClosed(listener: (event: EditorSessionClosed) => void): () => void;
  // Snippets
  snippetsList(): Promise<SnippetRecord[]>;
  snippetsUpsert(request: UpsertSnippetRequest): Promise<SnippetRecord>;
  snippetsRemove(request: RemoveSnippetRequest): Promise<void>;
  // Session logging
  loggingStart(request: StartLoggingRequest): Promise<void>;
  loggingStop(request: StopLoggingRequest): Promise<void>;
  loggingGetState(request: GetLoggingStateRequest): Promise<LoggingStateResponse>;
  // Host export
  exportHosts(request: ExportHostsRequest): Promise<{ exported: number }>;
}

function assertListener(value: unknown, methodName: string): asserts value is Function {
  if (typeof value === "function") {
    return;
  }

  throw new TypeError(`${methodName} listener must be a function`);
}

const UNIX_EPOCH_ISO = new Date(0).toISOString();

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as Record<string, unknown>;
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function toIsoDate(value: unknown): string {
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  const numeric = coerceNumber(value);
  if (numeric !== null) {
    const millis = numeric > 10_000_000_000 ? numeric : numeric * 1000;
    const date = new Date(millis);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  return UNIX_EPOCH_ISO;
}

function isDirectoryFromMode(mode: number | null): boolean {
  if (mode === null) {
    return false;
  }

  return (mode & 0o40000) !== 0;
}

function normalizePermissions(mode: number | null): number {
  if (mode === null) {
    return 0;
  }

  return mode > 0o7777 ? mode & 0o7777 : mode;
}

function normalizeSftpEntryShape(value: unknown): SftpEntry | null {
  const entry = asRecord(value);
  if (!entry) {
    return null;
  }

  const attrs = asRecord(entry.attrs);
  const name =
    typeof entry.name === "string"
      ? entry.name
      : typeof entry.filename === "string"
        ? entry.filename
        : null;
  if (!name || name.length === 0) {
    return null;
  }

  const path =
    typeof entry.path === "string" && entry.path.length > 0
      ? entry.path
      : typeof entry.fullPath === "string" && entry.fullPath.length > 0
        ? entry.fullPath
        : name.startsWith("/")
          ? name
          : `/${name}`;

  const mode = coerceNumber(entry.mode ?? entry.permissions ?? attrs?.mode);
  const typeValue = typeof entry.type === "string" ? entry.type.toLowerCase() : null;
  const isDirectory =
    typeof entry.isDirectory === "boolean"
      ? entry.isDirectory
      : typeValue === "d" || typeValue === "directory"
        ? true
        : isDirectoryFromMode(mode);

  return {
    name,
    path,
    size: coerceNumber(entry.size ?? attrs?.size) ?? 0,
    modifiedAt: toIsoDate(entry.modifiedAt ?? entry.mtime ?? attrs?.mtime),
    isDirectory,
    permissions: normalizePermissions(mode),
    owner: coerceNumber(entry.owner ?? entry.uid ?? attrs?.uid) ?? 0,
    group: coerceNumber(entry.group ?? entry.gid ?? attrs?.gid) ?? 0
  };
}

function normalizeSftpListResponseShape(value: unknown): SftpListResponse | null {
  let rawEntries: unknown[] | null = null;

  if (Array.isArray(value)) {
    rawEntries = value;
  } else {
    const payload = asRecord(value);
    if (Array.isArray(payload?.entries)) {
      rawEntries = payload.entries;
    } else if (Array.isArray(payload?.items)) {
      rawEntries = payload.items;
    }
  }

  if (!rawEntries) {
    return null;
  }

  const entries = rawEntries
    .map((entry) => normalizeSftpEntryShape(entry))
    .filter((entry): entry is SftpEntry => entry !== null);
  if (rawEntries.length > 0 && entries.length === 0) {
    return null;
  }

  return { entries };
}

const hostRecordArraySchema = z.array(hostRecordSchema);
const reorderHostsResponseSchema = z.object({ success: z.boolean() });
const groupRecordArraySchema = z.array(groupRecordSchema);
const serialProfileRecordArraySchema = z.array(serialProfileRecordSchema);
const serialPortInfoArraySchema = z.array(serialPortInfoSchema);
const transferJobArraySchema = z.array(transferJobSchema);
const sftpBookmarkArraySchema = z.array(sftpBookmarkSchema);
const fsGetHomeResponseSchema = z.object({ path: z.string() });
const fsListSshKeysResponseSchema = z.array(z.string());
const workspaceSaveResponseSchema = z.object({ success: z.boolean() });
const workspaceRecordNullableSchema = workspaceRecordSchema.nullable();
const workspaceRecordArraySchema = z.array(workspaceRecordSchema);
const sshKeyInfoArraySchema = z.array(sshKeyInfoSchema);
const sshKeysGenerateResponseSchema = z.object({ path: z.string() });
const sshFingerprintResponseSchema = z.object({ fingerprint: z.string().nullable() });
const sftpSyncStartResponseSchema = z.object({ syncId: z.string() });
const sftpSyncListResponseSchema = z.object({ syncs: z.array(sftpSyncStatusSchema) });
const hostPortForwardRecordArraySchema = z.array(hostPortForwardRecordSchema);
const connectionPoolStatsArraySchema = z.array(connectionPoolStatsSchema);
const booleanResponseSchema = z.boolean();

export function createDesktopApi(
  ipcRenderer: PreloadIpcRenderer,
  logger: PreloadLogger = console
): DesktopApi {
  return {
    async openSession(request: OpenSessionRequest): Promise<OpenSessionResponse> {
      const parsedRequest = openSessionRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(
        ipcChannels.session.open,
        parsedRequest
      );
      return openSessionResponseSchema.parse(result);
    },
    async resizeSession(request: ResizeSessionRequest): Promise<void> {
      const parsedRequest = resizeSessionRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.session.resize, parsedRequest);
    },
    async writeSession(request: WriteSessionRequest): Promise<void> {
      const parsedRequest = writeSessionRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.session.write, parsedRequest);
    },
    async closeSession(request: CloseSessionRequest): Promise<void> {
      const parsedRequest = closeSessionRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.session.close, parsedRequest);
    },
    onSessionEvent(listener: (event: SessionEvent) => void): () => void {
      assertListener(listener, "onSessionEvent");

      const wrappedListener = (_event: unknown, payload: unknown) => {
        const parsed = sessionEventSchema.safeParse(payload);
        if (!parsed.success) {
          logger.warn?.(
            "Ignored invalid session event payload from IPC",
            parsed.error
          );
          return;
        }

        try {
          listener(parsed.data);
        } catch (error) {
          logger.error?.("Session event listener threw", error);
        }
      };

      ipcRenderer.on(ipcChannels.session.event, wrappedListener);

      return () => {
        ipcRenderer.removeListener(ipcChannels.session.event, wrappedListener);
      };
    },
    onQuickConnect(listener: () => void): () => void {
      assertListener(listener, "onQuickConnect");

      const wrappedListener = () => {
        try {
          listener();
        } catch (error) {
          logger.error?.("Quick Connect listener threw", error);
        }
      };

      ipcRenderer.on(ipcChannels.tray.quickConnect, wrappedListener);

      return () => {
        ipcRenderer.removeListener(ipcChannels.tray.quickConnect, wrappedListener);
      };
    },
    async listHosts(): Promise<HostRecord[]> {
      const result = await ipcRenderer.invoke(ipcChannels.hosts.list);
      return hostRecordArraySchema.parse(result);
    },
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
    async importSshConfig(): Promise<{ imported: number; hosts: HostRecord[] }> {
      const result = await ipcRenderer.invoke(ipcChannels.hosts.importSshConfig);
      return importSshConfigResponseSchema.parse(result);
    },
    async listGroups(): Promise<Array<{ id: string; name: string; description: string | null }>> {
      const result = await ipcRenderer.invoke(ipcChannels.groups.list);
      return groupRecordArraySchema.parse(result);
    },
    async upsertGroup(request: UpsertGroupRequest): Promise<{ id: string; name: string; description: string | null }> {
      const parsed = upsertGroupRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.groups.upsert, parsed);
      return groupRecordSchema.parse(result);
    },
    async removeGroup(request: RemoveGroupRequest): Promise<void> {
      const parsed = removeGroupRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.groups.remove, parsed);
    },
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
    async setSessionSignals(request: SetSignalsRequest): Promise<void> {
      const parsed = setSignalsRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.session.setSignals, parsed);
    },
    async getHostStats(request: HostStatsRequest): Promise<HostStatsResponse> {
      const parsedRequest = hostStatsRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(
        ipcChannels.session.hostStats,
        parsedRequest
      );
      return hostStatsResponseSchema.parse(result);
    },
    async sftpConnect(request: SftpConnectRequest): Promise<SftpConnectResponse> {
      const parsed = sftpConnectRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.sftp.connect, parsed);
      return sftpConnectResponseSchema.parse(result);
    },
    async sftpDisconnect(request: SftpDisconnectRequest): Promise<void> {
      const parsed = sftpDisconnectRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.sftp.disconnect, parsed);
    },
    async sftpList(request: SftpListRequest): Promise<SftpListResponse> {
      const parsed = sftpListRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.sftp.list, parsed);
      const strict = sftpListResponseSchema.safeParse(result);
      if (strict.success) {
        console.log(
          "[sftp-preload] sftpList strict parse ok:",
          strict.data.entries.length,
          strict.data.entries.length > 0 ? `(first: ${strict.data.entries[0].name})` : ""
        );
        return strict.data;
      }

      const normalized = normalizeSftpListResponseShape(result);
      if (normalized) {
        console.log(
          "[sftp-preload] sftpList normalized fallback ok:",
          normalized.entries.length,
          normalized.entries.length > 0 ? `(first: ${normalized.entries[0].name})` : ""
        );
        return normalized;
      }

      const payload = asRecord(result);
      const payloadEntries = payload?.entries;
      const previewEntry = Array.isArray(result)
        ? result[0]
        : Array.isArray(payloadEntries)
          ? payloadEntries[0]
          : undefined;

      console.error("[sftp-preload] Zod parse failed for sftpList response:", strict.error);
      console.error(
        "[sftp-preload] Raw result sample:",
        JSON.stringify(previewEntry).slice(0, 200)
      );
      throw strict.error;
    },
    async sftpStat(request: SftpStatRequest): Promise<SftpEntry> {
      const parsed = sftpStatRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.sftp.stat, parsed);
      const strict = sftpEntrySchema.safeParse(result);
      if (strict.success) {
        return strict.data;
      }

      const normalized = normalizeSftpEntryShape(result);
      if (normalized) {
        return normalized;
      }

      throw strict.error;
    },
    async sftpMkdir(request: SftpMkdirRequest): Promise<void> {
      const parsed = sftpMkdirRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.sftp.mkdir, parsed);
    },
    async sftpRename(request: SftpRenameRequest): Promise<void> {
      const parsed = sftpRenameRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.sftp.rename, parsed);
    },
    async sftpDelete(request: SftpDeleteRequest): Promise<void> {
      const parsed = sftpDeleteRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.sftp.delete, parsed);
    },
    async sftpReadFile(request: SftpReadFileRequest): Promise<SftpReadFileResponse> {
      const parsed = sftpReadFileRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.sftp.readFile, parsed);
      return sftpReadFileResponseSchema.parse(result);
    },
    async sftpWriteFile(request: SftpWriteFileRequest): Promise<void> {
      const parsed = sftpWriteFileRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.sftp.writeFile, parsed);
    },
    async sftpTransferStart(request: SftpTransferStartRequest): Promise<TransferJob[]> {
      const parsed = sftpTransferStartRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.sftp.transferStart, parsed);
      return transferJobArraySchema.parse(result);
    },
    async sftpTransferCancel(request: SftpTransferCancelRequest): Promise<void> {
      const parsed = sftpTransferCancelRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.sftp.transferCancel, parsed);
    },
    async sftpTransferList(): Promise<SftpTransferListResponse> {
      const result = await ipcRenderer.invoke(ipcChannels.sftp.transferList);
      return sftpTransferListResponseSchema.parse(result);
    },
    async sftpTransferResolveConflict(
      request: SftpTransferResolveConflictRequest
    ): Promise<void> {
      const parsed = sftpTransferResolveConflictRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.sftp.transferResolveConflict, parsed);
    },
    onSftpEvent(listener: (event: SftpEvent) => void): () => void {
      assertListener(listener, "onSftpEvent");

      const wrappedListener = (_event: unknown, payload: unknown) => {
        const parsed = sftpEventSchema.safeParse(payload);
        if (!parsed.success) {
          logger.warn?.("Ignored invalid SFTP event payload from IPC", parsed.error);
          return;
        }

        try {
          listener(parsed.data);
        } catch (error) {
          logger.error?.("SFTP event listener threw", error);
        }
      };

      ipcRenderer.on(ipcChannels.sftp.event, wrappedListener);

      return () => {
        ipcRenderer.removeListener(ipcChannels.sftp.event, wrappedListener);
      };
    },
    async sftpBookmarksList(request: SftpBookmarkListRequest): Promise<SftpBookmark[]> {
      const parsed = sftpBookmarkListRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.sftp.bookmarksList, parsed);
      return sftpBookmarkArraySchema.parse(result);
    },
    async sftpBookmarksUpsert(request: SftpBookmarkUpsertRequest): Promise<SftpBookmark> {
      const parsed = sftpBookmarkUpsertRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.sftp.bookmarksUpsert, parsed);
      return sftpBookmarkSchema.parse(result);
    },
    async sftpBookmarksRemove(request: SftpBookmarkRemoveRequest): Promise<void> {
      const parsed = sftpBookmarkRemoveRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.sftp.bookmarksRemove, parsed);
    },
    async sftpBookmarksReorder(request: SftpBookmarkReorderRequest): Promise<void> {
      const parsed = sftpBookmarkReorderRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.sftp.bookmarksReorder, parsed);
    },
    async fsList(request: FsListRequest): Promise<FsListResponse> {
      const parsed = fsListRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.fs.list, parsed);
      return fsListResponseSchema.parse(result);
    },
    async fsStat(request: FsListRequest): Promise<FsEntry> {
      const parsed = fsListRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.fs.stat, parsed);
      return fsEntrySchema.parse(result);
    },
    async fsGetHome(): Promise<{ path: string }> {
      const result = await ipcRenderer.invoke(ipcChannels.fs.getHome);
      return fsGetHomeResponseSchema.parse(result);
    },
    async fsGetDrives(): Promise<FsGetDrivesResponse> {
      const result = await ipcRenderer.invoke(ipcChannels.fs.getDrives);
      return fsGetDrivesResponseSchema.parse(result);
    },
    async fsListSshKeys(): Promise<string[]> {
      const result = await ipcRenderer.invoke(ipcChannels.fs.listSshKeys);
      return fsListSshKeysResponseSchema.parse(result);
    },
    async workspaceSave(request: SaveWorkspaceRequest): Promise<{ success: boolean }> {
      const parsed = saveWorkspaceRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.workspace.save, parsed);
      return workspaceSaveResponseSchema.parse(result);
    },
    async workspaceLoad(request: LoadWorkspaceRequest): Promise<WorkspaceRecord | null> {
      const parsed = loadWorkspaceRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.workspace.load, parsed);
      return workspaceRecordNullableSchema.parse(result);
    },
    async workspaceList(): Promise<WorkspaceRecord[]> {
      const result = await ipcRenderer.invoke(ipcChannels.workspace.list);
      return workspaceRecordArraySchema.parse(result);
    },
    async workspaceRemove(request: RemoveWorkspaceRequest): Promise<void> {
      const parsed = removeWorkspaceRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.workspace.remove, parsed);
    },
    async workspaceSaveLast(layout: WorkspaceLayout): Promise<void> {
      const parsed = workspaceLayoutSchema.parse(layout);
      await ipcRenderer.invoke(ipcChannels.workspace.saveLast, parsed);
    },
    async workspaceLoadLast(): Promise<WorkspaceRecord | null> {
      const result = await ipcRenderer.invoke(ipcChannels.workspace.loadLast);
      return workspaceRecordNullableSchema.parse(result);
    },
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
    async sftpSyncStart(request: SftpSyncStartRequest): Promise<{ syncId: string }> {
      const parsed = sftpSyncStartRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.sftp.syncStart, parsed);
      return sftpSyncStartResponseSchema.parse(result);
    },
    async sftpSyncStop(request: SftpSyncStopRequest): Promise<void> {
      const parsed = sftpSyncStopRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.sftp.syncStop, parsed);
    },
    async sftpSyncList(): Promise<{ syncs: SftpSyncStatus[] }> {
      const result = await ipcRenderer.invoke(ipcChannels.sftp.syncList);
      return sftpSyncListResponseSchema.parse(result);
    },
    onSftpSyncEvent(listener: (event: SftpSyncEvent) => void): () => void {
      assertListener(listener, "onSftpSyncEvent");

      const wrappedListener = (_event: unknown, payload: unknown) => {
        const parsed = sftpSyncEventSchema.safeParse(payload);
        if (!parsed.success) {
          logger.warn?.("Ignored invalid SFTP sync event payload from IPC", parsed.error);
          return;
        }

        try {
          listener(parsed.data);
        } catch (error) {
          logger.error?.("SFTP sync event listener threw", error);
        }
      };

      ipcRenderer.on(ipcChannels.sftp.syncEvent, wrappedListener);

      return () => {
        ipcRenderer.removeListener(ipcChannels.sftp.syncEvent, wrappedListener);
      };
    },
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
    // Connection pool stats
    async connectionPoolStats(): Promise<ConnectionPoolStats[]> {
      const result = await ipcRenderer.invoke(ipcChannels.connectionPool.stats);
      return connectionPoolStatsArraySchema.parse(result);
    },
    // 1Password
    async opListVaults(): Promise<OpListVaultsResponse> {
      const result = await ipcRenderer.invoke(ipcChannels.op.listVaults);
      return opListVaultsResponseSchema.parse(result);
    },
    async opListItems(request: OpListItemsRequest): Promise<OpListItemsResponse> {
      const parsed = opListItemsRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.op.listItems, parsed);
      return opListItemsResponseSchema.parse(result);
    },
    async opGetItemFields(request: OpGetItemFieldsRequest): Promise<OpGetItemFieldsResponse> {
      const parsed = opGetItemFieldsRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.op.getItemFields, parsed);
      return opGetItemFieldsResponseSchema.parse(result);
    },
    // Editor window
    async editorOpen(request: EditorOpenRequest): Promise<void> {
      const parsed = editorOpenRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.editor.openEditor, parsed);
    },
    onEditorOpenFile(listener: (event: EditorOpenFile) => void): () => void {
      assertListener(listener, "onEditorOpenFile");
      const wrappedListener = (_event: unknown, payload: unknown) => {
        const parsed = editorOpenFileSchema.safeParse(payload);
        if (!parsed.success) {
          logger.warn?.("Ignored invalid editor open-file payload from IPC", parsed.error);
          return;
        }
        try {
          listener(parsed.data);
        } catch (error) {
          logger.error?.("Editor open-file listener threw", error);
        }
      };
      ipcRenderer.on(ipcChannels.editor.openFile, wrappedListener);
      return () => { ipcRenderer.removeListener(ipcChannels.editor.openFile, wrappedListener); };
    },
    onEditorSessionClosed(listener: (event: EditorSessionClosed) => void): () => void {
      assertListener(listener, "onEditorSessionClosed");
      const wrappedListener = (_event: unknown, payload: unknown) => {
        const parsed = editorSessionClosedSchema.safeParse(payload);
        if (!parsed.success) {
          logger.warn?.("Ignored invalid editor session-closed payload from IPC", parsed.error);
          return;
        }
        try {
          listener(parsed.data);
        } catch (error) {
          logger.error?.("Editor session-closed listener threw", error);
        }
      };
      ipcRenderer.on(ipcChannels.editor.sessionClosed, wrappedListener);
      return () => { ipcRenderer.removeListener(ipcChannels.editor.sessionClosed, wrappedListener); };
    },
    // Snippets
    async snippetsList(): Promise<SnippetRecord[]> {
      const raw = await ipcRenderer.invoke(ipcChannels.snippets.list);
      return z.array(snippetRecordSchema).parse(raw);
    },
    async snippetsUpsert(request: UpsertSnippetRequest): Promise<SnippetRecord> {
      const raw = await ipcRenderer.invoke(ipcChannels.snippets.upsert, upsertSnippetRequestSchema.parse(request));
      return snippetRecordSchema.parse(raw);
    },
    async snippetsRemove(request: RemoveSnippetRequest): Promise<void> {
      await ipcRenderer.invoke(ipcChannels.snippets.remove, removeSnippetRequestSchema.parse(request));
    },
    // Session logging
    async loggingStart(request: StartLoggingRequest): Promise<void> {
      await ipcRenderer.invoke(ipcChannels.logging.start, startLoggingRequestSchema.parse(request));
    },
    async loggingStop(request: StopLoggingRequest): Promise<void> {
      await ipcRenderer.invoke(ipcChannels.logging.stop, stopLoggingRequestSchema.parse(request));
    },
    async loggingGetState(request: GetLoggingStateRequest): Promise<LoggingStateResponse> {
      const raw = await ipcRenderer.invoke(ipcChannels.logging.getState, getLoggingStateRequestSchema.parse(request));
      return loggingStateResponseSchema.parse(raw);
    },
    // Host export
    async exportHosts(request: ExportHostsRequest): Promise<{ exported: number }> {
      const raw = await ipcRenderer.invoke(ipcChannels.hosts.exportHosts, exportHostsRequestSchema.parse(request));
      return z.object({ exported: z.number() }).parse(raw);
    },
  };
}
