import { describe, expect, it, vi } from "vitest";

import { ipcChannels, type SessionEvent } from "@sshterm/shared";

import { createMainProcessLifecycle } from "./mainLifecycle";

vi.mock("electron", () => ({}));

function createFakeApp() {
  const listeners = {
    activate: [] as Array<() => void>,
    "before-quit": [] as Array<() => void>
  };

  return {
    whenReady: vi.fn(async () => {}),
    on(event: "activate" | "before-quit", listener: () => void) {
      listeners[event].push(listener);
    },
    quit: vi.fn(),
    emit(event: "activate" | "before-quit") {
      for (const listener of listeners[event]) {
        listener();
      }
    },
    listenerCount(event: "activate" | "before-quit") {
      return listeners[event].length;
    }
  };
}

function createWindow(id: string) {
  return {
    id,
    destroyed: false,
    loadURL: vi.fn(async (_url: string) => {}),
    isDestroyed() {
      return this.destroyed;
    },
    webContents: {
      send: vi.fn()
    }
  };
}

function createTray(id: string) {
  return {
    id,
    destroy: vi.fn()
  };
}

function createHostMonitor() {
  return {
    start: vi.fn(),
    stop: vi.fn()
  };
}

describe("createMainProcessLifecycle", () => {
  it("boots, recreates the tray when the window is recreated, and cleans up before quit", async () => {
    const app = createFakeApp();
    const firstWindow = createWindow("window-1");
    const secondWindow = createWindow("window-2");
    const firstTray = createTray("tray-1");
    const secondTray = createTray("tray-2");
    const hostMonitor = createHostMonitor();
    const cleanupIpc = vi.fn();
    let sessionEventHandler: (event: SessionEvent) => void = () => {};
    let sftpEventHandler: (event: unknown) => void = () => {};

    const createMainWindow = vi
      .fn()
      .mockReturnValueOnce(firstWindow)
      .mockReturnValueOnce(secondWindow);
    const createTraySpy = vi
      .fn()
      .mockReturnValueOnce(firstTray)
      .mockReturnValueOnce(secondTray);
    const registerIpc = vi.fn(
      (
        _ipcMain: unknown,
        options: {
          emitSessionEvent?: (event: SessionEvent) => void;
          emitSftpEvent?: (event: unknown) => void;
        }
      ) => {
        sessionEventHandler = options.emitSessionEvent ?? (() => {});
        sftpEventHandler = options.emitSftpEvent ?? (() => {});
        return cleanupIpc;
      }
    );

    const lifecycle = createMainProcessLifecycle({
      app,
      ipcMain: {
        handle() {}
      },
      createMainWindow,
      createTray: createTraySpy,
      createHostMonitor: () => hostMonitor,
      registerIpc,
      getRendererUrl: () => "http://localhost:5173"
    });

    await lifecycle.bootstrap();

    expect(app.whenReady).toHaveBeenCalledTimes(1);
    expect(app.listenerCount("activate")).toBe(1);
    expect(app.listenerCount("before-quit")).toBe(1);
    expect(createMainWindow).toHaveBeenCalledTimes(1);
    expect(createTraySpy).toHaveBeenCalledWith(firstWindow);
    expect(hostMonitor.start).toHaveBeenCalledTimes(1);
    expect(registerIpc).toHaveBeenCalledTimes(1);

    sessionEventHandler({
      type: "status",
      sessionId: "session-1",
      state: "connected"
    });
    expect(firstWindow.webContents.send).toHaveBeenCalledWith(
      ipcChannels.session.event,
      {
        type: "status",
        sessionId: "session-1",
        state: "connected"
      }
    );

    sftpEventHandler({
      kind: "status",
      sftpSessionId: "sftp-1",
      state: "connected"
    });
    expect(firstWindow.webContents.send).toHaveBeenCalledWith(
      ipcChannels.sftp.event,
      {
        kind: "status",
        sftpSessionId: "sftp-1",
        state: "connected"
      }
    );

    firstWindow.destroyed = true;
    app.emit("activate");

    expect(createMainWindow).toHaveBeenCalledTimes(2);
    expect(firstTray.destroy).toHaveBeenCalledTimes(1);
    expect(createTraySpy).toHaveBeenCalledWith(secondWindow);

    sessionEventHandler({
      type: "status",
      sessionId: "session-2",
      state: "disconnected"
    });
    expect(secondWindow.webContents.send).toHaveBeenCalledWith(
      ipcChannels.session.event,
      {
        type: "status",
        sessionId: "session-2",
        state: "disconnected"
      }
    );
    sftpEventHandler({
      kind: "status",
      sftpSessionId: "sftp-2",
      state: "disconnected"
    });
    expect(secondWindow.webContents.send).toHaveBeenCalledWith(
      ipcChannels.sftp.event,
      {
        kind: "status",
        sftpSessionId: "sftp-2",
        state: "disconnected"
      }
    );
    expect(firstWindow.webContents.send).toHaveBeenCalledTimes(2);

    app.emit("before-quit");

    expect(cleanupIpc).toHaveBeenCalledTimes(1);
    expect(hostMonitor.stop).toHaveBeenCalledTimes(1);
    expect(secondTray.destroy).toHaveBeenCalledTimes(1);

    app.emit("before-quit");
    expect(cleanupIpc).toHaveBeenCalledTimes(1);
    expect(hostMonitor.stop).toHaveBeenCalledTimes(1);
    expect(secondTray.destroy).toHaveBeenCalledTimes(1);
  });

  it("accepts early beforeQuit and can bootstrap afterward", async () => {
    const app = createFakeApp();
    const window = createWindow("window-early");
    const tray = createTray("tray-early");
    const hostMonitor = createHostMonitor();
    const cleanupIpc = vi.fn();

    const lifecycle = createMainProcessLifecycle({
      app,
      ipcMain: {
        handle() {}
      },
      createMainWindow: vi.fn().mockReturnValue(window),
      createTray: vi.fn().mockReturnValue(tray),
      createHostMonitor: vi.fn().mockReturnValue(hostMonitor),
      registerIpc: vi.fn().mockReturnValue(cleanupIpc),
      getRendererUrl: () => "http://localhost:5173"
    });

    expect(() => lifecycle.beforeQuit()).not.toThrow();

    await lifecycle.bootstrap();

    expect(cleanupIpc).not.toHaveBeenCalled();
    expect(hostMonitor.start).toHaveBeenCalledTimes(1);
    expect(tray.destroy).not.toHaveBeenCalled();
    expect(app.listenerCount("activate")).toBe(1);
    expect(app.listenerCount("before-quit")).toBe(1);
  });

  it("replaces active resources on repeated bootstrap and remains idempotent on cleanup", async () => {
    const app = createFakeApp();
    const firstWindow = createWindow("window-1");
    const secondWindow = createWindow("window-2");
    const thirdWindow = createWindow("window-3");
    const firstTray = createTray("tray-1");
    const secondTray = createTray("tray-2");
    const thirdTray = createTray("tray-3");
    const firstHostMonitor = createHostMonitor();
    const secondHostMonitor = createHostMonitor();
    const thirdHostMonitor = createHostMonitor();
    const cleanupOne = vi.fn();
    const cleanupTwo = vi.fn();
    const cleanupThree = vi.fn();

    const createMainWindow = vi
      .fn()
      .mockReturnValueOnce(firstWindow)
      .mockReturnValueOnce(secondWindow)
      .mockReturnValueOnce(thirdWindow);
    const createTraySpy = vi
      .fn()
      .mockReturnValueOnce(firstTray)
      .mockReturnValueOnce(secondTray)
      .mockReturnValueOnce(thirdTray);
    const createHostMonitorSpy = vi
      .fn()
      .mockReturnValueOnce(firstHostMonitor)
      .mockReturnValueOnce(secondHostMonitor)
      .mockReturnValueOnce(thirdHostMonitor);
    const registerIpc = vi
      .fn()
      .mockReturnValueOnce(cleanupOne)
      .mockReturnValueOnce(cleanupTwo)
      .mockReturnValueOnce(cleanupThree);

    const lifecycle = createMainProcessLifecycle({
      app,
      ipcMain: {
        handle() {}
      },
      createMainWindow,
      createTray: createTraySpy,
      createHostMonitor: createHostMonitorSpy,
      registerIpc,
      getRendererUrl: () => "http://localhost:5173"
    });

    await lifecycle.bootstrap();
    await lifecycle.bootstrap();

    expect(createMainWindow).toHaveBeenCalledTimes(2);
    expect(createTraySpy).toHaveBeenCalledTimes(2);
    expect(createHostMonitorSpy).toHaveBeenCalledTimes(2);
    expect(registerIpc).toHaveBeenCalledTimes(2);
    expect(cleanupOne).toHaveBeenCalledTimes(1);
    expect(firstHostMonitor.stop).toHaveBeenCalledTimes(1);
    expect(firstTray.destroy).toHaveBeenCalledTimes(1);
    expect(secondHostMonitor.start).toHaveBeenCalledTimes(1);

    app.emit("before-quit");

    expect(cleanupTwo).toHaveBeenCalledTimes(1);
    expect(secondHostMonitor.stop).toHaveBeenCalledTimes(1);
    expect(secondTray.destroy).toHaveBeenCalledTimes(1);
    expect(cleanupThree).not.toHaveBeenCalled();
    expect(thirdHostMonitor.start).not.toHaveBeenCalled();
    expect(thirdTray.destroy).not.toHaveBeenCalled();

    await lifecycle.bootstrap();

    expect(createMainWindow).toHaveBeenCalledTimes(3);
    expect(createTraySpy).toHaveBeenCalledTimes(3);
    expect(createHostMonitorSpy).toHaveBeenCalledTimes(3);
    expect(registerIpc).toHaveBeenCalledTimes(3);
    expect(cleanupTwo).toHaveBeenCalledTimes(1);
    expect(thirdHostMonitor.start).toHaveBeenCalledTimes(1);

    app.emit("before-quit");
    expect(cleanupThree).toHaveBeenCalledTimes(1);
    expect(thirdHostMonitor.stop).toHaveBeenCalledTimes(1);
    expect(thirdTray.destroy).toHaveBeenCalledTimes(1);

    app.emit("before-quit");
    expect(cleanupThree).toHaveBeenCalledTimes(1);
    expect(thirdHostMonitor.stop).toHaveBeenCalledTimes(1);
    expect(thirdTray.destroy).toHaveBeenCalledTimes(1);
  });
});
