import { createWriteStream, mkdirSync } from "node:fs";
import type { WriteStream } from "node:fs";
import path from "node:path";
import {
  ipcChannels,
  startLoggingRequestSchema,
  stopLoggingRequestSchema,
  getLoggingStateRequestSchema,
} from "@sshterm/shared";
import type { IpcMainLike } from "./registerIpc";

type LogSession = {
  stream: WriteStream;
  filePath: string;
  bytesWritten: number;
};

const ANSI_ESCAPE_RE = /\x1b\[[0-9;]*[a-zA-Z]/g;

export function createSessionLogger() {
  const sessions = new Map<string, LogSession>();

  return {
    start(sessionId: string, filePath: string) {
      const existing = sessions.get(sessionId);
      if (existing) {
        existing.stream.end();
      }
      mkdirSync(path.dirname(filePath), { recursive: true });
      const stream = createWriteStream(filePath, { flags: "a", encoding: "utf-8" });
      sessions.set(sessionId, { stream, filePath, bytesWritten: 0 });
    },

    stop(sessionId: string) {
      const session = sessions.get(sessionId);
      if (session) {
        session.stream.end();
        sessions.delete(sessionId);
      }
    },

    onSessionData(sessionId: string, data: string) {
      const session = sessions.get(sessionId);
      if (!session) return;
      const clean = data.replace(ANSI_ESCAPE_RE, "");
      session.stream.write(clean);
      session.bytesWritten += Buffer.byteLength(clean, "utf-8");
    },

    getState(sessionId: string) {
      const session = sessions.get(sessionId);
      if (!session) {
        return { active: false, filePath: null, bytesWritten: 0 };
      }
      return {
        active: true,
        filePath: session.filePath,
        bytesWritten: session.bytesWritten,
      };
    },

    stopAll() {
      for (const [, session] of sessions) {
        session.stream.end();
      }
      sessions.clear();
    },
  };
}

export function registerLoggingIpc(ipcMain: IpcMainLike, logger: ReturnType<typeof createSessionLogger>) {
  ipcMain.handle(ipcChannels.logging.start, async (_event: unknown, request: unknown) => {
    const parsed = startLoggingRequestSchema.parse(request);
    logger.start(parsed.sessionId, parsed.filePath);
  });

  ipcMain.handle(ipcChannels.logging.stop, async (_event: unknown, request: unknown) => {
    const parsed = stopLoggingRequestSchema.parse(request);
    logger.stop(parsed.sessionId);
  });

  ipcMain.handle(ipcChannels.logging.getState, async (_event: unknown, request: unknown) => {
    const parsed = getLoggingStateRequestSchema.parse(request);
    return logger.getState(parsed.sessionId);
  });
}
