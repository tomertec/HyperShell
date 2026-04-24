import {
  ipcChannels,
  generateSshKeyRequestSchema,
  removeSshKeyRequestSchema,
  getFingerprintRequestSchema,
  convertPpkRequestSchema,
  type SshKeyInfo,
  type ConvertPpkResponse,
} from "@hypershell/shared";
import { convertPpkToOpenSsh } from "@hypershell/session-core";
import { execFile } from "node:child_process";
import { readdir, stat, unlink } from "node:fs/promises";
import path, { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { promisify } from "node:util";
import type { IpcMainInvokeEvent } from "electron";
import type { IpcMainLike } from "./registerIpc";
import {
  assertAbsolutePath,
  assertNotWindowsDevicePath,
  assertPathWithinAllowedRoots,
} from "../security/pathPolicy";

const execFileAsync = promisify(execFile);

function sshDir(): string {
  return join(homedir(), ".ssh");
}

function assertSafeSshKeyName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed === "." || trimmed === "..") {
    throw new Error("SSH key name is required");
  }
  if (trimmed.includes(path.posix.sep) || trimmed.includes(path.win32.sep)) {
    throw new Error("SSH key name cannot include path separators");
  }
  return trimmed;
}

function assertPathInSshDirectory(filePath: string): string {
  const resolvedPath = assertAbsolutePath(filePath, "Absolute path is required for SSH key operations");
  const allowedRoot = path.resolve(sshDir());
  assertPathWithinAllowedRoots(
    resolvedPath,
    [allowedRoot],
    "SSH key path must be within the ~/.ssh directory"
  );
  return resolvedPath;
}

function assertSafePpkPath(filePath: string): string {
  const resolvedPath = assertAbsolutePath(filePath, "Absolute path is required for PPK conversion");
  assertNotWindowsDevicePath(resolvedPath);

  if (path.extname(resolvedPath).toLowerCase() !== ".ppk") {
    throw new Error("PPK conversion requires a .ppk file");
  }

  const allowedRoots = [homedir(), tmpdir()].map((root) => path.resolve(root));
  assertPathWithinAllowedRoots(
    resolvedPath,
    allowedRoots,
    "PPK path must be within the user home or temp directory"
  );
  return resolvedPath;
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
      const safeName = assertSafeSshKeyName(parsed.name);
      const keyPath = assertPathInSshDirectory(join(sshDir(), safeName));
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
      const keyPath = assertPathInSshDirectory(parsed.path);
      const fingerprint = await getFingerprint(keyPath);
      return { fingerprint };
    }
  );

  ipcMain.handle(
    ipcChannels.sshKeys.remove,
    async (_event: IpcMainInvokeEvent, request: unknown) => {
      const parsed = removeSshKeyRequestSchema.parse(request);
      const keyPath = assertPathInSshDirectory(parsed.path);
      await unlink(keyPath);
      try {
        await unlink(`${keyPath}.pub`);
      } catch {
        // .pub may not exist
      }
      return { success: true };
    }
  );

  ipcMain.handle(
    ipcChannels.sshKeys.convertPpk,
    async (_event: IpcMainInvokeEvent, request: unknown): Promise<ConvertPpkResponse> => {
      const parsed = convertPpkRequestSchema.parse(request);
      const ppkPath = assertSafePpkPath(parsed.ppkPath);
      return convertPpkToOpenSsh(ppkPath);
    }
  );
}
