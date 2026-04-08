import type {
  SnippetRecord,
  UpsertSnippetRequest,
  RemoveSnippetRequest,
  StartLoggingRequest,
  StopLoggingRequest,
  GetLoggingStateRequest,
  LoggingStateResponse,
  CloseSessionRequest,
  StartPortForwardRequest,
  StopPortForwardRequest,
  FsEntry,
  FsGetDrivesResponse,
  FsListRequest,
  FsListResponse,
  GetSettingRequest,
  HostRecord,
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
  SftpTransferResolveConflictRequest,
  SftpTransferStartRequest,
  SftpWriteFileRequest,
  TransferJob,
  UpdateSettingRequest,
  UpsertHostRequest,
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
} from "@sshterm/shared";

declare global {
  interface Window {
    sshterm?: {
      openSession?: (request: OpenSessionRequest) => Promise<OpenSessionResponse>;
      resizeSession?: (request: ResizeSessionRequest) => Promise<void>;
      writeSession?: (request: WriteSessionRequest) => Promise<void>;
      closeSession?: (request: CloseSessionRequest) => Promise<void>;
      onSessionEvent?: (listener: (event: SessionEvent) => void) => () => void;
      onQuickConnect?: (listener: () => void) => () => void;
      listHosts?: () => Promise<HostRecord[]>;
      upsertHost?: (request: UpsertHostRequest) => Promise<HostRecord>;
      removeHost?: (request: RemoveHostRequest) => Promise<void>;
      reorderHosts?: (request: ReorderHostsRequest) => Promise<void>;
      getSetting?: (request: GetSettingRequest) => Promise<SettingRecord | null>;
      updateSetting?: (request: UpdateSettingRequest) => Promise<SettingRecord>;
      listSerialProfiles?: () => Promise<SerialProfileRecord[]>;
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
      exportHosts?: (request: ExportHostsRequest) => Promise<{ exported: number }>;
      scanPuttySessions?: () => Promise<ScanPuttyResponse>;
      hostFingerprintLookup?: (request: HostFingerprintLookupRequest) => Promise<HostFingerprintRecord | null>;
      hostFingerprintTrust?: (request: HostFingerprintTrustRequest) => Promise<HostFingerprintRecord>;
      hostFingerprintRemove?: (request: HostFingerprintRemoveRequest) => Promise<void>;
      onKeyboardInteractive?: (listener: (request: KeyboardInteractiveRequest) => void) => () => void;
      keyboardInteractiveRespond?: (response: KeyboardInteractiveResponse) => Promise<void>;
      backupCreate?: (request: CreateBackupRequest) => Promise<CreateBackupResponse>;
      backupRestore?: (request: RestoreBackupRequest) => Promise<RestoreBackupResponse>;
      backupList?: () => Promise<ListBackupsResponse>;
      backupShowOpenDialog?: () => Promise<string | null>;
    };
  }
}

export {};
