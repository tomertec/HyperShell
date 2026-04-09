import {
  ipcChannels,
  importSshManagerRequestSchema,
  type SshManagerHost,
  type SshManagerGroup,
  type SshManagerSnippet,
  type ImportSshManagerResponse,
} from "@hypershell/shared";
import type { IpcMainLike } from "./registerIpc";
import type { IpcMainInvokeEvent } from "electron";
import path from "node:path";
import { existsSync } from "node:fs";

/**
 * Map sshmanager auth type integer to HyperShell auth method string.
 *
 *   0 = SshAgent    → "default"
 *   1 = PrivateKey   → "keyfile"
 *   2 = Password     → "password"  (password itself cannot be migrated)
 *   3 = Kerberos     → "default"
 *   4 = OnePassword  → "op-reference"
 */
export function mapAuthType(authType: number): string {
  switch (authType) {
    case 0:
      return "default";
    case 1:
      return "keyfile";
    case 2:
      return "password";
    case 4:
      return "op-reference";
    default:
      return "default";
  }
}

/** Resolve the default sshmanager database path on Windows. */
export function resolveSshManagerDbPath(): string {
  return path.join(
    process.env.LOCALAPPDATA ?? "",
    "SshManager",
    "sshmanager.db"
  );
}

interface SshManagerHostRow {
  Id: string;
  DisplayName: string | null;
  Hostname: string | null;
  Port: number | null;
  Username: string | null;
  AuthType: number | null;
  PrivateKeyPath: string | null;
  OnePasswordReference: string | null;
  GroupId: string | null;
  Notes: string | null;
  IsFavorite: number | null;
  SortOrder: number | null;
  KeepAliveIntervalSeconds: number | null;
  ConnectionType: number | null;
}

interface SshManagerGroupRow {
  Id: string;
  Name: string | null;
  Description: string | null;
}

interface SshManagerSnippetRow {
  Id: string;
  Name: string | null;
  Command: string | null;
  Category: string | null;
  SortOrder: number | null;
}

export function parseHostRow(row: SshManagerHostRow): SshManagerHost {
  return {
    id: row.Id,
    displayName: row.DisplayName ?? row.Hostname ?? "Unknown",
    hostname: row.Hostname ?? "",
    port: row.Port ?? 22,
    username: row.Username ?? null,
    authType: row.AuthType ?? 0,
    privateKeyPath: row.PrivateKeyPath ?? null,
    opReference: row.OnePasswordReference ?? null,
    groupId: row.GroupId ?? null,
    notes: row.Notes ?? null,
    isFavorite: (row.IsFavorite ?? 0) !== 0,
    sortOrder: row.SortOrder ?? 0,
    keepAliveIntervalSeconds: row.KeepAliveIntervalSeconds ?? null,
  };
}

export function parseGroupRow(row: SshManagerGroupRow): SshManagerGroup {
  return {
    id: row.Id,
    name: row.Name ?? "Unnamed",
    description: row.Description ?? null,
  };
}

export function parseSnippetRow(row: SshManagerSnippetRow): SshManagerSnippet {
  return {
    id: row.Id,
    name: row.Name ?? "Unnamed",
    command: row.Command ?? "",
    category: row.Category ?? null,
    sortOrder: row.SortOrder ?? 0,
  };
}

type HostsRepoLike = {
  create(input: Record<string, unknown>): unknown;
  list(): Array<{ hostname: string; port: number; username: string | null }>;
};

type GroupsRepoLike = {
  create(input: { id: string; name: string; description: string | null }): unknown;
};

type SnippetsRepoLike = {
  create(input: { id: string; name: string; body: string }): unknown;
};

export function registerSshManagerImportIpc(
  ipcMain: IpcMainLike,
  getHostsRepo: () => HostsRepoLike,
  getGroupsRepo: () => GroupsRepoLike,
  getSnippetsRepo: () => SnippetsRepoLike
): void {
  ipcMain.handle(
    ipcChannels.hosts.scanSshManager,
    async (_event: IpcMainInvokeEvent) => {
      const dbPath = resolveSshManagerDbPath();

      if (!existsSync(dbPath)) {
        return { dbPath, hosts: [], groups: [], snippets: [] };
      }

      try {
        const Database = require("better-sqlite3");
        const smDb = new Database(dbPath, {
          readonly: true,
          fileMustExist: true,
        });

        let hosts: SshManagerHost[] = [];
        let groups: SshManagerGroup[] = [];
        let snippets: SshManagerSnippet[] = [];

        try {
          const hostRows = smDb
            .prepare(
              `SELECT Id, DisplayName, Hostname, Port, Username, AuthType, PrivateKeyPath, OnePasswordReference, GroupId, Notes, IsFavorite, SortOrder, KeepAliveIntervalSeconds, ConnectionType FROM HostEntries`
            )
            .all() as SshManagerHostRow[];

          // Only import SSH hosts (ConnectionType 0 or null), skip serial (1)
          hosts = hostRows
            .filter(
              (r) => r.ConnectionType === null || r.ConnectionType === 0
            )
            .filter((r) => r.Hostname && r.Hostname.trim().length > 0)
            .map(parseHostRow);
        } catch (e) {
          console.warn("[hypershell] Failed to read HostEntries from sshmanager DB:", e);
        }

        try {
          const groupRows = smDb
            .prepare(`SELECT Id, Name, Description FROM HostGroups`)
            .all() as SshManagerGroupRow[];
          groups = groupRows.map(parseGroupRow);
        } catch (e) {
          console.warn("[hypershell] Failed to read HostGroups from sshmanager DB:", e);
        }

        try {
          const snippetRows = smDb
            .prepare(
              `SELECT Id, Name, Command, Category, SortOrder FROM CommandSnippets`
            )
            .all() as SshManagerSnippetRow[];
          snippets = snippetRows.map(parseSnippetRow);
        } catch (e) {
          console.warn(
            "[hypershell] Failed to read CommandSnippets from sshmanager DB:",
            e
          );
        }

        smDb.close();
        return { dbPath, hosts, groups, snippets };
      } catch (e) {
        console.error("[hypershell] Failed to open sshmanager DB:", e);
        return { dbPath, hosts: [], groups: [], snippets: [] };
      }
    }
  );

  ipcMain.handle(
    ipcChannels.hosts.importSshManager,
    async (
      _event: IpcMainInvokeEvent,
      request: unknown
    ): Promise<ImportSshManagerResponse> => {
      const parsed = importSshManagerRequestSchema.parse(request);
      const dbPath = resolveSshManagerDbPath();

      if (!existsSync(dbPath)) {
        return {
          importedHosts: 0,
          importedGroups: 0,
          importedSnippets: 0,
          skippedDuplicates: 0,
        };
      }

      const Database = require("better-sqlite3");
      const smDb = new Database(dbPath, {
        readonly: true,
        fileMustExist: true,
      });

      let importedHosts = 0;
      let importedGroups = 0;
      let importedSnippets = 0;
      let skippedDuplicates = 0;

      const hostIdsSet = new Set(parsed.hostIds);
      const groupIdsSet = new Set(parsed.groupIds);
      const snippetIdsSet = new Set(parsed.snippetIds);

      // Import groups first (hosts may reference them)
      if (groupIdsSet.size > 0) {
        try {
          const groupRows = smDb
            .prepare(`SELECT Id, Name, Description FROM HostGroups`)
            .all() as SshManagerGroupRow[];

          const groupsRepo = getGroupsRepo();
          for (const row of groupRows) {
            if (!groupIdsSet.has(row.Id)) continue;
            const group = parseGroupRow(row);
            try {
              groupsRepo.create({
                id: group.id,
                name: group.name,
                description: group.description,
              });
              importedGroups++;
            } catch (e) {
              console.warn("[hypershell] Failed to import group:", group.name, e);
            }
          }
        } catch (e) {
          console.warn("[hypershell] Failed to read groups for import:", e);
        }
      }

      // Import hosts
      if (hostIdsSet.size > 0) {
        try {
          const hostRows = smDb
            .prepare(
              `SELECT Id, DisplayName, Hostname, Port, Username, AuthType, PrivateKeyPath, OnePasswordReference, GroupId, Notes, IsFavorite, SortOrder, KeepAliveIntervalSeconds, ConnectionType FROM HostEntries`
            )
            .all() as SshManagerHostRow[];

          const hostsRepo = getHostsRepo();
          const existingHosts = hostsRepo.list();

          for (const row of hostRows) {
            if (!hostIdsSet.has(row.Id)) continue;
            const host = parseHostRow(row);

            // Duplicate check: hostname + port + username
            const isDuplicate = existingHosts.some(
              (existing) =>
                existing.hostname === host.hostname &&
                existing.port === host.port &&
                (existing.username ?? null) === (host.username ?? null)
            );

            if (isDuplicate) {
              skippedDuplicates++;
              continue;
            }

            const authMethod = mapAuthType(host.authType);

            try {
              hostsRepo.create({
                id: `sm-${host.id}`,
                name: host.displayName,
                hostname: host.hostname,
                port: host.port,
                username: host.username ?? "",
                groupId: host.groupId
                  ? (groupIdsSet.has(host.groupId) ? host.groupId : null)
                  : null,
                notes: host.notes,
                identityFile:
                  authMethod === "keyfile" ? host.privateKeyPath : null,
                authMethod,
                opReference:
                  authMethod === "op-reference" ? host.opReference : null,
                isFavorite: host.isFavorite,
                sortOrder: host.sortOrder,
                keepAliveInterval: host.keepAliveIntervalSeconds,
              });
              importedHosts++;
            } catch (e) {
              console.warn(
                "[hypershell] Failed to import host:",
                host.displayName,
                e
              );
            }
          }
        } catch (e) {
          console.warn("[hypershell] Failed to read hosts for import:", e);
        }
      }

      // Import snippets
      if (snippetIdsSet.size > 0) {
        try {
          const snippetRows = smDb
            .prepare(
              `SELECT Id, Name, Command, Category, SortOrder FROM CommandSnippets`
            )
            .all() as SshManagerSnippetRow[];

          const snippetsRepo = getSnippetsRepo();
          for (const row of snippetRows) {
            if (!snippetIdsSet.has(row.Id)) continue;
            const snippet = parseSnippetRow(row);

            try {
              snippetsRepo.create({
                id: `sm-${snippet.id}`,
                name: snippet.name,
                body: snippet.command,
              });
              importedSnippets++;
            } catch (e) {
              console.warn(
                "[hypershell] Failed to import snippet:",
                snippet.name,
                e
              );
            }
          }
        } catch (e) {
          console.warn("[hypershell] Failed to read snippets for import:", e);
        }
      }

      smDb.close();

      return {
        importedHosts,
        importedGroups,
        importedSnippets,
        skippedDuplicates,
      };
    }
  );
}
