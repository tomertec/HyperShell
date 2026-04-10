import {
  ipcChannels,
  createBackupRequestSchema,
  restoreBackupRequestSchema,
} from "@hypershell/shared";
import type { BackupInfo } from "@hypershell/shared";
import { app, dialog } from "electron";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";
import type { IpcMainLike } from "./registerIpc";
import { closeSharedDatabase } from "./hostsIpc";

const BACKUP_FILENAME_PREFIX = "hypershell-backup-";
const BACKUP_EXTENSION = ".db";
const MAX_AUTO_BACKUPS = 5;
const SQLITE_MAGIC = "SQLite format 3\0";

/**
 * Resolves the path to the HyperShell database file.
 * Mirrors the logic in hostsIpc.ts resolveDatabasePath().
 */
function getDatabasePath(): string {
  const stableDataDir = path.join(app.getPath("appData"), "HyperShell");
  return path.join(stableDataDir, "hypershell.db");
}

/** Directory where auto-backups are stored. */
export function getBackupDir(): string {
  const dir = path.join(app.getPath("appData"), "HyperShell", "backups");
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Generates a timestamped backup filename. */
export function generateBackupFilename(date: Date = new Date()): string {
  const ts = date.toISOString().replace(/:/g, "-").replace(/\.\d{3}Z$/, "");
  return `${BACKUP_FILENAME_PREFIX}${ts}${BACKUP_EXTENSION}`;
}

/**
 * Validates that the first 16 bytes of a file match the SQLite magic string.
 * Returns true if the file is a valid SQLite database.
 */
export function isValidSqliteFile(filePath: string): boolean {
  try {
    const fd = readFileSync(filePath, { encoding: null });
    if (fd.length < 16) {
      return false;
    }
    const header = fd.subarray(0, 16).toString("ascii");
    return header === SQLITE_MAGIC;
  } catch {
    return false;
  }
}

/**
 * Lists backup files in the given directory, sorted newest-first.
 */
export function listBackupFiles(dir: string): BackupInfo[] {
  if (!existsSync(dir)) {
    return [];
  }

  const files = readdirSync(dir)
    .filter(
      (f) =>
        f.startsWith(BACKUP_FILENAME_PREFIX) && f.endsWith(BACKUP_EXTENSION)
    )
    .map((fileName) => {
      const filePath = path.join(dir, fileName);
      const stats = statSync(filePath);
      return {
        filePath,
        fileName,
        size: stats.size,
        createdAt: stats.mtime.toISOString(),
      };
    })
    .sort((a, b) => {
      const timeDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return timeDiff !== 0 ? timeDiff : b.fileName.localeCompare(a.fileName);
    });

  return files;
}

/**
 * Rotates auto-backups keeping only the last `maxKeep` files.
 */
export function rotateBackups(dir: string, maxKeep: number = MAX_AUTO_BACKUPS): void {
  const backups = listBackupFiles(dir);
  if (backups.length <= maxKeep) {
    return;
  }

  const toDelete = backups.slice(maxKeep);
  for (const backup of toDelete) {
    try {
      unlinkSync(backup.filePath);
    } catch {
      // Ignore deletion failures (e.g. file in use)
    }
  }
}

/**
 * Performs an auto-backup of the database on app startup.
 * Copies the DB to the backup directory and rotates old backups.
 */
export function performAutoBackup(): void {
  const dbPath = getDatabasePath();
  if (!existsSync(dbPath)) {
    return;
  }

  const backupDir = getBackupDir();
  const backupFileName = generateBackupFilename();
  const backupPath = path.join(backupDir, backupFileName);

  try {
    copyFileSync(dbPath, backupPath);
    console.log("[hypershell] Auto-backup created:", backupPath);
    rotateBackups(backupDir, MAX_AUTO_BACKUPS);
  } catch (error) {
    console.warn("[hypershell] Auto-backup failed:", error);
  }
}

function removeSqliteSidecars(dbPath: string): void {
  for (const suffix of ["-wal", "-shm", "-journal"]) {
    const sidecarPath = `${dbPath}${suffix}`;
    if (!existsSync(sidecarPath)) {
      continue;
    }
    try {
      unlinkSync(sidecarPath);
    } catch {
      // Best effort cleanup.
    }
  }
}

export function registerBackupIpc(ipcMain: IpcMainLike): void {
  ipcMain.handle(
    ipcChannels.backup.create,
    async (_event: unknown, request: unknown) => {
      const parsed = createBackupRequestSchema.parse(request);
      const dbPath = getDatabasePath();

      if (!existsSync(dbPath)) {
        throw new Error("Database file not found");
      }

      copyFileSync(dbPath, parsed.filePath);
      const stats = statSync(parsed.filePath);

      return {
        filePath: parsed.filePath,
        size: stats.size,
        createdAt: stats.mtime.toISOString(),
      };
    }
  );

  ipcMain.handle(
    ipcChannels.backup.restore,
    async (_event: unknown, request: unknown) => {
      const parsed = restoreBackupRequestSchema.parse(request);

      if (!existsSync(parsed.filePath)) {
        throw new Error("Backup file not found");
      }

      if (!isValidSqliteFile(parsed.filePath)) {
        throw new Error(
          "Invalid backup file: not a valid SQLite database"
        );
      }

      const dbPath = getDatabasePath();
      const dbDir = path.dirname(dbPath);
      mkdirSync(dbDir, { recursive: true });

      const restoreTempPath = path.join(
        dbDir,
        `hypershell.restore.${Date.now()}.tmp`
      );

      // Release any live SQLite handles before replacing the DB files.
      closeSharedDatabase();

      // Create a safety backup of the current DB before restoring
      const backupDir = getBackupDir();
      const safetyBackupName = generateBackupFilename();
      const safetyBackupPath = path.join(backupDir, safetyBackupName);
      if (existsSync(dbPath)) {
        copyFileSync(dbPath, safetyBackupPath);
      }

      try {
        copyFileSync(parsed.filePath, restoreTempPath);
        removeSqliteSidecars(dbPath);
        if (existsSync(dbPath)) {
          unlinkSync(dbPath);
        }
        renameSync(restoreTempPath, dbPath);
        removeSqliteSidecars(dbPath);
      } finally {
        if (existsSync(restoreTempPath)) {
          try {
            unlinkSync(restoreTempPath);
          } catch {
            // Best effort temp cleanup.
          }
        }
      }

      return { requiresRestart: true };
    }
  );

  ipcMain.handle(ipcChannels.backup.list, async () => {
    const backupDir = getBackupDir();
    const backups = listBackupFiles(backupDir);
    return { backups };
  });

  ipcMain.handle(
    ipcChannels.backup.showOpenDialog,
    async () => {
      const result = await dialog.showOpenDialog({
        properties: ["openFile"],
        filters: [
          { name: "SQLite Database", extensions: ["db"] },
          { name: "All Files", extensions: ["*"] },
        ],
      });
      return result.canceled ? null : result.filePaths[0] ?? null;
    }
  );
}
