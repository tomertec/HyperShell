import {
  connectionPoolStatsSchema,
  createBackupRequestSchema,
  createBackupResponseSchema,
  restoreBackupRequestSchema,
  restoreBackupResponseSchema,
  listBackupsResponseSchema,
  fsEntrySchema,
  fsGetDrivesResponseSchema,
  fsListRequestSchema,
  fsListResponseSchema,
  fsPathRequestSchema,
  fsRenameRequestSchema,
  closeSessionRequestSchema,
  savedSessionRecordSchema,
  ipcChannels,
  openSessionRequestSchema,
  openSessionResponseSchema,
  resizeSessionRequestSchema,
  sessionClearSavedStateResponseSchema,
  sessionEventSchema,
  sessionLoadSavedStateResponseSchema,
  sessionSaveStateRequestSchema,
  sessionSaveStateResponseSchema,
  upsertHostRequestSchema,
  removeHostRequestSchema,
  reorderHostsRequestSchema,
  writeSessionRequestSchema,
  getSettingRequestSchema,
  updateSettingRequestSchema,
  upsertGroupRequestSchema,
  removeGroupRequestSchema,
  upsertTagRequestSchema,
  removeTagRequestSchema,
  getHostTagsRequestSchema,
  setHostTagsRequestSchema,
  upsertHostProfileRequestSchema,
  removeHostProfileRequestSchema,
  listHostEnvVarsRequestSchema,
  replaceHostEnvVarsRequestSchema,
  upsertSerialProfileRequestSchema,
  removeSerialProfileRequestSchema,
  sftpBookmarkListRequestSchema,
  sftpBookmarkRemoveRequestSchema,
  sftpBookmarkReorderRequestSchema,
  sftpBookmarkSchema,
  sftpBookmarkUpsertRequestSchema,
  sftpConnectRequestSchema,
  sftpConnectResponseSchema,
  sftpChmodRequestSchema,
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
  sftpTransferPauseRequestSchema,
  sftpTransferResolveConflictRequestSchema,
  sftpTransferResumeRequestSchema,
  sftpTransferRetryRequestSchema,
  sftpTransferStartRequestSchema,
  sftpWriteFileRequestSchema,
  setSignalsRequestSchema,
  hostStatsRequestSchema,
  hostStatsResponseSchema,
  hostRecordSchema,
  hostStatusTargetsRequestSchema,
  hostStatusEventSchema,
  hostProfileRecordSchema,
  hostEnvVarRecordSchema,
  hostPortForwardRecordSchema,
  importSshConfigResponseSchema,
  scanPuttyResponseSchema,
  scanSshManagerResponseSchema,
  importSshManagerRequestSchema,
  importSshManagerResponseSchema,
  type ScanPuttyResponse,
  type ScanSshManagerResponse,
  type ImportSshManagerRequest,
  type ImportSshManagerResponse,
  type HostStatsRequest,
  type HostStatsResponse,
  type HostStatusTargetsRequest,
  type HostStatusEvent,
  type CloseSessionRequest,
  type SessionClearSavedStateResponse,
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
  type SessionSaveStateRequest,
  type SessionSaveStateResponse,
  type SavedSessionRecord,
  type UpsertHostRequest,
  type WriteSessionRequest,
  type GetSettingRequest,
  type UpdateSettingRequest,
  type SettingRecord,
  type UpsertGroupRequest,
  type RemoveGroupRequest,
  type TagRecord,
  type UpsertTagRequest,
  type RemoveTagRequest,
  type GetHostTagsRequest,
  type SetHostTagsRequest,
  type HostProfileRecord,
  type UpsertHostProfileRequest,
  type RemoveHostProfileRequest,
  type HostEnvVarRecord,
  type ListHostEnvVarsRequest,
  type ReplaceHostEnvVarsRequest,
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
  type SftpChmodRequest,
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
  type SftpTransferPauseRequest,
  type SftpTransferResolveConflictRequest,
  type SftpTransferResumeRequest,
  type SftpTransferRetryRequest,
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
  tagRecordSchema,
  transferJobSchema,
  workspaceLayoutSchema,
  workspaceRecordSchema,
  sshKeyInfoSchema,
  generateSshKeyRequestSchema,
  removeSshKeyRequestSchema,
  getFingerprintRequestSchema,
  convertPpkRequestSchema,
  convertPpkResponseSchema,
  sftpSyncStatusSchema,
  sftpSyncStartRequestSchema,
  sftpSyncStopRequestSchema,
  sftpSyncEventSchema,
  sftpDragOutRequestSchema,
  sftpDragOutResponseSchema,
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
  startRecordingRequestSchema,
  stopRecordingRequestSchema,
  getRecordingStateRequestSchema,
  recordingStateResponseSchema,
  deleteRecordingRequestSchema,
  deleteRecordingResponseSchema,
  getRecordingFramesRequestSchema,
  recordingFramesResponseSchema,
  exportRecordingRequestSchema,
  exportRecordingResponseSchema,
  sessionRecordingRecordSchema,
  connectionHistoryRecordSchema,
  connectionHistoryListByHostRequestSchema,
  connectionHistoryListRecentRequestSchema,
  exportHostsRequestSchema,
  hostFingerprintRecordSchema,
  hostFingerprintLookupRequestSchema,
  hostFingerprintTrustRequestSchema,
  hostFingerprintRemoveRequestSchema,
  tmuxProbeRequestSchema,
  tmuxProbeResponseSchema,
  type SnippetRecord,
  type UpsertSnippetRequest,
  type RemoveSnippetRequest,
  type StartLoggingRequest,
  type StopLoggingRequest,
  type GetLoggingStateRequest,
  type LoggingStateResponse,
  type StartRecordingRequest,
  type StopRecordingRequest,
  type GetRecordingStateRequest,
  type RecordingStateResponse,
  type SessionRecordingRecord,
  type DeleteRecordingRequest,
  type DeleteRecordingResponse,
  type GetRecordingFramesRequest,
  type RecordingFramesResponse,
  type ExportRecordingRequest,
  type ExportRecordingResponse,
  type ConnectionHistoryRecord,
  type ConnectionHistoryListByHostRequest,
  type ConnectionHistoryListRecentRequest,
  type ExportHostsRequest,
  type HostFingerprintRecord,
  type HostFingerprintLookupRequest,
  type HostFingerprintTrustRequest,
  type HostFingerprintRemoveRequest,
  type TmuxProbeRequest,
  type TmuxProbeResponse,
  keyboardInteractiveRequestSchema,
  keyboardInteractiveResponseSchema,
  type KeyboardInteractiveRequest,
  type KeyboardInteractiveResponse,
  type SaveWorkspaceRequest,
  type LoadWorkspaceRequest,
  type RemoveWorkspaceRequest,
  type WorkspaceLayout,
  type WorkspaceRecord,
  type SshKeyInfo,
  type GenerateSshKeyRequest,
  type RemoveSshKeyRequest,
  type GetFingerprintRequest,
  type ConvertPpkRequest,
  type ConvertPpkResponse,
  type SftpSyncStartRequest,
  type SftpSyncStopRequest,
  type SftpSyncStatus,
  type SftpSyncEvent,
  type SftpDragOutRequest,
  type SftpDragOutResponse,
  type HostPortForwardRecord,
  type UpsertHostPortForwardRequest,
  type ListHostPortForwardsRequest,
  type RemoveHostPortForwardRequest,
  type ReorderHostPortForwardsRequest,
  type ConnectionPoolStats,
  type CreateBackupRequest,
  type CreateBackupResponse,
  type RestoreBackupRequest,
  type RestoreBackupResponse,
  type ListBackupsResponse,
} from "@hypershell/shared";
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
  sessionSaveState(
    request: SessionSaveStateRequest
  ): Promise<SessionSaveStateResponse>;
  sessionLoadSavedState(): Promise<SavedSessionRecord[]>;
  sessionClearSavedState(): Promise<SessionClearSavedStateResponse>;
  onSessionEvent(listener: (event: SessionEvent) => void): () => void;
  onQuickConnect(listener: () => void): () => void;
  listHosts(): Promise<HostRecord[]>;
  setHostStatusTargets(request: HostStatusTargetsRequest): Promise<void>;
  onHostStatus(listener: (event: HostStatusEvent) => void): () => void;
  upsertHost(request: UpsertHostRequest): Promise<HostRecord>;
  removeHost(request: RemoveHostRequest): Promise<void>;
  reorderHosts(request: ReorderHostsRequest): Promise<{ success: boolean }>;
  getSetting(request: GetSettingRequest): Promise<SettingRecord | null>;
  updateSetting(request: UpdateSettingRequest): Promise<SettingRecord>;
  importSshConfig(): Promise<{ imported: number; hosts: HostRecord[] }>;
  scanPuttySessions(): Promise<ScanPuttyResponse>;
  scanSshManager(): Promise<ScanSshManagerResponse>;
  importSshManager(request: ImportSshManagerRequest): Promise<ImportSshManagerResponse>;
  listGroups(): Promise<Array<{ id: string; name: string; description: string | null }>>;
  upsertGroup(request: UpsertGroupRequest): Promise<{ id: string; name: string; description: string | null }>;
  removeGroup(request: RemoveGroupRequest): Promise<void>;
  listTags(): Promise<TagRecord[]>;
  upsertTag(request: UpsertTagRequest): Promise<TagRecord>;
  removeTag(request: RemoveTagRequest): Promise<void>;
  tagsGetHostTags(request: GetHostTagsRequest): Promise<TagRecord[]>;
  tagsSetHostTags(request: SetHostTagsRequest): Promise<TagRecord[]>;
  listHostProfiles(): Promise<HostProfileRecord[]>;
  upsertHostProfile(request: UpsertHostProfileRequest): Promise<HostProfileRecord>;
  removeHostProfile(request: RemoveHostProfileRequest): Promise<void>;
  listHostEnvVars(request: ListHostEnvVarsRequest): Promise<HostEnvVarRecord[]>;
  replaceHostEnvVars(
    request: ReplaceHostEnvVarsRequest
  ): Promise<HostEnvVarRecord[]>;
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
  sftpChmod(request: SftpChmodRequest): Promise<void>;
  sftpMkdir(request: SftpMkdirRequest): Promise<void>;
  sftpRename(request: SftpRenameRequest): Promise<void>;
  sftpDelete(request: SftpDeleteRequest): Promise<void>;
  sftpReadFile(request: SftpReadFileRequest): Promise<SftpReadFileResponse>;
  sftpWriteFile(request: SftpWriteFileRequest): Promise<void>;
  sftpTransferStart(request: SftpTransferStartRequest): Promise<TransferJob[]>;
  sftpTransferCancel(request: SftpTransferCancelRequest): Promise<void>;
  sftpTransferPause(request: SftpTransferPauseRequest): Promise<void>;
  sftpTransferResume(request: SftpTransferResumeRequest): Promise<void>;
  sftpTransferRetry(request: SftpTransferRetryRequest): Promise<TransferJob>;
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
  fsShowSaveDialog(options?: { defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }): Promise<string | null>;
  fsShowOpenDialog(options?: { title?: string; defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }): Promise<string | null>;
  fsOpenItem(request: { path: string }): Promise<void>;
  fsShowInFolder(request: { path: string }): Promise<void>;
  fsTrash(request: { path: string }): Promise<void>;
  fsRename(request: { oldPath: string; newPath: string }): Promise<void>;
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
  sshKeysConvertPpk(request: ConvertPpkRequest): Promise<ConvertPpkResponse>;
  sftpSyncStart(request: SftpSyncStartRequest): Promise<{ syncId: string }>;
  sftpSyncStop(request: SftpSyncStopRequest): Promise<void>;
  sftpSyncList(): Promise<{ syncs: SftpSyncStatus[] }>;
  onSftpSyncEvent(listener: (event: SftpSyncEvent) => void): () => void;
  sftpDragOut(request: SftpDragOutRequest): Promise<SftpDragOutResponse>;
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
  recordingStart(request: StartRecordingRequest): Promise<SessionRecordingRecord>;
  recordingStop(request: StopRecordingRequest): Promise<SessionRecordingRecord | null>;
  recordingGetState(request: GetRecordingStateRequest): Promise<RecordingStateResponse>;
  recordingList(): Promise<SessionRecordingRecord[]>;
  recordingDelete(request: DeleteRecordingRequest): Promise<DeleteRecordingResponse>;
  recordingGetFrames(request: GetRecordingFramesRequest): Promise<RecordingFramesResponse>;
  recordingExport(request: ExportRecordingRequest): Promise<ExportRecordingResponse>;
  connectionHistoryListByHost(
    request: ConnectionHistoryListByHostRequest
  ): Promise<ConnectionHistoryRecord[]>;
  connectionHistoryListRecent(
    request?: ConnectionHistoryListRecentRequest
  ): Promise<ConnectionHistoryRecord[]>;
  // Host export
  exportHosts(request: ExportHostsRequest): Promise<{ exported: number }>;
  // Host fingerprint verification
  hostFingerprintLookup(request: HostFingerprintLookupRequest): Promise<HostFingerprintRecord | null>;
  hostFingerprintTrust(request: HostFingerprintTrustRequest): Promise<HostFingerprintRecord>;
  hostFingerprintRemove(request: HostFingerprintRemoveRequest): Promise<void>;
  // Keyboard-interactive auth (2FA)
  onKeyboardInteractive(listener: (request: KeyboardInteractiveRequest) => void): () => void;
  keyboardInteractiveRespond(response: KeyboardInteractiveResponse): Promise<void>;
  // Database backup & restore
  backupCreate(request: CreateBackupRequest): Promise<CreateBackupResponse>;
  backupRestore(request: RestoreBackupRequest): Promise<RestoreBackupResponse>;
  backupList(): Promise<ListBackupsResponse>;
  backupShowOpenDialog(): Promise<string | null>;
  // Tmux detection
  tmuxProbe(request: TmuxProbeRequest): Promise<TmuxProbeResponse>;
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
const tagRecordArraySchema = z.array(tagRecordSchema);
const hostProfileRecordArraySchema = z.array(hostProfileRecordSchema);
const hostEnvVarRecordArraySchema = z.array(hostEnvVarRecordSchema);
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
const connectionHistoryRecordArraySchema = z.array(connectionHistoryRecordSchema);
const savedSessionRecordArraySchema = z.array(savedSessionRecordSchema);
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
    async sessionSaveState(
      request: SessionSaveStateRequest
    ): Promise<SessionSaveStateResponse> {
      const parsedRequest = sessionSaveStateRequestSchema.parse(request);
      const raw = await ipcRenderer.invoke(
        ipcChannels.session.saveState,
        parsedRequest
      );
      return sessionSaveStateResponseSchema.parse(raw);
    },
    async sessionLoadSavedState(): Promise<SavedSessionRecord[]> {
      const raw = await ipcRenderer.invoke(ipcChannels.session.loadSavedState);
      const parsed = sessionLoadSavedStateResponseSchema.parse(raw);
      return savedSessionRecordArraySchema.parse(parsed.sessions);
    },
    async sessionClearSavedState(): Promise<SessionClearSavedStateResponse> {
      const raw = await ipcRenderer.invoke(ipcChannels.session.clearSavedState);
      return sessionClearSavedStateResponseSchema.parse(raw);
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
    async setHostStatusTargets(request: HostStatusTargetsRequest): Promise<void> {
      const parsed = hostStatusTargetsRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.hosts.setStatusTargets, parsed);
    },
    onHostStatus(listener: (event: HostStatusEvent) => void): () => void {
      assertListener(listener, "onHostStatus");

      const wrappedListener = (_event: unknown, payload: unknown) => {
        const parsed = hostStatusEventSchema.safeParse(payload);
        if (!parsed.success) {
          logger.warn?.("Ignored invalid host status payload from IPC", parsed.error);
          return;
        }

        try {
          listener(parsed.data);
        } catch (error) {
          logger.error?.("Host status listener threw", error);
        }
      };

      ipcRenderer.on(ipcChannels.hosts.status, wrappedListener);

      return () => {
        ipcRenderer.removeListener(ipcChannels.hosts.status, wrappedListener);
      };
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
    async listTags(): Promise<TagRecord[]> {
      const result = await ipcRenderer.invoke(ipcChannels.tags.list);
      return tagRecordArraySchema.parse(result);
    },
    async upsertTag(request: UpsertTagRequest): Promise<TagRecord> {
      const parsed = upsertTagRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.tags.upsert, parsed);
      return tagRecordSchema.parse(result);
    },
    async removeTag(request: RemoveTagRequest): Promise<void> {
      const parsed = removeTagRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.tags.remove, parsed);
    },
    async tagsGetHostTags(request: GetHostTagsRequest): Promise<TagRecord[]> {
      const parsed = getHostTagsRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.tags.getHostTags, parsed);
      return tagRecordArraySchema.parse(result);
    },
    async tagsSetHostTags(request: SetHostTagsRequest): Promise<TagRecord[]> {
      const parsed = setHostTagsRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.tags.setHostTags, parsed);
      return tagRecordArraySchema.parse(result);
    },
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
    async sftpChmod(request: SftpChmodRequest): Promise<void> {
      const parsed = sftpChmodRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.sftp.chmod, parsed);
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
    async sftpTransferPause(request: SftpTransferPauseRequest): Promise<void> {
      const parsed = sftpTransferPauseRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.sftp.transferPause, parsed);
    },
    async sftpTransferResume(request: SftpTransferResumeRequest): Promise<void> {
      const parsed = sftpTransferResumeRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.sftp.transferResume, parsed);
    },
    async sftpTransferRetry(request: SftpTransferRetryRequest): Promise<TransferJob> {
      const parsed = sftpTransferRetryRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.sftp.transferRetry, parsed);
      return transferJobSchema.parse(result);
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
    async fsShowSaveDialog(options?: { defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }): Promise<string | null> {
      const result = await ipcRenderer.invoke(ipcChannels.fs.showSaveDialog, options);
      return result as string | null;
    },
    async fsShowOpenDialog(options?: { title?: string; defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }): Promise<string | null> {
      const result = await ipcRenderer.invoke(ipcChannels.fs.showOpenDialog, options);
      return result as string | null;
    },
    async fsOpenItem(request: { path: string }): Promise<void> {
      const parsed = fsPathRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.fs.openItem, parsed);
    },
    async fsShowInFolder(request: { path: string }): Promise<void> {
      const parsed = fsPathRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.fs.showInFolder, parsed);
    },
    async fsTrash(request: { path: string }): Promise<void> {
      const parsed = fsPathRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.fs.trash, parsed);
    },
    async fsRename(request: { oldPath: string; newPath: string }): Promise<void> {
      const parsed = fsRenameRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.fs.rename, parsed);
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
    async sshKeysConvertPpk(request: ConvertPpkRequest): Promise<ConvertPpkResponse> {
      const parsed = convertPpkRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.sshKeys.convertPpk, parsed);
      return convertPpkResponseSchema.parse(result);
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
    // Session recording
    async recordingStart(request: StartRecordingRequest): Promise<SessionRecordingRecord> {
      const raw = await ipcRenderer.invoke(ipcChannels.recording.start, startRecordingRequestSchema.parse(request));
      return sessionRecordingRecordSchema.parse(raw);
    },
    async recordingStop(request: StopRecordingRequest): Promise<SessionRecordingRecord | null> {
      const raw = await ipcRenderer.invoke(ipcChannels.recording.stop, stopRecordingRequestSchema.parse(request));
      if (raw === null || raw === undefined) {
        return null;
      }
      return sessionRecordingRecordSchema.parse(raw);
    },
    async recordingGetState(request: GetRecordingStateRequest): Promise<RecordingStateResponse> {
      const raw = await ipcRenderer.invoke(ipcChannels.recording.getState, getRecordingStateRequestSchema.parse(request));
      return recordingStateResponseSchema.parse(raw);
    },
    async recordingList(): Promise<SessionRecordingRecord[]> {
      const raw = await ipcRenderer.invoke(ipcChannels.recording.list);
      return z.array(sessionRecordingRecordSchema).parse(raw);
    },
    async recordingDelete(request: DeleteRecordingRequest): Promise<DeleteRecordingResponse> {
      const raw = await ipcRenderer.invoke(ipcChannels.recording.delete, deleteRecordingRequestSchema.parse(request));
      return deleteRecordingResponseSchema.parse(raw);
    },
    async recordingGetFrames(request: GetRecordingFramesRequest): Promise<RecordingFramesResponse> {
      const raw = await ipcRenderer.invoke(ipcChannels.recording.getFrames, getRecordingFramesRequestSchema.parse(request));
      return recordingFramesResponseSchema.parse(raw);
    },
    async recordingExport(request: ExportRecordingRequest): Promise<ExportRecordingResponse> {
      const raw = await ipcRenderer.invoke(ipcChannels.recording.export, exportRecordingRequestSchema.parse(request));
      return exportRecordingResponseSchema.parse(raw);
    },
    async connectionHistoryListByHost(
      request: ConnectionHistoryListByHostRequest
    ): Promise<ConnectionHistoryRecord[]> {
      const raw = await ipcRenderer.invoke(
        ipcChannels.connectionHistory.listByHost,
        connectionHistoryListByHostRequestSchema.parse(request)
      );
      return connectionHistoryRecordArraySchema.parse(raw);
    },
    async connectionHistoryListRecent(
      request?: ConnectionHistoryListRecentRequest
    ): Promise<ConnectionHistoryRecord[]> {
      const raw = await ipcRenderer.invoke(
        ipcChannels.connectionHistory.listRecent,
        connectionHistoryListRecentRequestSchema.parse(request ?? {})
      );
      return connectionHistoryRecordArraySchema.parse(raw);
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
    onKeyboardInteractive(listener: (request: KeyboardInteractiveRequest) => void): () => void {
      assertListener(listener, "onKeyboardInteractive");

      const wrappedListener = (_event: unknown, payload: unknown) => {
        const parsed = keyboardInteractiveRequestSchema.safeParse(payload);
        if (!parsed.success) {
          logger.warn?.("Ignored invalid keyboard-interactive payload from IPC", parsed.error);
          return;
        }

        try {
          listener(parsed.data);
        } catch (error) {
          logger.error?.("Keyboard-interactive listener threw", error);
        }
      };

      ipcRenderer.on(ipcChannels.sftp.keyboardInteractive, wrappedListener);

      return () => {
        ipcRenderer.removeListener(ipcChannels.sftp.keyboardInteractive, wrappedListener);
      };
    },
    async keyboardInteractiveRespond(response: KeyboardInteractiveResponse): Promise<void> {
      const parsed = keyboardInteractiveResponseSchema.parse(response);
      await ipcRenderer.invoke(ipcChannels.sftp.keyboardInteractiveResponse, parsed);
    },
    // Database backup & restore
    async backupCreate(request: CreateBackupRequest): Promise<CreateBackupResponse> {
      const parsed = createBackupRequestSchema.parse(request);
      const raw = await ipcRenderer.invoke(ipcChannels.backup.create, parsed);
      return createBackupResponseSchema.parse(raw);
    },
    async backupRestore(request: RestoreBackupRequest): Promise<RestoreBackupResponse> {
      const parsed = restoreBackupRequestSchema.parse(request);
      const raw = await ipcRenderer.invoke(ipcChannels.backup.restore, parsed);
      return restoreBackupResponseSchema.parse(raw);
    },
    async backupList(): Promise<ListBackupsResponse> {
      const raw = await ipcRenderer.invoke(ipcChannels.backup.list);
      return listBackupsResponseSchema.parse(raw);
    },
    async backupShowOpenDialog(): Promise<string | null> {
      const raw = await ipcRenderer.invoke(ipcChannels.backup.showOpenDialog);
      if (raw === null || raw === undefined) return null;
      return z.string().parse(raw);
    },
    async sftpDragOut(request: SftpDragOutRequest): Promise<SftpDragOutResponse> {
      const parsed = sftpDragOutRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.sftp.dragOut, parsed);
      return sftpDragOutResponseSchema.parse(result);
    },
    // Tmux detection
    async tmuxProbe(request: TmuxProbeRequest): Promise<TmuxProbeResponse> {
      const parsed = tmuxProbeRequestSchema.parse(request);
      const raw = await ipcRenderer.invoke(ipcChannels.tmux.probe, parsed);
      return tmuxProbeResponseSchema.parse(raw);
    },
  };
}
