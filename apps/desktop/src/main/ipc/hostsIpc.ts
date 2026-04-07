import { createHostsRepositoryFromDatabase } from "@sshterm/db";
import type { HostInput, HostRecord } from "@sshterm/db";
import {
  ipcChannels,
  upsertHostRequestSchema,
  removeHostRequestSchema,
  reorderHostsRequestSchema,
  type UpsertHostRequest,
  type RemoveHostRequest,
  type ReorderHostsRequest
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
import sftpBookmarksSql from "@sshterm/db/src/migrations/002_sftp_bookmarks.sql";
import hostAuthFieldsSql from "@sshterm/db/src/migrations/003_host_auth_fields.sql";
import advancedSshSql from "@sshterm/db/src/migrations/006_advanced_ssh.sql";

import type { IpcMainLike } from "./registerIpc";

type HostsRepoLike = {
  create(input: HostInput): HostRecord;
  get(id: string): HostRecord | undefined;
  list(): HostRecord[];
  remove(id: string): boolean;
  updateSortOrders(items: Array<{ id: string; sortOrder: number; groupId: string | null }>): void;
};

let hostsRepo: HostsRepoLike | null = null;
let sharedDb: unknown = null;

/** Returns the shared SQLite database instance, creating it on first call. */
export function getOrCreateDatabase(): unknown {
  if (!sharedDb) {
    try {
      const Database = require("better-sqlite3");
      const dbPath = resolveDatabasePath();
      console.log("[sshterm] Opening database at:", dbPath);
      const db = new Database(dbPath);
      db.pragma("foreign_keys = ON");
      db.exec(initSchemaSql);
      db.exec(sftpBookmarksSql);
      // Migration 003: add identity_file and auth fields to hosts table.
      try { db.exec("ALTER TABLE hosts ADD COLUMN identity_file TEXT"); } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("already exists") || msg.includes("duplicate column")) {
          console.info("[sshterm] Migration 003 (identity_file): column already exists");
        } else {
          console.error("[sshterm] Migration 003 (identity_file) failed:", msg);
        }
      }
      for (const statement of hostAuthFieldsSql.split(";").map((s: string) => s.trim()).filter((s: string) => s.length > 0)) {
        try { db.exec(statement); } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.includes("already exists") || msg.includes("duplicate column")) {
            console.info("[sshterm] Migration 003 (auth fields): column already exists");
          } else {
            console.error("[sshterm] Migration 003 (auth fields) failed:", msg);
          }
        }
      }
      // Migration 004: add is_favorite column
      try { db.exec("ALTER TABLE hosts ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0"); } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("already exists") || msg.includes("duplicate column")) {
          console.info("[sshterm] Migration 004 (is_favorite): column already exists");
        } else {
          console.error("[sshterm] Migration 004 (is_favorite) failed:", msg);
        }
      }
      // Migration 005: add sort_order and color columns
      for (const stmt of [
        "ALTER TABLE hosts ADD COLUMN sort_order INTEGER",
        "ALTER TABLE host_groups ADD COLUMN sort_order INTEGER",
        "ALTER TABLE hosts ADD COLUMN color TEXT"
      ]) {
        try { db.exec(stmt); } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.includes("already exists") || msg.includes("duplicate column")) {
            console.info(`[sshterm] Migration 005: column already exists`);
          } else {
            console.error(`[sshterm] Migration 005 failed:`, msg);
          }
        }
      }
      // Migration 006: advanced SSH fields + host_port_forwards table
      for (const stmt of advancedSshSql.split(";").map((s: string) => s.trim()).filter((s: string) => s.length > 0)) {
        try { db.exec(stmt); } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.includes("already exists") || msg.includes("duplicate column")) {
            console.info("[sshterm] Migration 006: column/table already exists");
          } else {
            console.error("[sshterm] Migration 006 failed:", msg);
          }
        }
      }
      sharedDb = db;
      console.log("[sshterm] Database initialized successfully");
    } catch (err) {
      console.error("[sshterm] Failed to initialize SQLite:", err);
    }
  }
  return sharedDb;
}

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
          isFavorite: Boolean(item?.isFavorite ?? false),
          sortOrder: item?.sortOrder == null ? null : Number(item.sortOrder),
          color: item?.color == null ? null : String(item.color)
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
        isFavorite: input.isFavorite ?? false,
        sortOrder: input.sortOrder ?? null,
        color: input.color ?? null
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
    },
    updateSortOrders(items: Array<{ id: string; sortOrder: number; groupId: string | null }>): void {
      const hosts = readHosts();
      for (const item of items) {
        const host = hosts.find((h) => h.id === item.id);
        if (host) {
          host.sortOrder = item.sortOrder;
          host.groupId = item.groupId;
        }
      }
      writeHosts(hosts);
    }
  };
}

export function getOrCreateHostsRepo() {
  if (!hostsRepo) {
    const db = getOrCreateDatabase();
    if (db) {
      hostsRepo = createHostsRepositoryFromDatabase(db as Parameters<typeof createHostsRepositoryFromDatabase>[0]);
      // One-time import: migrate hosts from JSON fallback into SQLite
      importFallbackHosts(hostsRepo);
    } else {
      console.error("[sshterm] No database available, falling back to JSON store");
      const fallbackPath = resolveHostsFallbackPath();
      console.log("[sshterm] Using fallback hosts store at:", fallbackPath);
      hostsRepo = createFileBackedHostsRepo(fallbackPath);
    }
  }
  return hostsRepo;
}

function importFallbackHosts(repo: HostsRepoLike): void {
  const fallbackPath = resolveHostsFallbackPath();
  if (!existsSync(fallbackPath)) return;

  try {
    const raw = readFileSync(fallbackPath, "utf8");
    const hosts = JSON.parse(raw);
    if (!Array.isArray(hosts) || hosts.length === 0) return;

    let imported = 0;
    for (const h of hosts) {
      if (!h?.id || !h?.name || !h?.hostname) continue;
      // Skip if already in DB
      if (repo.get(h.id)) continue;
      repo.create({
        id: h.id,
        name: h.name,
        hostname: h.hostname,
        port: h.port ?? 22,
        username: h.username ?? null,
        identityFile: h.identityFile ?? null,
        authProfileId: h.authProfileId ?? null,
        groupId: h.groupId ?? null,
        notes: h.notes ?? null,
        authMethod: h.authMethod ?? "default",
        agentKind: h.agentKind ?? "system",
        opReference: h.opReference ?? null,
        isFavorite: h.isFavorite ?? false
      });
      imported++;
    }

    if (imported > 0) {
      console.log(`[sshterm] Imported ${imported} host(s) from JSON fallback into SQLite`);
      // Rename fallback so we don't re-import
      const donePath = fallbackPath + ".migrated";
      try { copyFileSync(fallbackPath, donePath); } catch { /* best effort */ }
      try { writeFileSync(fallbackPath, "[]", "utf8"); } catch { /* best effort */ }
    }
  } catch (err) {
    console.warn("[sshterm] Failed to import fallback hosts:", err);
  }
}

export const hostChannelList = [
  ipcChannels.hosts.list,
  ipcChannels.hosts.upsert,
  ipcChannels.hosts.remove,
  ipcChannels.hosts.reorder
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
      isFavorite: parsed.isFavorite ?? false,
      color: parsed.color ?? null,
      sortOrder: parsed.sortOrder ?? null,
    });
  });

  ipcMain.handle(ipcChannels.hosts.reorder, (_event: IpcMainInvokeEvent, request: ReorderHostsRequest) => {
    const parsed = reorderHostsRequestSchema.parse(request);
    const repo = getOrCreateHostsRepo();
    if ('updateSortOrders' in repo) {
      (repo as any).updateSortOrders(parsed.items);
    }
    return { success: true };
  });

  ipcMain.handle(ipcChannels.hosts.remove, (_event: IpcMainInvokeEvent, request: RemoveHostRequest) => {
    const parsed = removeHostRequestSchema.parse(request);
    const removed = getOrCreateHostsRepo().remove(parsed.id);
    if (!removed) {
      throw new Error(`Host not found: ${parsed.id}`);
    }
    return { success: true };
  });
}
