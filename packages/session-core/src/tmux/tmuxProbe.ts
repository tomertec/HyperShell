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

export function parseTmuxListOutput(_output: string): TmuxSession[] {
  throw new Error("Not implemented");
}

export async function tmuxProbe(_options: TmuxProbeOptions): Promise<TmuxSession[]> {
  throw new Error("Not implemented");
}
