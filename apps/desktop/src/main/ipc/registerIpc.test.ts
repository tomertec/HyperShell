import { describe, expect, it } from "vitest";
import { ipcChannels, type SessionEvent } from "@sshterm/shared";
import type { SessionManager, SessionSnapshot } from "@sshterm/session-core";
import type { IpcMainInvokeEvent } from "electron";

import { getRegisteredChannels, registerIpc } from "./registerIpc";

function createFakeIpcMain() {
  const handlers = new Map<
    string,
    (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
  >();

  return {
    handle(
      channel: string,
      handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
    ) {
      handlers.set(channel, handler);
    },
    removeHandler(channel: string) {
      handlers.delete(channel);
    },
    async invoke(channel: string, request: unknown) {
      const handler = handlers.get(channel);
      if (!handler) {
        throw new Error(`No handler for channel ${channel}`);
      }

      return handler({} as IpcMainInvokeEvent, request);
    },
    hasHandler(channel: string) {
      return handlers.has(channel);
    },
    handlerCount() {
      return handlers.size;
    }
  };
}

function createFakeSessionManager() {
  const events: SessionEvent[] = [];
  let listener: ((event: SessionEvent) => void) | null = null;
  const opens: unknown[] = [];
  const writes: unknown[] = [];
  const resizes: unknown[] = [];
  const closes: unknown[] = [];

  const manager: SessionManager = {
    open(input) {
      opens.push(input);
      return {
        sessionId: "session-1",
        state: "connecting"
      };
    },
    write(sessionId, data) {
      writes.push({ sessionId, data });
    },
    resize(sessionId, cols, rows) {
      resizes.push({ sessionId, cols, rows });
    },
    close(sessionId) {
      closes.push({ sessionId });
    },
    getSession(_sessionId): SessionSnapshot | undefined {
      return undefined;
    },
    listSessions(): SessionSnapshot[] {
      return [];
    },
    onEvent(nextListener) {
      listener = nextListener as (event: SessionEvent) => void;
      return () => {
        listener = null;
      };
    }
  };

  return {
    manager,
    opens,
    writes,
    resizes,
    closes,
    emit(event: SessionEvent) {
      events.push(event);
      listener?.(event);
    },
    emittedEvents: events
  };
}

describe("registerIpc", () => {
  it("registers the session open channel", () => {
    expect(getRegisteredChannels()).toContain("session:open");
  });

  it("rejects malformed payloads before reaching the SessionManager", async () => {
    const cases = [
      {
        channel: ipcChannels.session.open,
        payloads: [
          {},
          { transport: "ssh", profileId: "host-1", cols: 120 },
          { transport: "ssh", profileId: "", cols: 120, rows: 40 },
          { transport: "serial", profileId: "host-1", cols: -1, rows: 40 }
        ],
        expected: "opens"
      },
      {
        channel: ipcChannels.session.resize,
        payloads: [
          {},
          { sessionId: "session-1", cols: 120 },
          { sessionId: "", cols: 120, rows: 40 },
          { sessionId: "session-1", cols: 0, rows: 40 }
        ],
        expected: "resizes"
      },
      {
        channel: ipcChannels.session.write,
        payloads: [
          {},
          { sessionId: "session-1" },
          { sessionId: "", data: "ls\n" },
          { sessionId: "session-1", data: 42 }
        ],
        expected: "writes"
      },
      {
        channel: ipcChannels.session.close,
        payloads: [{}, { sessionId: "" }, { sessionId: 0 }],
        expected: "closes"
      }
    ] as const;

    for (const testCase of cases) {
      const ipcMain = createFakeIpcMain();
      const manager = createFakeSessionManager();
      registerIpc(ipcMain, {
        sessionManager: manager.manager
      });

      for (const payload of testCase.payloads) {
        await expect(
          ipcMain.invoke(testCase.channel, payload)
        ).rejects.toBeTruthy();
      }

      expect(manager.opens).toHaveLength(0);
      expect(manager.writes).toHaveLength(0);
      expect(manager.resizes).toHaveLength(0);
      expect(manager.closes).toHaveLength(0);
      const trackedCollections = {
        opens: manager.opens,
        resizes: manager.resizes,
        writes: manager.writes,
        closes: manager.closes
      } as const;
      expect(trackedCollections[testCase.expected]).toHaveLength(0);
    }
  });

  it("routes open/write/resize/close requests through the manager", async () => {
    const ipcMain = createFakeIpcMain();
    const manager = createFakeSessionManager();
    const unregister = registerIpc(ipcMain, {
      sessionManager: manager.manager
    });

    const openResult = await ipcMain.invoke(ipcChannels.session.open, {
      transport: "ssh",
      profileId: "host-1",
      cols: 120,
      rows: 40
    });
    await ipcMain.invoke(ipcChannels.session.write, {
      sessionId: "session-1",
      data: "ls\n"
    });
    await ipcMain.invoke(ipcChannels.session.resize, {
      sessionId: "session-1",
      cols: 140,
      rows: 50
    });
    await ipcMain.invoke(ipcChannels.session.close, {
      sessionId: "session-1"
    });

    expect(openResult).toEqual({
      sessionId: "session-1",
      state: "connecting"
    });
    expect(manager.opens).toHaveLength(1);
    expect(manager.writes).toEqual([{ sessionId: "session-1", data: "ls\n" }]);
    expect(manager.resizes).toEqual([
      {
        sessionId: "session-1",
        cols: 140,
        rows: 50
      }
    ]);
    expect(manager.closes).toEqual([{ sessionId: "session-1" }]);

    unregister();
    expect(ipcMain.handlerCount()).toBe(0);
  });

  it("cleans stale listeners and handlers when re-registered", () => {
    const ipcMain = createFakeIpcMain();
    const managerA = createFakeSessionManager();
    const managerB = createFakeSessionManager();
    const forwardedA: SessionEvent[] = [];
    const forwardedB: SessionEvent[] = [];

    registerIpc(ipcMain, {
      sessionManager: managerA.manager,
      emitSessionEvent(event) {
        forwardedA.push(event as SessionEvent);
      }
    });

    managerA.emit({
      type: "status",
      sessionId: "s-a",
      state: "connected"
    });
    expect(forwardedA).toHaveLength(1);

    const unregisterB = registerIpc(ipcMain, {
      sessionManager: managerB.manager,
      emitSessionEvent(event) {
        forwardedB.push(event as SessionEvent);
      }
    });

    managerA.emit({
      type: "status",
      sessionId: "s-a",
      state: "disconnected"
    });
    managerB.emit({
      type: "status",
      sessionId: "s-b",
      state: "connected"
    });

    expect(forwardedA).toHaveLength(1);
    expect(forwardedB).toEqual([
      {
        type: "status",
        sessionId: "s-b",
        state: "connected"
      }
    ]);
    expect(ipcMain.hasHandler(ipcChannels.session.open)).toBe(true);

    unregisterB();
    expect(ipcMain.handlerCount()).toBe(0);
  });
});
