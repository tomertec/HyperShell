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
  get(id: string): HostRecord | undefined;
  list(): HostRecord[];
  remove(id: string): boolean;
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
          identityFile:
            item?.identityFile == null ? null : String(item.identityFile),
          authProfileId:
            item?.authProfileId == null ? null : String(item.authProfileId),
          groupId: item?.groupId == null ? null : String(item.groupId),
          notes: item?.notes == null ? null : String(item.notes),
          authMethod: item?.authMethod == null ? "default" : String(item.authMethod),
          agentKind: item?.agentKind == null ? "system" : String(item.agentKind),
          opReference: item?.opReference == null ? null : String(item.opReference),
          isFavorite: Boolean(item?.isFavorite ?? false)
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
        identityFile: input.identityFile ?? null,
        authProfileId: input.authProfileId ?? null,
        groupId: input.groupId ?? null,
        notes: input.notes ?? null,
        authMethod: input.authMethod ?? "default",
        agentKind: input.agentKind ?? "system",
        opReference: input.opReference ?? null,
        isFavorite: input.isFavorite ?? false
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
    get(id: string): HostRecord | undefined {
      return readHosts().find((host) => host.id === id);
    },
    list(): HostRecord[] {
      return readHosts().sort((left, right) =>
        left.name.localeCompare(right.name)
      );
    },
    remove(id: string): boolean {
      const hosts = readHosts();
      const index = hosts.findIndex((host) => host.id === id);
      if (index === -1) return false;
      hosts.splice(index, 1);
      writeHosts(hosts);
      return true;
    }
  };
}

export function getOrCreateHostsRepo() {
  if (!hostsRepo) {
    try {
      const Database = require("better-sqlite3");
      const dbPath = resolveDatabasePath();
      console.log("[sshterm] Opening database at:", dbPath);
      const db = new Database(dbPath);
      db.pragma("foreign_keys = ON");
      db.exec(initSchemaSql);
      // Migration 004: add is_favorite column (safe to run on existing DBs)
      try { db.exec("ALTER TABLE hosts ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0"); } catch { /* column exists */ }
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
      identityFile: parsed.identityFile ?? null,
      notes: parsed.notes ?? null,
      authMethod: parsed.authMethod ?? "default",
      agentKind: parsed.agentKind ?? "system",
      opReference: parsed.opReference ?? null,
      isFavorite: parsed.isFavorite ?? false
    });
  });

  ipcMain.handle(ipcChannels.hosts.remove, (_event: IpcMainInvokeEvent, request: RemoveHostRequest) => {
    const parsed = removeHostRequestSchema.parse(request);
    getOrCreateHostsRepo().remove(parsed.id);
  });
}
