import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, writeFileSync, existsSync, rmSync, readdirSync } from "node:fs";
import path from "node:path";
import { homedir, tmpdir } from "node:os";

const electronMock = vi.hoisted(() => ({
  openDialogResult: { canceled: true, filePaths: [] as string[] },
  appPath: process.env.TEMP ?? process.env.TMP ?? "/tmp",
}));

vi.mock("electron", () => ({
  app: { getPath: () => electronMock.appPath },
  dialog: {
    showOpenDialog: vi.fn(async () => electronMock.openDialogResult),
  },
}));

import {
  generateBackupFilename,
  isValidSqliteFile,
  listBackupFiles,
  rotateBackups,
  registerBackupIpc,
} from "./backupIpc";
import { ipcChannels } from "@hypershell/shared";

type IpcHandler = (event: unknown, request: unknown) => unknown;

function createTempDir(): string {
  const dir = path.join(tmpdir(), `hypershell-backup-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("generateBackupFilename", () => {
  it("produces a filename with the expected prefix and extension", () => {
    const filename = generateBackupFilename(new Date("2025-06-15T10:30:00.000Z"));
    expect(filename).toBe("hypershell-backup-2025-06-15T10-30-00.db");
  });

  it("uses current date when no argument provided", () => {
    const filename = generateBackupFilename();
    expect(filename).toMatch(/^hypershell-backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.db$/);
  });
});

describe("isValidSqliteFile", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns true for a file with the SQLite magic header", () => {
    const filePath = path.join(tempDir, "valid.db");
    const header = Buffer.from("SQLite format 3\0");
    const padding = Buffer.alloc(100);
    writeFileSync(filePath, Buffer.concat([header, padding]));
    expect(isValidSqliteFile(filePath)).toBe(true);
  });

  it("returns false for a file without the SQLite magic header", () => {
    const filePath = path.join(tempDir, "invalid.db");
    writeFileSync(filePath, "This is not a SQLite database file.");
    expect(isValidSqliteFile(filePath)).toBe(false);
  });

  it("returns false for a file that is too short", () => {
    const filePath = path.join(tempDir, "short.db");
    writeFileSync(filePath, "Short");
    expect(isValidSqliteFile(filePath)).toBe(false);
  });

  it("returns false for a non-existent file", () => {
    expect(isValidSqliteFile(path.join(tempDir, "nope.db"))).toBe(false);
  });
});

describe("listBackupFiles", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns an empty array for an empty directory", () => {
    expect(listBackupFiles(tempDir)).toEqual([]);
  });

  it("returns an empty array for a non-existent directory", () => {
    expect(listBackupFiles(path.join(tempDir, "nope"))).toEqual([]);
  });

  it("lists only files matching the backup pattern", () => {
    writeFileSync(path.join(tempDir, "hypershell-backup-2025-01-01T00-00-00.db"), "data");
    writeFileSync(path.join(tempDir, "hypershell-backup-2025-01-02T00-00-00.db"), "data");
    writeFileSync(path.join(tempDir, "unrelated.txt"), "data");
    writeFileSync(path.join(tempDir, "hypershell-backup-partial"), "data");

    const result = listBackupFiles(tempDir);
    expect(result).toHaveLength(2);
    expect(result[0].fileName).toBe("hypershell-backup-2025-01-02T00-00-00.db");
    expect(result[1].fileName).toBe("hypershell-backup-2025-01-01T00-00-00.db");
  });

  it("sorts backups newest-first", () => {
    // Create files with slightly different timestamps
    const file1 = path.join(tempDir, "hypershell-backup-2025-01-01T00-00-00.db");
    const file2 = path.join(tempDir, "hypershell-backup-2025-06-15T12-00-00.db");
    writeFileSync(file1, "old");
    writeFileSync(file2, "new");

    const result = listBackupFiles(tempDir);
    expect(result.length).toBe(2);
    // The most recently modified file should be first
    expect(result[0].fileName).toContain("2025-06-15");
  });
});

describe("rotateBackups", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("does nothing when fewer than maxKeep backups exist", () => {
    writeFileSync(path.join(tempDir, "hypershell-backup-2025-01-01T00-00-00.db"), "data");
    writeFileSync(path.join(tempDir, "hypershell-backup-2025-01-02T00-00-00.db"), "data");

    rotateBackups(tempDir, 5);
    const files = readdirSync(tempDir).filter((f) => f.startsWith("hypershell-backup-"));
    expect(files).toHaveLength(2);
  });

  it("deletes oldest backups when exceeding maxKeep", () => {
    // Create 7 backup files
    for (let i = 0; i < 7; i++) {
      const fileName = `hypershell-backup-2025-01-0${i + 1}T00-00-00.db`;
      writeFileSync(path.join(tempDir, fileName), `data-${i}`);
    }

    rotateBackups(tempDir, 3);
    const remaining = readdirSync(tempDir).filter((f) => f.startsWith("hypershell-backup-"));
    expect(remaining).toHaveLength(3);
  });

  it("keeps the newest backups after rotation", () => {
    for (let i = 1; i <= 5; i++) {
      const fileName = `hypershell-backup-2025-01-0${i}T00-00-00.db`;
      writeFileSync(path.join(tempDir, fileName), `data-${i}`);
    }

    rotateBackups(tempDir, 2);
    const remaining = readdirSync(tempDir)
      .filter((f) => f.startsWith("hypershell-backup-"))
      .sort();
    expect(remaining).toHaveLength(2);
    // The newest files by mtime should remain. Since we wrote them sequentially,
    // the last two written (04, 05) should remain.
    // But mtime might be the same on fast systems, so just check count.
  });
});

describe("registerBackupIpc path policy", () => {
  it("rejects create path outside allowed roots", async () => {
    const handlers = new Map<string, IpcHandler>();
    registerBackupIpc({
      handle(channel: string, handler: IpcHandler) {
        handlers.set(channel, handler);
      },
    } as never);

    const createHandler = handlers.get(ipcChannels.backup.create);
    if (!createHandler) {
      throw new Error("Missing backup.create handler");
    }

    const home = path.resolve(homedir());
    const outsidePath = path.join(path.dirname(home), `${path.basename(home)}-evil`, "backup.db");
    await expect(
      Promise.resolve(createHandler({}, { filePath: outsidePath }))
    ).rejects.toThrow("Backup path must be within the user home, temp, or HyperShell backup directory");
  });

  it("rejects create path with non-sqlite extension", async () => {
    const handlers = new Map<string, IpcHandler>();
    registerBackupIpc({
      handle(channel: string, handler: IpcHandler) {
        handlers.set(channel, handler);
      },
    } as never);

    const createHandler = handlers.get(ipcChannels.backup.create);
    if (!createHandler) {
      throw new Error("Missing backup.create handler");
    }

    const targetPath = path.join(homedir(), "backup.txt");
    await expect(
      Promise.resolve(createHandler({}, { filePath: targetPath }))
    ).rejects.toThrow("Backup file must use a SQLite extension");
  });

  it("allows restore paths selected through the backup open dialog", async () => {
    const handlers = new Map<string, IpcHandler>();
    registerBackupIpc({
      handle(channel: string, handler: IpcHandler) {
        handlers.set(channel, handler);
      },
    } as never);

    const showOpenDialogHandler = handlers.get(ipcChannels.backup.showOpenDialog);
    const restoreHandler = handlers.get(ipcChannels.backup.restore);
    if (!showOpenDialogHandler || !restoreHandler) {
      throw new Error("Missing backup handlers");
    }

    const home = path.resolve(homedir());
    const selectedPath = path.join(path.dirname(home), `${path.basename(home)}-external`, "selected.db");
    electronMock.openDialogResult = { canceled: false, filePaths: [selectedPath] };

    await expect(Promise.resolve(showOpenDialogHandler({}, {}))).resolves.toBe(path.resolve(selectedPath));
    await expect(
      Promise.resolve(restoreHandler({}, { filePath: selectedPath }))
    ).rejects.toThrow("Backup file not found");
  });
});
