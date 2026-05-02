import { createHostsRepositoryFromDatabase, openDatabase, createSftpBookmarksRepository, createHostFingerprintRepositoryFromDatabase } from "@hypershell/db";
import { app, nativeImage } from "electron";
import path from "node:path";
import fs from "node:fs";
import { pipeline } from "node:stream/promises";
import { ZipFile } from "yazl";
import {
  ipcChannels,
  sftpBookmarkListRequestSchema,
  sftpBookmarkRemoveRequestSchema,
  sftpBookmarkReorderRequestSchema,
  sftpBookmarkUpsertRequestSchema,
  sftpConnectRequestSchema,
  sftpChmodRequestSchema,
  sftpDeleteRequestSchema,
  sftpDisconnectRequestSchema,
  sftpListRequestSchema,
  sftpMkdirRequestSchema,
  sftpReadFileRequestSchema,
  sftpRenameRequestSchema,
  sftpStatRequestSchema,
  sftpTransferCancelRequestSchema,
  sftpTransferPauseRequestSchema,
  sftpTransferResolveConflictRequestSchema,
  sftpTransferResumeRequestSchema,
  sftpTransferRetryRequestSchema,
  sftpTransferStartRequestSchema,
  sftpWriteFileRequestSchema,
  sftpSyncStartRequestSchema,
  sftpSyncStopRequestSchema,
  sftpDragOutRequestSchema,
  keyboardInteractiveResponseSchema,
  type SftpEvent,
  type SftpSyncEvent,
  type SftpConnectRequest,
  type SftpTransferPauseRequest,
  type SftpTransferResumeRequest,
  type KeyboardInteractiveRequest,
} from "@hypershell/shared";
import type {
  SessionManager,
  SftpConnectionOptions,
  SftpTransportHandle,
  KeyboardInteractiveCallback,
  Ssh2ConnectionPool,
} from "@hypershell/session-core";
import { createSyncEngine, probeHostKey } from "@hypershell/session-core";
import { createHash, timingSafeEqual } from "node:crypto";
import type { IpcMainEvent, IpcMainInvokeEvent } from "electron";

import type { IpcMainLike } from "./registerIpc";
import { editorWindowManager } from "../windows/editorWindowManager";
import { createSftpSessionManager } from "../sftp/sftpSessionManager";
import { createTransferManager } from "../sftp/transferManager";
import { createTransferManifest } from "../sftp/transferManifest";

export function resolveSafeDragOutPath(tempDir: string, fileName: string): string {
  const trimmed = fileName.trim();
  if (!trimmed) {
    throw new Error("Invalid drag-out filename");
  }

  const baseName = path.basename(trimmed);
  const hasPathSeparators = trimmed.includes(path.posix.sep) || trimmed.includes(path.win32.sep);
  const hasControlChars = /[\0-\x1f]/.test(trimmed);
  if (hasPathSeparators || hasControlChars || baseName !== trimmed || baseName === "." || baseName === "..") {
    throw new Error("Invalid drag-out filename");
  }

  const resolvedTempDir = path.resolve(tempDir);
  const resolvedTarget = path.resolve(resolvedTempDir, baseName);
  if (resolvedTarget !== path.join(resolvedTempDir, baseName)) {
    throw new Error("Invalid drag-out filename");
  }

  return resolvedTarget;
}

/**
 * Error subclass thrown when host key verification fails.
 * Contains the fingerprint details so the renderer can show the appropriate dialog.
 */
class HostKeyVerificationError extends Error {
  public readonly hostname: string;
  public readonly port: number;
  public readonly algorithm: string;
  public readonly fingerprint: string;
  public readonly verificationStatus: "new_host" | "key_changed";
  public readonly previousFingerprint?: string;

  constructor(opts: {
    hostname: string;
    port: number;
    algorithm: string;
    fingerprint: string;
    verificationStatus: "new_host" | "key_changed";
    previousFingerprint?: string;
  }) {
    // Encode structured data in the error message so the renderer can parse it.
    // Electron serializes errors across IPC as plain Error objects with only the message.
    const payload = {
      __hostKeyVerification: true,
      hostname: opts.hostname,
      port: opts.port,
      algorithm: opts.algorithm,
      fingerprint: opts.fingerprint,
      verificationStatus: opts.verificationStatus,
      previousFingerprint: opts.previousFingerprint,
    };
    super(JSON.stringify(payload));
    this.name = "HostKeyVerificationError";
    this.hostname = opts.hostname;
    this.port = opts.port;
    this.algorithm = opts.algorithm;
    this.fingerprint = opts.fingerprint;
    this.verificationStatus = opts.verificationStatus;
    this.previousFingerprint = opts.previousFingerprint;
  }
}

/** @internal Extracted for testability. */
export interface HostFingerprintLookup {
  findByHost(hostname: string, port: number): Array<{ fingerprint: string; isTrusted: boolean }>;
  findByHostAndAlgorithm(hostname: string, port: number, algorithm: string): { id?: string; fingerprint: string; isTrusted: boolean } | undefined;
  upsert(record: { id?: string; hostname: string; port: number; algorithm: string; fingerprint: string }): void;
}

/**
 * Verifies a remote host key against known fingerprints.
 * Throws on new/changed keys or when probe fails with no trusted fallback.
 * @internal Exported for testing.
 */
export async function verifyHostKey(
  hostname: string,
  port: number,
  fingerprintRepo: HostFingerprintLookup,
  trustedFingerprints: string[],
): Promise<void> {
  try {
    const { algorithm, fingerprint } = await probeHostKey(hostname, port);
    const existing = fingerprintRepo.findByHostAndAlgorithm(hostname, port, algorithm);

    if (!existing) {
      throw new HostKeyVerificationError({
        hostname, port, algorithm, fingerprint, verificationStatus: "new_host",
      });
    } else if (
      existing.fingerprint.length !== fingerprint.length ||
      !timingSafeEqual(Buffer.from(existing.fingerprint), Buffer.from(fingerprint))
    ) {
      throw new HostKeyVerificationError({
        hostname, port, algorithm, fingerprint,
        verificationStatus: "key_changed",
        previousFingerprint: existing.fingerprint,
      });
    } else if (!existing.isTrusted) {
      throw new HostKeyVerificationError({
        hostname, port, algorithm, fingerprint, verificationStatus: "new_host",
      });
    }
    // Key matches trusted fingerprint — update last_seen
    fingerprintRepo.upsert({ id: existing.id, hostname, port, algorithm, fingerprint });
  } catch (error) {
    if (error instanceof HostKeyVerificationError) {
      throw error;
    }
    if (trustedFingerprints.length === 0) {
      throw new Error(
        `Unable to verify host key for ${hostname}:${port} and no previously trusted fingerprints exist`
      );
    }
    console.warn("[sftp] Host key probe failed, falling back to trusted fingerprints:", (error as Error).message);
  }
}

export interface RegisterSftpIpcOptions {
  sessionManager: SessionManager;
  resolveConnectionOptions: (
    hostId: string,
    request: SftpConnectRequest
  ) => Promise<SftpConnectionOptions | null>;
  onConnected?: (payload: {
    sftpSessionId: string;
    hostId: string;
    connectionOptions: SftpConnectionOptions;
  }) => void;
  emitSftpEvent?: (event: SftpEvent) => void;
  emitSyncEvent?: (event: SftpSyncEvent) => void;
  emitKeyboardInteractive?: (request: KeyboardInteractiveRequest) => void;
  db?: ReturnType<typeof openDatabase>;
  connectionPool?: Ssh2ConnectionPool;
}

// Singletons created inside registerSftpIpc to avoid import-time side effects.

function resolveHostIdFromRequest(
  request: { hostId?: string; sessionId?: string },
  sessionManager: SessionManager
): string | null {
  if (request.hostId) {
    return request.hostId;
  }

  if (!request.sessionId) {
    return null;
  }

  return sessionManager.getSession(request.sessionId)?.profileId ?? null;
}



function ensureBookmarkHost(
  hostId: string,
  connOpts: SftpConnectionOptions,
  repo: ReturnType<typeof createHostsRepositoryFromDatabase>
): void {
  if (repo.get(hostId)) return;
  repo.create({
    id: hostId,
    name: connOpts.username ? `${connOpts.username}@${connOpts.hostname}` : connOpts.hostname,
    hostname: connOpts.hostname,
    port: connOpts.port ?? 22,
    username: connOpts.username ?? null
  });
}

function normalizeFileContent(buffer: Buffer): { content: string; encoding: "utf-8" | "base64" } {
  // Check for null bytes in first 8KB to detect binary content
  const sample = buffer.subarray(0, 8192);
  if (sample.includes(0)) {
    return { content: buffer.toString("base64"), encoding: "base64" };
  }

  return { content: buffer.toString("utf8"), encoding: "utf-8" };
}

function normalizeTransferStatus(status: string): "queued" | "active" | "paused" | "completed" | "failed" {
  if (
    status === "queued" ||
    status === "active" ||
    status === "paused" ||
    status === "completed" ||
    status === "failed"
  ) {
    return status;
  }

  return "active";
}

function createDragOutTempFileName(fileName: string, cacheKey: string): string {
  const extension = path.extname(fileName);
  const stem = extension.length > 0 ? fileName.slice(0, -extension.length) : fileName;
  const suffix = createHash("sha256").update(cacheKey).digest("hex").slice(0, 12);
  return `${stem}-${suffix}${extension}`;
}

export interface SftpDragOutItem {
  remotePath: string;
  fileName: string;
  isDirectory?: boolean;
}

export interface SftpDragOutSkippedEntry {
  path: string;
  reason: string;
}

export interface StageSftpDragOutItemOptions {
  transport: Pick<SftpTransportHandle, "createReadStream" | "list">;
  tempDir: string;
  cacheKey: string;
  archiveDirectory?: boolean;
  item: SftpDragOutItem;
}

function isPermissionDeniedError(error: unknown): boolean {
  const maybeError = error as { code?: unknown; message?: unknown };
  return maybeError.code === 3 || /permission denied/i.test(String(maybeError.message ?? error));
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function stageRemoteFile(
  transport: Pick<SftpTransportHandle, "createReadStream">,
  remotePath: string,
  localPath: string
): Promise<void> {
  await fs.promises.mkdir(path.dirname(localPath), { recursive: true });
  await pipeline(transport.createReadStream(remotePath), fs.createWriteStream(localPath));
}

async function stageRemoteDirectory(
  transport: Pick<SftpTransportHandle, "createReadStream" | "list">,
  remotePath: string,
  localPath: string,
  options: {
    skipPermissionDenied?: boolean;
    isRoot?: boolean;
    skippedEntries?: SftpDragOutSkippedEntry[];
  } = {}
): Promise<SftpDragOutSkippedEntry[]> {
  const skippedEntries = options.skippedEntries ?? [];
  await fs.promises.mkdir(localPath, { recursive: true });
  let entries: Awaited<ReturnType<Pick<SftpTransportHandle, "list">["list"]>>;
  try {
    entries = await transport.list(remotePath);
  } catch (error) {
    if (options.skipPermissionDenied && !options.isRoot && isPermissionDeniedError(error)) {
      skippedEntries.push({ path: remotePath, reason: getErrorMessage(error) });
      return skippedEntries;
    }
    throw error;
  }

  for (const entry of entries) {
    const childLocalPath = resolveSafeDragOutPath(localPath, entry.name);
    if (entry.isDirectory) {
      await stageRemoteDirectory(transport, entry.path, childLocalPath, {
        skipPermissionDenied: options.skipPermissionDenied,
        isRoot: false,
        skippedEntries,
      });
      continue;
    }

    try {
      await stageRemoteFile(transport, entry.path, childLocalPath);
    } catch (error) {
      if (options.skipPermissionDenied && isPermissionDeniedError(error)) {
        skippedEntries.push({ path: entry.path, reason: getErrorMessage(error) });
        continue;
      }
      throw error;
    }
  }

  return skippedEntries;
}

async function writeSkippedEntriesManifest(
  localDir: string,
  skippedEntries: SftpDragOutSkippedEntry[]
): Promise<void> {
  if (skippedEntries.length === 0) return;

  let manifestPath = resolveSafeDragOutPath(localDir, "HYPERSHELL_SKIPPED_FILES.txt");
  for (let index = 2; fs.existsSync(manifestPath); index += 1) {
    manifestPath = resolveSafeDragOutPath(localDir, `HYPERSHELL_SKIPPED_FILES_${index}.txt`);
  }

  const content = [
    "Some remote items could not be included in this drag-out archive.",
    "",
    ...skippedEntries.map((entry) => `${entry.path}\t${entry.reason}`),
    "",
  ].join("\n");
  await fs.promises.writeFile(manifestPath, content, "utf8");
}

async function addDirectoryToZip(
  zipFile: ZipFile,
  localDir: string,
  metadataDir: string
): Promise<void> {
  const stats = await fs.promises.stat(localDir);
  zipFile.addEmptyDirectory(`${metadataDir}/`, { mtime: stats.mtime });

  const entries = await fs.promises.readdir(localDir, { withFileTypes: true });
  for (const entry of entries) {
    const localPath = path.join(localDir, entry.name);
    const metadataPath = path.posix.join(metadataDir, entry.name);

    if (entry.isDirectory()) {
      await addDirectoryToZip(zipFile, localPath, metadataPath);
      continue;
    }

    zipFile.addFile(localPath, metadataPath, { compress: false });
  }
}

export async function createZipFromDirectory(
  sourceDir: string,
  zipPath: string,
  rootName: string
): Promise<void> {
  await fs.promises.rm(zipPath, { recursive: true, force: true });
  await fs.promises.mkdir(path.dirname(zipPath), { recursive: true });

  const zipFile = new ZipFile();
  const output = fs.createWriteStream(zipPath);
  const writeComplete = pipeline(zipFile.outputStream, output);

  await addDirectoryToZip(zipFile, sourceDir, rootName);
  zipFile.end();
  await writeComplete;
}

export async function stageSftpDragOutItem({
  transport,
  tempDir,
  cacheKey,
  archiveDirectory,
  item,
}: StageSftpDragOutItemOptions): Promise<string> {
  await fs.promises.mkdir(tempDir, { recursive: true });

  const safeOriginalPath = resolveSafeDragOutPath(tempDir, item.fileName);
  const safeOriginalName = path.basename(safeOriginalPath);
  const uniqueFileName = createDragOutTempFileName(path.basename(safeOriginalPath), cacheKey);
  const tempPath = resolveSafeDragOutPath(tempDir, uniqueFileName);

  await fs.promises.rm(tempPath, { recursive: true, force: true });

  if (item.isDirectory) {
    const skippedEntries = await stageRemoteDirectory(transport, item.remotePath, tempPath, {
      skipPermissionDenied: archiveDirectory,
      isRoot: true,
    });
    if (archiveDirectory) {
      await writeSkippedEntriesManifest(tempPath, skippedEntries);
      const zipPath = `${tempPath}.zip`;
      await createZipFromDirectory(tempPath, zipPath, safeOriginalName);
      return zipPath;
    }

    return tempPath;
  }

  await stageRemoteFile(transport, item.remotePath, tempPath);
  return tempPath;
}

export function shouldStartNativeDragOut(
  request: { isDirectory?: boolean; prepareOnly?: boolean },
  hadCachedTempPath: boolean
): boolean {
  if (request.prepareOnly) return false;
  if (request.isDirectory && !hadCachedTempPath) return false;
  return true;
}

const DRAG_OUT_TEMP_DIR_NAME = "hypershell-drag";
const DRAG_OUT_STARTUP_TTL_MS = 60 * 60 * 1000; // 1h — drag cache has no long-term value
const DRAG_OUT_POST_DRAG_DELAY_MS = 5 * 60 * 1000; // 5m
const DRAG_OUT_ICON_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAADklEQVQ4jWNgGAWDEwAAAhAAATHKfqoAAAAASUVORK5CYII=";

function createDragOutIcon() {
  return nativeImage.createFromBuffer(Buffer.from(DRAG_OUT_ICON_PNG_BASE64, "base64"));
}

export async function pruneDragOutCache(
  tempDir: string,
  maxAgeMs: number,
  now = Date.now()
): Promise<void> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(tempDir, { withFileTypes: true });
  } catch {
    return; // dir missing / unreadable — nothing to prune
  }

  for (const entry of entries) {
    const target = path.join(tempDir, entry.name);
    try {
      const stats = await fs.promises.stat(target);
      if (now - stats.mtimeMs < maxAgeMs) continue;
      await fs.promises.rm(target, { recursive: true, force: true });
    } catch {
      // best-effort — skip locked/in-use entries, next startup will retry
    }
  }
}

export function registerSftpIpc(
  ipcMain: IpcMainLike,
  options: RegisterSftpIpcOptions
): () => void {
  const sftpSessionManager = createSftpSessionManager();
  const transferManager = createTransferManager({ autoStart: true, maxConcurrent: 1 });
  const manifest = createTransferManifest(app.getPath("userData"));
  manifest.prune(7 * 24 * 60 * 60 * 1000); // 7 days

  const db = options.db ?? openDatabase();
  const hostsRepo = createHostsRepositoryFromDatabase(db);
  const bookmarksRepo = createSftpBookmarksRepository(db);
  const fingerprintRepo = createHostFingerprintRepositoryFromDatabase(db);

  // Drag-out cache: pre-downloaded files keyed by "sessionId:remotePath"
  const dragCache = new Map<string, string>();
  const dragStageTasks = new Map<string, Promise<string>>();
  const dragTempDir = path.join(app.getPath("temp"), DRAG_OUT_TEMP_DIR_NAME);
  // Fire-and-forget — never block app startup on (potentially multi-GB) rm.
  void pruneDragOutCache(dragTempDir, DRAG_OUT_STARTUP_TTL_MS);

  const stageDragOutItemOnce = (
    cacheKey: string,
    request: { sftpSessionId: string } & SftpDragOutItem
  ): Promise<string> => {
    let stageTask = dragStageTasks.get(cacheKey);
    if (!stageTask) {
      const transport = sftpSessionManager.getTransport(request.sftpSessionId);
      stageTask = stageSftpDragOutItem({
        transport,
        tempDir: dragTempDir,
        cacheKey,
        archiveDirectory: request.isDirectory,
        item: request,
      }).then((stagedPath) => {
        dragCache.set(cacheKey, stagedPath);
        return stagedPath;
      }).finally(() => {
        dragStageTasks.delete(cacheKey);
      });
      dragStageTasks.set(cacheKey, stageTask);
    }

    return stageTask;
  };

  // Keyboard-interactive auth relay: pending requests keyed by requestId
  const pendingKbdInteractive = new Map<string, {
    resolve: (responses: string[]) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();

  const KEYBOARD_INTERACTIVE_TIMEOUT_MS = 60_000;

  function createKeyboardInteractiveCallback(): KeyboardInteractiveCallback {
    return (name, instructions, prompts) => {
      return new Promise<string[]>((resolve, reject) => {
        const requestId = `kbd-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const timer = setTimeout(() => {
          pendingKbdInteractive.delete(requestId);
          reject(new Error("Keyboard-interactive authentication timed out"));
        }, KEYBOARD_INTERACTIVE_TIMEOUT_MS);

        pendingKbdInteractive.set(requestId, { resolve, reject, timer });

        options.emitKeyboardInteractive?.({
          requestId,
          name: name ?? "",
          instructions: instructions ?? "",
          prompts,
        });
      });
    };
  }

  const handleConnect = async (
    _event: IpcMainInvokeEvent,
    rawRequest: unknown
  ) => {
    const request = sftpConnectRequestSchema.parse(rawRequest);
    const hostId = resolveHostIdFromRequest(request, options.sessionManager);
    if (!hostId) {
      throw new Error("Unable to resolve SFTP host");
    }

    const connectOptions = await options.resolveConnectionOptions(hostId, request);
    if (!connectOptions) {
      throw new Error(`Unable to resolve SFTP connection options for ${hostId}`);
    }

    // --- Host key verification ---
    const hostname = connectOptions.hostname;
    const port = connectOptions.port ?? 22;

    const trustedFingerprints = fingerprintRepo
      .findByHost(hostname, port)
      .filter((record) => record.isTrusted)
      .map((record) => record.fingerprint);

    await verifyHostKey(hostname, port, fingerprintRepo, trustedFingerprints);

    ensureBookmarkHost(hostId, connectOptions, hostsRepo);

    const sftpSessionId = await sftpSessionManager.connect(hostId, connectOptions, {
      onKeyboardInteractive: createKeyboardInteractiveCallback(),
      trustedHostFingerprints: trustedFingerprints,
      pool: options.connectionPool,
    });
    options.onConnected?.({
      sftpSessionId,
      hostId,
      connectionOptions: connectOptions,
    });
    return { sftpSessionId };
  };

  const handleDisconnect = async (
    _event: IpcMainInvokeEvent,
    rawRequest: unknown
  ) => {
    const request = sftpDisconnectRequestSchema.parse(rawRequest);
    editorWindowManager.notifySessionClosed(request.sftpSessionId);
    sftpSessionManager.disconnect(request.sftpSessionId);
  };

  const handleList = async (_event: IpcMainInvokeEvent, rawRequest: unknown) => {
    const request = sftpListRequestSchema.parse(rawRequest);
    const transport = sftpSessionManager.getTransport(request.sftpSessionId);
    return { entries: await transport.list(request.path) };
  };

  const handleStat = async (_event: IpcMainInvokeEvent, rawRequest: unknown) => {
    const request = sftpStatRequestSchema.parse(rawRequest);
    return sftpSessionManager.getTransport(request.sftpSessionId).stat(request.path);
  };

  const handleChmod = async (_event: IpcMainInvokeEvent, rawRequest: unknown) => {
    const request = sftpChmodRequestSchema.parse(rawRequest);
    await sftpSessionManager
      .getTransport(request.sftpSessionId)
      .chmod(request.path, request.permissions);
  };

  const handleMkdir = async (_event: IpcMainInvokeEvent, rawRequest: unknown) => {
    const request = sftpMkdirRequestSchema.parse(rawRequest);
    await sftpSessionManager.getTransport(request.sftpSessionId).mkdir(request.path);
  };

  const handleRename = async (_event: IpcMainInvokeEvent, rawRequest: unknown) => {
    const request = sftpRenameRequestSchema.parse(rawRequest);
    await sftpSessionManager.getTransport(request.sftpSessionId).rename(request.oldPath, request.newPath);
  };

  const handleDelete = async (_event: IpcMainInvokeEvent, rawRequest: unknown) => {
    const request = sftpDeleteRequestSchema.parse(rawRequest);
    await sftpSessionManager.getTransport(request.sftpSessionId).remove(request.path, request.recursive);
  };

  const handleReadFile = async (_event: IpcMainInvokeEvent, rawRequest: unknown) => {
    const request = sftpReadFileRequestSchema.parse(rawRequest);
    const buffer = await sftpSessionManager.getTransport(request.sftpSessionId).readFile(request.path);
    return normalizeFileContent(buffer);
  };

  const handleWriteFile = async (_event: IpcMainInvokeEvent, rawRequest: unknown) => {
    const request = sftpWriteFileRequestSchema.parse(rawRequest);
    const content = request.encoding === "base64"
      ? Buffer.from(request.content, "base64")
      : Buffer.from(request.content, "utf8");
    await sftpSessionManager.getTransport(request.sftpSessionId).writeFile(request.path, content);
  };

  const handleTransferStart = async (_event: IpcMainInvokeEvent, rawRequest: unknown) => {
    const request = sftpTransferStartRequestSchema.parse(rawRequest);
    const transport = sftpSessionManager.getTransport(request.sftpSessionId);
    const session = sftpSessionManager.getSession(request.sftpSessionId);
    return transferManager.enqueue(
      request.sftpSessionId,
      transport,
      request.operations,
      undefined,
      session?.connectionOptions ?? null
    );
  };

  const handleTransferCancel = async (_event: IpcMainInvokeEvent, rawRequest: unknown) => {
    const request = sftpTransferCancelRequestSchema.parse(rawRequest);
    transferManager.cancel(request.transferId);
  };

  const handleTransferPause = async (_event: IpcMainInvokeEvent, rawRequest: unknown) => {
    const request: SftpTransferPauseRequest = sftpTransferPauseRequestSchema.parse(rawRequest);
    transferManager.pause(request.transferId);
  };

  const handleTransferResume = async (_event: IpcMainInvokeEvent, rawRequest: unknown) => {
    const request: SftpTransferResumeRequest = sftpTransferResumeRequestSchema.parse(rawRequest);
    transferManager.resume(request.transferId);
  };

  const handleTransferRetry = async (_event: IpcMainInvokeEvent, rawRequest: unknown) => {
    const request = sftpTransferRetryRequestSchema.parse(rawRequest);
    const entries = manifest.load();
    const entry = entries.find((e) => e.transferId === request.transferId);
    if (!entry) {
      throw new Error(`No persisted transfer found for ${request.transferId}`);
    }

    const transport = sftpSessionManager.getTransport(entry.sftpSessionId);
    manifest.remove(entry.transferId);

    const job = transferManager.enqueueResume(entry.sftpSessionId, transport, {
      transferId: entry.transferId,
      type: entry.type,
      localPath: entry.localPath,
      remotePath: entry.remotePath,
      bytesTransferred: entry.bytesTransferred,
      totalBytes: entry.totalBytes,
      batchId: entry.batchId,
    });

    return job;
  };

  const handleTransferList = async () => {
    return { transfers: transferManager.list() };
  };

  const handleTransferResolveConflict = async (
    _event: IpcMainInvokeEvent,
    rawRequest: unknown
  ) => {
    const request = sftpTransferResolveConflictRequestSchema.parse(rawRequest);
    transferManager.resolveConflict(
      request.transferId,
      request.resolution,
      request.applyToAll
    );
  };

  const handleBookmarksList = async (_event: IpcMainInvokeEvent, rawRequest: unknown) => {
    const request = sftpBookmarkListRequestSchema.parse(rawRequest);
    return bookmarksRepo.list(request.hostId);
  };

  const handleBookmarksUpsert = async (_event: IpcMainInvokeEvent, rawRequest: unknown) => {
    const request = sftpBookmarkUpsertRequestSchema.parse(rawRequest);
    if (!hostsRepo.get(request.hostId)) {
      throw new Error(`Host ${request.hostId} not found — cannot create bookmark for unknown host`);
    }

    return bookmarksRepo.upsert(request);
  };

  const handleBookmarksRemove = async (_event: IpcMainInvokeEvent, rawRequest: unknown) => {
    const request = sftpBookmarkRemoveRequestSchema.parse(rawRequest);
    bookmarksRepo.remove(request.id);
  };

  const handleBookmarksReorder = async (_event: IpcMainInvokeEvent, rawRequest: unknown) => {
    const request = sftpBookmarkReorderRequestSchema.parse(rawRequest);
    bookmarksRepo.reorder(request.bookmarkIds);
  };

  const syncEngine = createSyncEngine();

  const handleSyncStart = async (_event: IpcMainInvokeEvent, rawRequest: unknown) => {
    const request = sftpSyncStartRequestSchema.parse(rawRequest);
    const transport = sftpSessionManager.getTransport(request.sftpSessionId);
    const syncId = syncEngine.start(transport, {
      localPath: request.localPath,
      remotePath: request.remotePath,
      direction: request.direction,
      excludePatterns: request.excludePatterns,
      deleteOrphans: request.deleteOrphans,
    });
    // Run sync in background — events emitted via syncEvent channel
    void syncEngine.runOnce(syncId);
    return { syncId };
  };

  const handleSyncStop = async (_event: IpcMainInvokeEvent, rawRequest: unknown) => {
    const request = sftpSyncStopRequestSchema.parse(rawRequest);
    syncEngine.stop(request.syncId);
  };

  const handleSyncList = async () => {
    return { syncs: syncEngine.list() };
  };

  const scheduleDragOutCleanup = (cacheKey: string, tempPath: string, isDirectory?: boolean) => {
    const pathsToCleanup = [tempPath];
    if (isDirectory && tempPath.endsWith(".zip")) {
      pathsToCleanup.push(tempPath.slice(0, -".zip".length));
    }

    setTimeout(() => {
      for (const pathToCleanup of pathsToCleanup) {
        try {
          fs.rmSync(pathToCleanup, { recursive: true, force: true });
        } catch {
          // best-effort; leave for startup prune
        }
      }
      if (dragCache.get(cacheKey) === tempPath) {
        dragCache.delete(cacheKey);
      }
    }, DRAG_OUT_POST_DRAG_DELAY_MS).unref();
  };

  const startNativeDragOutFromCache = async (
    sender: IpcMainEvent["sender"],
    request: { isDirectory?: boolean; prepareOnly?: boolean },
    cacheKey: string
  ): Promise<string> => {
    const tempPath = dragCache.get(cacheKey);
    const hadCachedTempPath = Boolean(tempPath && fs.existsSync(tempPath));
    if (!tempPath || !shouldStartNativeDragOut(request, hadCachedTempPath)) {
      return "";
    }

    // Windows rejects startDrag with an empty/placeholder NativeImage. Ask
    // the shell for the real icon of the staged file (e.g. the .zip icon) and
    // fall back to the stub only if that fails.
    let icon: Electron.NativeImage;
    try {
      icon = await app.getFileIcon(tempPath, { size: "small" });
      if (icon.isEmpty()) throw new Error("empty icon");
    } catch {
      icon = createDragOutIcon();
    }

    sender.startDrag({ file: tempPath, icon });
    scheduleDragOutCleanup(cacheKey, tempPath, request.isDirectory);
    return tempPath;
  };

  const handleDragOut = async (event: IpcMainInvokeEvent, rawRequest: unknown) => {
    const request = sftpDragOutRequestSchema.parse(rawRequest);

    const cacheKey = `${request.sftpSessionId}:${request.remotePath}`;

    // Check cache first — file may have been pre-downloaded on selection
    let tempPath = dragCache.get(cacheKey);
    const hadCachedTempPath = Boolean(tempPath && fs.existsSync(tempPath));

    if (!hadCachedTempPath) {
      const stageTask = stageDragOutItemOnce(cacheKey, request);

      if (request.isDirectory && !request.prepareOnly) {
        void stageTask.catch((error) => {
          console.warn("[sftp] Failed to stage drag-out item", error);
        });
        return { tempPath: "" };
      }

      try {
        tempPath = await stageTask;
      } catch (error) {
        console.warn("[sftp] Failed to stage drag-out item", error);
        return { tempPath: "" };
      }
    }

    // prepareOnly: just cache the file, don't initiate OS drag
    if (request.prepareOnly) {
      return { tempPath };
    }

    if (!tempPath || !shouldStartNativeDragOut(request, hadCachedTempPath)) {
      return { tempPath: tempPath ?? "" };
    }

    await startNativeDragOutFromCache(event.sender, request, cacheKey);

    return { tempPath };
  };

  const handleStartNativeDragOut = (event: IpcMainEvent, rawRequest: unknown) => {
    const request = sftpDragOutRequestSchema.parse(rawRequest);
    const cacheKey = `${request.sftpSessionId}:${request.remotePath}`;
    void startNativeDragOutFromCache(event.sender, request, cacheKey).catch((error) => {
      console.warn("[sftp] startNativeDragOut failed", error);
    });
  };

  const handleKeyboardInteractiveResponse = async (
    _event: IpcMainInvokeEvent,
    rawRequest: unknown
  ) => {
    const request = keyboardInteractiveResponseSchema.parse(rawRequest);
    const pending = pendingKbdInteractive.get(request.requestId);
    if (!pending) {
      console.warn("[sftp] Received keyboard-interactive response for unknown request:", request.requestId);
      return;
    }

    clearTimeout(pending.timer);
    pendingKbdInteractive.delete(request.requestId);
    pending.resolve(request.responses);
  };

  ipcMain.handle(ipcChannels.sftp.keyboardInteractiveResponse, handleKeyboardInteractiveResponse);
  ipcMain.handle(ipcChannels.sftp.connect, handleConnect);
  ipcMain.handle(ipcChannels.sftp.disconnect, handleDisconnect);
  ipcMain.handle(ipcChannels.sftp.list, handleList);
  ipcMain.handle(ipcChannels.sftp.stat, handleStat);
  ipcMain.handle(ipcChannels.sftp.chmod, handleChmod);
  ipcMain.handle(ipcChannels.sftp.mkdir, handleMkdir);
  ipcMain.handle(ipcChannels.sftp.rename, handleRename);
  ipcMain.handle(ipcChannels.sftp.delete, handleDelete);
  ipcMain.handle(ipcChannels.sftp.readFile, handleReadFile);
  ipcMain.handle(ipcChannels.sftp.writeFile, handleWriteFile);
  ipcMain.handle(ipcChannels.sftp.transferStart, handleTransferStart);
  ipcMain.handle(ipcChannels.sftp.transferCancel, handleTransferCancel);
  ipcMain.handle(ipcChannels.sftp.transferPause, handleTransferPause);
  ipcMain.handle(ipcChannels.sftp.transferResume, handleTransferResume);
  ipcMain.handle(ipcChannels.sftp.transferRetry, handleTransferRetry);
  ipcMain.handle(ipcChannels.sftp.transferList, handleTransferList);
  ipcMain.handle(ipcChannels.sftp.transferResolveConflict, handleTransferResolveConflict);
  ipcMain.handle(ipcChannels.sftp.bookmarksList, handleBookmarksList);
  ipcMain.handle(ipcChannels.sftp.bookmarksUpsert, handleBookmarksUpsert);
  ipcMain.handle(ipcChannels.sftp.bookmarksRemove, handleBookmarksRemove);
  ipcMain.handle(ipcChannels.sftp.bookmarksReorder, handleBookmarksReorder);
  ipcMain.handle(ipcChannels.sftp.syncStart, handleSyncStart);
  ipcMain.handle(ipcChannels.sftp.syncStop, handleSyncStop);
  ipcMain.handle(ipcChannels.sftp.syncList, handleSyncList);
  ipcMain.handle(ipcChannels.sftp.dragOut, handleDragOut);
  ipcMain.on?.(ipcChannels.sftp.startNativeDragOut, handleStartNativeDragOut);

  const unsubscribeSyncEvents = syncEngine.onEvent((event) => {
    options.emitSyncEvent?.(event);
  });

  const unsubscribeSftpSessionEvents = sftpSessionManager.onEvent((event) => {
    if (event.type === "status") {
      options.emitSftpEvent?.({
        kind: "status",
        sftpSessionId: event.sftpSessionId,
        state: event.state
      });
      return;
    }

    if (event.type === "error") {
      options.emitSftpEvent?.({
        kind: "status",
        sftpSessionId: event.sftpSessionId,
        state: "failed"
      });
      return;
    }

    if (event.type === "exit") {
      options.emitSftpEvent?.({
        kind: "status",
        sftpSessionId: event.sftpSessionId,
        state: "disconnected"
      });
    }
  });

  const unsubscribeTransferEvents = transferManager.onEvent((event) => {
    if (event.kind === "transfer-progress") {
      options.emitSftpEvent?.({
        kind: "transfer-progress",
        transferId: event.transferId,
        bytesTransferred: event.bytesTransferred,
        totalBytes: event.totalBytes,
        speed: event.speed,
        status: normalizeTransferStatus(event.status)
      });
      return;
    }

    if (event.kind === "transfer-complete") {
      if (event.status === "completed") {
        manifest.remove(event.transferId);
      } else if (event.status === "failed") {
        const details = transferManager.getJobDetails(event.transferId);
        if (details && details.status === "interrupted" && details.bytesTransferred > 0) {
          manifest.save({
            transferId: event.transferId,
            type: details.type,
            localPath: details.localPath,
            remotePath: details.remotePath,
            totalBytes: details.totalBytes,
            bytesTransferred: details.bytesTransferred,
            remoteMtime: new Date().toISOString(),
            remoteSize: details.totalBytes,
            sftpSessionId: details.sftpSessionId,
            batchId: details.batchId,
            interruptedAt: new Date().toISOString(),
          });
        }
      }

      options.emitSftpEvent?.({
        kind: "transfer-complete",
        transferId: event.transferId,
        status: event.status,
        error: event.error
      });
      return;
    }

    options.emitSftpEvent?.({
      kind: "transfer-conflict",
      transferId: event.transferId,
      remotePath: event.remotePath,
      localPath: event.localPath
    });
  });

  return () => {
    unsubscribeSftpSessionEvents();
    unsubscribeTransferEvents();
    unsubscribeSyncEvents();
    // Clean up any pending keyboard-interactive requests
    for (const [, pending] of pendingKbdInteractive) {
      clearTimeout(pending.timer);
      pending.reject(new Error("SFTP IPC shutdown"));
    }
    pendingKbdInteractive.clear();
    sftpSessionManager.disconnectAll();
    for (const channel of Object.values(ipcChannels.sftp)) {
      ipcMain.removeHandler?.(channel);
    }
    ipcMain.removeListener?.(ipcChannels.sftp.startNativeDragOut, handleStartNativeDragOut);
  };
}
