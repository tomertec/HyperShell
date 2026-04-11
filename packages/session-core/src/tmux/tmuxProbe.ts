// packages/session-core/src/tmux/tmuxProbe.ts

import { execFile } from "node:child_process";
import { buildSshPtyCommand } from "../transports/sshPtyTransport";

const TMUX_FORMAT =
  "#{session_name}|#{session_windows}|#{session_created}|#{session_attached}";
const DEFAULT_TIMEOUT_MS = 10_000;

export interface TmuxSession {
  name: string;
  windowCount: number;
  createdAt: Date;
  attached: boolean;
}

export interface TmuxProbeOptions {
  hostname: string;
  username?: string;
  port?: number;
  identityFile?: string;
  proxyJump?: string;
  keepAliveSeconds?: number;
  extraArgs?: string[];
  timeoutMs?: number;
}

export function parseTmuxListOutput(output: string): TmuxSession[] {
  const sessions: TmuxSession[] = [];
  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parts = trimmed.split("|");
    if (parts.length < 4) continue;

    const name = parts[0];
    const windowCount = parseInt(parts[1], 10);
    const createdEpoch = parseInt(parts[2], 10);
    const attachedFlag = parseInt(parts[3], 10);

    if (!name || isNaN(windowCount) || isNaN(createdEpoch)) continue;

    sessions.push({
      name,
      windowCount,
      createdAt: new Date(createdEpoch * 1000),
      attached: attachedFlag === 1,
    });
  }
  return sessions;
}

export async function tmuxProbe(
  options: TmuxProbeOptions,
): Promise<TmuxSession[]> {
  try {
    const profile = {
      hostname: options.hostname,
      username: options.username,
      port: options.port,
      identityFile: options.identityFile,
      proxyJump: options.proxyJump,
      keepAliveSeconds: options.keepAliveSeconds,
      extraArgs: options.extraArgs,
      requestTty: false,
    };

    const { command, args } = buildSshPtyCommand(profile);
    // buildSshPtyCommand puts destination last; append remote command after it
    args.push(`tmux ls -F '${TMUX_FORMAT}'`);

    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    return new Promise<TmuxSession[]>((resolve) => {
      const child = execFile(
        command,
        args,
        { timeout: timeoutMs, windowsHide: true },
        (error, stdout) => {
          if (error) {
            resolve([]);
            return;
          }
          resolve(parseTmuxListOutput(stdout));
        },
      );

      // Safety net: resolve empty on spawn errors (e.g. binary not found)
      child.on("error", () => resolve([]));
    });
  } catch {
    // buildSshPtyCommand/buildSshArgs can throw (e.g. invalid proxyJump)
    return [];
  }
}
