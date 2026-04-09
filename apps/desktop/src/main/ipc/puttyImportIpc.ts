import { ipcChannels } from "@hypershell/shared";
import type { PuttySession } from "@hypershell/shared";
import type { IpcMainInvokeEvent } from "electron";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { userInfo } from "node:os";

import type { IpcMainLike } from "./registerIpc";

const execFileAsync = promisify(execFile);

const PUTTY_SESSIONS_KEY =
  "HKCU\\Software\\SimonTatham\\PuTTY\\Sessions";

/**
 * Parse the output of `reg query ... /s` for PuTTY sessions.
 *
 * Each subkey block looks like:
 *
 *     HKEY_CURRENT_USER\Software\SimonTatham\PuTTY\Sessions\myserver
 *         HostName    REG_SZ    example.com
 *         PortNumber    REG_DWORD    0x16
 *         Protocol    REG_SZ    ssh
 *         UserName    REG_SZ    admin
 *         PublicKeyFile    REG_SZ    C:\Users\user\.ssh\id_rsa.ppk
 */
export function parsePuttyRegistryOutput(stdout: string): PuttySession[] {
  const sessions: PuttySession[] = [];
  const blocks = stdout.split(/\r?\n\r?\n/).filter(Boolean);

  const defaultUser = (() => {
    try {
      return userInfo().username;
    } catch {
      return "";
    }
  })();

  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    // First line is the registry key path
    const keyLine = lines[0];
    const keyMatch = keyLine.match(
      /\\PuTTY\\Sessions\\(.+)$/i
    );
    if (!keyMatch) continue;

    const rawName = keyMatch[1];

    // Skip Default Settings
    if (rawName === "Default%20Settings") continue;

    const name = decodeURIComponent(rawName);

    // Parse values from remaining lines
    const values = new Map<string, string>();
    for (let i = 1; i < lines.length; i++) {
      const match = lines[i].match(
        /^(\S+)\s+REG_(?:SZ|DWORD)\s+(.*)$/
      );
      if (match) {
        values.set(match[1], match[2]);
      }
    }

    // Only import SSH sessions
    const protocol = values.get("Protocol") ?? "";
    if (protocol.toLowerCase() !== "ssh") continue;

    const hostname = values.get("HostName") ?? "";
    if (!hostname) continue;

    // PortNumber is a DWORD (hex), e.g. 0x16 = 22
    let port = 22;
    const portRaw = values.get("PortNumber");
    if (portRaw) {
      const parsed = parseInt(portRaw, 16);
      if (!Number.isNaN(parsed) && parsed > 0 && parsed <= 65535) {
        port = parsed;
      }
    }

    const username = values.get("UserName") || defaultUser;
    const keyFile = values.get("PublicKeyFile") ?? "";

    sessions.push({ name, hostname, port, username, keyFile });
  }

  return sessions;
}

export function registerPuttyImportIpc(ipcMain: IpcMainLike): void {
  ipcMain.handle(
    ipcChannels.hosts.scanPutty,
    async (_event: IpcMainInvokeEvent) => {
      if (process.platform !== "win32") {
        return { sessions: [] };
      }

      try {
        const { stdout } = await execFileAsync("reg", [
          "query",
          PUTTY_SESSIONS_KEY,
          "/s",
        ], { windowsHide: true });

        const sessions = parsePuttyRegistryOutput(stdout);
        return { sessions };
      } catch {
        // Registry key doesn't exist or reg.exe failed — PuTTY not installed
        return { sessions: [] };
      }
    }
  );
}
