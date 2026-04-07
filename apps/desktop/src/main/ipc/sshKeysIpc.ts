import {
  ipcChannels,
  generateSshKeyRequestSchema,
  removeSshKeyRequestSchema,
  getFingerprintRequestSchema,
  type SshKeyInfo,
} from "@sshterm/shared";
import { execFile } from "node:child_process";
import { readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { promisify } from "node:util";
import type { IpcMainInvokeEvent } from "electron";
import type { IpcMainLike } from "./registerIpc";

const execFileAsync = promisify(execFile);

function sshDir(): string {
  return join(homedir(), ".ssh");
}

function detectKeyTypeFromName(name: string): SshKeyInfo["type"] {
  if (name.startsWith("id_ed25519") || name.includes("ed25519")) return "ed25519";
  if (name.startsWith("id_ecdsa") || name.includes("ecdsa")) return "ecdsa";
  if (name.startsWith("id_rsa") || name.includes("rsa")) return "rsa";
  if (name.startsWith("id_dsa") || name.includes("dsa")) return "dsa";
  return "unknown";
}

function detectKeyTypeFromFingerprint(fingerprint: string | null): SshKeyInfo["type"] | null {
  if (!fingerprint) return null;
  const upper = fingerprint.toUpperCase();
  if (upper.includes("(ED25519)")) return "ed25519";
  if (upper.includes("(ECDSA)")) return "ecdsa";
  if (upper.includes("(RSA)")) return "rsa";
  if (upper.includes("(DSA)")) return "dsa";
  return null;
}

function parseBitsFromFingerprint(fingerprint: string | null): number | null {
  if (!fingerprint) return null;
  const match = fingerprint.match(/^(\d+)\s/);
  return match ? parseInt(match[1], 10) : null;
}

async function getFingerprint(keyPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("ssh-keygen", ["-lf", keyPath]);
    return stdout.trim();
  } catch {
    return null;
  }
}

export function registerSshKeysIpc(ipcMain: IpcMainLike): void {
  ipcMain.handle(ipcChannels.sshKeys.list, async () => {
    const dir = sshDir();
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return [];
    }

    const skipNames = new Set([
      "config",
      "known_hosts",
      "known_hosts.old",
      "authorized_keys",
      "environment",
    ]);
    const privateKeys = entries.filter(
      (e) => !e.endsWith(".pub") && !skipNames.has(e) && !e.startsWith(".")
    );

    const results: SshKeyInfo[] = [];
    for (const name of privateKeys) {
      const keyPath = join(dir, name);
      try {
        const st = await stat(keyPath);
        if (!st.isFile()) continue;
        const hasPublicKey = entries.includes(`${name}.pub`);
        const fingerprint = await getFingerprint(keyPath);
        const type = detectKeyTypeFromFingerprint(fingerprint) ?? detectKeyTypeFromName(name);
        const bits = parseBitsFromFingerprint(fingerprint);
        results.push({
          path: keyPath,
          name,
          type,
          bits,
          fingerprint,
          hasPublicKey,
          createdAt: st.birthtime?.toISOString() ?? null,
        });
      } catch {
        continue;
      }
    }

    return results;
  });

  ipcMain.handle(
    ipcChannels.sshKeys.generate,
    async (_event: IpcMainInvokeEvent, request: unknown) => {
      const parsed = generateSshKeyRequestSchema.parse(request);
      const keyPath = join(sshDir(), parsed.name);
      const args = [
        "-t",
        parsed.type,
        "-f",
        keyPath,
        "-N",
        parsed.passphrase ?? "",
        "-C",
        parsed.comment ?? "",
      ];
      if (parsed.type === "rsa" && parsed.bits) {
        args.push("-b", String(parsed.bits));
      }
      await execFileAsync("ssh-keygen", args);
      return { path: keyPath };
    }
  );

  ipcMain.handle(
    ipcChannels.sshKeys.getFingerprint,
    async (_event: IpcMainInvokeEvent, request: unknown) => {
      const parsed = getFingerprintRequestSchema.parse(request);
      const fingerprint = await getFingerprint(parsed.path);
      return { fingerprint };
    }
  );

  ipcMain.handle(
    ipcChannels.sshKeys.remove,
    async (_event: IpcMainInvokeEvent, request: unknown) => {
      const parsed = removeSshKeyRequestSchema.parse(request);
      await unlink(parsed.path);
      try {
        await unlink(`${parsed.path}.pub`);
      } catch {
        // .pub may not exist
      }
      return { success: true };
    }
  );
}
