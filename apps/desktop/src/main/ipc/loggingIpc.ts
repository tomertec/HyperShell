import { createWriteStream, mkdirSync } from "node:fs";
import type { WriteStream } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  assertAbsolutePath,
  assertNotWindowsDevicePath,
  assertPathWithinAllowedRoots,
} from "../security/pathPolicy";

function assertSafeLogPath(filePath: string): string {
  const resolved = assertAbsolutePath(filePath, "Absolute path is required for logging");
  assertNotWindowsDevicePath(resolved);

  // Allow paths within user home or OS temp directory
  const allowedRoots = [os.homedir(), os.tmpdir()].map((root) => path.resolve(root));
  assertPathWithinAllowedRoots(
    resolved,
    allowedRoots,
    "Log path must be within the user home or temp directory"
  );

  return resolved;
}
import {
  ipcChannels,
  startLoggingRequestSchema,
  stopLoggingRequestSchema,
  getLoggingStateRequestSchema,
} from "@hypershell/shared";
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
      const safePath = assertSafeLogPath(filePath);
      const existing = sessions.get(sessionId);
      if (existing) {
        existing.stream.end();
      }
      mkdirSync(path.dirname(safePath), { recursive: true });
      const stream = createWriteStream(safePath, { flags: "a", encoding: "utf-8" });
      sessions.set(sessionId, { stream, filePath: safePath, bytesWritten: 0 });
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
