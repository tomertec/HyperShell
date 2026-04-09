import { createHostsRepositoryFromDatabase, openDatabase, createSftpBookmarksRepository, createHostFingerprintRepositoryFromDatabase } from "@hypershell/db";
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
  sftpTransferStartRequestSchema,
  sftpWriteFileRequestSchema,
  sftpSyncStartRequestSchema,
  sftpSyncStopRequestSchema,
  keyboardInteractiveResponseSchema,
  type SftpEvent,
  type SftpSyncEvent,
  type SftpDeleteRequest,
  type SftpDisconnectRequest,
  type SftpConnectRequest,
  type SftpListRequest,
  type SftpMkdirRequest,
  type SftpReadFileRequest,
  type SftpRenameRequest,
  type SftpStatRequest,
  type SftpTransferCancelRequest,
  type SftpTransferPauseRequest,
  type SftpTransferResolveConflictRequest,
  type SftpTransferResumeRequest,
  type SftpTransferStartRequest,
  type SftpWriteFileRequest,
  type KeyboardInteractiveRequest,
} from "@hypershell/shared";
import type { SessionManager, SftpConnectionOptions, KeyboardInteractiveCallback } from "@hypershell/session-core";
import { createSyncEngine, probeHostKey } from "@hypershell/session-core";
import { timingSafeEqual } from "node:crypto";
import type { IpcMainInvokeEvent } from "electron";

import type { IpcMainLike } from "./registerIpc";
import { editorWindowManager } from "../windows/editorWindowManager";
import { createSftpSessionManager, type SftpSessionManager } from "../sftp/sftpSessionManager";
import { createTransferManager, type TransferManager } from "../sftp/transferManager";

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

export function registerSftpIpc(
  ipcMain: IpcMainLike,
  options: RegisterSftpIpcOptions
): () => void {
  const sftpSessionManager = createSftpSessionManager();
  const transferManager = createTransferManager({ autoStart: true, maxConcurrent: 1 });

  const db = options.db ?? openDatabase();
  const hostsRepo = createHostsRepositoryFromDatabase(db);
  const bookmarksRepo = createSftpBookmarksRepository(db);
  const fingerprintRepo = createHostFingerprintRepositoryFromDatabase(db);

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

    try {
      const { algorithm, fingerprint } = await probeHostKey(hostname, port);
      const existing = fingerprintRepo.findByHostAndAlgorithm(hostname, port, algorithm);

      if (!existing) {
          // First time seeing this host — require user approval
          throw new HostKeyVerificationError({
            hostname,
            port,
            algorithm,
            fingerprint,
            verificationStatus: "new_host",
          });
        } else if (
          existing.fingerprint.length !== fingerprint.length ||
          !timingSafeEqual(Buffer.from(existing.fingerprint), Buffer.from(fingerprint))
        ) {
          // Key has changed — possible MITM attack
          throw new HostKeyVerificationError({
            hostname,
            port,
            algorithm,
            fingerprint,
            verificationStatus: "key_changed",
            previousFingerprint: existing.fingerprint,
          });
        } else if (!existing.isTrusted) {
          // Key is known but not yet trusted
          throw new HostKeyVerificationError({
            hostname,
            port,
            algorithm,
            fingerprint,
            verificationStatus: "new_host",
          });
        }
        // else: key matches trusted fingerprint — proceed
        // Update last_seen
        fingerprintRepo.upsert({
          id: existing.id,
          hostname,
          port,
          algorithm,
          fingerprint,
        });
      } catch (error) {
        if (error instanceof HostKeyVerificationError) {
          throw error;
        }
        // If probe fails for network reasons, let the actual connect attempt handle it
        console.warn("[sftp] Host key probe failed, proceeding with connect:", (error as Error).message);
    }

    ensureBookmarkHost(hostId, connectOptions, hostsRepo);

    const sftpSessionId = await sftpSessionManager.connect(hostId, connectOptions, {
      onKeyboardInteractive: createKeyboardInteractiveCallback(),
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
    return transferManager.enqueue(request.sftpSessionId, transport, request.operations);
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
  ipcMain.handle(ipcChannels.sftp.transferList, handleTransferList);
  ipcMain.handle(ipcChannels.sftp.transferResolveConflict, handleTransferResolveConflict);
  ipcMain.handle(ipcChannels.sftp.bookmarksList, handleBookmarksList);
  ipcMain.handle(ipcChannels.sftp.bookmarksUpsert, handleBookmarksUpsert);
  ipcMain.handle(ipcChannels.sftp.bookmarksRemove, handleBookmarksRemove);
  ipcMain.handle(ipcChannels.sftp.bookmarksReorder, handleBookmarksReorder);
  ipcMain.handle(ipcChannels.sftp.syncStart, handleSyncStart);
  ipcMain.handle(ipcChannels.sftp.syncStop, handleSyncStop);
  ipcMain.handle(ipcChannels.sftp.syncList, handleSyncList);

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
  };
}
