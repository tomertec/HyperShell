import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import type { LocalProfileIcon } from "@hypershell/shared";

export interface DetectedShell {
  detectKey: string;
  name: string;
  executable: string;
  args: string[];
  icon: LocalProfileIcon;
}

export interface DetectProbes {
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  fileExists(candidate: string): boolean;
  /** Returns raw stdout, or null when the command is unavailable or fails. */
  runCommand(file: string, args: string[]): Buffer | null;
}

export function createDefaultProbes(): DetectProbes {
  return {
    platform: process.platform,
    env: process.env,
    fileExists: (candidate) => existsSync(candidate),
    runCommand: (file, args) => {
      try {
        return execFileSync(file, args, { timeout: 5_000, windowsHide: true });
      } catch {
        return null;
      }
    }
  };
}

/** `wsl.exe -l -q` writes UTF-16LE. Decoding as UTF-8 yields NUL-interleaved names. */
export function parseWslDistros(stdout: Buffer): string[] {
  return stdout
    .toString("utf16le")
    .split(/\r?\n/)
    .map((line) => line.replaceAll("\u0000", "").trim())
    .filter((line) => line.length > 0);
}

/**
 * Docker Desktop manages internal WSL distros (`docker-desktop`, `docker-desktop-data`)
 * that are not intended for direct terminal use. Filter them out to match Windows Terminal's behavior.
 */
function isInternalWslDistro(distroName: string): boolean {
  const internalNames = new Set([
    "docker-desktop",
    "docker-desktop-data"
  ]);
  return internalNames.has(distroName.toLowerCase());
}

function detectWindowsShells(probes: DetectProbes): DetectedShell[] {
  const shells: DetectedShell[] = [];
  const systemRoot = probes.env.SystemRoot ?? probes.env.WINDIR ?? "C:\\Windows";
  const programFiles = probes.env.ProgramFiles ?? "C:\\Program Files";

  // Always path.win32: these are Windows paths whatever host builds them, and
  // path.join follows the host's separator, so on a POSIX runner it would emit
  // `C:\Windows/System32/...` and match nothing.
  const windowsPowerShell = path.win32.join(
    systemRoot,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe"
  );
  if (probes.fileExists(windowsPowerShell)) {
    shells.push({
      detectKey: "windows-powershell",
      name: "Windows PowerShell",
      executable: windowsPowerShell,
      args: [],
      icon: "powershell"
    });
  }

  const pwsh7 = path.win32.join(programFiles, "PowerShell", "7", "pwsh.exe");
  if (probes.fileExists(pwsh7)) {
    shells.push({
      detectKey: "pwsh7",
      name: "PowerShell",
      executable: pwsh7,
      args: [],
      icon: "powershell"
    });
  }

  const cmd = path.win32.join(systemRoot, "System32", "cmd.exe");
  if (probes.fileExists(cmd)) {
    shells.push({
      detectKey: "cmd",
      name: "Command Prompt",
      executable: cmd,
      args: [],
      icon: "cmd"
    });
  }

  const gitBash = path.win32.join(programFiles, "Git", "bin", "bash.exe");
  if (probes.fileExists(gitBash)) {
    shells.push({
      detectKey: "git-bash",
      name: "Git Bash",
      executable: gitBash,
      args: [],
      icon: "bash"
    });
  }

  // Gate the probe on the binary existing, like the four shells above: spawning
  // `wsl.exe` is the only part of detection that costs real time (up to the 5s
  // command timeout), so a machine without WSL should not pay for a failed
  // spawn to learn what a file check already answers.
  const wsl = path.win32.join(systemRoot, "System32", "wsl.exe");
  const wslOutput = probes.fileExists(wsl) ? probes.runCommand(wsl, ["-l", "-q"]) : null;
  if (wslOutput) {
    for (const distro of parseWslDistros(wslOutput)) {
      if (!isInternalWslDistro(distro)) {
        shells.push({
          detectKey: `wsl:${distro}`,
          name: `${distro} (WSL)`,
          executable: wsl,
          args: ["-d", distro],
          icon: "linux"
        });
      }
    }
  }

  return shells;
}

function detectPosixShells(probes: DetectProbes): DetectedShell[] {
  const candidates = [probes.env.SHELL, "/bin/zsh", "/bin/bash", "/bin/sh"].filter(
    (candidate): candidate is string => Boolean(candidate)
  );

  for (const candidate of candidates) {
    if (probes.fileExists(candidate)) {
      return [
        {
          detectKey: "default-shell",
          name: path.posix.basename(candidate),
          executable: candidate,
          args: [],
          icon: "terminal"
        }
      ];
    }
  }

  return [];
}

export function detectLocalShells(probes: DetectProbes): DetectedShell[] {
  return probes.platform === "win32"
    ? detectWindowsShells(probes)
    : detectPosixShells(probes);
}
