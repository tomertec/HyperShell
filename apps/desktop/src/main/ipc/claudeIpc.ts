import { ipcMain } from "electron";
import {
  claudeSessionInfoRequestSchema,
  claudeSessionInfoResponseSchema,
  ipcChannels,
  type ClaudeSessionInfoResponse,
} from "@hypershell/shared";

import { getClaudeSessionInfo } from "../claudeSessions";

export function registerClaudeIpc(): void {
  ipcMain.handle(
    ipcChannels.claude.sessionInfo,
    async (_event, request: unknown): Promise<ClaudeSessionInfoResponse> => {
      const parsed = claudeSessionInfoRequestSchema.parse(request);
      const info = await getClaudeSessionInfo(parsed.sessionId).catch(() => null);
      return claudeSessionInfoResponseSchema.parse({ info });
    }
  );
}
