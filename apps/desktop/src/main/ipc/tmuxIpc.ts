import {
  ipcChannels,
  tmuxProbeRequestSchema,
  type TmuxProbeResponse,
} from "@hypershell/shared";
import { tmuxProbe, type TmuxSession } from "@hypershell/session-core";
import type { IpcMainLike } from "./registerIpc";

type HostLookup = {
  get(id: string):
    | {
        hostname: string;
        username: string | null;
        port: number;
        identityFile: string | null;
        proxyJump: string | null;
        keepAliveInterval: number | null;
      }
    | undefined;
};

export function registerTmuxIpc(
  ipcMain: IpcMainLike,
  getHostsRepo: () => HostLookup,
): void {
  ipcMain.handle(
    ipcChannels.tmux.probe,
    async (_event: unknown, request: unknown): Promise<TmuxProbeResponse> => {
      const parsed = tmuxProbeRequestSchema.parse(request);
      const repo = getHostsRepo();
      const host = repo.get(parsed.hostId);

      if (!host) {
        return { sessions: [] };
      }

      const sessions = await tmuxProbe({
        hostname: host.hostname,
        username: host.username ?? undefined,
        port: host.port,
        identityFile: host.identityFile ?? undefined,
        proxyJump: host.proxyJump ?? undefined,
        keepAliveSeconds: host.keepAliveInterval ?? undefined,
      });

      return {
        sessions: sessions.map((s: TmuxSession) => ({
          name: s.name,
          windowCount: s.windowCount,
          createdAt: s.createdAt.toISOString(),
          attached: s.attached,
        })),
      };
    },
  );
}
