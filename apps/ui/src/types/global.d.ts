import type {
  CloseSessionRequest,
  FsEntry,
  FsGetDrivesResponse,
  FsListRequest,
  FsListResponse,
  HostRecord,
  HostStatsRequest,
  HostStatsResponse,
  OpenSessionRequest,
  OpenSessionResponse,
  RemoveHostRequest,
  ResizeSessionRequest,
  SerialPortInfo,
  SerialProfileRecord,
  RemoveSerialProfileRequest,
  SessionEvent,
  SetSignalsRequest,
  SftpBookmark,
  SftpBookmarkListRequest,
  SftpBookmarkRemoveRequest,
  SftpBookmarkReorderRequest,
  SftpBookmarkUpsertRequest,
  SftpConnectRequest,
  SftpConnectResponse,
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
  UpsertHostRequest,
  UpsertSerialProfileRequest,
  WriteSessionRequest
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
    };
  }
}

export {};
