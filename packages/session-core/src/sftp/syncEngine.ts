import { randomUUID } from "node:crypto";
import { mkdir, readdir, stat as fsStat, writeFile } from "node:fs/promises";
import { dirname, join, posix } from "node:path";
import type { SftpTransportHandle } from "../transports/sftpTransport";

export interface SyncConfig {
  localPath: string;
  remotePath: string;
  direction: "local-to-remote" | "remote-to-local" | "bidirectional";
  excludePatterns: string[];
  deleteOrphans: boolean;
}

export interface SyncStatus {
  syncId: string;
  status: "scanning" | "syncing" | "idle" | "error" | "stopped";
  filesScanned: number;
  filesSynced: number;
  bytesTransferred: number;
  lastError: string | null;
  lastSyncAt: string | null;
}

export type SyncEvent =
  | { kind: "sync-progress"; syncId: string; filesScanned: number; filesSynced: number; currentFile: string }
  | { kind: "sync-complete"; syncId: string; filesSynced: number; bytesTransferred: number }
  | { kind: "sync-error"; syncId: string; error: string };

export type SyncEventListener = (event: SyncEvent) => void;

interface ManagedSync {
  syncId: string;
  config: SyncConfig;
  transport: SftpTransportHandle;
  status: SyncStatus;
  aborted: boolean;
}

export interface SyncEngine {
  start(transport: SftpTransportHandle, config: SyncConfig): string;
  stop(syncId: string): void;
  list(): SyncStatus[];
  runOnce(syncId: string): Promise<void>;
  onEvent(listener: SyncEventListener): () => void;
}

export function createSyncEngine(): SyncEngine {
  const syncs = new Map<string, ManagedSync>();
  const listeners = new Set<SyncEventListener>();

  function emit(event: SyncEvent): void {
    for (const listener of listeners) listener(event);
  }

  function shouldExclude(filePath: string, patterns: string[]): boolean {
    const segments = filePath.replace(/\\/g, "/").split("/");
    return patterns.some((pattern) =>
      segments.some((seg) => seg === pattern || seg.startsWith(pattern + "."))
    );
  }

  async function ensureRemoteDirExists(
    transport: SftpTransportHandle,
    remoteDir: string
  ): Promise<void> {
    const normalized = remoteDir.replace(/\\/g, "/");
    const segments = normalized.split("/").filter((segment) => segment.length > 0);
    let current = normalized.startsWith("/") ? "/" : "";

    for (const segment of segments) {
      current = current === "/" ? `/${segment}` : `${current}/${segment}`;
      try {
        await transport.mkdir(current);
      } catch {
        // Directory may already exist.
      }
    }
  }

  async function scanLocalDir(dir: string): Promise<Array<{ relativePath: string; size: number; mtime: number }>> {
    const results: Array<{ relativePath: string; size: number; mtime: number }> = [];
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isFile()) {
        const st = await fsStat(fullPath);
        results.push({ relativePath: entry.name, size: st.size, mtime: st.mtimeMs / 1000 });
      } else if (entry.isDirectory()) {
        const subEntries = await scanLocalDir(fullPath);
        for (const sub of subEntries) {
          results.push({ relativePath: join(entry.name, sub.relativePath), size: sub.size, mtime: sub.mtime });
        }
      }
    }
    return results;
  }

  async function scanRemoteDir(
    transport: SftpTransportHandle,
    dir: string,
    relativeBase = ""
  ): Promise<Array<{ relativePath: string; path: string; size: number; modifiedAt: string }>> {
    const results: Array<{ relativePath: string; path: string; size: number; modifiedAt: string }> = [];
    const entries = await transport.list(dir);
    for (const entry of entries) {
      const relativePath = relativeBase
        ? posix.join(relativeBase, entry.name)
        : entry.name;
      if (entry.isDirectory) {
        const nested = await scanRemoteDir(transport, entry.path, relativePath);
        results.push(...nested);
        continue;
      }

      results.push({
        relativePath,
        path: entry.path,
        size: entry.size,
        modifiedAt: entry.modifiedAt
      });
    }

    return results;
  }

  return {
    start(transport, config) {
      const syncId = `sync-${randomUUID().replace(/-/g, "")}`;
      const managed: ManagedSync = {
        syncId,
        config,
        transport,
        aborted: false,
        status: {
          syncId,
          status: "idle",
          filesScanned: 0,
          filesSynced: 0,
          bytesTransferred: 0,
          lastError: null,
          lastSyncAt: null,
        },
      };
      syncs.set(syncId, managed);
      return syncId;
    },

    stop(syncId) {
      const managed = syncs.get(syncId);
      if (managed) {
        managed.aborted = true;
        managed.status.status = "stopped";
      }
      syncs.delete(syncId);
    },

    list() {
      return [...syncs.values()].map((s) => ({ ...s.status }));
    },

    async runOnce(syncId) {
      const managed = syncs.get(syncId);
      if (!managed || managed.aborted) return;

      const { config, transport } = managed;
      managed.status.status = "scanning";

      try {
        if (config.direction === "local-to-remote" || config.direction === "bidirectional") {
          const localFiles = await scanLocalDir(config.localPath);
          managed.status.filesScanned = localFiles.length;
          managed.status.status = "syncing";
          let synced = 0;

          for (const file of localFiles) {
            if (managed.aborted) break;
            if (shouldExclude(file.relativePath, config.excludePatterns)) continue;

            const remotePath = `${config.remotePath}/${file.relativePath.replace(/\\/g, "/")}`;
            let needsUpload = false;

            try {
              const remoteStat = await transport.stat(remotePath);
              const remoteModTime = new Date(remoteStat.modifiedAt).getTime() / 1000;
              if (file.mtime > remoteModTime) {
                needsUpload = true;
              }
            } catch {
              needsUpload = true;
            }

            if (needsUpload) {
              emit({
                kind: "sync-progress",
                syncId,
                filesScanned: managed.status.filesScanned,
                filesSynced: synced,
                currentFile: file.relativePath,
              });

              const remoteDir = remotePath.substring(0, remotePath.lastIndexOf("/"));
              await ensureRemoteDirExists(transport, remoteDir);

              const { createReadStream } = await import("node:fs");
              const localStream = createReadStream(join(config.localPath, file.relativePath));
              const remoteStream = transport.createWriteStream(remotePath);
              await new Promise<void>((resolve, reject) => {
                remoteStream.on("close", resolve);
                remoteStream.on("error", reject);
                localStream.on("error", reject);
                localStream.pipe(remoteStream);
              });

              synced++;
              managed.status.filesSynced = synced;
              managed.status.bytesTransferred += file.size;
            }
          }
        }

        if (config.direction === "remote-to-local" || config.direction === "bidirectional") {
          const remoteFiles = await scanRemoteDir(transport, config.remotePath);
          managed.status.filesScanned += remoteFiles.length;
          managed.status.status = "syncing";

          for (const file of remoteFiles) {
            if (managed.aborted) break;
            if (shouldExclude(file.relativePath, config.excludePatterns)) continue;

            const localFilePath = join(config.localPath, file.relativePath);
            let needsDownload = false;

            try {
              const localStat = await fsStat(localFilePath);
              const remoteModTime = new Date(file.modifiedAt).getTime();
              if (remoteModTime > localStat.mtimeMs) {
                needsDownload = true;
              }
            } catch {
              needsDownload = true;
            }

            if (needsDownload) {
              emit({
                kind: "sync-progress",
                syncId,
                filesScanned: managed.status.filesScanned,
                filesSynced: managed.status.filesSynced,
                currentFile: file.relativePath,
              });

              const data = await transport.readFile(file.path);
              await mkdir(dirname(localFilePath), { recursive: true });
              await writeFile(localFilePath, data);

              managed.status.filesSynced++;
              managed.status.bytesTransferred += file.size;
            }
          }
        }

        managed.status.status = "idle";
        managed.status.lastSyncAt = new Date().toISOString();
        emit({
          kind: "sync-complete",
          syncId,
          filesSynced: managed.status.filesSynced,
          bytesTransferred: managed.status.bytesTransferred,
        });
      } catch (err) {
        managed.status.status = "error";
        managed.status.lastError = err instanceof Error ? err.message : String(err);
        emit({ kind: "sync-error", syncId, error: managed.status.lastError });
      }
    },

    onEvent(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
