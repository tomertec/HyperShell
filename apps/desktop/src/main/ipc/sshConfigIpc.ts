import { ipcChannels } from "@sshterm/shared";
import type { IpcMainInvokeEvent } from "electron";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { parseSshConfig } from "@sshterm/session-core";
import { randomUUID } from "node:crypto";

import type { IpcMainLike } from "./registerIpc";

type HostImporter = {
  create(input: { id: string; name: string; hostname: string; port?: number; username?: string | null; identityFile?: string | null }): unknown;
};

export function registerSshConfigIpc(ipcMain: IpcMainLike, getHostsRepo: () => HostImporter): void {
  ipcMain.handle(ipcChannels.hosts.importSshConfig, (_event: IpcMainInvokeEvent) => {
    const configPath = path.join(homedir(), ".ssh", "config");
    let configContent: string;
    try {
      configContent = readFileSync(configPath, "utf8");
    } catch {
      return { imported: 0, hosts: [] };
    }

    const result = parseSshConfig(configContent);
    const repo = getHostsRepo();
    const imported = [];

    for (const host of result.hosts) {
      const record = repo.create({
        id: randomUUID(),
        name: host.alias,
        hostname: host.hostName ?? host.alias,
        port: host.port,
        username: host.user ?? null,
        identityFile: host.identityFile ?? null
      });
      imported.push(record);
    }

    return { imported: imported.length, hosts: imported };
  });
}
