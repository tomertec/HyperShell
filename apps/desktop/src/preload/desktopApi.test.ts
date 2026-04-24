import { describe, expect, it, vi } from "vitest";

import { ipcChannels, type SessionEvent } from "@hypershell/shared";

import { createDesktopApi, type PreloadIpcRenderer } from "./desktopApi";

function createFakeIpcRenderer() {
  const listeners = new Map<
    string,
    Set<(event: unknown, ...args: unknown[]) => void>
  >();
  const invoke = vi.fn<
    (channel: string, ...args: unknown[]) => Promise<unknown>
  >(async (_channel, _request) => undefined);
  const send = vi.fn<(channel: string, ...args: unknown[]) => void>();

  const ipcRenderer: PreloadIpcRenderer = {
    invoke,
    send,
    on(channel, listener) {
      const current = listeners.get(channel) ?? new Set();
      current.add(listener);
      listeners.set(channel, current);
    },
    removeListener(channel, listener) {
      listeners.get(channel)?.delete(listener);
    }
  };

  return {
    ipcRenderer,
    invoke,
    send,
    emit(channel: string, payload?: unknown) {
      for (const listener of listeners.get(channel) ?? []) {
        listener({}, payload);
      }
    },
    listenerCount(channel: string) {
      return listeners.get(channel)?.size ?? 0;
    }
  };
}

describe("createDesktopApi", () => {
  it("validates openSession request/response and routes through invoke", async () => {
    const fake = createFakeIpcRenderer();
    fake.invoke.mockResolvedValueOnce({
      sessionId: "s1",
      state: "connecting"
    });
    const api = createDesktopApi(fake.ipcRenderer);

    const result = await api.openSession({
      transport: "ssh",
      profileId: "host-1",
      cols: 120,
      rows: 40
    });

    expect(result).toEqual({
      sessionId: "s1",
      state: "connecting"
    });
    expect(fake.invoke).toHaveBeenCalledWith(ipcChannels.session.open, {
      transport: "ssh",
      profileId: "host-1",
      cols: 120,
      rows: 40
    });
  });

  it("rejects invalid openSession inputs before IPC invoke", async () => {
    const fake = createFakeIpcRenderer();
    const api = createDesktopApi(fake.ipcRenderer);

    await expect(
      api.openSession({
        transport: "ssh",
        profileId: "",
        cols: 120,
        rows: 40
      } as unknown as Parameters<typeof api.openSession>[0])
    ).rejects.toBeTruthy();
    expect(fake.invoke).not.toHaveBeenCalled();
  });

  it("rejects invalid resize/write/close inputs before IPC invoke", async () => {
    const fake = createFakeIpcRenderer();
    const api = createDesktopApi(fake.ipcRenderer);

    await expect(
      api.resizeSession({
        sessionId: "",
        cols: 120,
        rows: 40
      } as unknown as Parameters<typeof api.resizeSession>[0])
    ).rejects.toBeTruthy();
    await expect(
      api.writeSession({
        sessionId: "session-1",
        data: 123
      } as unknown as Parameters<typeof api.writeSession>[0])
    ).rejects.toBeTruthy();
    await expect(
      api.closeSession({
        sessionId: ""
      } as unknown as Parameters<typeof api.closeSession>[0])
    ).rejects.toBeTruthy();
    expect(fake.invoke).not.toHaveBeenCalled();
  });

  it("rejects invalid openSession responses", async () => {
    const fake = createFakeIpcRenderer();
    fake.invoke.mockResolvedValueOnce({
      sessionId: "",
      state: "bad-state"
    });
    const api = createDesktopApi(fake.ipcRenderer);

    await expect(
      api.openSession({
        transport: "ssh",
        profileId: "host-1",
        cols: 120,
        rows: 40
      })
    ).rejects.toBeTruthy();
  });

  it("starts native SFTP drag-out over fire-and-forget IPC", () => {
    const fake = createFakeIpcRenderer();
    const api = createDesktopApi(fake.ipcRenderer);

    api.sftpStartNativeDragOut({
      sftpSessionId: "sftp-1",
      remotePath: "/home/user/project",
      fileName: "project",
      isDirectory: true,
    });

    expect(fake.send).toHaveBeenCalledWith(ipcChannels.sftp.startNativeDragOut, {
      sftpSessionId: "sftp-1",
      remotePath: "/home/user/project",
      fileName: "project",
      isDirectory: true,
    });
    expect(fake.invoke).not.toHaveBeenCalled();
  });

  it("guards session event listener payloads and catches listener exceptions", () => {
    const fake = createFakeIpcRenderer();
    const logger = {
      warn: vi.fn(),
      error: vi.fn()
    };
    const api = createDesktopApi(fake.ipcRenderer, logger);
    const seen: SessionEvent[] = [];
    const unsubscribe = api.onSessionEvent((event) => {
      seen.push(event);
      throw new Error("listener failed");
    });

    const invalidPayloads: unknown[] = [
      undefined,
      null,
      {},
      { type: "unknown" },
      { type: "status", sessionId: "", state: "connected" },
      { type: "error", sessionId: "s1", message: "" }
    ];

    for (const payload of invalidPayloads) {
      fake.emit(ipcChannels.session.event, payload);
    }

    fake.emit(ipcChannels.session.event, {
      type: "status",
      sessionId: "s1",
      state: "connected"
    });

    expect(seen).toEqual([
      {
        type: "status",
        sessionId: "s1",
        state: "connected"
      }
    ]);
    expect(logger.warn).toHaveBeenCalledTimes(invalidPayloads.length);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(fake.listenerCount(ipcChannels.session.event)).toBe(1);

    unsubscribe();
    expect(fake.listenerCount(ipcChannels.session.event)).toBe(0);
  });

  it("guards quick-connect listeners and unsubscribes cleanly", () => {
    const fake = createFakeIpcRenderer();
    const logger = {
      warn: vi.fn(),
      error: vi.fn()
    };
    const api = createDesktopApi(fake.ipcRenderer, logger);
    let calls = 0;
    const unsubscribe = api.onQuickConnect(() => {
      calls += 1;
      throw new Error("boom");
    });

    fake.emit(ipcChannels.tray.quickConnect);
    expect(calls).toBe(1);
    expect(logger.error).toHaveBeenCalledTimes(1);

    unsubscribe();
    fake.emit(ipcChannels.tray.quickConnect);
    expect(calls).toBe(1);
  });

  it("rejects invalid listener types for session and quick-connect events", () => {
    const fake = createFakeIpcRenderer();
    const api = createDesktopApi(fake.ipcRenderer);

    expect(() => api.onSessionEvent(null as unknown as () => void)).toThrow(
      TypeError
    );
    expect(() => api.onQuickConnect({} as unknown as () => void)).toThrow(
      TypeError
    );
    expect(fake.listenerCount(ipcChannels.session.event)).toBe(0);
    expect(fake.listenerCount(ipcChannels.tray.quickConnect)).toBe(0);
  });

  it("normalizes legacy sftpList array payloads", async () => {
    const fake = createFakeIpcRenderer();
    fake.invoke.mockResolvedValueOnce([
      {
        filename: "lib",
        attrs: {
          mode: 0o040755,
          size: 4096,
          mtime: 1712400000,
          uid: 0,
          gid: 0
        }
      },
      {
        filename: "hosts",
        attrs: {
          mode: 0o100644,
          size: 120,
          mtime: 1712403600,
          uid: 0,
          gid: 0
        }
      }
    ]);
    const api = createDesktopApi(fake.ipcRenderer);

    const result = await api.sftpList({
      sftpSessionId: "sftp-1",
      path: "/"
    });

    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]).toMatchObject({
      name: "lib",
      path: "/lib",
      isDirectory: true,
      permissions: 0o755
    });
    expect(result.entries[1]).toMatchObject({
      name: "hosts",
      path: "/hosts",
      isDirectory: false,
      size: 120,
      permissions: 0o644
    });
  });

  it("normalizes non-canonical sftpStat payloads", async () => {
    const fake = createFakeIpcRenderer();
    fake.invoke.mockResolvedValueOnce({
      filename: "passwd",
      fullPath: "/etc/passwd",
      attrs: {
        mode: 0o100644,
        size: 2048,
        mtime: 1712407200,
        uid: 0,
        gid: 0
      }
    });
    const api = createDesktopApi(fake.ipcRenderer);

    const result = await api.sftpStat({
      sftpSessionId: "sftp-1",
      path: "/etc/passwd"
    });

    expect(result).toMatchObject({
      name: "passwd",
      path: "/etc/passwd",
      isDirectory: false,
      permissions: 0o644,
      size: 2048
    });
  });

  it("validates chmod request and routes through invoke", async () => {
    const fake = createFakeIpcRenderer();
    const api = createDesktopApi(fake.ipcRenderer);

    await api.sftpChmod({
      sftpSessionId: "sftp-1",
      path: "/var/log/app.log",
      permissions: 0o640
    });

    expect(fake.invoke).toHaveBeenCalledWith(ipcChannels.sftp.chmod, {
      sftpSessionId: "sftp-1",
      path: "/var/log/app.log",
      permissions: 0o640
    });
  });
});
