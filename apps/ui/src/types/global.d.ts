import type {
  SnippetRecord,
  UpsertSnippetRequest,
  RemoveSnippetRequest,
  StartLoggingRequest,
  StopLoggingRequest,
  GetLoggingStateRequest,
  LoggingStateResponse,
  StartRecordingRequest,
  StopRecordingRequest,
  GetRecordingStateRequest,
  RecordingStateResponse,
  SessionRecordingRecord,
  DeleteRecordingRequest,
  DeleteRecordingResponse,
  GetRecordingFramesRequest,
  RecordingFramesResponse,
  ExportRecordingRequest,
  ExportRecordingResponse,
  ConnectionHistoryRecord,
  ConnectionHistoryListByHostRequest,
  ConnectionHistoryListRecentRequest,
  SavedSessionRecord,
  SessionSaveStateRequest,
  SessionSaveStateResponse,
  SessionClearSavedStateResponse,
  CloseSessionRequest,
  StartPortForwardRequest,
  StopPortForwardRequest,
  FsEntry,
  FsGetDrivesResponse,
  FsListRequest,
  FsListResponse,
  GetSettingRequest,
  HostRecord,
  HostStatusTargetsRequest,
  HostStatusEvent,
  HostStatsRequest,
  HostStatsResponse,
  OpenSessionRequest,
  OpenSessionResponse,
  ReorderHostsRequest,
  RemoveHostRequest,
  ResizeSessionRequest,
  SerialPortInfo,
  SerialProfileRecord,
  RemoveSerialProfileRequest,
  SessionEvent,
  SettingRecord,
  SetSignalsRequest,
  SftpBookmark,
  SftpBookmarkListRequest,
  SftpBookmarkRemoveRequest,
  SftpBookmarkReorderRequest,
  SftpBookmarkUpsertRequest,
  SftpConnectRequest,
  SftpConnectResponse,
  SftpChmodRequest,
  SftpDeleteRequest,
  SftpDisconnectRequest,
  SftpEvent,
  SftpListRequest,
  SftpListResponse,
  SftpMkdirRequest,
  SftpReadFileRequest,
  SftpReadFileResponse,
  SftpRenameRequest,
  SftpEntry,
  SftpStatRequest,
  SftpTransferCancelRequest,
  SftpTransferListResponse,
  SftpTransferPauseRequest,
  SftpTransferResolveConflictRequest,
  SftpTransferResumeRequest,
  SftpTransferStartRequest,
  SftpWriteFileRequest,
  TransferJob,
  UpdateSettingRequest,
  UpsertHostRequest,
  HostProfileRecord,
  UpsertHostProfileRequest,
  RemoveHostProfileRequest,
  HostEnvVarRecord,
  ListHostEnvVarsRequest,
  ReplaceHostEnvVarsRequest,
  TagRecord,
  UpsertTagRequest,
  RemoveTagRequest,
  GetHostTagsRequest,
  SetHostTagsRequest,
  UpsertSerialProfileRequest,
  WriteSessionRequest,
  SaveWorkspaceRequest,
  LoadWorkspaceRequest,
  RemoveWorkspaceRequest,
  WorkspaceLayout,
  WorkspaceRecord,
  SshKeyInfo,
  GenerateSshKeyRequest,
  RemoveSshKeyRequest,
  GetFingerprintRequest,
  SftpSyncStartRequest,
  SftpSyncStopRequest,
  SftpSyncStatus,
  SftpSyncEvent,
  HostPortForwardRecord,
  UpsertHostPortForwardRequest,
  ListHostPortForwardsRequest,
  RemoveHostPortForwardRequest,
  ReorderHostPortForwardsRequest,
  ConnectionPoolStats,
  OpListVaultsResponse,
  OpListItemsRequest,
  OpListItemsResponse,
  OpGetItemFieldsRequest,
  OpGetItemFieldsResponse,
  EditorOpenRequest,
  EditorOpenFile,
  EditorSessionClosed,
  ConvertPpkRequest,
  ConvertPpkResponse,
  ExportHostsRequest,
  ScanSshManagerResponse,
  ImportSshManagerRequest,
  ImportSshManagerResponse,
  HostFingerprintRecord,
  HostFingerprintLookupRequest,
  HostFingerprintTrustRequest,
  HostFingerprintRemoveRequest,
  KeyboardInteractiveRequest,
  KeyboardInteractiveResponse,
  ScanPuttyResponse,
  CreateBackupRequest,
  CreateBackupResponse,
  RestoreBackupRequest,
  RestoreBackupResponse,
  ListBackupsResponse,
  SftpDragOutRequest,
  SftpDragOutResponse,
} from "@hypershell/shared";

declare const __APP_VERSION__: string;

declare global {
  interface Window {
    hypershell?: {
      openSession?: (request: OpenSessionRequest) => Promise<OpenSessionResponse>;
      resizeSession?: (request: ResizeSessionRequest) => Promise<void>;
      writeSession?: (request: WriteSessionRequest) => Promise<void>;
      closeSession?: (request: CloseSessionRequest) => Promise<void>;
      sessionSaveState?: (
        request: SessionSaveStateRequest
      ) => Promise<SessionSaveStateResponse>;
      sessionLoadSavedState?: () => Promise<SavedSessionRecord[]>;
      sessionClearSavedState?: () => Promise<SessionClearSavedStateResponse>;
      onSessionEvent?: (listener: (event: SessionEvent) => void) => () => void;
      onQuickConnect?: (listener: () => void) => () => void;
      listHosts?: () => Promise<HostRecord[]>;
      setHostStatusTargets?: (request: HostStatusTargetsRequest) => Promise<void>;
      onHostStatus?: (listener: (event: HostStatusEvent) => void) => () => void;
      upsertHost?: (request: UpsertHostRequest) => Promise<HostRecord>;
      removeHost?: (request: RemoveHostRequest) => Promise<void>;
      reorderHosts?: (request: ReorderHostsRequest) => Promise<void>;
      getSetting?: (request: GetSettingRequest) => Promise<SettingRecord | null>;
      updateSetting?: (request: UpdateSettingRequest) => Promise<SettingRecord>;
      listSerialProfiles?: () => Promise<SerialProfileRecord[]>;
      listTags?: () => Promise<TagRecord[]>;
      upsertTag?: (request: UpsertTagRequest) => Promise<TagRecord>;
      removeTag?: (request: RemoveTagRequest) => Promise<void>;
      tagsGetHostTags?: (request: GetHostTagsRequest) => Promise<TagRecord[]>;
      tagsSetHostTags?: (request: SetHostTagsRequest) => Promise<TagRecord[]>;
      listHostProfiles?: () => Promise<HostProfileRecord[]>;
      upsertHostProfile?: (request: UpsertHostProfileRequest) => Promise<HostProfileRecord>;
      removeHostProfile?: (request: RemoveHostProfileRequest) => Promise<void>;
      listHostEnvVars?: (request: ListHostEnvVarsRequest) => Promise<HostEnvVarRecord[]>;
      replaceHostEnvVars?: (
        request: ReplaceHostEnvVarsRequest
      ) => Promise<HostEnvVarRecord[]>;
      upsertSerialProfile?: (request: UpsertSerialProfileRequest) => Promise<SerialProfileRecord>;
      removeSerialProfile?: (request: RemoveSerialProfileRequest) => Promise<void>;
      listSerialPorts?: () => Promise<SerialPortInfo[]>;
      setSessionSignals?: (request: SetSignalsRequest) => Promise<void>;
      getHostStats?: (request: HostStatsRequest) => Promise<HostStatsResponse>;
      sftpConnect?: (request: SftpConnectRequest) => Promise<SftpConnectResponse>;
      sftpDisconnect?: (request: SftpDisconnectRequest) => Promise<void>;
      sftpList?: (request: SftpListRequest) => Promise<SftpListResponse>;
      sftpStat?: (request: SftpStatRequest) => Promise<SftpEntry>;
      sftpChmod?: (request: SftpChmodRequest) => Promise<void>;
      sftpMkdir?: (request: SftpMkdirRequest) => Promise<void>;
      sftpRename?: (request: SftpRenameRequest) => Promise<void>;
      sftpDelete?: (request: SftpDeleteRequest) => Promise<void>;
      sftpReadFile?: (request: SftpReadFileRequest) => Promise<SftpReadFileResponse>;
      sftpWriteFile?: (request: SftpWriteFileRequest) => Promise<void>;
      sftpTransferStart?: (request: SftpTransferStartRequest) => Promise<TransferJob[]>;
      sftpTransferCancel?: (request: SftpTransferCancelRequest) => Promise<void>;
      sftpTransferPause?: (request: SftpTransferPauseRequest) => Promise<void>;
      sftpTransferResume?: (request: SftpTransferResumeRequest) => Promise<void>;
      sftpTransferList?: () => Promise<SftpTransferListResponse>;
      sftpTransferResolveConflict?: (request: SftpTransferResolveConflictRequest) => Promise<void>;
      onSftpEvent?: (listener: (event: SftpEvent) => void) => () => void;
      sftpBookmarksList?: (request: SftpBookmarkListRequest) => Promise<SftpBookmark[]>;
      sftpBookmarksUpsert?: (request: SftpBookmarkUpsertRequest) => Promise<SftpBookmark>;
      sftpBookmarksRemove?: (request: SftpBookmarkRemoveRequest) => Promise<void>;
      sftpBookmarksReorder?: (request: SftpBookmarkReorderRequest) => Promise<void>;
      fsList?: (request: FsListRequest) => Promise<FsListResponse>;
      fsStat?: (request: FsListRequest) => Promise<FsEntry>;
      fsGetHome?: () => Promise<{ path: string }>;
      fsGetDrives?: () => Promise<FsGetDrivesResponse>;
      fsListSshKeys?: () => Promise<string[]>;
      fsShowSaveDialog?: (options?: { defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }) => Promise<string | null>;
      fsShowOpenDialog?: (options?: { title?: string; defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }) => Promise<string | null>;
      workspaceSave?: (request: SaveWorkspaceRequest) => Promise<{ success: boolean }>;
      workspaceLoad?: (request: LoadWorkspaceRequest) => Promise<WorkspaceRecord | null>;
      workspaceList?: () => Promise<WorkspaceRecord[]>;
      workspaceRemove?: (request: RemoveWorkspaceRequest) => Promise<void>;
      workspaceSaveLast?: (layout: WorkspaceLayout) => Promise<void>;
      workspaceLoadLast?: () => Promise<WorkspaceRecord | null>;
      sshKeysList?: () => Promise<SshKeyInfo[]>;
      sshKeysGenerate?: (request: GenerateSshKeyRequest) => Promise<{ path: string }>;
      sshKeysGetFingerprint?: (request: GetFingerprintRequest) => Promise<{ fingerprint: string | null }>;
      sshKeysRemove?: (request: RemoveSshKeyRequest) => Promise<void>;
      sshKeysConvertPpk?: (request: ConvertPpkRequest) => Promise<ConvertPpkResponse>;
      sftpSyncStart?: (request: SftpSyncStartRequest) => Promise<{ syncId: string }>;
      sftpSyncStop?: (request: SftpSyncStopRequest) => Promise<void>;
      sftpSyncList?: () => Promise<{ syncs: SftpSyncStatus[] }>;
      onSftpSyncEvent?: (listener: (event: SftpSyncEvent) => void) => () => void;
      hostPortForwardList?: (request: ListHostPortForwardsRequest) => Promise<HostPortForwardRecord[]>;
      hostPortForwardUpsert?: (request: UpsertHostPortForwardRequest) => Promise<HostPortForwardRecord>;
      hostPortForwardRemove?: (request: RemoveHostPortForwardRequest) => Promise<boolean>;
      hostPortForwardReorder?: (request: ReorderHostPortForwardsRequest) => Promise<void>;
      connectionPoolStats?: () => Promise<ConnectionPoolStats[]>;
      startPortForward?: (request: StartPortForwardRequest) => Promise<{ id: string }>;
      stopPortForward?: (request: StopPortForwardRequest) => Promise<void>;
      listPortForwards?: () => Promise<{ id: string }[]>;
      opListVaults?: () => Promise<OpListVaultsResponse>;
      opListItems?: (request: OpListItemsRequest) => Promise<OpListItemsResponse>;
      opGetItemFields?: (request: OpGetItemFieldsRequest) => Promise<OpGetItemFieldsResponse>;
      editorOpen?: (request: EditorOpenRequest) => Promise<void>;
      onEditorOpenFile?: (listener: (event: EditorOpenFile) => void) => () => void;
      onEditorSessionClosed?: (listener: (event: EditorSessionClosed) => void) => () => void;
      snippetsList?: () => Promise<SnippetRecord[]>;
      snippetsUpsert?: (request: UpsertSnippetRequest) => Promise<SnippetRecord>;
      snippetsRemove?: (request: RemoveSnippetRequest) => Promise<void>;
      loggingStart?: (request: StartLoggingRequest) => Promise<void>;
      loggingStop?: (request: StopLoggingRequest) => Promise<void>;
      loggingGetState?: (request: GetLoggingStateRequest) => Promise<LoggingStateResponse>;
      recordingStart?: (request: StartRecordingRequest) => Promise<SessionRecordingRecord>;
      recordingStop?: (request: StopRecordingRequest) => Promise<SessionRecordingRecord | null>;
      recordingGetState?: (request: GetRecordingStateRequest) => Promise<RecordingStateResponse>;
      recordingList?: () => Promise<SessionRecordingRecord[]>;
      recordingDelete?: (request: DeleteRecordingRequest) => Promise<DeleteRecordingResponse>;
      recordingGetFrames?: (request: GetRecordingFramesRequest) => Promise<RecordingFramesResponse>;
      recordingExport?: (request: ExportRecordingRequest) => Promise<ExportRecordingResponse>;
      connectionHistoryListByHost?: (
        request: ConnectionHistoryListByHostRequest
      ) => Promise<ConnectionHistoryRecord[]>;
      connectionHistoryListRecent?: (
        request?: ConnectionHistoryListRecentRequest
      ) => Promise<ConnectionHistoryRecord[]>;
      exportHosts?: (request: ExportHostsRequest) => Promise<{ exported: number }>;
      scanPuttySessions?: () => Promise<ScanPuttyResponse>;
      scanSshManager?: () => Promise<ScanSshManagerResponse>;
      importSshManager?: (request: ImportSshManagerRequest) => Promise<ImportSshManagerResponse>;
      hostFingerprintLookup?: (request: HostFingerprintLookupRequest) => Promise<HostFingerprintRecord | null>;
      hostFingerprintTrust?: (request: HostFingerprintTrustRequest) => Promise<HostFingerprintRecord>;
      hostFingerprintRemove?: (request: HostFingerprintRemoveRequest) => Promise<void>;
      onKeyboardInteractive?: (listener: (request: KeyboardInteractiveRequest) => void) => () => void;
      keyboardInteractiveRespond?: (response: KeyboardInteractiveResponse) => Promise<void>;
      backupCreate?: (request: CreateBackupRequest) => Promise<CreateBackupResponse>;
      backupRestore?: (request: RestoreBackupRequest) => Promise<RestoreBackupResponse>;
      backupList?: () => Promise<ListBackupsResponse>;
      backupShowOpenDialog?: () => Promise<string | null>;
      sftpDragOut?: (request: SftpDragOutRequest) => Promise<SftpDragOutResponse>;
    };
  }
}

export {};
