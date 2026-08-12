import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface PersistedTransfer {
  transferId: string;
  type: "upload" | "download";
  localPath: string;
  remotePath: string;
  totalBytes: number;
  bytesTransferred: number;
  remoteMtime: string;
  remoteSize: number;
  sftpSessionId: string;
  batchId: string;
  interruptedAt: string;
}

export interface TransferManifest {
  save(entry: PersistedTransfer): void;
  remove(transferId: string): void;
  load(): PersistedTransfer[];
  prune(maxAgeMs: number): void;
  loadBySession(sftpSessionId: string): PersistedTransfer[];
}

export function createTransferManifest(directory: string): TransferManifest {
  const filePath = join(directory, "transfers.json");

  // A manifest we cannot read is discarded, and the next save() overwrites it —
  // so say so, otherwise resumable-transfer history vanishes without a trace.
  function readAll(): PersistedTransfer[] {
    if (!existsSync(filePath)) return [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(filePath, "utf8"));
    } catch (e) {
      console.warn(`[hypershell] Discarding unreadable transfer manifest ${filePath}:`, e);
      return [];
    }

    if (!Array.isArray(parsed)) {
      console.warn(`[hypershell] Discarding transfer manifest ${filePath}: expected an array`);
      return [];
    }

    return parsed as PersistedTransfer[];
  }

  function writeAll(entries: PersistedTransfer[]): void {
    writeFileSync(filePath, JSON.stringify(entries, null, 2), "utf8");
  }

  return {
    save(entry) {
      const entries = readAll().filter((e) => e.transferId !== entry.transferId);
      entries.push(entry);
      writeAll(entries);
    },

    remove(transferId) {
      writeAll(readAll().filter((e) => e.transferId !== transferId));
    },

    load() {
      return readAll();
    },

    prune(maxAgeMs) {
      const cutoff = Date.now() - maxAgeMs;
      writeAll(readAll().filter((e) => new Date(e.interruptedAt).getTime() > cutoff));
    },

    loadBySession(sftpSessionId) {
      return readAll().filter((e) => e.sftpSessionId === sftpSessionId);
    },
  };
}
