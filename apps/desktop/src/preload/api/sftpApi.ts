import {
  ipcChannels,
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
  transferJobSchema,
  sftpSyncStatusSchema,
  sftpSyncStartRequestSchema,
  sftpSyncStopRequestSchema,
  sftpSyncEventSchema,
  sftpDragOutRequestSchema,
  sftpDragOutResponseSchema,
  keyboardInteractiveRequestSchema,
  keyboardInteractiveResponseSchema,
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
  type SftpSyncStartRequest,
  type SftpSyncStopRequest,
  type SftpSyncStatus,
  type SftpSyncEvent,
  type SftpDragOutRequest,
  type SftpDragOutResponse,
  type KeyboardInteractiveRequest,
  type KeyboardInteractiveResponse,
} from "@hypershell/shared";
import { z } from "zod";
import { createSubscription } from "./subscription";
import type { PreloadIpcRenderer, PreloadLogger } from "./types";

export interface SftpApi {
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
  sftpSyncStart(request: SftpSyncStartRequest): Promise<{ syncId: string }>;
  sftpSyncStop(request: SftpSyncStopRequest): Promise<void>;
  sftpSyncList(): Promise<{ syncs: SftpSyncStatus[] }>;
  onSftpSyncEvent(listener: (event: SftpSyncEvent) => void): () => void;
  sftpDragOut(request: SftpDragOutRequest): Promise<SftpDragOutResponse>;
  sftpStartNativeDragOut(request: SftpDragOutRequest): void;
  onKeyboardInteractive(listener: (request: KeyboardInteractiveRequest) => void): () => void;
  keyboardInteractiveRespond(response: KeyboardInteractiveResponse): Promise<void>;
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

const transferJobArraySchema = z.array(transferJobSchema);
const sftpBookmarkArraySchema = z.array(sftpBookmarkSchema);
const sftpSyncStartResponseSchema = z.object({ syncId: z.string() });
const sftpSyncListResponseSchema = z.object({ syncs: z.array(sftpSyncStatusSchema) });

export function createSftpApi(
  ipcRenderer: PreloadIpcRenderer,
  logger: PreloadLogger
): SftpApi {
  return {
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
        return strict.data;
      }

      const normalized = normalizeSftpListResponseShape(result);
      if (normalized) {
        return normalized;
      }
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
    onSftpEvent: createSubscription(
      ipcRenderer,
      logger,
      ipcChannels.sftp.event,
      "onSftpEvent",
      "SFTP event",
      sftpEventSchema
    ),
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
    onSftpSyncEvent: createSubscription(
      ipcRenderer,
      logger,
      ipcChannels.sftp.syncEvent,
      "onSftpSyncEvent",
      "SFTP sync event",
      sftpSyncEventSchema
    ),
    async sftpDragOut(request: SftpDragOutRequest): Promise<SftpDragOutResponse> {
      const parsed = sftpDragOutRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.sftp.dragOut, parsed);
      return sftpDragOutResponseSchema.parse(result);
    },
    sftpStartNativeDragOut(request: SftpDragOutRequest): void {
      const parsed = sftpDragOutRequestSchema.parse(request);
      ipcRenderer.send(ipcChannels.sftp.startNativeDragOut, parsed);
    },
    onKeyboardInteractive: createSubscription(
      ipcRenderer,
      logger,
      ipcChannels.sftp.keyboardInteractive,
      "onKeyboardInteractive",
      "keyboard-interactive",
      keyboardInteractiveRequestSchema
    ),
    async keyboardInteractiveRespond(response: KeyboardInteractiveResponse): Promise<void> {
      const parsed = keyboardInteractiveResponseSchema.parse(response);
      await ipcRenderer.invoke(ipcChannels.sftp.keyboardInteractiveResponse, parsed);
    },
  };
}
