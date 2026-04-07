import {
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
  workspaceLayoutSchema,
  generateSshKeyRequestSchema,
  removeSshKeyRequestSchema,
  getFingerprintRequestSchema,
  sftpSyncStartRequestSchema,
  sftpSyncStopRequestSchema,
  sftpSyncEventSchema,
  listHostPortForwardsRequestSchema,
  upsertHostPortForwardRequestSchema,
  removeHostPortForwardRequestSchema,
  reorderHostPortForwardsRequestSchema,
  hostPortForwardRecordSchema,
  connectionPoolStatsSchema,
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
      return result as HostRecord[];
    },
    async upsertHost(request: UpsertHostRequest): Promise<HostRecord> {
      const parsed = upsertHostRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.hosts.upsert, parsed);
      return result as HostRecord;
    },
    async removeHost(request: RemoveHostRequest): Promise<void> {
      const parsed = removeHostRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.hosts.remove, parsed);
    },
    async reorderHosts(request: ReorderHostsRequest): Promise<{ success: boolean }> {
      const parsed = reorderHostsRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.hosts.reorder, parsed);
      return result as { success: boolean };
    },
    async getSetting(request: GetSettingRequest): Promise<SettingRecord | null> {
      const parsed = getSettingRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.settings.get, parsed);
      return result as SettingRecord | null;
    },
    async updateSetting(request: UpdateSettingRequest): Promise<SettingRecord> {
      const parsed = updateSettingRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.settings.update, parsed);
      return result as SettingRecord;
    },
    async importSshConfig(): Promise<{ imported: number; hosts: HostRecord[] }> {
      const result = await ipcRenderer.invoke(ipcChannels.hosts.importSshConfig);
      return result as { imported: number; hosts: HostRecord[] };
    },
    async listGroups(): Promise<Array<{ id: string; name: string; description: string | null }>> {
      const result = await ipcRenderer.invoke(ipcChannels.groups.list);
      return result as Array<{ id: string; name: string; description: string | null }>;
    },
    async upsertGroup(request: UpsertGroupRequest): Promise<{ id: string; name: string; description: string | null }> {
      const parsed = upsertGroupRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.groups.upsert, parsed);
      return result as { id: string; name: string; description: string | null };
    },
    async removeGroup(request: RemoveGroupRequest): Promise<void> {
      const parsed = removeGroupRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.groups.remove, parsed);
    },
    async listSerialProfiles(): Promise<SerialProfileRecord[]> {
      const result = await ipcRenderer.invoke(ipcChannels.serialProfiles.list);
      return result as SerialProfileRecord[];
    },
    async upsertSerialProfile(request: UpsertSerialProfileRequest): Promise<SerialProfileRecord> {
      const parsed = upsertSerialProfileRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.serialProfiles.upsert, parsed);
      return result as SerialProfileRecord;
    },
    async removeSerialProfile(request: RemoveSerialProfileRequest): Promise<void> {
      const parsed = removeSerialProfileRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.serialProfiles.remove, parsed);
    },
    async listSerialPorts(): Promise<SerialPortInfo[]> {
      const result = await ipcRenderer.invoke(ipcChannels.serialProfiles.listPorts);
      return result as SerialPortInfo[];
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
      return result as TransferJob[];
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
      return result as SftpBookmark[];
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
      return result as { path: string };
    },
    async fsGetDrives(): Promise<FsGetDrivesResponse> {
      const result = await ipcRenderer.invoke(ipcChannels.fs.getDrives);
      return fsGetDrivesResponseSchema.parse(result);
    },
    async fsListSshKeys(): Promise<string[]> {
      const result = await ipcRenderer.invoke(ipcChannels.fs.listSshKeys);
      return Array.isArray(result) ? result : [];
    },
    async workspaceSave(request: SaveWorkspaceRequest): Promise<{ success: boolean }> {
      const parsed = saveWorkspaceRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.workspace.save, parsed);
      return result as { success: boolean };
    },
    async workspaceLoad(request: LoadWorkspaceRequest): Promise<WorkspaceRecord | null> {
      const parsed = loadWorkspaceRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.workspace.load, parsed);
      return result as WorkspaceRecord | null;
    },
    async workspaceList(): Promise<WorkspaceRecord[]> {
      const result = await ipcRenderer.invoke(ipcChannels.workspace.list);
      return result as WorkspaceRecord[];
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
      return result as WorkspaceRecord | null;
    },
    async sshKeysList(): Promise<SshKeyInfo[]> {
      const result = await ipcRenderer.invoke(ipcChannels.sshKeys.list);
      return result as SshKeyInfo[];
    },
    async sshKeysGenerate(request: GenerateSshKeyRequest): Promise<{ path: string }> {
      const parsed = generateSshKeyRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.sshKeys.generate, parsed);
      return result as { path: string };
    },
    async sshKeysGetFingerprint(request: GetFingerprintRequest): Promise<{ fingerprint: string | null }> {
      const parsed = getFingerprintRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.sshKeys.getFingerprint, parsed);
      return result as { fingerprint: string | null };
    },
    async sshKeysRemove(request: RemoveSshKeyRequest): Promise<void> {
      const parsed = removeSshKeyRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.sshKeys.remove, parsed);
    },
    async sftpSyncStart(request: SftpSyncStartRequest): Promise<{ syncId: string }> {
      const parsed = sftpSyncStartRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.sftp.syncStart, parsed);
      return result as { syncId: string };
    },
    async sftpSyncStop(request: SftpSyncStopRequest): Promise<void> {
      const parsed = sftpSyncStopRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.sftp.syncStop, parsed);
    },
    async sftpSyncList(): Promise<{ syncs: SftpSyncStatus[] }> {
      const result = await ipcRenderer.invoke(ipcChannels.sftp.syncList);
      return result as { syncs: SftpSyncStatus[] };
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
      return result as HostPortForwardRecord[];
    },
    async hostPortForwardUpsert(request: UpsertHostPortForwardRequest): Promise<HostPortForwardRecord> {
      const parsed = upsertHostPortForwardRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.hostPortForward.upsert, parsed);
      return result as HostPortForwardRecord;
    },
    async hostPortForwardRemove(request: RemoveHostPortForwardRequest): Promise<boolean> {
      const parsed = removeHostPortForwardRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.hostPortForward.remove, parsed);
      return result as boolean;
    },
    async hostPortForwardReorder(request: ReorderHostPortForwardsRequest): Promise<void> {
      const parsed = reorderHostPortForwardsRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.hostPortForward.reorder, parsed);
    },
    // Connection pool stats
    async connectionPoolStats(): Promise<ConnectionPoolStats[]> {
      const result = await ipcRenderer.invoke(ipcChannels.connectionPool.stats);
      return result as ConnectionPoolStats[];
    },
  };
}
