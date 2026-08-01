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
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import type { IpcMainLike } from "./registerIpc";
import { closeSharedDatabase } from "./hostsIpc";
import {
  assertAbsolutePath,
  assertNotWindowsDevicePath,
  assertPathWithinAllowedRoots,
} from "../security/pathPolicy";

const BACKUP_FILENAME_PREFIX = "hypershell-backup-";
const BACKUP_EXTENSION = ".db";
const MAX_AUTO_BACKUPS = 5;
const SQLITE_MAGIC = "SQLite format 3\0";
const ALLOWED_BACKUP_EXTENSIONS = new Set([".db", ".sqlite", ".sqlite3"]);
const trustedDialogBackupPaths = new Set<string>();

/**
 * Tables a restore candidate must contain to be a HyperShell database.
 * Deliberately a small core subset — later migrations add tables that older
 * (but still restorable) backups legitimately lack.
 */
const REQUIRED_TABLES = ["hosts", "host_groups", "app_settings"];

/**
 * `packages/db` applies idempotent DDL on every open and never writes
 * `PRAGMA user_version`, so every database this build produces reports 0.
 * A higher value means the file came from a newer schema (or another app)
 * that this build cannot be trusted to read.
 */
const MAX_SUPPORTED_USER_VERSION = 0;

// `require` is injected by the esbuild banner in the bundled main process, but
// not when these modules are loaded directly (tests). Bind it explicitly so the
// native module resolves in both.
const requireNative = createRequire(import.meta.url);

type SqliteOnlineBackupDatabase = {
  pragma(command: string, options?: { simple?: boolean }): unknown;
  exec(sql: string): unknown;
  prepare(sql: string): { all(): unknown[] };
  backup?: (destinationPath: string) => Promise<unknown>;
  close(): void;
};

export interface SqliteBackupValidation {
  valid: boolean;
  /** Human-readable failure cause. Present only when `valid` is false. */
  reason?: string;
}

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

function openSqliteDatabaseForBackup(dbPath: string): SqliteOnlineBackupDatabase {
  const Database = requireNative("better-sqlite3");
  return new Database(dbPath, { fileMustExist: true }) as SqliteOnlineBackupDatabase;
}

function openSqliteDatabaseReadOnly(dbPath: string): SqliteOnlineBackupDatabase {
  const Database = requireNative("better-sqlite3");
  return new Database(dbPath, {
    readonly: true,
    fileMustExist: true,
  }) as SqliteOnlineBackupDatabase;
}

function assertSafeBackupPath(
  filePath: string,
  options: { allowTrustedDialogSelection?: boolean } = {}
): string {
  const resolved = assertAbsolutePath(filePath, "Absolute path is required for backup files");
  assertNotWindowsDevicePath(resolved);

  const extension = path.extname(resolved).toLowerCase();
  if (!ALLOWED_BACKUP_EXTENSIONS.has(extension)) {
    throw new Error("Backup file must use a SQLite extension (.db, .sqlite, .sqlite3)");
  }

  if (options.allowTrustedDialogSelection && trustedDialogBackupPaths.has(resolved)) {
    return resolved;
  }

  const allowedRoots = [homedir(), tmpdir(), getBackupDir()].map((root) => path.resolve(root));
  assertPathWithinAllowedRoots(
    resolved,
    allowedRoots,
    "Backup path must be within the user home, temp, or HyperShell backup directory"
  );

  return resolved;
}

function trustBackupPathFromDialog(filePath: string): string {
  const resolved = assertAbsolutePath(filePath, "Absolute path is required for backup files");
  assertNotWindowsDevicePath(resolved);
  const extension = path.extname(resolved).toLowerCase();
  if (!ALLOWED_BACKUP_EXTENSIONS.has(extension)) {
    throw new Error("Backup file must use a SQLite extension (.db, .sqlite, .sqlite3)");
  }
  trustedDialogBackupPaths.add(resolved);
  return resolved;
}

async function createConsistentBackup(sourcePath: string, destinationPath: string): Promise<void> {
  const resolvedSource = path.resolve(sourcePath);
  const resolvedDestination = path.resolve(destinationPath);
  const samePath = process.platform === "win32"
    ? resolvedSource.toLowerCase() === resolvedDestination.toLowerCase()
    : resolvedSource === resolvedDestination;
  if (samePath) {
    throw new Error("Backup destination must be different from the source database path");
  }

  if (existsSync(resolvedDestination)) {
    unlinkSync(resolvedDestination);
  }

  const db = openSqliteDatabaseForBackup(resolvedSource);
  try {
    db.pragma("busy_timeout = 5000");

    if (typeof db.backup === "function") {
      await db.backup(resolvedDestination);
      return;
    }

    const escapedDestination = resolvedDestination.replace(/'/g, "''");
    db.exec(`VACUUM INTO '${escapedDestination}'`);
  } finally {
    db.close();
  }
}

/** Generates a timestamped backup filename. */
export function generateBackupFilename(date: Date = new Date()): string {
  const ts = date.toISOString().replace(/:/g, "-").replace(/\.\d{3}Z$/, "");
  return `${BACKUP_FILENAME_PREFIX}${ts}${BACKUP_EXTENSION}`;
}

/**
 * Cheap first pass: the first 16 bytes must match the SQLite magic string.
 * Passing this proves nothing about the contents — see `validateSqliteBackup`.
 */
export function hasSqliteHeader(filePath: string): boolean {
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

function toFailureReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readQuickCheckResult(db: SqliteOnlineBackupDatabase): string {
  const rows = db.pragma("quick_check") as unknown;
  if (!Array.isArray(rows) || rows.length === 0) {
    return "no result";
  }

  const first = rows[0];
  if (typeof first === "string") {
    return first;
  }
  if (first && typeof first === "object") {
    const [value] = Object.values(first as Record<string, unknown>);
    return String(value);
  }

  return String(first);
}

/**
 * Fully validates a restore candidate before it is allowed to replace the live
 * database: the file must open as SQLite, pass `PRAGMA quick_check`, report a
 * schema version this build understands, and contain the core HyperShell
 * tables. A header-correct but structurally corrupt file fails here.
 */
export function validateSqliteBackup(filePath: string): SqliteBackupValidation {
  if (!hasSqliteHeader(filePath)) {
    return { valid: false, reason: "file does not start with a SQLite header" };
  }

  let db: SqliteOnlineBackupDatabase;
  try {
    db = openSqliteDatabaseReadOnly(filePath);
  } catch (error) {
    return { valid: false, reason: `database could not be opened (${toFailureReason(error)})` };
  }

  try {
    const quickCheck = readQuickCheckResult(db);
    if (quickCheck.toLowerCase() !== "ok") {
      return { valid: false, reason: `integrity check failed (${quickCheck})` };
    }

    const userVersion = Number(db.pragma("user_version", { simple: true }));
    if (!Number.isInteger(userVersion) || userVersion > MAX_SUPPORTED_USER_VERSION) {
      return {
        valid: false,
        reason: `unsupported schema version ${userVersion} (expected at most ${MAX_SUPPORTED_USER_VERSION})`,
      };
    }

    const tableRows = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as Array<{ name?: unknown }>;
    const presentTables = new Set(
      tableRows.map((row) => String(row?.name ?? ""))
    );
    const missingTables = REQUIRED_TABLES.filter((table) => !presentTables.has(table));
    if (missingTables.length > 0) {
      return {
        valid: false,
        reason: `missing required tables: ${missingTables.join(", ")}`,
      };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, reason: `database could not be read (${toFailureReason(error)})` };
  } finally {
    try {
      db.close();
    } catch {
      // Best effort — the handle is read-only and about to be discarded.
    }
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
export async function performAutoBackup(): Promise<void> {
  const dbPath = getDatabasePath();
  if (!existsSync(dbPath)) {
    return;
  }

  const backupDir = getBackupDir();
  const backupFileName = generateBackupFilename();
  const backupPath = path.join(backupDir, backupFileName);

  try {
    await createConsistentBackup(dbPath, backupPath);
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
      const safeDestinationPath = assertSafeBackupPath(parsed.filePath);

      if (!existsSync(dbPath)) {
        throw new Error("Database file not found");
      }

      await createConsistentBackup(dbPath, safeDestinationPath);
      const stats = statSync(safeDestinationPath);

      return {
        filePath: safeDestinationPath,
        size: stats.size,
        createdAt: stats.mtime.toISOString(),
      };
    }
  );

  ipcMain.handle(
    ipcChannels.backup.restore,
    async (_event: unknown, request: unknown) => {
      const parsed = restoreBackupRequestSchema.parse(request);
      const safeRestorePath = assertSafeBackupPath(parsed.filePath, {
        allowTrustedDialogSelection: true,
      });
      trustedDialogBackupPaths.delete(safeRestorePath);

      if (!existsSync(safeRestorePath)) {
        throw new Error("Backup file not found");
      }

      const candidateValidation = validateSqliteBackup(safeRestorePath);
      if (!candidateValidation.valid) {
        throw new Error(
          `Invalid backup file: ${candidateValidation.reason ?? "not a valid HyperShell database"}`
        );
      }

      const dbPath = getDatabasePath();
      const dbDir = path.dirname(dbPath);
      mkdirSync(dbDir, { recursive: true });

      const restoreTempPath = path.join(
        dbDir,
        `hypershell.restore.${Date.now()}.tmp`
      );
      const rollbackPath = path.join(
        dbDir,
        `hypershell.rollback.${Date.now()}.tmp`
      );

      // Create a safety backup of the current DB before restoring.
      const backupDir = getBackupDir();
      const safetyBackupName = generateBackupFilename();
      const safetyBackupPath = path.join(backupDir, safetyBackupName);
      if (existsSync(dbPath)) {
        await createConsistentBackup(dbPath, safetyBackupPath);
      }

      // Release any live SQLite handles before replacing the DB files.
      closeSharedDatabase();

      let movedCurrentToRollback = false;
      let restoreApplied = false;
      try {
        copyFileSync(safeRestorePath, restoreTempPath);
        const copyValidation = validateSqliteBackup(restoreTempPath);
        if (!copyValidation.valid) {
          throw new Error(
            `Restore failed: copied backup is not a valid HyperShell database (${
              copyValidation.reason ?? "unknown reason"
            })`
          );
        }
        removeSqliteSidecars(dbPath);

        if (existsSync(dbPath)) {
          renameSync(dbPath, rollbackPath);
          movedCurrentToRollback = true;
        }

        renameSync(restoreTempPath, dbPath);
        restoreApplied = true;
        removeSqliteSidecars(dbPath);
      } catch (error) {
        if (!restoreApplied && movedCurrentToRollback && existsSync(rollbackPath)) {
          if (existsSync(dbPath)) {
            try {
              unlinkSync(dbPath);
            } catch {
              // Best effort cleanup before rollback restore.
            }
          }
          try {
            renameSync(rollbackPath, dbPath);
          } catch {
            // If rollback recovery fails, propagate the original restore error.
          }
        }
        throw error;
      } finally {
        if (existsSync(restoreTempPath)) {
          try {
            unlinkSync(restoreTempPath);
          } catch {
            // Best effort temp cleanup.
          }
        }
        if (restoreApplied && existsSync(rollbackPath)) {
          try {
            unlinkSync(rollbackPath);
          } catch {
            // Best effort rollback file cleanup.
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
          { name: "SQLite Database", extensions: ["db", "sqlite", "sqlite3"] },
        ],
      });
      if (result.canceled) {
        return null;
      }
      const selectedPath = result.filePaths[0];
      return selectedPath ? trustBackupPathFromDialog(selectedPath) : null;
    }
  );
}
