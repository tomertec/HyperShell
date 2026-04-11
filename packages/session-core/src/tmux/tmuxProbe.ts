// packages/session-core/src/tmux/tmuxProbe.ts

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

export async function tmuxProbe(_options: TmuxProbeOptions): Promise<TmuxSession[]> {
  throw new Error("Not implemented");
}
