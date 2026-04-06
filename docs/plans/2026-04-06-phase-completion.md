# SSHTerm Phase 2-4 Completion Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete all remaining Phase 2-4 features identified in the gap analysis — split panes, auth wiring, host delete, SSH config import, group management, session reconnect, broadcast UI, port forwarding execution, and settings persistence.

**Architecture:** Each task builds on the existing three-layer Electron model (main → preload → renderer). All IPC additions follow the established pattern: Zod schema in `packages/shared`, handler in `apps/desktop`, preload method in `desktopApi.ts`, UI consumption via `window.sshterm`. Database changes use existing repositories pattern with `better-sqlite3`.

**Tech Stack:** TypeScript, Zod, Zustand, React, xterm.js, better-sqlite3, node-pty, Vitest

---

## Parallel Group A — Backend Features (independent, run concurrently)

### Task 1: Host Delete

**Files:**
- Modify: `packages/db/src/repositories/hostsRepository.ts`
- Modify: `apps/desktop/src/main/ipc/hostsIpc.ts`
- Test: `packages/db/src/repositories/hostsRepository.test.ts`

**Step 1: Add `remove` to hostsRepository**

In `packages/db/src/repositories/hostsRepository.ts`, add a `deleteHost` prepared statement and a `remove` method to both the database-backed and in-memory repositories.

Database-backed — add after `getHostById` prepared statement (~line 95):

```typescript
const deleteHost = db.prepare(`DELETE FROM hosts WHERE id = ?`);
```

Add `remove` method to the returned object after `list()`:

```typescript
remove(id: string): boolean {
  const result = deleteHost.run(id);
  return result.changes > 0;
}
```

In-memory — add `remove` method after `list()`:

```typescript
remove(id: string): boolean {
  return hosts.delete(id);
}
```

Update `HostsRepoLike` usage — the `createHostsRepository` function doesn't define an explicit return type; the callers in `hostsIpc.ts` use a `HostsRepoLike` type. That type needs updating too (Task 1 Step 3).

**Step 2: Add `remove` to file-backed repo in hostsIpc.ts**

In `apps/desktop/src/main/ipc/hostsIpc.ts`, update the `HostsRepoLike` type (line 24-27) to include `remove`:

```typescript
type HostsRepoLike = {
  create(input: HostInput): HostRecord;
  list(): HostRecord[];
  remove(id: string): boolean;
};
```

Add `remove` method to `createFileBackedHostsRepo` returned object:

```typescript
remove(id: string): boolean {
  const hosts = readHosts();
  const index = hosts.findIndex((host) => host.id === id);
  if (index === -1) return false;
  hosts.splice(index, 1);
  writeHosts(hosts);
  return true;
}
```

**Step 3: Implement the remove IPC handler**

Replace the stub at line 171-173 in `hostsIpc.ts`:

```typescript
ipcMain.handle(ipcChannels.hosts.remove, (_event: IpcMainInvokeEvent, request: RemoveHostRequest) => {
  const parsed = removeHostRequestSchema.parse(request);
  getOrCreateHostsRepo().remove(parsed.id);
});
```

**Step 4: Write tests**

In `packages/db/src/repositories/hostsRepository.test.ts`, add:

```typescript
it("removes a host by id", () => {
  const repo = createHostsRepository();
  repo.create({ id: "h1", name: "test", hostname: "example.com" });
  expect(repo.remove("h1")).toBe(true);
  expect(repo.list()).toHaveLength(0);
});

it("returns false when removing a non-existent host", () => {
  const repo = createHostsRepository();
  expect(repo.remove("nonexistent")).toBe(false);
});
```

**Step 5: Run tests**

```bash
pnpm --filter @sshterm/db test
```

**Step 6: Commit**

```bash
git add packages/db/src/repositories/hostsRepository.ts apps/desktop/src/main/ipc/hostsIpc.ts packages/db/src/repositories/hostsRepository.test.ts
git commit -m "feat: implement host delete in repository and IPC handler"
```

---

### Task 2: Settings Persistence

**Files:**
- Create: `apps/desktop/src/main/ipc/settingsIpc.ts`
- Modify: `apps/desktop/src/main/ipc/registerIpc.ts`
- Modify: `apps/desktop/src/preload/desktopApi.ts`
- Modify: `packages/shared/src/ipc/schemas.ts`
- Modify: `packages/shared/src/ipc/contracts.ts`
- Test: `apps/desktop/src/main/ipc/settingsIpc.test.ts` (new)

**Step 1: Add settings schemas to shared**

In `packages/shared/src/ipc/schemas.ts`, add after the host schemas:

```typescript
// --- Settings schemas ---

export const getSettingRequestSchema = z.object({
  key: z.string().min(1)
});

export const updateSettingRequestSchema = z.object({
  key: z.string().min(1),
  value: z.string()
});

export const settingRecordSchema = z.object({
  key: z.string().min(1),
  value: z.string()
});

export type GetSettingRequest = z.infer<typeof getSettingRequestSchema>;
export type UpdateSettingRequest = z.infer<typeof updateSettingRequestSchema>;
export type SettingRecord = z.infer<typeof settingRecordSchema>;
```

**Step 2: Create settingsIpc.ts**

Create `apps/desktop/src/main/ipc/settingsIpc.ts`:

```typescript
import {
  ipcChannels,
  getSettingRequestSchema,
  updateSettingRequestSchema,
  type GetSettingRequest,
  type UpdateSettingRequest,
  type SettingRecord
} from "@sshterm/shared";
import type { IpcMainInvokeEvent } from "electron";
import type { IpcMainLike } from "./registerIpc";

type SettingsRepoLike = {
  get(key: string): SettingRecord | undefined;
  set(key: string, value: string): SettingRecord;
  list(): SettingRecord[];
};

let settingsRepo: SettingsRepoLike | null = null;

function getOrCreateSettingsRepo(getDb: () => unknown): SettingsRepoLike {
  if (settingsRepo) return settingsRepo;

  const db = getDb() as import("better-sqlite3").Database | null;

  if (db) {
    const getSetting = db.prepare("SELECT key, value FROM app_settings WHERE key = ?");
    const upsertSetting = db.prepare(`
      INSERT INTO app_settings (key, value) VALUES (@key, @value)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `);
    const listSettings = db.prepare("SELECT key, value FROM app_settings ORDER BY key");

    settingsRepo = {
      get(key: string): SettingRecord | undefined {
        const row = getSetting.get(key) as { key: string; value: string } | undefined;
        return row ? { key: row.key, value: row.value } : undefined;
      },
      set(key: string, value: string): SettingRecord {
        upsertSetting.run({ key, value });
        return { key, value };
      },
      list(): SettingRecord[] {
        return listSettings.all() as SettingRecord[];
      }
    };
  } else {
    const store = new Map<string, string>();
    settingsRepo = {
      get(key: string): SettingRecord | undefined {
        const value = store.get(key);
        return value !== undefined ? { key, value } : undefined;
      },
      set(key: string, value: string): SettingRecord {
        store.set(key, value);
        return { key, value };
      },
      list(): SettingRecord[] {
        return Array.from(store.entries(), ([key, value]) => ({ key, value }));
      }
    };
  }

  return settingsRepo;
}

export function registerSettingsIpc(ipcMain: IpcMainLike, getDb: () => unknown): void {
  ipcMain.handle(ipcChannels.settings.get, (_event: IpcMainInvokeEvent, request: GetSettingRequest) => {
    const parsed = getSettingRequestSchema.parse(request);
    return getOrCreateSettingsRepo(getDb).get(parsed.key) ?? null;
  });

  ipcMain.handle(ipcChannels.settings.update, (_event: IpcMainInvokeEvent, request: UpdateSettingRequest) => {
    const parsed = updateSettingRequestSchema.parse(request);
    return getOrCreateSettingsRepo(getDb).set(parsed.key, parsed.value);
  });
}
```

**Step 3: Register settings IPC in registerIpc.ts**

In `apps/desktop/src/main/ipc/registerIpc.ts`:

Add import:
```typescript
import { registerSettingsIpc } from "./settingsIpc";
```

Add channels to `registeredChannels`:
```typescript
const registeredChannels = [
  ipcChannels.session.open,
  ipcChannels.session.resize,
  ipcChannels.session.write,
  ipcChannels.session.close,
  ipcChannels.hosts.list,
  ipcChannels.hosts.upsert,
  ipcChannels.hosts.remove,
  ipcChannels.settings.get,
  ipcChannels.settings.update
] as const;
```

Call in `registerIpc()` after `registerHostIpc(ipcMain)`:
```typescript
registerSettingsIpc(ipcMain, () => null);
```

**Step 4: Add preload methods**

In `apps/desktop/src/preload/desktopApi.ts`, add to imports:
```typescript
import {
  // ... existing imports ...
  getSettingRequestSchema,
  updateSettingRequestSchema,
  type GetSettingRequest,
  type UpdateSettingRequest,
  type SettingRecord
} from "@sshterm/shared";
```

Add to `DesktopApi` interface:
```typescript
getSetting(request: GetSettingRequest): Promise<SettingRecord | null>;
updateSetting(request: UpdateSettingRequest): Promise<SettingRecord>;
```

Add implementations to `createDesktopApi` return object:
```typescript
async getSetting(request: GetSettingRequest): Promise<SettingRecord | null> {
  const parsed = getSettingRequestSchema.parse(request);
  const result = await ipcRenderer.invoke(ipcChannels.settings.get, parsed);
  return result as SettingRecord | null;
},
async updateSetting(request: UpdateSettingRequest): Promise<SettingRecord> {
  const parsed = updateSettingRequestSchema.parse(request);
  const result = await ipcRenderer.invoke(ipcChannels.settings.update, parsed);
  return result as SettingRecord;
}
```

**Step 5: Export new types from shared index**

The existing `export * from "./ipc/schemas"` in `packages/shared/src/index.ts` already re-exports everything from schemas.ts, so no change needed.

**Step 6: Write test**

Create `apps/desktop/src/main/ipc/settingsIpc.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { registerSettingsIpc } from "./settingsIpc";

function createMockIpcMain() {
  const handlers = new Map<string, Function>();
  return {
    handle(channel: string, handler: Function) {
      handlers.set(channel, handler);
    },
    removeHandler(channel: string) {
      handlers.delete(channel);
    },
    invoke(channel: string, ...args: unknown[]) {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`No handler for ${channel}`);
      return handler({}, ...args);
    }
  };
}

describe("settingsIpc", () => {
  it("returns null for unknown setting", async () => {
    const ipc = createMockIpcMain();
    registerSettingsIpc(ipc, () => null);
    const result = await ipc.invoke("settings:get", { key: "theme" });
    expect(result).toBeNull();
  });

  it("stores and retrieves a setting", async () => {
    const ipc = createMockIpcMain();
    registerSettingsIpc(ipc, () => null);
    await ipc.invoke("settings:update", { key: "theme", value: "dark" });
    const result = await ipc.invoke("settings:get", { key: "theme" });
    expect(result).toEqual({ key: "theme", value: "dark" });
  });
});
```

**Step 7: Run tests**

```bash
pnpm --filter @sshterm/desktop test
```

**Step 8: Commit**

```bash
git add packages/shared/src/ipc/schemas.ts apps/desktop/src/main/ipc/settingsIpc.ts apps/desktop/src/main/ipc/settingsIpc.test.ts apps/desktop/src/main/ipc/registerIpc.ts apps/desktop/src/preload/desktopApi.ts
git commit -m "feat: add settings persistence via app_settings table"
```

---

### Task 3: Wire Auth Profiles Into Session Opening

**Files:**
- Modify: `packages/session-core/src/sessionManager.ts`
- Modify: `packages/session-core/src/transports/transportEvents.ts`
- Modify: `apps/desktop/src/main/ipc/registerIpc.ts`
- Modify: `apps/desktop/src/main/ipc/hostsIpc.ts`
- Modify: `packages/shared/src/ipc/schemas.ts`
- Test: `packages/session-core/src/sessionManager.test.ts`

The current flow: `openSession({ transport, profileId })` → `createDefaultTransport` treats `profileId` as hostname for SSH or path for serial. This needs to resolve the profileId against the hosts/serial_profiles database to build a real `SshConnectionProfile` or `SerialConnectionProfile`.

**Step 1: Extend OpenSessionRequest to carry resolved profile data**

Currently the renderer sends `{ transport, profileId, cols, rows }` and the session manager uses `profileId` as hostname. Instead of making session-core depend on the database, we'll resolve the profile in the IPC layer (main process) and pass the resolved connection details to the session manager.

In `packages/session-core/src/transports/transportEvents.ts`, extend `OpenSessionRequest`:

```typescript
export interface SshConnectionOptions {
  hostname: string;
  username?: string;
  port?: number;
  identityFile?: string;
  proxyJump?: string;
  keepAliveSeconds?: number;
}

export interface SerialConnectionOptions {
  path: string;
  baudRate?: number;
  dataBits?: number;
  stopBits?: number;
  parity?: string;
  flowControl?: string;
  localEcho?: boolean;
  dtr?: boolean;
  rts?: boolean;
}

export type OpenSessionRequest = {
  sessionId: string;
  transport: SessionTransportKind;
  profileId: string;
  cols: number;
  rows: number;
  sshOptions?: SshConnectionOptions;
  serialOptions?: SerialConnectionOptions;
};
```

**Step 2: Update createDefaultTransport in sessionManager.ts**

Replace the `createDefaultTransport` function (lines 77-91):

```typescript
function createDefaultTransport(request: OpenSessionRequest): TransportHandle {
  if (request.transport === "ssh") {
    const opts = request.sshOptions ?? { hostname: request.profileId };
    return createSshPtyTransport(request, {
      hostname: opts.hostname,
      username: opts.username,
      port: opts.port,
      identityFile: opts.identityFile,
      proxyJump: opts.proxyJump,
      keepAliveSeconds: opts.keepAliveSeconds
    });
  }

  if (request.transport === "serial") {
    const opts = request.serialOptions ?? { path: request.profileId };
    return createSerialTransport(request, {
      path: opts.path,
      baudRate: opts.baudRate,
      dataBits: opts.dataBits,
      stopBits: opts.stopBits,
      parity: opts.parity,
      flowControl: opts.flowControl,
      localEcho: opts.localEcho,
      dtr: opts.dtr,
      rts: opts.rts
    });
  }

  return createNoopTransport(request.sessionId);
}
```

**Step 3: Add `OpenSessionInput.sshOptions` and `serialOptions`**

In `sessionManager.ts`, update `OpenSessionInput`:

```typescript
export interface OpenSessionInput {
  transport: SessionTransportKind;
  profileId: string;
  cols: number;
  rows: number;
  sshOptions?: SshConnectionOptions;
  serialOptions?: SerialConnectionOptions;
}
```

Import the types:
```typescript
import type {
  OpenSessionRequest,
  SessionState,
  SessionTransportEvent,
  SessionTransportKind,
  SshConnectionOptions,
  SerialConnectionOptions,
  TransportHandle
} from "./transports/transportEvents";
```

Pass them through in `open()` — update the `createTransport` call (line 152-158):

```typescript
const transport = createTransport({
  sessionId,
  transport: input.transport,
  profileId: input.profileId,
  cols: input.cols,
  rows: input.rows,
  sshOptions: input.sshOptions,
  serialOptions: input.serialOptions
});
```

**Step 4: Resolve host profiles in the IPC handler**

In `apps/desktop/src/main/ipc/registerIpc.ts`, update `openSessionHandler` to look up host data and resolve auth profiles. Add a profile resolution function:

```typescript
import { resolveOnePasswordReference, isOnePasswordReference } from "../security/opResolver";
import { revealSecret } from "../security/secureStorage";
```

The host lookup needs access to the hosts repo. Update `RegisterIpcOptions`:

```typescript
export interface RegisterIpcOptions {
  emitSessionEvent?: (event: unknown) => void;
  sessionManager?: SessionManager;
  resolveHostProfile?: (profileId: string) => Promise<{ hostname: string; username?: string; port?: number; identityFile?: string; proxyJump?: string } | null>;
}
```

Update `openSessionHandler` to pass resolved data:

```typescript
async function openSessionHandler(
  _event: IpcMainInvokeEvent,
  request: OpenSessionRequest,
  manager: SessionManager = sessionManager,
  resolveHostProfile?: RegisterIpcOptions["resolveHostProfile"]
): Promise<OpenSessionResponse> {
  const parsed = openSessionRequestSchema.parse(request);

  let sshOptions: { hostname: string; username?: string; port?: number; identityFile?: string; proxyJump?: string } | undefined;

  if (parsed.transport === "ssh" && resolveHostProfile) {
    const profile = await resolveHostProfile(parsed.profileId);
    if (profile) {
      sshOptions = profile;
    }
  }

  return manager.open({
    ...parsed,
    sshOptions: sshOptions ?? { hostname: parsed.profileId }
  });
}
```

Wire in registerIpc — update the handler registration:

```typescript
ipcMain.handle(ipcChannels.session.open, (event, request) =>
  openSessionHandler(event, request, manager, options.resolveHostProfile)
);
```

**Step 5: Export new types from session-core index**

In `packages/session-core/src/index.ts`, ensure `SshConnectionOptions` and `SerialConnectionOptions` are exported. Check what's currently exported and add if needed:

```typescript
export type { SshConnectionOptions, SerialConnectionOptions } from "./transports/transportEvents";
```

**Step 6: Update tests**

In `packages/session-core/src/sessionManager.test.ts`, add:

```typescript
it("passes sshOptions to transport when provided", () => {
  let capturedRequest: OpenSessionRequest | null = null;

  const manager = createSessionManager({
    createTransport(request) {
      capturedRequest = request;
      return createNoopTransport(request.sessionId);
    }
  });

  manager.open({
    transport: "ssh",
    profileId: "host-1",
    cols: 80,
    rows: 24,
    sshOptions: { hostname: "10.0.0.1", username: "admin", port: 2222 }
  });

  expect(capturedRequest?.sshOptions).toEqual({
    hostname: "10.0.0.1",
    username: "admin",
    port: 2222
  });
});
```

You'll need to import `createNoopTransport` or inline it — check if it's exported. If not, define a local helper:

```typescript
function createTestTransport(sessionId: string): TransportHandle {
  const listeners = new Set<(event: SessionTransportEvent) => void>();
  return {
    write() {},
    resize() {},
    close() {
      for (const l of listeners) l({ type: "exit", sessionId, exitCode: null });
    },
    onEvent(l) { listeners.add(l); return () => { listeners.delete(l); }; }
  };
}
```

**Step 7: Run tests**

```bash
pnpm --filter @sshterm/session-core test
```

**Step 8: Commit**

```bash
git add packages/session-core/src/transports/transportEvents.ts packages/session-core/src/sessionManager.ts packages/session-core/src/index.ts apps/desktop/src/main/ipc/registerIpc.ts packages/session-core/src/sessionManager.test.ts
git commit -m "feat: wire auth profile resolution into session opening"
```

---

## Parallel Group B — UI Features (independent, run concurrently)

### Task 4: Split Pane UI

**Files:**
- Modify: `apps/ui/src/features/layout/layoutStore.ts`
- Modify: `apps/ui/src/features/layout/Workspace.tsx`
- Modify: `apps/ui/src/features/layout/layoutStore.test.ts`

**Step 1: Extend layoutStore with split pane state**

The store currently manages a flat list of tabs. Add split support by introducing a `panes` concept — each pane holds one or more tabs and panes are arranged in a horizontal split array.

In `apps/ui/src/features/layout/layoutStore.ts`, add to `LayoutState`:

```typescript
export type Pane = {
  paneId: string;
  sessionId: string | null;
};

export type LayoutState = {
  tabs: LayoutTab[];
  activeSessionId: string | null;
  panes: Pane[];
  activePaneId: string;
  openTab: (tab: LayoutTab) => void;
  activateTab: (sessionId: string) => void;
  replaceSessionId: (oldSessionId: string, nextSessionId: string) => void;
  splitPane: (sessionId: string) => void;
  closePane: (paneId: string) => void;
  activatePane: (paneId: string) => void;
};
```

Initialize with a single pane:

```typescript
const initialPaneId = "pane-1";
```

In `createLayoutStore`, add initial state and actions:

```typescript
panes: [{ paneId: initialPaneId, sessionId: null }],
activePaneId: initialPaneId,

splitPane: (sessionId) =>
  set((state) => {
    const newPaneId = `pane-${state.panes.length + 1}`;
    return {
      panes: [...state.panes, { paneId: newPaneId, sessionId }],
      activePaneId: newPaneId
    };
  }),

closePane: (paneId) =>
  set((state) => {
    if (state.panes.length <= 1) return state;
    const nextPanes = state.panes.filter((p) => p.paneId !== paneId);
    return {
      panes: nextPanes,
      activePaneId:
        state.activePaneId === paneId
          ? nextPanes[nextPanes.length - 1].paneId
          : state.activePaneId
    };
  }),

activatePane: (paneId) =>
  set({ activePaneId: paneId }),
```

Also update `openTab` to set the active pane's session:

```typescript
openTab: (tab) =>
  set((state) => {
    const tabs = state.tabs.some((t) => t.sessionId === tab.sessionId)
      ? state.tabs
      : [...state.tabs, { ...tab, tabKey: tab.tabKey ?? tab.sessionId }];
    const panes = state.panes.map((p) =>
      p.paneId === state.activePaneId ? { ...p, sessionId: tab.sessionId } : p
    );
    return { tabs, activeSessionId: tab.sessionId, panes };
  }),
```

**Step 2: Update Workspace.tsx with split rendering**

Replace the single-pane rendering with a flex container that renders all panes side by side:

```typescript
import { useStore } from "zustand";

import { TerminalPane } from "../terminal/TerminalPane";
import { layoutStore, type Pane } from "./layoutStore";
import { TabBar } from "./TabBar";

function PaneView({ pane, isActive }: { pane: Pane; isActive: boolean }) {
  const tabs = useStore(layoutStore, (s) => s.tabs);
  const replaceSessionId = useStore(layoutStore, (s) => s.replaceSessionId);
  const activatePane = useStore(layoutStore, (s) => s.activatePane);
  const activeTab = tabs.find((t) => t.sessionId === pane.sessionId) ?? null;

  if (!activeTab) {
    return (
      <div
        className="flex-1 flex items-center justify-center text-text-muted text-sm border-l border-border first:border-l-0"
        onClick={() => activatePane(pane.paneId)}
      >
        Empty pane
      </div>
    );
  }

  return (
    <div
      className={`flex-1 min-w-0 flex flex-col border-l border-border first:border-l-0 ${
        isActive ? "ring-1 ring-accent/20 ring-inset" : ""
      }`}
      onClick={() => activatePane(pane.paneId)}
    >
      <TerminalPane
        key={activeTab.tabKey ?? activeTab.sessionId}
        title={activeTab.title}
        transport={activeTab.transport ?? "ssh"}
        profileId={activeTab.profileId ?? activeTab.sessionId}
        sessionId={activeTab.preopened ? activeTab.sessionId : undefined}
        autoConnect={!activeTab.preopened}
        onSessionOpened={(sessionId) => {
          replaceSessionId(activeTab.sessionId, sessionId);
        }}
      />
    </div>
  );
}

export function Workspace() {
  const tabs = useStore(layoutStore, (s) => s.tabs);
  const activeSessionId = useStore(layoutStore, (s) => s.activeSessionId);
  const activateTab = useStore(layoutStore, (s) => s.activateTab);
  const panes = useStore(layoutStore, (s) => s.panes);
  const activePaneId = useStore(layoutStore, (s) => s.activePaneId);

  const closeTab = (sessionId: string) => {
    window.sshterm?.closeSession?.({ sessionId }).catch(() => {});
    layoutStore.setState((state) => {
      const nextTabs = state.tabs.filter((t) => t.sessionId !== sessionId);
      const nextPanes = state.panes.map((p) =>
        p.sessionId === sessionId ? { ...p, sessionId: null } : p
      );
      const nextActive =
        state.activeSessionId === sessionId
          ? nextTabs[nextTabs.length - 1]?.sessionId ?? null
          : state.activeSessionId;
      return { tabs: nextTabs, activeSessionId: nextActive, panes: nextPanes };
    });
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <TabBar
        tabs={tabs}
        activeSessionId={activeSessionId}
        onActivate={activateTab}
        onClose={closeTab}
      />

      {tabs.length > 0 ? (
        <div className="flex-1 min-h-0 flex">
          {panes.map((pane) => (
            <PaneView
              key={pane.paneId}
              pane={pane}
              isActive={pane.paneId === activePaneId}
            />
          ))}
        </div>
      ) : (
        <div className="relative flex-1 flex flex-col items-center justify-center gap-4 text-text-secondary">
          <div className="absolute inset-0 bg-gradient-to-b from-base-900 via-base-900 to-base-950" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_50%_40%,rgba(56,189,248,0.03),transparent)]" />
          <div className="relative flex flex-col items-center gap-4">
            <div className="relative">
              <svg width="56" height="56" viewBox="0 0 56 56" fill="none" className="text-text-muted/50">
                <rect x="6" y="10" width="44" height="36" rx="6" stroke="currentColor" strokeWidth="1.5" />
                <rect x="6" y="10" width="44" height="36" rx="6" fill="currentColor" fillOpacity="0.03" />
                <path d="M16 24L24 32L16 40" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M28 40H40" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <rect x="29" y="38" width="2" height="4" rx="0.5" fill="currentColor" opacity="0.4">
                  <animate attributeName="opacity" values="0.4;0.1;0.4" dur="1.5s" repeatCount="indefinite" />
                </rect>
              </svg>
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-16 h-4 bg-accent/[0.06] rounded-full blur-lg" />
            </div>
            <div className="text-center">
              <div className="text-sm font-medium text-text-secondary">No sessions open</div>
              <div className="text-xs text-text-muted mt-1.5">
                Double-click a host or press{" "}
                <kbd className="inline-flex items-center px-1.5 py-0.5 rounded bg-base-700/80 text-text-secondary text-[11px] border border-border/50 font-medium">
                  Ctrl+K
                </kbd>{" "}
                to connect
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 3: Write tests**

In `apps/ui/src/features/layout/layoutStore.test.ts`, add:

```typescript
it("splits a pane", () => {
  const store = createLayoutStore();
  store.getState().openTab({ sessionId: "s1", title: "server-1" });
  store.getState().splitPane("s1");

  expect(store.getState().panes).toHaveLength(2);
  expect(store.getState().panes[1]?.sessionId).toBe("s1");
  expect(store.getState().activePaneId).toBe(store.getState().panes[1]?.paneId);
});

it("closes a pane", () => {
  const store = createLayoutStore();
  store.getState().splitPane("s1");
  const secondPaneId = store.getState().panes[1]?.paneId!;
  store.getState().closePane(secondPaneId);
  expect(store.getState().panes).toHaveLength(1);
});

it("does not close the last pane", () => {
  const store = createLayoutStore();
  const firstPaneId = store.getState().panes[0]?.paneId!;
  store.getState().closePane(firstPaneId);
  expect(store.getState().panes).toHaveLength(1);
});
```

**Step 4: Run tests**

```bash
pnpm --filter @sshterm/ui test
```

**Step 5: Commit**

```bash
git add apps/ui/src/features/layout/layoutStore.ts apps/ui/src/features/layout/Workspace.tsx apps/ui/src/features/layout/layoutStore.test.ts
git commit -m "feat: add split pane support to layout store and workspace"
```

---

### Task 5: SSH Config Import via IPC

**Files:**
- Create: `apps/desktop/src/main/ipc/sshConfigIpc.ts`
- Modify: `apps/desktop/src/main/ipc/registerIpc.ts`
- Modify: `apps/desktop/src/preload/desktopApi.ts`
- Modify: `packages/shared/src/ipc/schemas.ts`
- Test: `apps/desktop/src/main/ipc/sshConfigIpc.test.ts` (new)

The UI currently has a paste-and-parse dialog (SshConfigImportDialog.tsx). The actual `parseSshConfig` function lives in `packages/session-core/src/ssh/parseSshConfig.ts` and is fully functional. The gap is: (1) no IPC channel to read `~/.ssh/config` from the filesystem, and (2) no IPC to bulk-import parsed hosts.

**Step 1: Add schema for SSH config import**

In `packages/shared/src/ipc/schemas.ts`, add:

```typescript
export const importSshConfigResponseSchema = z.object({
  imported: z.number().int().nonneg(),
  hosts: z.array(hostRecordSchema)
});

export type ImportSshConfigResponse = z.infer<typeof importSshConfigResponseSchema>;
```

**Step 2: Create sshConfigIpc.ts**

Create `apps/desktop/src/main/ipc/sshConfigIpc.ts`:

```typescript
import { ipcChannels } from "@sshterm/shared";
import type { IpcMainInvokeEvent } from "electron";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { parseSshConfig } from "@sshterm/session-core";
import { randomUUID } from "node:crypto";

import type { IpcMainLike } from "./registerIpc";

type HostImporter = {
  create(input: { id: string; name: string; hostname: string; port?: number; username?: string | null }): unknown;
};

export function registerSshConfigIpc(ipcMain: IpcMainLike, getHostsRepo: () => HostImporter): void {
  ipcMain.handle(ipcChannels.hosts.importSshConfig, (_event: IpcMainInvokeEvent) => {
    const configPath = path.join(homedir(), ".ssh", "config");
    let configContent: string;
    try {
      configContent = readFileSync(configPath, "utf8");
    } catch {
      return { imported: 0, hosts: [] };
    }

    const result = parseSshConfig(configContent);
    const repo = getHostsRepo();
    const imported = [];

    for (const host of result.hosts) {
      const record = repo.create({
        id: randomUUID(),
        name: host.alias,
        hostname: host.hostName ?? host.alias,
        port: host.port,
        username: host.user ?? null
      });
      imported.push(record);
    }

    return { imported: imported.length, hosts: imported };
  });
}
```

**Step 3: Register in registerIpc.ts**

Add import:
```typescript
import { registerSshConfigIpc } from "./sshConfigIpc";
```

Add channel to `registeredChannels`:
```typescript
ipcChannels.hosts.importSshConfig,
```

Call in `registerIpc()`:
```typescript
registerSshConfigIpc(ipcMain, () => getOrCreateHostsRepo());
```

This requires importing `getOrCreateHostsRepo` from hostsIpc — if it's not exported, export it.

**Step 4: Add preload method**

In `apps/desktop/src/preload/desktopApi.ts`, add to `DesktopApi` interface:

```typescript
importSshConfig(): Promise<{ imported: number; hosts: HostRecord[] }>;
```

Add implementation:

```typescript
async importSshConfig(): Promise<{ imported: number; hosts: HostRecord[] }> {
  const result = await ipcRenderer.invoke(ipcChannels.hosts.importSshConfig);
  return result as { imported: number; hosts: HostRecord[] };
}
```

**Step 5: Write test**

Create `apps/desktop/src/main/ipc/sshConfigIpc.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { registerSshConfigIpc } from "./sshConfigIpc";

function createMockIpcMain() {
  const handlers = new Map<string, Function>();
  return {
    handle(channel: string, handler: Function) { handlers.set(channel, handler); },
    removeHandler(channel: string) { handlers.delete(channel); },
    invoke(channel: string, ...args: unknown[]) {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`No handler for ${channel}`);
      return handler({}, ...args);
    }
  };
}

describe("sshConfigIpc", () => {
  it("returns empty when config file is missing", async () => {
    const ipc = createMockIpcMain();
    const repo = { create: vi.fn() };
    registerSshConfigIpc(ipc, () => repo);
    const result = await ipc.invoke("hosts:import-ssh-config");
    expect(result).toEqual({ imported: 0, hosts: [] });
  });
});
```

**Step 6: Run tests and commit**

```bash
pnpm --filter @sshterm/desktop test
git add packages/shared/src/ipc/schemas.ts apps/desktop/src/main/ipc/sshConfigIpc.ts apps/desktop/src/main/ipc/sshConfigIpc.test.ts apps/desktop/src/main/ipc/registerIpc.ts apps/desktop/src/preload/desktopApi.ts
git commit -m "feat: add SSH config import IPC to read ~/.ssh/config and bulk-import hosts"
```

---

### Task 6: Broadcast Targeting UI and Safety Banner

**Files:**
- Create: `apps/ui/src/features/broadcast/BroadcastBar.tsx`
- Modify: `apps/ui/src/features/layout/Workspace.tsx` (or AppShell.tsx)
- Test: `apps/ui/src/features/broadcast/broadcastStore.test.ts` (extend)

**Step 1: Create BroadcastBar component**

Create `apps/ui/src/features/broadcast/BroadcastBar.tsx`:

```tsx
import { useStore } from "zustand";
import { broadcastStore } from "./broadcastStore";
import { layoutStore } from "../layout/layoutStore";

export function BroadcastBar() {
  const enabled = useStore(broadcastStore, (s) => s.enabled);
  const targets = useStore(broadcastStore, (s) => s.targetSessionIds);
  const toggle = useStore(broadcastStore, (s) => s.toggle);
  const setTargets = useStore(broadcastStore, (s) => s.setTargets);
  const tabs = useStore(layoutStore, (s) => s.tabs);

  if (!enabled) {
    return (
      <button
        onClick={toggle}
        className="px-3 py-1 text-xs text-text-muted hover:text-text-primary transition-colors"
        title="Enable broadcast mode"
      >
        Broadcast
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-warning/10 border-b border-warning/30">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-warning opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-warning" />
      </span>
      <span className="text-xs font-medium text-warning">
        BROADCAST ACTIVE
      </span>
      <span className="text-xs text-text-muted mx-1">
        Input sent to {targets.length} session{targets.length !== 1 ? "s" : ""}
      </span>

      <div className="flex gap-1 ml-2">
        {tabs.map((tab) => {
          const isTarget = targets.includes(tab.sessionId);
          return (
            <button
              key={tab.sessionId}
              onClick={() => {
                const next = isTarget
                  ? targets.filter((id) => id !== tab.sessionId)
                  : [...targets, tab.sessionId];
                setTargets(next);
              }}
              className={`px-2 py-0.5 rounded text-[11px] border transition-colors ${
                isTarget
                  ? "border-warning/40 bg-warning/15 text-warning"
                  : "border-border bg-base-800 text-text-muted hover:text-text-primary"
              }`}
            >
              {tab.title}
            </button>
          );
        })}
      </div>

      <button
        onClick={toggle}
        className="ml-auto px-2 py-0.5 rounded text-xs text-warning hover:bg-warning/20 transition-colors"
      >
        Stop
      </button>
    </div>
  );
}
```

**Step 2: Add BroadcastBar to Workspace**

In `apps/ui/src/features/layout/Workspace.tsx`, import and render above the TabBar:

```typescript
import { BroadcastBar } from "../broadcast/BroadcastBar";
```

Add at the top of the returned JSX (first child of the outer div):

```tsx
<BroadcastBar />
```

**Step 3: Extend broadcast store test**

In `apps/ui/src/features/broadcast/broadcastStore.test.ts`, add:

```typescript
it("toggles broadcast on and off", () => {
  const store = createBroadcastStore();
  store.getState().toggle();
  expect(store.getState().enabled).toBe(true);
  store.getState().toggle();
  expect(store.getState().enabled).toBe(false);
});

it("deduplicates target session ids", () => {
  const store = createBroadcastStore();
  store.getState().setTargets(["s1", "s1", "s2"]);
  expect(store.getState().targetSessionIds).toEqual(["s1", "s2"]);
});
```

**Step 4: Run tests and commit**

```bash
pnpm --filter @sshterm/ui test
git add apps/ui/src/features/broadcast/BroadcastBar.tsx apps/ui/src/features/layout/Workspace.tsx apps/ui/src/features/broadcast/broadcastStore.test.ts
git commit -m "feat: add broadcast targeting bar with session toggles and safety banner"
```

---

## Parallel Group C — Remaining Features

### Task 7: Session Reconnect Logic

**Files:**
- Modify: `packages/session-core/src/sessionManager.ts`
- Test: `packages/session-core/src/sessionManager.test.ts`

**Step 1: Add reconnect support to SessionManager**

Add a reconnect policy and method. When a session exits and has `autoReconnect: true`, the manager should re-open the transport after a delay.

In `sessionManager.ts`, extend `OpenSessionInput`:

```typescript
export interface OpenSessionInput {
  transport: SessionTransportKind;
  profileId: string;
  cols: number;
  rows: number;
  sshOptions?: SshConnectionOptions;
  serialOptions?: SerialConnectionOptions;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
}
```

Extend `SessionSnapshot`:

```typescript
export interface SessionSnapshot {
  sessionId: string;
  transport: SessionTransportKind;
  profileId: string;
  cols: number;
  rows: number;
  state: SessionState;
  autoReconnect: boolean;
  reconnectAttempts: number;
}
```

Extend `ManagedSession`:

```typescript
interface ManagedSession {
  snapshot: SessionSnapshot;
  transport: TransportHandle;
  unsubscribe: () => void;
  input: OpenSessionInput;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
}
```

In `open()`, save the input and initialize reconnect fields:

```typescript
const snapshot: SessionSnapshot = {
  sessionId,
  transport: input.transport,
  profileId: input.profileId,
  cols: input.cols,
  rows: input.rows,
  state: "connecting",
  autoReconnect: input.autoReconnect ?? false,
  reconnectAttempts: 0
};
```

Store input in the managed session:

```typescript
sessions.set(sessionId, {
  snapshot,
  transport,
  unsubscribe,
  input,
  reconnectTimer: null
});
```

In `handleEvent`, when `event.type === "exit"`, check for auto-reconnect before deleting:

```typescript
if (event.type === "exit") {
  const session = sessions.get(sessionId);
  if (session) {
    session.snapshot.state = "disconnected";
    session.unsubscribe();

    const maxAttempts = session.input.maxReconnectAttempts ?? 5;
    if (session.snapshot.autoReconnect && session.snapshot.reconnectAttempts < maxAttempts) {
      session.snapshot.state = "reconnecting";
      session.snapshot.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, session.snapshot.reconnectAttempts - 1), 30000);

      // Emit reconnecting status
      for (const listener of listeners) {
        listener({ type: "status", sessionId, state: "reconnecting" });
      }

      session.reconnectTimer = setTimeout(() => {
        const newTransport = createTransport({
          sessionId,
          transport: session.input.transport,
          profileId: session.input.profileId,
          cols: session.snapshot.cols,
          rows: session.snapshot.rows,
          sshOptions: session.input.sshOptions,
          serialOptions: session.input.serialOptions
        });

        session.transport = newTransport;
        session.unsubscribe = newTransport.onEvent((evt) => handleEvent(sessionId, evt));
        session.snapshot.state = "connecting";
      }, delay);
    } else {
      sessions.delete(sessionId);
    }
  }
}
```

In `close()`, clear the reconnect timer:

```typescript
close(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (!session) return;

  if (session.reconnectTimer) {
    clearTimeout(session.reconnectTimer);
    session.reconnectTimer = null;
  }
  session.snapshot.autoReconnect = false; // prevent reconnect on user-initiated close

  session.transport.close();
  session.unsubscribe();
  session.snapshot.state = "disconnected";
  sessions.delete(sessionId);
}
```

**Step 2: Write tests**

In `packages/session-core/src/sessionManager.test.ts`:

```typescript
it("reconnects automatically when autoReconnect is true", async () => {
  let transportCount = 0;

  const manager = createSessionManager({
    createTransport(request) {
      transportCount++;
      const listeners = new Set<(event: SessionTransportEvent) => void>();
      return {
        write() {},
        resize() {},
        close() {},
        onEvent(listener) {
          listeners.add(listener);
          // Simulate immediate exit on first transport
          if (transportCount === 1) {
            queueMicrotask(() => {
              for (const l of listeners) l({ type: "exit", sessionId: request.sessionId, exitCode: 1 });
            });
          }
          return () => { listeners.delete(listener); };
        }
      };
    }
  });

  const events: SessionTransportEvent[] = [];
  manager.onEvent((e) => events.push(e));

  manager.open({
    transport: "ssh",
    profileId: "host-1",
    cols: 80,
    rows: 24,
    autoReconnect: true,
    maxReconnectAttempts: 3
  });

  // Wait for exit + reconnect timer (1s for first attempt)
  await new Promise((resolve) => setTimeout(resolve, 1500));

  expect(transportCount).toBeGreaterThanOrEqual(2);
  expect(events.some((e) => e.type === "status" && e.state === "reconnecting")).toBe(true);
});

it("does not reconnect when user closes session", () => {
  let transportCount = 0;

  const manager = createSessionManager({
    createTransport(request) {
      transportCount++;
      return {
        write() {},
        resize() {},
        close() {},
        onEvent(listener) {
          return () => {};
        }
      };
    }
  });

  const result = manager.open({
    transport: "ssh",
    profileId: "host-1",
    cols: 80,
    rows: 24,
    autoReconnect: true
  });

  manager.close(result.sessionId);
  expect(transportCount).toBe(1);
});
```

**Step 3: Run tests and commit**

```bash
pnpm --filter @sshterm/session-core test
git add packages/session-core/src/sessionManager.ts packages/session-core/src/sessionManager.test.ts
git commit -m "feat: add auto-reconnect with exponential backoff to session manager"
```

---

### Task 8: Port Forwarding Execution

**Files:**
- Create: `packages/session-core/src/portForwarding.ts`
- Modify: `packages/shared/src/ipc/schemas.ts`
- Modify: `packages/shared/src/ipc/channels.ts`
- Create: `apps/desktop/src/main/ipc/portForwardIpc.ts`
- Modify: `apps/desktop/src/main/ipc/registerIpc.ts`
- Modify: `apps/desktop/src/preload/desktopApi.ts`
- Test: `packages/session-core/src/portForwarding.test.ts` (new)

Port forwarding uses SSH's `-L` (local), `-R` (remote), and `-D` (dynamic/SOCKS) flags spawned as a background PTY process.

**Step 1: Create portForwarding module**

Create `packages/session-core/src/portForwarding.ts`:

```typescript
import type { SshPtySpawn, SshPtyProcess, DisposableLike } from "./transports/sshPtyTransport";
import { buildSshPtyCommand } from "./transports/sshPtyTransport";

export interface PortForwardProfile {
  protocol: "local" | "remote" | "dynamic";
  localAddress: string;
  localPort: number;
  remoteHost: string;
  remotePort: number;
}

export interface PortForwardRequest {
  hostname: string;
  username?: string;
  port?: number;
  identityFile?: string;
  forward: PortForwardProfile;
}

export function buildForwardArg(forward: PortForwardProfile): string[] {
  if (forward.protocol === "dynamic") {
    return ["-D", `${forward.localAddress}:${forward.localPort}`];
  }

  const binding = `${forward.localAddress}:${forward.localPort}:${forward.remoteHost}:${forward.remotePort}`;

  if (forward.protocol === "remote") {
    return ["-R", binding];
  }

  return ["-L", binding];
}

export interface PortForwardHandle {
  close(): void;
  onExit(listener: (exitCode: number | null) => void): () => void;
  onError(listener: (message: string) => void): () => void;
}

export function createPortForward(
  request: PortForwardRequest,
  spawnPty: SshPtySpawn
): PortForwardHandle {
  const cmd = buildSshPtyCommand({
    hostname: request.hostname,
    username: request.username,
    port: request.port,
    identityFile: request.identityFile,
    requestTty: false,
    extraArgs: [...buildForwardArg(request.forward), "-N"]
  });

  const exitListeners = new Set<(exitCode: number | null) => void>();
  const errorListeners = new Set<(message: string) => void>();

  let pty: SshPtyProcess;
  try {
    pty = spawnPty(cmd.command, cmd.args, {
      cols: 80,
      rows: 1,
      name: "xterm-256color"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to spawn SSH for port forwarding";
    queueMicrotask(() => {
      for (const l of errorListeners) l(message);
      for (const l of exitListeners) l(null);
    });
    return {
      close() {},
      onExit(listener) { exitListeners.add(listener); return () => { exitListeners.delete(listener); }; },
      onError(listener) { errorListeners.add(listener); return () => { errorListeners.delete(listener); }; }
    };
  }

  pty.onExit((event) => {
    for (const l of exitListeners) l(event.exitCode ?? null);
  });

  return {
    close() {
      try { pty.kill(); } catch { /* already dead */ }
    },
    onExit(listener) { exitListeners.add(listener); return () => { exitListeners.delete(listener); }; },
    onError(listener) { errorListeners.add(listener); return () => { errorListeners.delete(listener); }; }
  };
}
```

**Step 2: Add to session-core exports**

In `packages/session-core/src/index.ts`, add:

```typescript
export { buildForwardArg, createPortForward, type PortForwardProfile, type PortForwardRequest, type PortForwardHandle } from "./portForwarding";
```

**Step 3: Add IPC schemas and channels**

In `packages/shared/src/ipc/channels.ts`, add:

```typescript
export const portForwardChannels = {
  start: "port-forward:start",
  stop: "port-forward:stop",
  list: "port-forward:list"
} as const;
```

Add to `ipcChannels`:

```typescript
export const ipcChannels = {
  session: sessionChannels,
  hosts: hostChannels,
  settings: settingsChannels,
  tray: trayChannels,
  portForward: portForwardChannels
} as const;
```

In `packages/shared/src/ipc/schemas.ts`, add:

```typescript
export const startPortForwardRequestSchema = z.object({
  hostname: z.string().min(1),
  username: z.string().optional(),
  port: z.number().int().positive().optional(),
  protocol: z.enum(["local", "remote", "dynamic"]),
  localAddress: z.string().default("127.0.0.1"),
  localPort: z.number().int().positive(),
  remoteHost: z.string().default(""),
  remotePort: z.number().int().nonnegative().default(0)
});

export const stopPortForwardRequestSchema = z.object({
  id: z.string().min(1)
});

export type StartPortForwardRequest = z.infer<typeof startPortForwardRequestSchema>;
export type StopPortForwardRequest = z.infer<typeof stopPortForwardRequestSchema>;
```

**Step 4: Create portForwardIpc.ts**

Create `apps/desktop/src/main/ipc/portForwardIpc.ts`:

```typescript
import {
  ipcChannels,
  startPortForwardRequestSchema,
  stopPortForwardRequestSchema,
  type StartPortForwardRequest,
  type StopPortForwardRequest
} from "@sshterm/shared";
import { createPortForward, type PortForwardHandle } from "@sshterm/session-core";
import type { IpcMainInvokeEvent } from "electron";
import { randomUUID } from "node:crypto";
import type { IpcMainLike } from "./registerIpc";

const activeForwards = new Map<string, PortForwardHandle>();

export function registerPortForwardIpc(ipcMain: IpcMainLike): void {
  ipcMain.handle(ipcChannels.portForward.start, (_event: IpcMainInvokeEvent, request: StartPortForwardRequest) => {
    const parsed = startPortForwardRequestSchema.parse(request);
    const id = randomUUID();

    // node-pty loaded at runtime
    const nodePty = require("node-pty") as { spawn: import("@sshterm/session-core").SshPtySpawn };

    const handle = createPortForward(
      {
        hostname: parsed.hostname,
        username: parsed.username,
        port: parsed.port,
        forward: {
          protocol: parsed.protocol,
          localAddress: parsed.localAddress,
          localPort: parsed.localPort,
          remoteHost: parsed.remoteHost,
          remotePort: parsed.remotePort
        }
      },
      nodePty.spawn
    );

    handle.onExit(() => { activeForwards.delete(id); });
    activeForwards.set(id, handle);

    return { id };
  });

  ipcMain.handle(ipcChannels.portForward.stop, (_event: IpcMainInvokeEvent, request: StopPortForwardRequest) => {
    const parsed = stopPortForwardRequestSchema.parse(request);
    const handle = activeForwards.get(parsed.id);
    if (handle) {
      handle.close();
      activeForwards.delete(parsed.id);
    }
  });

  ipcMain.handle(ipcChannels.portForward.list, () => {
    return Array.from(activeForwards.keys()).map((id) => ({ id }));
  });
}
```

**Step 5: Write test for buildForwardArg**

Create `packages/session-core/src/portForwarding.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { buildForwardArg } from "./portForwarding";

describe("buildForwardArg", () => {
  it("builds local forward args", () => {
    const args = buildForwardArg({
      protocol: "local",
      localAddress: "127.0.0.1",
      localPort: 8080,
      remoteHost: "db.internal",
      remotePort: 5432
    });
    expect(args).toEqual(["-L", "127.0.0.1:8080:db.internal:5432"]);
  });

  it("builds remote forward args", () => {
    const args = buildForwardArg({
      protocol: "remote",
      localAddress: "0.0.0.0",
      localPort: 3000,
      remoteHost: "localhost",
      remotePort: 3000
    });
    expect(args).toEqual(["-R", "0.0.0.0:3000:localhost:3000"]);
  });

  it("builds dynamic forward args", () => {
    const args = buildForwardArg({
      protocol: "dynamic",
      localAddress: "127.0.0.1",
      localPort: 1080,
      remoteHost: "",
      remotePort: 0
    });
    expect(args).toEqual(["-D", "127.0.0.1:1080"]);
  });
});
```

**Step 6: Register in registerIpc.ts, add preload methods, run tests, and commit**

```bash
pnpm --filter @sshterm/session-core test
git add packages/session-core/src/portForwarding.ts packages/session-core/src/portForwarding.test.ts packages/session-core/src/index.ts packages/shared/src/ipc/channels.ts packages/shared/src/ipc/schemas.ts apps/desktop/src/main/ipc/portForwardIpc.ts apps/desktop/src/main/ipc/registerIpc.ts apps/desktop/src/preload/desktopApi.ts
git commit -m "feat: add port forwarding execution via SSH -L/-R/-D"
```

---

### Task 9: Group Management

**Files:**
- Create: `packages/db/src/repositories/groupsRepository.ts`
- Modify: `packages/db/src/repositories/index.ts`
- Modify: `packages/shared/src/ipc/schemas.ts`
- Modify: `packages/shared/src/ipc/channels.ts`
- Create: `apps/desktop/src/main/ipc/groupsIpc.ts`
- Modify: `apps/desktop/src/main/ipc/registerIpc.ts`
- Modify: `apps/desktop/src/preload/desktopApi.ts`
- Test: `packages/db/src/repositories/groupsRepository.test.ts` (new)

**Step 1: Create groupsRepository**

Create `packages/db/src/repositories/groupsRepository.ts`:

```typescript
import type { SqliteDatabase } from "../index";
import { openDatabase } from "../index";

export type GroupRecord = {
  id: string;
  name: string;
  description: string | null;
};

export type GroupInput = {
  id: string;
  name: string;
  description?: string | null;
};

type GroupRow = {
  id: string;
  name: string;
  description: string | null;
};

export function createGroupsRepositoryFromDatabase(db: SqliteDatabase) {
  const insertGroup = db.prepare(`
    INSERT INTO host_groups (id, name, description)
    VALUES (@id, @name, @description)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      updated_at = CURRENT_TIMESTAMP
  `);
  const listGroups = db.prepare("SELECT id, name, description FROM host_groups ORDER BY name COLLATE NOCASE ASC");
  const getGroupById = db.prepare("SELECT id, name, description FROM host_groups WHERE id = ?");
  const deleteGroup = db.prepare("DELETE FROM host_groups WHERE id = ?");

  return {
    create(input: GroupInput): GroupRecord {
      const normalized = {
        id: input.id,
        name: input.name,
        description: input.description ?? null
      };
      insertGroup.run(normalized);
      const row = getGroupById.get(input.id) as GroupRow | undefined;
      if (!row) throw new Error(`Group ${input.id} was not persisted`);
      return row;
    },
    list(): GroupRecord[] {
      return listGroups.all() as GroupRecord[];
    },
    get(id: string): GroupRecord | undefined {
      return getGroupById.get(id) as GroupRecord | undefined;
    },
    remove(id: string): boolean {
      const result = deleteGroup.run(id);
      return result.changes > 0;
    }
  };
}

export function createGroupsRepository(databasePath = ":memory:") {
  try {
    return createGroupsRepositoryFromDatabase(openDatabase(databasePath));
  } catch (error) {
    if (databasePath !== ":memory:") throw error;

    const groups = new Map<string, GroupRecord>();
    return {
      create(input: GroupInput): GroupRecord {
        const record: GroupRecord = {
          id: input.id,
          name: input.name,
          description: input.description ?? null
        };
        groups.set(record.id, record);
        return record;
      },
      list(): GroupRecord[] {
        return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));
      },
      get(id: string): GroupRecord | undefined {
        return groups.get(id);
      },
      remove(id: string): boolean {
        return groups.delete(id);
      }
    };
  }
}
```

**Step 2: Export from index**

In `packages/db/src/repositories/index.ts`, add:

```typescript
export * from "./groupsRepository";
```

**Step 3: Add schemas and channels**

In `packages/shared/src/ipc/channels.ts`, add:

```typescript
export const groupChannels = {
  list: "groups:list",
  upsert: "groups:upsert",
  remove: "groups:remove"
} as const;
```

Add to `ipcChannels`:

```typescript
groups: groupChannels,
```

In `packages/shared/src/ipc/schemas.ts`, add:

```typescript
export const groupRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable()
});

export const upsertGroupRequestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable().optional()
});

export const removeGroupRequestSchema = z.object({
  id: z.string().min(1)
});

export type GroupRecord = z.infer<typeof groupRecordSchema>;
export type UpsertGroupRequest = z.infer<typeof upsertGroupRequestSchema>;
export type RemoveGroupRequest = z.infer<typeof removeGroupRequestSchema>;
```

**Step 4: Create groupsIpc.ts and register**

Create `apps/desktop/src/main/ipc/groupsIpc.ts`:

```typescript
import {
  ipcChannels,
  upsertGroupRequestSchema,
  removeGroupRequestSchema,
  type UpsertGroupRequest,
  type RemoveGroupRequest
} from "@sshterm/shared";
import type { IpcMainInvokeEvent } from "electron";
import type { IpcMainLike } from "./registerIpc";
import type { GroupInput, GroupRecord } from "@sshterm/db";

type GroupsRepoLike = {
  create(input: GroupInput): GroupRecord;
  list(): GroupRecord[];
  remove(id: string): boolean;
};

export function registerGroupsIpc(ipcMain: IpcMainLike, getRepo: () => GroupsRepoLike): void {
  ipcMain.handle(ipcChannels.groups.list, () => {
    return getRepo().list();
  });

  ipcMain.handle(ipcChannels.groups.upsert, (_event: IpcMainInvokeEvent, request: UpsertGroupRequest) => {
    const parsed = upsertGroupRequestSchema.parse(request);
    return getRepo().create({
      id: parsed.id,
      name: parsed.name,
      description: parsed.description ?? null
    });
  });

  ipcMain.handle(ipcChannels.groups.remove, (_event: IpcMainInvokeEvent, request: RemoveGroupRequest) => {
    const parsed = removeGroupRequestSchema.parse(request);
    getRepo().remove(parsed.id);
  });
}
```

**Step 5: Add preload methods**

In `apps/desktop/src/preload/desktopApi.ts`, add to `DesktopApi`:

```typescript
listGroups(): Promise<GroupRecord[]>;
upsertGroup(request: UpsertGroupRequest): Promise<GroupRecord>;
removeGroup(request: RemoveGroupRequest): Promise<void>;
```

With implementations:

```typescript
async listGroups(): Promise<GroupRecord[]> {
  const result = await ipcRenderer.invoke(ipcChannels.groups.list);
  return result as GroupRecord[];
},
async upsertGroup(request: UpsertGroupRequest): Promise<GroupRecord> {
  const parsed = upsertGroupRequestSchema.parse(request);
  const result = await ipcRenderer.invoke(ipcChannels.groups.upsert, parsed);
  return result as GroupRecord;
},
async removeGroup(request: RemoveGroupRequest): Promise<void> {
  const parsed = removeGroupRequestSchema.parse(request);
  await ipcRenderer.invoke(ipcChannels.groups.remove, parsed);
}
```

**Step 6: Write test**

Create `packages/db/src/repositories/groupsRepository.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { createGroupsRepository } from "./groupsRepository";

describe("groupsRepository", () => {
  it("creates and lists groups", () => {
    const repo = createGroupsRepository();
    repo.create({ id: "g1", name: "Production", description: "Prod servers" });
    repo.create({ id: "g2", name: "Development", description: null });
    const groups = repo.list();
    expect(groups).toHaveLength(2);
    expect(groups[0]?.name).toBe("Development");
    expect(groups[1]?.name).toBe("Production");
  });

  it("removes a group", () => {
    const repo = createGroupsRepository();
    repo.create({ id: "g1", name: "Test" });
    expect(repo.remove("g1")).toBe(true);
    expect(repo.list()).toHaveLength(0);
  });

  it("upserts existing group", () => {
    const repo = createGroupsRepository();
    repo.create({ id: "g1", name: "Old Name" });
    repo.create({ id: "g1", name: "New Name" });
    expect(repo.list()).toHaveLength(1);
    expect(repo.get("g1")?.name).toBe("New Name");
  });
});
```

**Step 7: Run tests and commit**

```bash
pnpm --filter @sshterm/db test
git add packages/db/src/repositories/groupsRepository.ts packages/db/src/repositories/groupsRepository.test.ts packages/db/src/repositories/index.ts packages/shared/src/ipc/schemas.ts packages/shared/src/ipc/channels.ts apps/desktop/src/main/ipc/groupsIpc.ts apps/desktop/src/main/ipc/registerIpc.ts apps/desktop/src/preload/desktopApi.ts
git commit -m "feat: add group management (CRUD) with IPC and repository"
```

---

## Execution Order

These tasks can be parallelized as follows:

**Wave 1 (all independent):**
- Task 1: Host Delete
- Task 2: Settings Persistence
- Task 3: Auth Profile Wiring

**Wave 2 (all independent, can start immediately or after Wave 1):**
- Task 4: Split Pane UI
- Task 5: SSH Config Import IPC
- Task 6: Broadcast UI

**Wave 3 (can start after Task 3 for reconnect, others independent):**
- Task 7: Session Reconnect
- Task 8: Port Forwarding Execution
- Task 9: Group Management

**Final:** Run full test suite: `pnpm test`
