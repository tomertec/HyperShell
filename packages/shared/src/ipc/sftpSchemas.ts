import { z } from "zod";
import { sessionStateSchema } from "./schemas";

export const sftpEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  size: z.number(),
  modifiedAt: z.string(),
  isDirectory: z.boolean(),
  permissions: z.number(),
  owner: z.number(),
  group: z.number()
});
export type SftpEntry = z.infer<typeof sftpEntrySchema>;

export const sftpConnectRequestSchema = z.union([
  z.object({
    hostId: z.string(),
    username: z.string().min(1).optional(),
    password: z.string().min(1).optional()
  }),
  z.object({
    sessionId: z.string(),
    username: z.string().min(1).optional(),
    password: z.string().min(1).optional()
  })
]);
export type SftpConnectRequest = z.infer<typeof sftpConnectRequestSchema>;

export const sftpConnectResponseSchema = z.object({
  sftpSessionId: z.string()
});
export type SftpConnectResponse = z.infer<typeof sftpConnectResponseSchema>;

export const sftpDisconnectRequestSchema = z.object({
  sftpSessionId: z.string()
});
export type SftpDisconnectRequest = z.infer<typeof sftpDisconnectRequestSchema>;

export const sftpListRequestSchema = z.object({
  sftpSessionId: z.string(),
  path: z.string()
});
export type SftpListRequest = z.infer<typeof sftpListRequestSchema>;

export const sftpListResponseSchema = z.object({
  entries: z.array(sftpEntrySchema)
});
export type SftpListResponse = z.infer<typeof sftpListResponseSchema>;

export const sftpStatRequestSchema = z.object({
  sftpSessionId: z.string(),
  path: z.string()
});
export type SftpStatRequest = z.infer<typeof sftpStatRequestSchema>;

export const sftpChmodRequestSchema = z.object({
  sftpSessionId: z.string(),
  path: z.string(),
  permissions: z.number().int().min(0).max(0o7777)
});
export type SftpChmodRequest = z.infer<typeof sftpChmodRequestSchema>;

export const sftpMkdirRequestSchema = z.object({
  sftpSessionId: z.string(),
  path: z.string()
});
export type SftpMkdirRequest = z.infer<typeof sftpMkdirRequestSchema>;

export const sftpRenameRequestSchema = z.object({
  sftpSessionId: z.string(),
  oldPath: z.string(),
  newPath: z.string()
});
export type SftpRenameRequest = z.infer<typeof sftpRenameRequestSchema>;

export const sftpDeleteRequestSchema = z.object({
  sftpSessionId: z.string(),
  path: z.string(),
  recursive: z.boolean().optional().default(false)
});
export type SftpDeleteRequest = z.infer<typeof sftpDeleteRequestSchema>;

export const sftpReadFileRequestSchema = z.object({
  sftpSessionId: z.string(),
  path: z.string()
});
export type SftpReadFileRequest = z.infer<typeof sftpReadFileRequestSchema>;

export const sftpReadFileResponseSchema = z.object({
  content: z.string(),
  encoding: z.enum(["utf-8", "base64"])
});
export type SftpReadFileResponse = z.infer<typeof sftpReadFileResponseSchema>;

export const sftpWriteFileRequestSchema = z.object({
  sftpSessionId: z.string(),
  path: z.string(),
  content: z.string(),
  encoding: z.enum(["utf-8", "base64"]).optional().default("utf-8")
});
export type SftpWriteFileRequest = z.infer<typeof sftpWriteFileRequestSchema>;

export const transferOpSchema = z.object({
  type: z.enum(["upload", "download"]),
  localPath: z.string(),
  remotePath: z.string(),
  isDirectory: z.boolean()
});
export type TransferOp = z.infer<typeof transferOpSchema>;

export const sftpTransferStartRequestSchema = z.object({
  sftpSessionId: z.string(),
  operations: z.array(transferOpSchema).min(1)
});
export type SftpTransferStartRequest = z.infer<typeof sftpTransferStartRequestSchema>;

export const sftpTransferCancelRequestSchema = z.object({
  transferId: z.string()
});
export type SftpTransferCancelRequest = z.infer<typeof sftpTransferCancelRequestSchema>;

export const transferJobStatusSchema = z.enum([
  "queued",
  "active",
  "paused",
  "completed",
  "failed"
]);
export type TransferJobStatus = z.infer<typeof transferJobStatusSchema>;

export const transferJobSchema = z.object({
  transferId: z.string(),
  groupId: z.string().optional(),
  type: z.enum(["upload", "download"]),
  localPath: z.string(),
  remotePath: z.string(),
  status: transferJobStatusSchema,
  bytesTransferred: z.number(),
  totalBytes: z.number(),
  speed: z.number(),
  error: z.string().optional()
});
export type TransferJob = z.infer<typeof transferJobSchema>;

export const sftpTransferListResponseSchema = z.object({
  transfers: z.array(transferJobSchema)
});
export type SftpTransferListResponse = z.infer<typeof sftpTransferListResponseSchema>;

export const sftpTransferResolveConflictRequestSchema = z.object({
  transferId: z.string(),
  resolution: z.enum(["overwrite", "skip", "rename"]),
  applyToAll: z.boolean().optional().default(false)
});
export type SftpTransferResolveConflictRequest = z.infer<
  typeof sftpTransferResolveConflictRequestSchema
>;

export const sftpEventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("transfer-progress"),
    transferId: z.string(),
    bytesTransferred: z.number(),
    totalBytes: z.number(),
    speed: z.number(),
    status: transferJobStatusSchema
  }),
  z.object({
    kind: z.literal("transfer-conflict"),
    transferId: z.string(),
    remotePath: z.string(),
    localPath: z.string()
  }),
  z.object({
    kind: z.literal("status"),
    sftpSessionId: z.string(),
    state: sessionStateSchema
  }),
  z.object({
    kind: z.literal("transfer-complete"),
    transferId: z.string(),
    status: z.enum(["completed", "failed"]),
    error: z.string().optional()
  })
]);
export type SftpEvent = z.infer<typeof sftpEventSchema>;

export const fsListRequestSchema = z.object({ path: z.string() });
export type FsListRequest = z.infer<typeof fsListRequestSchema>;

export const fsEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  size: z.number(),
  modifiedAt: z.string(),
  isDirectory: z.boolean()
});
export type FsEntry = z.infer<typeof fsEntrySchema>;

export const fsListResponseSchema = z.object({
  entries: z.array(fsEntrySchema)
});
export type FsListResponse = z.infer<typeof fsListResponseSchema>;

export const fsGetDrivesResponseSchema = z.object({
  drives: z.array(z.string())
});
export type FsGetDrivesResponse = z.infer<typeof fsGetDrivesResponseSchema>;

export const sftpBookmarkSchema = z.object({
  id: z.string(),
  hostId: z.string(),
  name: z.string(),
  remotePath: z.string(),
  sortOrder: z.number(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type SftpBookmark = z.infer<typeof sftpBookmarkSchema>;

export const sftpBookmarkListRequestSchema = z.object({
  hostId: z.string()
});
export type SftpBookmarkListRequest = z.infer<typeof sftpBookmarkListRequestSchema>;

export const sftpBookmarkUpsertRequestSchema = z.object({
  id: z.string().optional(),
  hostId: z.string(),
  name: z.string(),
  remotePath: z.string(),
  sortOrder: z.number().optional()
});
export type SftpBookmarkUpsertRequest = z.infer<typeof sftpBookmarkUpsertRequestSchema>;

export const sftpBookmarkRemoveRequestSchema = z.object({
  id: z.string()
});
export type SftpBookmarkRemoveRequest = z.infer<typeof sftpBookmarkRemoveRequestSchema>;

export const sftpBookmarkReorderRequestSchema = z.object({
  bookmarkIds: z.array(z.string())
});
export type SftpBookmarkReorderRequest = z.infer<typeof sftpBookmarkReorderRequestSchema>;

// --- Sync schemas ---

export const sftpSyncConfigSchema = z.object({
  sftpSessionId: z.string().min(1),
  localPath: z.string().min(1),
  remotePath: z.string().min(1),
  direction: z.enum(["local-to-remote", "remote-to-local", "bidirectional"]),
  excludePatterns: z.array(z.string()).default([]),
  deleteOrphans: z.boolean().default(false),
});

export const sftpSyncStartRequestSchema = sftpSyncConfigSchema;

export const sftpSyncStopRequestSchema = z.object({
  syncId: z.string().min(1),
});

export const sftpSyncStatusSchema = z.object({
  syncId: z.string().min(1),
  status: z.enum(["scanning", "syncing", "idle", "error", "stopped"]),
  filesScanned: z.number().int(),
  filesSynced: z.number().int(),
  bytesTransferred: z.number(),
  lastError: z.string().nullable(),
  lastSyncAt: z.string().nullable(),
});

export const sftpSyncEventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("sync-progress"),
    syncId: z.string(),
    filesScanned: z.number(),
    filesSynced: z.number(),
    currentFile: z.string(),
  }),
  z.object({
    kind: z.literal("sync-complete"),
    syncId: z.string(),
    filesSynced: z.number(),
    bytesTransferred: z.number(),
  }),
  z.object({
    kind: z.literal("sync-error"),
    syncId: z.string(),
    error: z.string(),
  }),
]);

export type SftpSyncConfig = z.infer<typeof sftpSyncConfigSchema>;
export type SftpSyncStartRequest = z.infer<typeof sftpSyncStartRequestSchema>;
export type SftpSyncStopRequest = z.infer<typeof sftpSyncStopRequestSchema>;
export type SftpSyncStatus = z.infer<typeof sftpSyncStatusSchema>;
export type SftpSyncEvent = z.infer<typeof sftpSyncEventSchema>;

// -- Editor window schemas --

export const editorOpenRequestSchema = z.object({
  sftpSessionId: z.string(),
  remotePath: z.string(),
});
export type EditorOpenRequest = z.infer<typeof editorOpenRequestSchema>;

// Same shape as editorOpenRequestSchema — reuse to avoid drift
export const editorOpenFileSchema = editorOpenRequestSchema;
export type EditorOpenFile = EditorOpenRequest;

export const editorSessionClosedSchema = z.object({
  sftpSessionId: z.string(),
});
export type EditorSessionClosed = z.infer<typeof editorSessionClosedSchema>;
