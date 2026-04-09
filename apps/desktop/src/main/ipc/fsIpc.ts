import { ipcChannels, fsListRequestSchema } from "@hypershell/shared";
import type { FsEntry } from "@hypershell/shared";
import { dialog } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import { readdir, stat, access, realpath } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import type { IpcMainLike } from "./registerIpc";

function readEnv(primary: string, fallback?: string): string | undefined {
  const primaryValue = process.env[primary];
  if (typeof primaryValue === "string") {
    return primaryValue;
  }
  if (!fallback) {
    return undefined;
  }
  const fallbackValue = process.env[fallback];
  return typeof fallbackValue === "string" ? fallbackValue : undefined;
}

function envEnabled(primary: string, fallback: string | undefined, defaultValue: boolean): boolean {
  const value = readEnv(primary, fallback);
  if (value === undefined) {
    return defaultValue;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "0" || normalized === "false" || normalized === "no") {
    return false;
  }
  if (normalized === "1" || normalized === "true" || normalized === "yes") {
    return true;
  }
  return defaultValue;
}

const localFsEnabled = envEnabled("SSHTERM_ENABLE_LOCAL_FS", "HYPERSHELL_ENABLE_LOCAL_FS", true);
const sshKeyDiscoveryEnabled = envEnabled(
  "SSHTERM_ENABLE_SSH_KEY_DISCOVERY",
  "HYPERSHELL_ENABLE_SSH_KEY_DISCOVERY",
  true
);
const allowSystemRoots = envEnabled(
  "SSHTERM_FS_ALLOW_SYSTEM_ROOTS",
  "HYPERSHELL_FS_ALLOW_SYSTEM_ROOTS",
  true
);
const envAllowedRoots = (readEnv("SSHTERM_FS_ALLOWED_ROOTS", "HYPERSHELL_FS_ALLOWED_ROOTS") ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter((value) => value.length > 0);

function normalizeAbsolutePath(inputPath: string): string {
  if (!path.isAbsolute(inputPath)) {
    throw new Error(`Absolute path is required: ${inputPath}`);
  }

  const resolved = path.resolve(inputPath);
  if (process.platform === "win32") {
    const lower = resolved.toLowerCase();
    if (lower.startsWith("\\\\.")) {
      throw new Error(`Blocked device path: ${inputPath}`);
    }
  }

  return resolved;
}

function toComparablePath(inputPath: string): string {
  return process.platform === "win32" ? inputPath.toLowerCase() : inputPath;
}

function isPathWithinRoot(targetPath: string, rootPath: string): boolean {
  const comparableTarget = toComparablePath(targetPath);
  const comparableRoot = toComparablePath(rootPath);
  if (comparableTarget === comparableRoot) {
    return true;
  }

  const withSep = comparableRoot.endsWith(path.sep)
    ? comparableRoot
    : `${comparableRoot}${path.sep}`;
  return comparableTarget.startsWith(withSep);
}

async function getAllowedRoots(): Promise<string[]> {
  const roots = new Set<string>();
  roots.add(normalizeAbsolutePath(os.homedir()));

  for (const extraRoot of envAllowedRoots) {
    try {
      roots.add(normalizeAbsolutePath(extraRoot));
    } catch {
      // Ignore malformed paths from environment variables.
    }
  }

  if (allowSystemRoots) {
    if (process.platform === "win32") {
      for (const drive of await listDrives()) {
        roots.add(normalizeAbsolutePath(drive));
      }
    } else {
      roots.add("/");
    }
  }

  return Array.from(roots);
}

async function assertPathAllowed(inputPath: string): Promise<string> {
  if (!localFsEnabled) {
    throw new Error("Local filesystem browsing is disabled by policy");
  }

  const normalizedPath = normalizeAbsolutePath(inputPath);
  const allowedRoots = await getAllowedRoots();
  const canonicalTargetPath = await realpath(normalizedPath).catch(() => normalizedPath);
  const canonicalRoots = await Promise.all(
    allowedRoots.map(async (root) => {
      return realpath(root).catch(() => root);
    })
  );
  if (!canonicalRoots.some((root) => isPathWithinRoot(canonicalTargetPath, root))) {
    throw new Error(`Path is outside the allowed filesystem roots: ${inputPath}`);
  }

  return normalizedPath;
}

async function toEntry(basePath: string, name: string): Promise<FsEntry> {
  const fullPath = path.join(basePath, name);
  const stats = await stat(fullPath);
  return {
    name,
    path: fullPath,
    size: stats.size,
    modifiedAt: stats.mtime.toISOString(),
    isDirectory: stats.isDirectory()
  };
}

async function listDrives(): Promise<string[]> {
  if (process.platform !== "win32") {
    return ["/"];
  }

  const checks = Array.from({ length: 26 }, (_, i) => {
    const drive = `${String.fromCharCode(65 + i)}:\\`;
    return access(drive).then(() => drive, () => null);
  });

  const results = await Promise.all(checks);
  const drives = results.filter((d): d is string => d !== null);
  return drives.length > 0 ? drives : ["C:\\"];
}

export function registerFsIpc(ipcMain: IpcMainLike): () => void {
  ipcMain.handle(ipcChannels.fs.list, async (_event: IpcMainInvokeEvent, rawRequest: unknown) => {
    const request = fsListRequestSchema.parse(rawRequest);
    const targetPath = await assertPathAllowed(request.path);
    const dirents = await readdir(targetPath, { withFileTypes: true });

    const settled = await Promise.allSettled(
      dirents.map((dirent) => toEntry(targetPath, dirent.name))
    );

    const entries: FsEntry[] = [];
    for (const result of settled) {
      if (result.status === "fulfilled") {
        entries.push(result.value);
      }
    }

    return { entries };
  });

  ipcMain.handle(ipcChannels.fs.stat, async (_event: IpcMainInvokeEvent, rawRequest: unknown) => {
    const request = fsListRequestSchema.parse(rawRequest);
    const targetPath = await assertPathAllowed(request.path);
    const stats = await stat(targetPath);
    return {
      name: path.basename(targetPath) || targetPath,
      path: targetPath,
      size: stats.size,
      modifiedAt: stats.mtime.toISOString(),
      isDirectory: stats.isDirectory()
    } satisfies FsEntry;
  });

  ipcMain.handle(ipcChannels.fs.getHome, () => {
    return { path: os.homedir() };
  });

  ipcMain.handle(ipcChannels.fs.getDrives, async () => {
    if (!localFsEnabled) {
      return { drives: [] };
    }

    if (process.platform === "win32") {
      if (allowSystemRoots) {
        return { drives: await listDrives() };
      }

      const roots = await getAllowedRoots();
      const drives = Array.from(
        new Set(
          roots
            .map((root) => {
              const match = /^[A-Za-z]:\\/.exec(root);
              return match ? match[0] : null;
            })
            .filter((drive): drive is string => drive !== null)
        )
      );
      return { drives };
    }

    return { drives: allowSystemRoots ? ["/"] : [] };
  });

  ipcMain.handle(ipcChannels.fs.listSshKeys, async () => {
    if (!localFsEnabled || !sshKeyDiscoveryEnabled) {
      return [];
    }

    const sshDir = path.join(os.homedir(), ".ssh");
    try {
      const entries = await readdir(sshDir);
      const keys: string[] = [];
      for (const name of entries) {
        // Skip known non-key files, public keys, and config files
        if (
          name.endsWith(".pub") ||
          name === "config" ||
          name === "known_hosts" ||
          name === "known_hosts.old" ||
          name === "authorized_keys" ||
          name === "environment"
        ) {
          continue;
        }

        const fullPath = path.join(sshDir, name);
        try {
          const stats = await stat(fullPath);
          if (stats.isFile() && stats.size > 0 && stats.size < 100_000) {
            keys.push(fullPath);
          }
        } catch {
          // Skip inaccessible files
        }
      }
      return keys;
    } catch {
      return [];
    }
  });

  ipcMain.handle(ipcChannels.fs.showSaveDialog, async (_event: IpcMainInvokeEvent, request: unknown) => {
    const { defaultPath, filters } = (request ?? {}) as {
      defaultPath?: string;
      filters?: Array<{ name: string; extensions: string[] }>;
    };
    const result = await dialog.showSaveDialog({
      defaultPath,
      filters,
    });
    return result.canceled ? null : result.filePath;
  });

  ipcMain.handle(ipcChannels.fs.showOpenDialog, async (_event: IpcMainInvokeEvent, request: unknown) => {
    const { title, defaultPath, filters } = (request ?? {}) as {
      title?: string;
      defaultPath?: string;
      filters?: Array<{ name: string; extensions: string[] }>;
    };
    const result = await dialog.showOpenDialog({
      title,
      defaultPath,
      filters,
      properties: ["openFile"],
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  return () => {
    for (const channel of Object.values(ipcChannels.fs)) {
      ipcMain.removeHandler?.(channel);
    }
  };
}
