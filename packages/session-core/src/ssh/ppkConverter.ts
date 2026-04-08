import { execFile } from "node:child_process";
import { readFile, writeFile, access } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface PpkConvertResult {
  success: boolean;
  outputPath?: string;
  error?: string;
  tool?: "ssh-keygen" | "puttygen" | "none";
}

/**
 * Check whether a file is in PuTTY PPK format by inspecting its header.
 */
export async function isPpkFile(filePath: string): Promise<boolean> {
  try {
    const buf = await readFile(filePath, "utf-8");
    const firstLine = buf.split(/\r?\n/)[0] ?? "";
    return (
      firstLine.startsWith("PuTTY-User-Key-File-2:") ||
      firstLine.startsWith("PuTTY-User-Key-File-3:")
    );
  } catch {
    return false;
  }
}

/**
 * Derive the output path for the converted key.
 * E.g. `C:\Users\me\.ssh\mykey.ppk` -> `C:\Users\me\.ssh\mykey_openssh`
 */
export function getConvertedKeyPath(ppkPath: string): string {
  const dir = dirname(ppkPath);
  const base = basename(ppkPath, ".ppk");
  return join(dir, `${base}_openssh`);
}

/**
 * Convert a PuTTY .ppk key to OpenSSH format.
 *
 * Strategy:
 * 1. Try `ssh-keygen -i -f <ppk>` (outputs to stdout, works with OpenSSH 8.4+ for PPK v2/v3)
 * 2. If that fails, try `puttygen <ppk> -O private-openssh -o <output>`
 * 3. If neither tool works, return instructions for manual conversion
 */
export async function convertPpkToOpenSsh(ppkPath: string): Promise<PpkConvertResult> {
  const outputPath = getConvertedKeyPath(ppkPath);

  // Verify input exists
  try {
    await access(ppkPath);
  } catch {
    return {
      success: false,
      error: `PPK file not found: ${ppkPath}`,
      tool: "none",
    };
  }

  // Verify it's actually a PPK file
  const ppk = await isPpkFile(ppkPath);
  if (!ppk) {
    return {
      success: false,
      error: "File does not appear to be in PuTTY PPK format.",
      tool: "none",
    };
  }

  // Strategy 1: ssh-keygen
  try {
    const { stdout } = await execFileAsync("ssh-keygen", ["-i", "-f", ppkPath]);
    if (stdout.trim()) {
      await writeFile(outputPath, stdout.trim() + "\n", { mode: 0o600 });
      return { success: true, outputPath, tool: "ssh-keygen" };
    }
  } catch {
    // ssh-keygen failed, try puttygen
  }

  // Strategy 2: puttygen
  try {
    await execFileAsync("puttygen", [ppkPath, "-O", "private-openssh", "-o", outputPath]);
    return { success: true, outputPath, tool: "puttygen" };
  } catch {
    // puttygen not available either
  }

  return {
    success: false,
    error:
      "Neither ssh-keygen nor puttygen could convert this file. " +
      "Install PuTTY (puttygen) or OpenSSH 8.4+ and try again, or convert manually:\n" +
      "  puttygen mykey.ppk -O private-openssh -o mykey_openssh",
    tool: "none",
  };
}
