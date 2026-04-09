import { ipcChannels } from "./channels";
import type {
  CloseSessionRequest,
  OpenSessionRequest,
  OpenSessionResponse,
  ResizeSessionRequest,
  SessionEvent,
  WriteSessionRequest
} from "./schemas";
import type {
  FsGetDrivesResponse,
  FsListRequest,
  FsListResponse,
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
  SftpStatRequest,
  SftpTransferCancelRequest,
  SftpTransferListResponse,
  SftpTransferPauseRequest,
  SftpTransferResolveConflictRequest,
  SftpTransferResumeRequest,
  SftpTransferStartRequest,
  SftpWriteFileRequest,
  SftpEntry,
  TransferJob
} from "./sftpSchemas";

export interface SessionIpcClient {
  openSession(request: OpenSessionRequest): Promise<OpenSessionResponse>;
  resizeSession(request: ResizeSessionRequest): Promise<void>;
  writeSession(request: WriteSessionRequest): Promise<void>;
  closeSession(request: CloseSessionRequest): Promise<void>;
  onSessionEvent(listener: (event: SessionEvent) => void): () => void;
}

export interface SessionIpcHandlers {
  [ipcChannels.session.open]: (
    request: OpenSessionRequest
  ) => Promise<OpenSessionResponse>;
  [ipcChannels.session.resize]: (request: ResizeSessionRequest) => Promise<void>;
  [ipcChannels.session.write]: (request: WriteSessionRequest) => Promise<void>;
  [ipcChannels.session.close]: (request: CloseSessionRequest) => Promise<void>;
}

export interface SftpIpcClient {
  connect(request: SftpConnectRequest): Promise<SftpConnectResponse>;
  disconnect(request: SftpDisconnectRequest): Promise<void>;
  list(request: SftpListRequest): Promise<SftpListResponse>;
  stat(request: SftpStatRequest): Promise<SftpEntry>;
  chmod(request: SftpChmodRequest): Promise<void>;
  mkdir(request: SftpMkdirRequest): Promise<void>;
  rename(request: SftpRenameRequest): Promise<void>;
  delete(request: SftpDeleteRequest): Promise<void>;
  readFile(request: SftpReadFileRequest): Promise<SftpReadFileResponse>;
  writeFile(request: SftpWriteFileRequest): Promise<void>;
  transferStart(request: SftpTransferStartRequest): Promise<TransferJob[]>;
  transferCancel(request: SftpTransferCancelRequest): Promise<void>;
  transferPause(request: SftpTransferPauseRequest): Promise<void>;
  transferResume(request: SftpTransferResumeRequest): Promise<void>;
  transferList(): Promise<SftpTransferListResponse>;
  transferResolveConflict(request: SftpTransferResolveConflictRequest): Promise<void>;
  listBookmarks(request: SftpBookmarkListRequest): Promise<SftpBookmark[]>;
  upsertBookmark(request: SftpBookmarkUpsertRequest): Promise<SftpBookmark>;
  removeBookmark(request: SftpBookmarkRemoveRequest): Promise<void>;
  reorderBookmarks(request: SftpBookmarkReorderRequest): Promise<void>;
  onEvent(listener: (event: SftpEvent) => void): () => void;
}

export interface SftpIpcHandlers {
  [ipcChannels.sftp.connect]: (
    request: SftpConnectRequest
  ) => Promise<SftpConnectResponse>;
  [ipcChannels.sftp.disconnect]: (
    request: SftpDisconnectRequest
  ) => Promise<void>;
  [ipcChannels.sftp.list]: (request: SftpListRequest) => Promise<SftpListResponse>;
  [ipcChannels.sftp.stat]: (request: SftpStatRequest) => Promise<SftpEntry>;
  [ipcChannels.sftp.chmod]: (request: SftpChmodRequest) => Promise<void>;
  [ipcChannels.sftp.mkdir]: (request: SftpMkdirRequest) => Promise<void>;
  [ipcChannels.sftp.rename]: (request: SftpRenameRequest) => Promise<void>;
  [ipcChannels.sftp.delete]: (request: SftpDeleteRequest) => Promise<void>;
  [ipcChannels.sftp.readFile]: (
    request: SftpReadFileRequest
  ) => Promise<SftpReadFileResponse>;
  [ipcChannels.sftp.writeFile]: (
    request: SftpWriteFileRequest
  ) => Promise<void>;
  [ipcChannels.sftp.transferStart]: (
    request: SftpTransferStartRequest
  ) => Promise<TransferJob[]>;
  [ipcChannels.sftp.transferCancel]: (
    request: SftpTransferCancelRequest
  ) => Promise<void>;
  [ipcChannels.sftp.transferPause]: (
    request: SftpTransferPauseRequest
  ) => Promise<void>;
  [ipcChannels.sftp.transferResume]: (
    request: SftpTransferResumeRequest
  ) => Promise<void>;
  [ipcChannels.sftp.transferList]: () => Promise<SftpTransferListResponse>;
  [ipcChannels.sftp.transferResolveConflict]: (
    request: SftpTransferResolveConflictRequest
  ) => Promise<void>;
  [ipcChannels.sftp.bookmarksList]: (
    request: SftpBookmarkListRequest
  ) => Promise<SftpBookmark[]>;
  [ipcChannels.sftp.bookmarksUpsert]: (
    request: SftpBookmarkUpsertRequest
  ) => Promise<SftpBookmark>;
  [ipcChannels.sftp.bookmarksRemove]: (
    request: SftpBookmarkRemoveRequest
  ) => Promise<void>;
  [ipcChannels.sftp.bookmarksReorder]: (
    request: SftpBookmarkReorderRequest
  ) => Promise<void>;
}

export interface FsIpcClient {
  list(request: FsListRequest): Promise<FsListResponse>;
  getDrives(): Promise<FsGetDrivesResponse>;
}

export interface FsIpcHandlers {
  [ipcChannels.fs.list]: (request: FsListRequest) => Promise<FsListResponse>;
  [ipcChannels.fs.getDrives]: () => Promise<FsGetDrivesResponse>;
}
