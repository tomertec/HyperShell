import { describe, expect, it, vi } from "vitest";
import { ipcChannels } from "@hypershell/shared";
import type { SqliteDatabase } from "@hypershell/db";

import { registerSessionRecoveryIpc } from "./sessionRecoveryIpc";
import type { IpcMainLike } from "./registerIpc";

const captured: { sessions: unknown[] } = { sessions: [] };

vi.mock("@hypershell/db", () => ({
  createSavedSessionRepositoryFromDatabase: () => ({
    replaceAll: (sessions: unknown[]) => {
      captured.sessions = sessions;
      return sessions.length;
    },
    listRecoverable: () => [],
    clearAll: () => 0,
    markAllGraceful: () => 0,
  }),
}));

function createFakeIpcMain() {
  const handlers = new Map<string, (event: unknown, request?: unknown) => Promise<unknown>>();
  return {
    handle(channel: string, handler: (event: unknown, request?: unknown) => Promise<unknown>) {
      handlers.set(channel, handler);
    },
    invoke(channel: string, request?: unknown) {
      const handler = handlers.get(channel);
      if (!handler) {
        throw new Error(`No handler for ${channel}`);
      }
      return handler({}, request);
    },
  } as IpcMainLike & { invoke: (channel: string, request?: unknown) => Promise<unknown> };
}

describe("session recovery save-state", () => {
  it("carries the Claude session id through to the repository", async () => {
    // The handler whitelists fields, so a new field has to be added there too
    // or the saved_sessions column silently never gets written.
    const ipcMain = createFakeIpcMain();
    registerSessionRecoveryIpc(ipcMain, () => ({}) as SqliteDatabase);

    await ipcMain.invoke(ipcChannels.session.saveState, {
      sessions: [
        {
          id: "s1",
          transport: "local",
          profileId: "p1",
          title: "Claude",
          claudeSessionId: "64afeb05-2f9f-4bba-8087-9b7029b2fab1",
        },
      ],
    });

    expect(captured.sessions[0]).toMatchObject({
      claudeSessionId: "64afeb05-2f9f-4bba-8087-9b7029b2fab1",
    });
  });

  it("stores null for a session with no Claude conversation", async () => {
    const ipcMain = createFakeIpcMain();
    registerSessionRecoveryIpc(ipcMain, () => ({}) as SqliteDatabase);

    await ipcMain.invoke(ipcChannels.session.saveState, {
      sessions: [{ id: "s2", transport: "ssh", profileId: "h1", title: "web01" }],
    });

    expect(captured.sessions[0]).toMatchObject({ claudeSessionId: null });
  });
});
