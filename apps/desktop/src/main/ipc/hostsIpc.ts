import { createHostsRepositoryFromDatabase } from "@sshterm/db";
import type { HostInput, HostRecord } from "@sshterm/db";
import {
  ipcChannels,
  upsertHostRequestSchema,
  removeHostRequestSchema,
  type UpsertHostRequest,
  type RemoveHostRequest
} from "@sshterm/shared";
import { app } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import path from "node:path";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import initSchemaSql from "@sshterm/db/src/migrations/001_init.sql";

import type { IpcMainLike } from "./registerIpc";

type HostsRepoLike = {
  create(input: HostInput): HostRecord;
  list(): HostRecord[];
};

let hostsRepo: HostsRepoLike | null = null;

function resolveDatabasePath(): string {
  const stableDataDir = path.join(app.getPath("appData"), "SSHTerm");
  const stableDbPath = path.join(stableDataDir, "sshterm.db");
  const legacyDbPath = path.join(app.getPath("userData"), "sshterm.db");

  mkdirSync(stableDataDir, { recursive: true });

  if (
    !existsSync(stableDbPath) &&
    existsSync(legacyDbPath) &&
    legacyDbPath !== stableDbPath
  ) {
    try {
      copyFileSync(legacyDbPath, stableDbPath);
      console.log("[sshterm] Migrated host DB to stable path:", stableDbPath);
    } catch (error) {
      console.warn("[sshterm] Failed migrating host DB, continuing with stable path:", error);
    }
  }

  return stableDbPath;
}

function resolveHostsFallbackPath(): string {
  return path.join(app.getPath("appData"), "SSHTerm", "hosts.fallback.json");
}

function createFileBackedHostsRepo(filePath: string): HostsRepoLike {
  type StoredHost = HostRecord;

  const readHosts = (): StoredHost[] => {
    if (!existsSync(filePath)) {
      return [];
    }

    try {
      const raw = readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .map((item) => ({
          id: String(item?.id ?? ""),
          name: String(item?.name ?? ""),
          hostname: String(item?.hostname ?? ""),
          port: Number(item?.port ?? 22),
          username: item?.username == null ? null : String(item.username),
          authProfileId:
            item?.authProfileId == null ? null : String(item.authProfileId),
          groupId: item?.groupId == null ? null : String(item.groupId),
          notes: item?.notes == null ? null : String(item.notes)
        }))
        .filter((item) => item.id.length > 0 && item.name.length > 0 && item.hostname.length > 0);
    } catch {
      return [];
    }
  };

  const writeHosts = (hosts: StoredHost[]): void => {
    writeFileSync(filePath, JSON.stringify(hosts, null, 2), "utf8");
  };

  return {
    create(input: HostInput): HostRecord {
      const normalized: HostRecord = {
        id: input.id,
        name: input.name,
        hostname: input.hostname,
        port: input.port ?? 22,
        username: input.username ?? null,
        authProfileId: input.authProfileId ?? null,
        groupId: input.groupId ?? null,
        notes: input.notes ?? null
      };

      const hosts = readHosts();
      const existingIndex = hosts.findIndex((host) => host.id === normalized.id);
      if (existingIndex >= 0) {
        hosts[existingIndex] = normalized;
      } else {
        hosts.push(normalized);
      }

      writeHosts(hosts);
      return normalized;
    },
    list(): HostRecord[] {
      return readHosts().sort((left, right) =>
        left.name.localeCompare(right.name)
      );
    }
  };
}

function getOrCreateHostsRepo() {
  if (!hostsRepo) {
    try {
      const Database = require("better-sqlite3");
      const dbPath = resolveDatabasePath();
      console.log("[sshterm] Opening database at:", dbPath);
      const db = new Database(dbPath);
      db.pragma("foreign_keys = ON");
      db.exec(initSchemaSql);
      hostsRepo = createHostsRepositoryFromDatabase(db);
      console.log("[sshterm] Database initialized successfully");
    } catch (err) {
      console.error("[sshterm] Failed to initialize SQLite, falling back to JSON store:", err);
      const fallbackPath = resolveHostsFallbackPath();
      console.log("[sshterm] Using fallback hosts store at:", fallbackPath);
      hostsRepo = createFileBackedHostsRepo(fallbackPath);
    }
  }
  return hostsRepo;
}

export const hostChannelList = [
  ipcChannels.hosts.list,
  ipcChannels.hosts.upsert,
  ipcChannels.hosts.remove
] as const;

export function registerHostIpc(ipcMain: IpcMainLike): void {
  ipcMain.handle(ipcChannels.hosts.list, () => {
    return getOrCreateHostsRepo().list();
  });

  ipcMain.handle(ipcChannels.hosts.upsert, (_event: IpcMainInvokeEvent, request: UpsertHostRequest) => {
    const parsed = upsertHostRequestSchema.parse(request);
    return getOrCreateHostsRepo().create({
      id: parsed.id,
      name: parsed.name,
      hostname: parsed.hostname,
      port: parsed.port,
      username: parsed.username ?? null,
      notes: parsed.notes ?? null
    });
  });

  ipcMain.handle(ipcChannels.hosts.remove, (_event: IpcMainInvokeEvent, request: RemoveHostRequest) => {
    const parsed = removeHostRequestSchema.parse(request);
    void parsed;
  });
}
