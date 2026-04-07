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
  type SftpSyncEvent
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
}

function assertListener(value: unknown, methodName: string): asserts value is Function {
  if (typeof value === "function") {
    return;
  }

  throw new TypeError(`${methodName} listener must be a function`);
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
      return sftpListResponseSchema.parse(result);
    },
    async sftpStat(request: SftpStatRequest): Promise<SftpEntry> {
      const parsed = sftpStatRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.sftp.stat, parsed);
      return sftpEntrySchema.parse(result);
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
    }
  };
}
