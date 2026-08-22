import { describe, expect, it, vi, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ipcChannels } from "@hypershell/shared";

const electronMock = vi.hoisted(() => ({
  appDataDir: "",
}));

vi.mock("electron", () => ({
  app: {
    getPath: () => {
      if (!electronMock.appDataDir) {
        electronMock.appDataDir = mkdtempSync(path.join(tmpdir(), "hypershell-groups-ipc-"));
      }
      return electronMock.appDataDir;
    },
  },
  safeStorage: { isEncryptionAvailable: () => false },
}));

import { registerHostIpc, closeSharedDatabase } from "./hostsIpc";

type IpcHandler = (event: unknown, request?: unknown) => unknown;

function createHandlers(): Map<string, IpcHandler> {
  const handlers = new Map<string, IpcHandler>();
  registerHostIpc({
    handle: (channel: string, handler: IpcHandler) => {
      handlers.set(channel, handler);
    },
  } as never);
  return handlers;
}

afterAll(() => {
  closeSharedDatabase();
  if (electronMock.appDataDir) {
    rmSync(electronMock.appDataDir, { recursive: true, force: true });
  }
});

describe("host group persistence", () => {
  const handlers = createHandlers();
  const upsert = (request: Record<string, unknown>) =>
    handlers.get(ipcChannels.hosts.upsert)!({}, request) as Record<string, unknown>;
  const list = () =>
    handlers.get(ipcChannels.hosts.list)!({}) as Array<Record<string, unknown>>;

  it("persists a new group by name and returns it on upsert and list", () => {
    const saved = upsert({ id: "g1", name: "web", hostname: "web.example.com", group: "Production" });
    expect(saved.group).toBe("Production");
    expect(saved.groupId).toBeTruthy();

    const listed = list().find((h) => h.id === "g1");
    expect(listed?.group).toBe("Production");
    expect(listed?.groupId).toBe(saved.groupId);
  });

  it("reuses the existing group row for the same name", () => {
    const first = upsert({ id: "g2", name: "db", hostname: "db.example.com", group: "Production" });
    const second = upsert({ id: "g3", name: "cache", hostname: "cache.example.com", group: "Production" });
    expect(second.groupId).toBe(first.groupId);
  });

  it("clears the group when the name is empty or omitted", () => {
    upsert({ id: "g4", name: "app", hostname: "app.example.com", group: "Staging" });
    const cleared = upsert({ id: "g4", name: "app", hostname: "app.example.com", group: "" });
    expect(cleared.groupId).toBeNull();
    expect(cleared.group).toBe("");

    upsert({ id: "g5", name: "edge", hostname: "edge.example.com", group: "Staging" });
    const omitted = upsert({ id: "g5", name: "edge", hostname: "edge.example.com" });
    expect(omitted.groupId).toBeNull();
  });

  it("persists group assignment through reorder", () => {
    upsert({ id: "g6", name: "a", hostname: "a.example.com" });
    upsert({ id: "g7", name: "b", hostname: "b.example.com", group: "Infra" });
    handlers.get(ipcChannels.hosts.reorder)!({}, {
      items: [
        { id: "g6", sortOrder: 0, groupId: null, group: "Infra" },
        { id: "g7", sortOrder: 1, groupId: null, group: "" },
      ],
    });
    const hosts = list();
    expect(hosts.find((h) => h.id === "g6")?.group).toBe("Infra");
    expect(hosts.find((h) => h.id === "g7")?.group).toBe("");
    expect(hosts.find((h) => h.id === "g7")?.groupId).toBeNull();
  });
});
