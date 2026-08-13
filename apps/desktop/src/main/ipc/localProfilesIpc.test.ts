import { describe, expect, it, vi } from "vitest";
import { ipcChannels } from "@hypershell/shared";
import type { createLocalProfilesRepositoryFromDatabase, LocalProfileRecord } from "@hypershell/db";
import { registerLocalProfilesIpc } from "./localProfilesIpc";
import type { IpcMainLike } from "./registerIpc";

type LocalProfilesRepo = ReturnType<typeof createLocalProfilesRepositoryFromDatabase>;

type Handler = (event: unknown, request: unknown) => Promise<unknown>;

function createFakeIpcMain(): IpcMainLike & { invoke: (channel: string, request?: unknown) => Promise<unknown> } {
  const handlers = new Map<string, Handler>();

  return {
    handle(channel: string, handler: Handler) {
      handlers.set(channel, handler);
    },
    removeHandler(channel: string) {
      handlers.delete(channel);
    },
    invoke(channel: string, request?: unknown) {
      const handler = handlers.get(channel);
      if (!handler) {
        throw new Error(`No handler registered for ${channel}`);
      }
      return handler({}, request);
    }
  } as IpcMainLike & { invoke: (channel: string, request?: unknown) => Promise<unknown> };
}

function record(overrides: Partial<LocalProfileRecord> = {}): LocalProfileRecord {
  return {
    id: "p1",
    name: "PowerShell",
    executable: "pwsh.exe",
    args: [],
    startingDirectory: null,
    icon: "powershell",
    color: null,
    elevated: false,
    source: "user",
    detectKey: null,
    isAvailable: true,
    isHidden: false,
    sortOrder: 0,
    claudeSession: false,
    claudeSessionMode: "continue" as const,
    ...overrides
  };
}

function createFakeRepo(initial: LocalProfileRecord[] = []): LocalProfilesRepo {
  const rows = new Map(initial.map((row) => [row.id, row]));

  return {
    create(input) {
      const row: LocalProfileRecord = {
        id: input.id,
        name: input.name,
        executable: input.executable,
        args: input.args ?? [],
        startingDirectory: input.startingDirectory ?? null,
        icon: input.icon ?? "terminal",
        color: input.color ?? null,
        elevated: input.elevated ?? false,
        source: input.source ?? "user",
        detectKey: input.detectKey ?? null,
        isAvailable: input.isAvailable ?? true,
        isHidden: input.isHidden ?? false,
        sortOrder: input.sortOrder ?? 0,
        claudeSession: input.claudeSession ?? false,
        claudeSessionMode: input.claudeSessionMode ?? "continue"
      };
      rows.set(row.id, row);
      return row;
    },
    get: (id) => rows.get(id),
    getByDetectKey: (detectKey) =>
      Array.from(rows.values()).find((row) => row.detectKey === detectKey),
    list: () => Array.from(rows.values()),
    remove: (id) => rows.delete(id),
    setHidden: (id, hidden) => {
      const row = rows.get(id);
      if (row) row.isHidden = hidden;
    },
    setAvailable: (id, available) => {
      const row = rows.get(id);
      if (row) row.isAvailable = available;
    },
    reorder: (items) => {
      for (const item of items) {
        const row = rows.get(item.id);
        if (row) row.sortOrder = item.sortOrder;
      }
    },
    listEnvVars: () => [],
    replaceEnvVars: () => {}
  } satisfies LocalProfilesRepo;
}

describe("local profiles upsert", () => {
  // `null` and `undefined` are distinct on the wire: the form sends `null` from
  // its "clear" affordances and omits the field entirely when it has nothing to
  // say. Collapsing the two with `??` made clearing a no-op — the old value came
  // straight back on the next list().
  it("clears the colour when the request sends null", async () => {
    const repo = createFakeRepo([record({ color: "blue" })]);
    const ipcMain = createFakeIpcMain();
    registerLocalProfilesIpc(ipcMain, () => repo);

    const updated = (await ipcMain.invoke(ipcChannels.localProfiles.upsert, {
      id: "p1",
      name: "PowerShell",
      executable: "pwsh.exe",
      color: null
    })) as LocalProfileRecord;

    expect(updated.color).toBeNull();
    expect(repo.get("p1")?.color).toBeNull();
  });

  it("keeps the stored colour when the request omits the field", async () => {
    const repo = createFakeRepo([record({ color: "blue" })]);
    const ipcMain = createFakeIpcMain();
    registerLocalProfilesIpc(ipcMain, () => repo);

    const updated = (await ipcMain.invoke(ipcChannels.localProfiles.upsert, {
      id: "p1",
      name: "Renamed",
      executable: "pwsh.exe"
    })) as LocalProfileRecord;

    expect(updated.color).toBe("blue");
  });

  it("saves the Claude session flag from the request", async () => {
    const repo = createFakeRepo([record()]);
    const ipcMain = createFakeIpcMain();
    registerLocalProfilesIpc(ipcMain, () => repo);

    const updated = (await ipcMain.invoke(ipcChannels.localProfiles.upsert, {
      id: "p1",
      name: "Claude",
      executable: "claude.exe",
      claudeSession: true
    })) as LocalProfileRecord;

    expect(updated.claudeSession).toBe(true);
  });

  it("keeps the stored Claude session flag when the request omits it", async () => {
    // The handler whitelists fields one by one, so an omitted flag must fall
    // back to the stored value rather than silently resetting it to false.
    const repo = createFakeRepo([record({ claudeSession: true })]);
    const ipcMain = createFakeIpcMain();
    registerLocalProfilesIpc(ipcMain, () => repo);

    const updated = (await ipcMain.invoke(ipcChannels.localProfiles.upsert, {
      id: "p1",
      name: "Renamed",
      executable: "claude.exe"
    })) as LocalProfileRecord;

    expect(updated.claudeSession).toBe(true);
  });

  it("turns the Claude session flag off when the request sends false", async () => {
    const repo = createFakeRepo([record({ claudeSession: true })]);
    const ipcMain = createFakeIpcMain();
    registerLocalProfilesIpc(ipcMain, () => repo);

    const updated = (await ipcMain.invoke(ipcChannels.localProfiles.upsert, {
      id: "p1",
      name: "Claude",
      executable: "claude.exe",
      claudeSession: false
    })) as LocalProfileRecord;

    expect(updated.claudeSession).toBe(false);
  });

  it("clears the starting directory when the request sends null", async () => {
    const repo = createFakeRepo([record({ startingDirectory: "C:\\work" })]);
    const ipcMain = createFakeIpcMain();
    registerLocalProfilesIpc(ipcMain, () => repo);

    const updated = (await ipcMain.invoke(ipcChannels.localProfiles.upsert, {
      id: "p1",
      name: "PowerShell",
      executable: "pwsh.exe",
      startingDirectory: null
    })) as LocalProfileRecord;

    expect(updated.startingDirectory).toBeNull();
    expect(repo.get("p1")?.startingDirectory).toBeNull();
  });

  it("keeps the stored starting directory when the request omits the field", async () => {
    const repo = createFakeRepo([record({ startingDirectory: "C:\\work" })]);
    const ipcMain = createFakeIpcMain();
    registerLocalProfilesIpc(ipcMain, () => repo);

    const updated = (await ipcMain.invoke(ipcChannels.localProfiles.upsert, {
      id: "p1",
      name: "Renamed",
      executable: "pwsh.exe"
    })) as LocalProfileRecord;

    expect(updated.startingDirectory).toBe("C:\\work");
  });

  it("rejects a colour outside the palette", async () => {
    const repo = createFakeRepo([record()]);
    const ipcMain = createFakeIpcMain();
    registerLocalProfilesIpc(ipcMain, () => repo);

    await expect(
      ipcMain.invoke(ipcChannels.localProfiles.upsert, {
        id: "p1",
        name: "PowerShell",
        executable: "pwsh.exe",
        color: "url(javascript:alert(1))"
      })
    ).rejects.toThrow();
  });
});

describe("deferred shell detection", () => {
  it("does not run detection during registration", () => {
    const repo = createFakeRepo();
    const getRepo = vi.fn(() => repo);

    registerLocalProfilesIpc(createFakeIpcMain(), getRepo);

    // registerIpc runs before the main window exists, so nothing here may
    // spawn a shell probe synchronously.
    expect(getRepo).not.toHaveBeenCalled();
  });

  it("makes list wait for a scheduled detection pass", async () => {
    const repo = createFakeRepo();
    const order: string[] = [];
    let inDetection = false;
    const ipcMain = createFakeIpcMain();
    const handle = registerLocalProfilesIpc(ipcMain, () => {
      order.push(inDetection ? "detection" : "list");
      return repo;
    });

    const detection = handle.scheduleDetection().then(() => {
      inDetection = false;
    });
    inDetection = true;

    const listed = (await ipcMain.invoke(ipcChannels.localProfiles.list)) as LocalProfileRecord[];
    await detection;

    // The renderer's first read must observe reconciled data, so the repository
    // has to be touched by detection before `list` ever reaches it.
    expect(order[0]).toBe("detection");
    expect(listed).toEqual(repo.list());
  });

  it("resolves rather than throwing when a detection pass fails", async () => {
    const repo = createFakeRepo();
    const throwingGetRepo = () => {
      throw new Error("database gone");
    };
    const handle = registerLocalProfilesIpc(createFakeIpcMain(), throwingGetRepo);

    // A detection failure on the startup path must never reject: nothing
    // awaits it before the window is created, so a rejection would be an
    // unhandled one and, before that, an exception escaping registerIpc.
    await expect(handle.scheduleDetection()).resolves.toBeUndefined();
    expect(repo.list()).toEqual([]);
  });
});
