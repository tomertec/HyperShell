import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export interface ScpCommandOptions {
  hostname: string;
  port?: number;
  username?: string;
  privateKeyPath?: string;
  knownHostsFile?: string;
  proxyJump?: string;
  direction: "upload" | "download";
  remotePath: string;
  localPath: string;
}

export interface ScpCommand {
  command: string;
  args: string[];
}

export function buildScpCommand(options: ScpCommandOptions): ScpCommand {
  let command = "scp";
  if (process.platform === "win32") {
    const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
    if (systemRoot) {
      const bundledPath = path.join(systemRoot, "System32", "OpenSSH", "scp.exe");
      if (existsSync(bundledPath)) {
        command = bundledPath;
      }
    }
  }

  const args: string[] = [];
  const knownHostsFile = options.knownHostsFile ?? path.join(os.homedir(), ".ssh", "known_hosts");

  // Prevent interactive prompts — fail fast on auth issues
  args.push("-o", "BatchMode=yes");
  args.push("-o", "StrictHostKeyChecking=accept-new");
  args.push("-o", `UserKnownHostsFile=${knownHostsFile}`);

  if (options.port != null) {
    args.push("-P", String(options.port)); // SCP uses uppercase -P (not -p like ssh)
  }

  if (options.privateKeyPath) {
    args.push("-i", options.privateKeyPath);
  }

  if (options.proxyJump) {
    if (!/^[\w.@:,[\]\-]+$/.test(options.proxyJump)) {
      throw new Error("Invalid proxyJump format");
    }
    args.push("-J", options.proxyJump);
  }

  const destination = options.username
    ? `${options.username}@${options.hostname}`
    : options.hostname;

  if (options.direction === "download") {
    args.push(`${destination}:${options.remotePath}`, options.localPath);
  } else {
    args.push(options.localPath, `${destination}:${options.remotePath}`);
  }

  return { command, args };
}
