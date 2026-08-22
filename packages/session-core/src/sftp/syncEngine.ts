import { randomBytes, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, rename, rm, stat as fsStat } from "node:fs/promises";
import { dirname, join, posix } from "node:path";
import { pipeline } from "node:stream/promises";
import {
  REMOTE_WRITE_TEMP_NAME,
  truncateForTempName,
  type SftpTransportHandle
} from "../transports/sftpTransport";

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
  | { kind: "sync-complete"; syncId: string; filesSynced: number; bytesTransferred: number; filesFailed: number }
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

/** Matches the temp names `buildTempPath` produces, on either side. */
const SYNC_TEMP_NAME = /\.hypershell-sync-[0-9a-f]{12}\.tmp$/;

/**
 * Sibling temp path for an in-progress transfer of `fullPath`.
 *
 * The random suffix matters: a fixed name would let two syncs racing the same
 * file (concurrent syncs, or a restart overlapping an in-flight run) clobber
 * each other's temp file, and whichever rename lands could leave a truncated
 * file at the real path with a fresh mtime — silently unfixable, since the
 * mtime check would then see it as already up to date on every future sync.
 *
 * The base name is trimmed to keep the result inside the 255-byte filename
 * ceiling, so an already-long name doesn't start failing to transfer.
 *
 * `side` decides what counts as a separator: remote SFTP paths are POSIX,
 * where a backslash is an ordinary filename character — treating it as a
 * separator there would compute the truncation budget against only the
 * fragment after it, letting a long backslash-bearing name overflow the
 * ceiling. Local paths keep both, since Windows accepts either.
 */
export function buildTempPath(fullPath: string, side: "local" | "remote"): string {
  const suffix = `.hypershell-sync-${randomBytes(6).toString("hex")}.tmp`;
  const separator =
    side === "remote"
      ? fullPath.lastIndexOf("/")
      : Math.max(fullPath.lastIndexOf("/"), fullPath.lastIndexOf("\\"));
  const directory = fullPath.slice(0, separator + 1);
  const baseName = fullPath.slice(separator + 1);
  return `${directory}${truncateForTempName(baseName, Buffer.byteLength(suffix))}${suffix}`;
}

export function createSyncEngine(): SyncEngine {
  const syncs = new Map<string, ManagedSync>();
  const listeners = new Set<SyncEventListener>();

  function emit(event: SyncEvent): void {
    for (const listener of listeners) listener(event);
  }

  function shouldExclude(filePath: string, patterns: string[]): boolean {
    const segments = filePath.replace(/\\/g, "/").split("/");

    // Temp files are never content, in either direction. A run killed
    // mid-transfer strands one on whichever side it was writing to, and
    // without this the next run would treat it as a real file and copy it to
    // the far end — where it would then look like content to the run after
    // that. Remote uploads go through the transport now, so its temp names
    // (including a partial left by a paused transfer-queue upload) are
    // excluded alongside sync's own local ones.
    if (
      segments.some(
        (segment) => SYNC_TEMP_NAME.test(segment) || REMOTE_WRITE_TEMP_NAME.test(segment)
      )
    ) {
      return true;
    }

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
      const failures: Array<{ path: string; error: string }> = [];

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

              // transport.upload owns the write invariant — sibling temp file,
              // mode preservation, rename into place, temp cleanup on failure.
              // Streaming straight onto the live path would leave a truncated
              // file there if the transfer dies, and the truncated copy carries
              // a fresh mtime, so every later run considers it up to date.
              try {
                const remoteDir = remotePath.substring(0, remotePath.lastIndexOf("/"));
                await ensureRemoteDirExists(transport, remoteDir);

                await transport.upload(join(config.localPath, file.relativePath), remotePath);

                synced++;
                managed.status.filesSynced = synced;
                managed.status.bytesTransferred += file.size;
              } catch (fileError) {
                // One unreadable/unwritable file must not abandon the rest of
                // the run. When the rename unlinked the destination and then
                // failed, the transport keeps the temp file (the only surviving
                // copy) and its error message says where it is.
                failures.push({
                  path: file.relativePath,
                  error: fileError instanceof Error ? fileError.message : String(fileError),
                });
              }
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

              // Stream rather than buffer: transport.readFile() is the editor's
              // API and rejects anything over 10 MB, which silently made sync
              // unusable for real payloads.
              const tempPath = buildTempPath(localFilePath, "local");
              try {
                await mkdir(dirname(localFilePath), { recursive: true });

                const remoteStream = transport.createReadStream(file.path);
                const localStream = createWriteStream(tempPath);
                await pipeline(remoteStream, localStream);

                await rename(tempPath, localFilePath);

                managed.status.filesSynced++;
                managed.status.bytesTransferred += file.size;
              } catch (fileError) {
                // One unreadable file must not abandon the rest of the run.
                failures.push({
                  path: file.relativePath,
                  error: fileError instanceof Error ? fileError.message : String(fileError),
                });
                await rm(tempPath, { force: true }).catch(() => {});
              }
            }
          }
        }

        managed.status.status = "idle";
        managed.status.lastSyncAt = new Date().toISOString();
        managed.status.lastError =
          failures.length > 0
            ? `${failures.length} file(s) failed; first: ${failures[0].path} — ${failures[0].error}`
            : null;

        emit({
          kind: "sync-complete",
          syncId,
          filesSynced: managed.status.filesSynced,
          bytesTransferred: managed.status.bytesTransferred,
          filesFailed: failures.length,
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
