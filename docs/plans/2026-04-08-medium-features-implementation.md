# Medium Features Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement 6 medium features: snippets manager, session logging, tab drag-and-drop reorder, split pane shortcuts, host export, and toast notifications.

**Architecture:** Each feature follows the standard IPC contract pattern (shared schemas -> main handler -> preload bridge -> renderer UI). Features are independent and can be implemented in any order. Toast notifications are a cross-cutting concern that other features will use.

**Tech Stack:** Electron IPC with Zod validation, Zustand stores, @dnd-kit (already installed), better-sqlite3, sonner (toast library), React + Tailwind CSS v4.

---

## Feature 12: Toast Notifications (implement first — other features use it)

### Task 12.1: Install sonner and create ToastProvider

**Files:**
- Modify: `apps/ui/package.json`
- Modify: `apps/ui/src/App.tsx`

**Step 1: Install sonner**

Run: `pnpm --filter @sshterm/ui add sonner`

**Step 2: Read App.tsx to find the root layout**

Read `apps/ui/src/App.tsx` and identify where to add the Toaster component.

**Step 3: Add Toaster to App.tsx**

Add the import and component. The Toaster goes at the root level, sibling to the main layout:

```tsx
import { Toaster } from "sonner";
```

Inside the JSX return, add as the last child:

```tsx
<Toaster
  position="bottom-right"
  toastOptions={{
    className: "!bg-base-700 !border !border-border !text-text-primary !text-sm",
  }}
/>
```

**Step 4: Verify it renders**

Run: `pnpm --filter @sshterm/ui build`
Expected: Build succeeds with no errors.

**Step 5: Commit**

```bash
git add apps/ui/package.json apps/ui/src/App.tsx pnpm-lock.yaml
git commit -m "feat: add sonner toast provider"
```

### Task 12.2: Test toast integration

**Files:**
- Test: `apps/ui/src/features/layout/toast.test.ts`

**Step 1: Write a basic test**

```ts
import { describe, it, expect } from "vitest";
import { toast } from "sonner";

describe("toast", () => {
  it("exports toast function", () => {
    expect(typeof toast).toBe("function");
    expect(typeof toast.success).toBe("function");
    expect(typeof toast.error).toBe("function");
  });
});
```

**Step 2: Run the test**

Run: `pnpm --filter @sshterm/ui test -- toast.test`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/ui/src/features/layout/toast.test.ts
git commit -m "test: verify toast exports"
```

---

## Feature 7: Snippets Manager

### Task 7.1: Create snippets DB repository

**Files:**
- Create: `packages/db/src/repositories/snippetsRepository.ts`
- Modify: `packages/db/src/index.ts` (export the new repository)

The `snippets` table already exists in `packages/db/src/migrations/001_init.sql:86-92` with columns: `id TEXT PK`, `name TEXT NOT NULL UNIQUE`, `body TEXT NOT NULL`, `created_at`, `updated_at`.

**Step 1: Write the failing test**

Create `packages/db/src/repositories/snippetsRepository.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createSnippetsRepository } from "./snippetsRepository";

describe("snippetsRepository", () => {
  let repo: ReturnType<typeof createSnippetsRepository>;

  beforeEach(() => {
    repo = createSnippetsRepository(":memory:");
  });

  it("creates and lists a snippet", () => {
    const snippet = repo.create({ id: "s1", name: "hello", body: "echo hello" });
    expect(snippet.id).toBe("s1");
    expect(snippet.name).toBe("hello");
    expect(snippet.body).toBe("echo hello");
    const all = repo.list();
    expect(all).toHaveLength(1);
  });

  it("updates an existing snippet via upsert", () => {
    repo.create({ id: "s1", name: "hello", body: "echo hello" });
    repo.create({ id: "s1", name: "hello", body: "echo world" });
    const all = repo.list();
    expect(all).toHaveLength(1);
    expect(all[0].body).toBe("echo world");
  });

  it("removes a snippet", () => {
    repo.create({ id: "s1", name: "hello", body: "echo hello" });
    expect(repo.remove("s1")).toBe(true);
    expect(repo.list()).toHaveLength(0);
  });

  it("returns false when removing nonexistent snippet", () => {
    expect(repo.remove("nope")).toBe(false);
  });
});
```

**Step 2: Run it to verify it fails**

Run: `pnpm --filter @sshterm/db test -- snippetsRepository.test`
Expected: FAIL — module not found

**Step 3: Implement snippetsRepository.ts**

Follow the exact pattern from `hostsRepository.ts` (simpler since fewer columns). The repository needs to call `openDatabase(path)` which runs the init migration that creates the `snippets` table.

```ts
import type { SqliteDatabase } from "../index";
import { openDatabase } from "../index";

export type SnippetRecord = {
  id: string;
  name: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type SnippetInput = {
  id: string;
  name: string;
  body: string;
};

type SnippetRow = {
  id: string;
  name: string;
  body: string;
  created_at: string;
  updated_at: string;
};

function mapRow(row: SnippetRow): SnippetRecord {
  return {
    id: row.id,
    name: row.name,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createSnippetsRepository(databasePath = ":memory:") {
  const db = openDatabase(databasePath);
  return createSnippetsRepositoryFromDatabase(db);
}

export function createSnippetsRepositoryFromDatabase(db: SqliteDatabase) {
  const upsertSnippet = db.prepare(`
    INSERT INTO snippets (id, name, body)
    VALUES (@id, @name, @body)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      body = excluded.body,
      updated_at = CURRENT_TIMESTAMP
  `);

  const listSnippets = db.prepare(`
    SELECT id, name, body, created_at, updated_at
    FROM snippets
    ORDER BY name COLLATE NOCASE ASC
  `);

  const getSnippetById = db.prepare(`
    SELECT id, name, body, created_at, updated_at
    FROM snippets
    WHERE id = ?
  `);

  const deleteSnippet = db.prepare(`DELETE FROM snippets WHERE id = ?`);

  return {
    create(input: SnippetInput): SnippetRecord {
      upsertSnippet.run(input);
      const row = getSnippetById.get(input.id) as SnippetRow | undefined;
      if (!row) throw new Error(`Snippet ${input.id} was not persisted`);
      return mapRow(row);
    },
    list(): SnippetRecord[] {
      return (listSnippets.all() as SnippetRow[]).map(mapRow);
    },
    get(id: string): SnippetRecord | undefined {
      const row = getSnippetById.get(id) as SnippetRow | undefined;
      return row ? mapRow(row) : undefined;
    },
    remove(id: string): boolean {
      const result = deleteSnippet.run(id);
      return result.changes > 0;
    },
  };
}
```

**Step 4: Export from packages/db/src/index.ts**

Add to the exports:
```ts
export { createSnippetsRepository, createSnippetsRepositoryFromDatabase } from "./repositories/snippetsRepository";
export type { SnippetRecord, SnippetInput } from "./repositories/snippetsRepository";
```

**Step 5: Run the test**

Run: `pnpm --filter @sshterm/db test -- snippetsRepository.test`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/db/src/repositories/snippetsRepository.ts packages/db/src/repositories/snippetsRepository.test.ts packages/db/src/index.ts
git commit -m "feat: add snippets repository with CRUD operations"
```

### Task 7.2: Add snippets IPC channels and schemas

**Files:**
- Modify: `packages/shared/src/ipc/channels.ts` — add `snippetChannels`
- Modify: `packages/shared/src/ipc/schemas.ts` — add snippet schemas

**Step 1: Add channels**

In `packages/shared/src/ipc/channels.ts`, add before the `ipcChannels` export:

```ts
export const snippetChannels = {
  list: "snippets:list",
  upsert: "snippets:upsert",
  remove: "snippets:remove",
} as const;
```

Add `snippets: snippetChannels` to the `ipcChannels` object.

**Step 2: Add Zod schemas**

In `packages/shared/src/ipc/schemas.ts`, add snippet schemas:

```ts
// --- Snippet schemas ---

export const snippetRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  body: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const upsertSnippetRequestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  body: z.string(),
});

export const removeSnippetRequestSchema = z.object({
  id: z.string().min(1),
});

export type SnippetRecord = z.infer<typeof snippetRecordSchema>;
export type UpsertSnippetRequest = z.infer<typeof upsertSnippetRequestSchema>;
export type RemoveSnippetRequest = z.infer<typeof removeSnippetRequestSchema>;
```

**Step 3: Build shared package**

Run: `pnpm --filter @sshterm/shared build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add packages/shared/src/ipc/channels.ts packages/shared/src/ipc/schemas.ts
git commit -m "feat: add snippet IPC channels and Zod schemas"
```

### Task 7.3: Add snippets IPC handler

**Files:**
- Create: `apps/desktop/src/main/ipc/snippetsIpc.ts`
- Modify: `apps/desktop/src/main/ipc/registerIpc.ts`

**Step 1: Create snippetsIpc.ts**

Follow the pattern from `hostsIpc.ts`. The handler file should:
1. Import the snippets repository from `@sshterm/db`
2. Import channel names and schemas from `@sshterm/shared`
3. Register `handle` for each channel
4. Validate request with Zod before passing to repository

```ts
import { createSnippetsRepositoryFromDatabase } from "@sshterm/db";
import type { SnippetInput, SnippetRecord } from "@sshterm/db";
import {
  ipcChannels,
  upsertSnippetRequestSchema,
  removeSnippetRequestSchema,
} from "@sshterm/shared";
import type { IpcMainLike } from "./registerIpc";

type SnippetsRepoLike = {
  create(input: SnippetInput): SnippetRecord;
  list(): SnippetRecord[];
  remove(id: string): boolean;
};

let snippetsRepo: SnippetsRepoLike | null = null;

export function registerSnippetsIpc(
  ipcMain: IpcMainLike,
  getDatabase: () => import("@sshterm/db").SqliteDatabase
) {
  if (!snippetsRepo) {
    snippetsRepo = createSnippetsRepositoryFromDatabase(getDatabase());
  }
  const repo = snippetsRepo;

  ipcMain.handle(ipcChannels.snippets.list, async () => {
    return repo.list();
  });

  ipcMain.handle(ipcChannels.snippets.upsert, async (_event: unknown, request: unknown) => {
    const parsed = upsertSnippetRequestSchema.parse(request);
    return repo.create(parsed);
  });

  ipcMain.handle(ipcChannels.snippets.remove, async (_event: unknown, request: unknown) => {
    const parsed = removeSnippetRequestSchema.parse(request);
    repo.remove(parsed.id);
  });
}
```

**Step 2: Register in registerIpc.ts**

1. Import `registerSnippetsIpc` at top
2. Add the 3 snippet channels to the `registeredChannels` array
3. Call `registerSnippetsIpc(ipcMain, getOrCreateDatabase)` in the `registerIpc` function body, near other `register*Ipc` calls. Check how `getOrCreateDatabase` is exposed — it's imported from `hostsIpc.ts`.

**Step 3: Build desktop**

Run: `pnpm --filter @sshterm/desktop build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add apps/desktop/src/main/ipc/snippetsIpc.ts apps/desktop/src/main/ipc/registerIpc.ts
git commit -m "feat: add snippets IPC handler"
```

### Task 7.4: Add snippets preload bridge

**Files:**
- Modify: `apps/desktop/src/preload/desktopApi.ts`
- Modify: `apps/ui/src/types/global.d.ts`

**Step 1: Add preload methods**

In `desktopApi.ts`, add three methods to the `sshterm` object following the existing pattern (invoke + Zod parse response):

```ts
snippetsList: async (): Promise<SnippetRecord[]> => {
  const raw = await ipcRenderer.invoke(ipcChannels.snippets.list);
  return z.array(snippetRecordSchema).parse(raw);
},
snippetsUpsert: async (request: UpsertSnippetRequest): Promise<SnippetRecord> => {
  const raw = await ipcRenderer.invoke(ipcChannels.snippets.upsert, upsertSnippetRequestSchema.parse(request));
  return snippetRecordSchema.parse(raw);
},
snippetsRemove: async (request: RemoveSnippetRequest): Promise<void> => {
  await ipcRenderer.invoke(ipcChannels.snippets.remove, removeSnippetRequestSchema.parse(request));
},
```

Import the necessary schemas at the top of `desktopApi.ts`.

**Step 2: Add type declarations**

In `apps/ui/src/types/global.d.ts`, add to the `Window.sshterm` interface:

```ts
snippetsList?: () => Promise<SnippetRecord[]>;
snippetsUpsert?: (request: UpsertSnippetRequest) => Promise<SnippetRecord>;
snippetsRemove?: (request: RemoveSnippetRequest) => Promise<void>;
```

Import `SnippetRecord`, `UpsertSnippetRequest`, `RemoveSnippetRequest` from `@sshterm/shared`.

**Step 3: Build**

Run: `pnpm build`
Expected: All workspaces build successfully.

**Step 4: Commit**

```bash
git add apps/desktop/src/preload/desktopApi.ts apps/ui/src/types/global.d.ts
git commit -m "feat: add snippets preload bridge and type declarations"
```

### Task 7.5: Create snippets UI — store and panel

**Files:**
- Create: `apps/ui/src/features/snippets/snippetStore.ts`
- Create: `apps/ui/src/features/snippets/SnippetsPanel.tsx`
- Create: `apps/ui/src/features/snippets/SnippetForm.tsx`

**Step 1: Create the Zustand store**

```ts
import { create } from "zustand";

type SnippetRecord = {
  id: string;
  name: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

type SnippetStore = {
  snippets: SnippetRecord[];
  isOpen: boolean;
  loading: boolean;
  toggle: () => void;
  open: () => void;
  close: () => void;
  load: () => Promise<void>;
  upsert: (id: string, name: string, body: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

export const useSnippetStore = create<SnippetStore>((set, get) => ({
  snippets: [],
  isOpen: false,
  loading: false,
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  open: () => {
    set({ isOpen: true });
    void get().load();
  },
  close: () => set({ isOpen: false }),
  load: async () => {
    set({ loading: true });
    const snippets = await window.sshterm?.snippetsList?.() ?? [];
    set({ snippets, loading: false });
  },
  upsert: async (id, name, body) => {
    await window.sshterm?.snippetsUpsert?.({ id, name, body });
    void get().load();
  },
  remove: async (id) => {
    await window.sshterm?.snippetsRemove?.({ id });
    void get().load();
  },
}));
```

**Step 2: Create SnippetForm.tsx**

A simple form with name (text input) and body (textarea). Uses controlled state. On submit, calls `upsert` with a generated UUID for new snippets. Include a cancel button.

**Step 3: Create SnippetsPanel.tsx**

A slide-out panel (right side) showing the list of snippets. Each snippet shows its name with a click-to-copy-to-clipboard action (copies `body`), edit button, and delete button. Include an "Add Snippet" button that toggles to the form view.

The panel should also support **sending a snippet to the active terminal** by calling:
```ts
window.sshterm?.writeSession?.({ sessionId: activeSessionId, data: snippet.body });
```

Get `activeSessionId` from `layoutStore`.

**Step 4: Wire into Workspace**

Add a snippets button to the toolbar area in `Workspace.tsx` (next to the Tunnels and Workspaces buttons at line 191). Toggle `useSnippetStore.toggle()`.

Render `<SnippetsPanel />` conditionally when `isOpen` is true.

**Step 5: Build and manually verify**

Run: `pnpm --filter @sshterm/ui build`
Expected: Build succeeds.

**Step 6: Commit**

```bash
git add apps/ui/src/features/snippets/
git add apps/ui/src/features/layout/Workspace.tsx
git commit -m "feat: add snippets manager UI with send-to-terminal"
```

### Task 7.6: Add keyboard shortcut for snippets panel

**Files:**
- Modify: `apps/ui/src/features/snippets/SnippetsPanel.tsx` or `apps/ui/src/App.tsx`

**Step 1: Add global keyboard listener**

Register a `keydown` handler for `Ctrl+Shift+S` (or `Cmd+Shift+S` on Mac) that toggles the snippets panel. Use `useEffect` in `App.tsx`:

```ts
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "S") {
      e.preventDefault();
      useSnippetStore.getState().toggle();
    }
  };
  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}, []);
```

**Step 2: Build and verify**

Run: `pnpm --filter @sshterm/ui build`

**Step 3: Commit**

```bash
git add apps/ui/src/App.tsx
git commit -m "feat: add Ctrl+Shift+S keyboard shortcut for snippets panel"
```

---

## Feature 8: Session Logging

### Task 8.1: Add session logging IPC channels and schemas

**Files:**
- Modify: `packages/shared/src/ipc/channels.ts`
- Modify: `packages/shared/src/ipc/schemas.ts`

**Step 1: Add channels**

```ts
export const loggingChannels = {
  start: "logging:start",
  stop: "logging:stop",
  getState: "logging:get-state",
} as const;
```

Add `logging: loggingChannels` to `ipcChannels`.

**Step 2: Add schemas**

```ts
// --- Session logging schemas ---

export const startLoggingRequestSchema = z.object({
  sessionId: z.string().min(1),
  filePath: z.string().min(1),
});

export const stopLoggingRequestSchema = z.object({
  sessionId: z.string().min(1),
});

export const getLoggingStateRequestSchema = z.object({
  sessionId: z.string().min(1),
});

export const loggingStateResponseSchema = z.object({
  active: z.boolean(),
  filePath: z.string().nullable(),
  bytesWritten: z.number().int(),
});

export type StartLoggingRequest = z.infer<typeof startLoggingRequestSchema>;
export type StopLoggingRequest = z.infer<typeof stopLoggingRequestSchema>;
export type GetLoggingStateRequest = z.infer<typeof getLoggingStateRequestSchema>;
export type LoggingStateResponse = z.infer<typeof loggingStateResponseSchema>;
```

**Step 3: Build**

Run: `pnpm --filter @sshterm/shared build`

**Step 4: Commit**

```bash
git add packages/shared/src/ipc/channels.ts packages/shared/src/ipc/schemas.ts
git commit -m "feat: add session logging IPC channels and schemas"
```

### Task 8.2: Implement session logging handler

**Files:**
- Create: `apps/desktop/src/main/ipc/loggingIpc.ts`
- Modify: `apps/desktop/src/main/ipc/registerIpc.ts`

The logging handler maintains a `Map<sessionId, { stream: WriteStream, bytesWritten: number }>`. It intercepts session data events. The key insight: `registerIpc.ts` line 890 already subscribes to `manager.onEvent(...)`. The logging handler should hook into the same event stream.

**Step 1: Write the failing test**

Create `apps/desktop/src/main/ipc/loggingIpc.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSessionLogger } from "./loggingIpc";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

describe("SessionLogger", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), "sshterm-log-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes data events to file", async () => {
    const logFile = path.join(tempDir, "session.log");
    const logger = createSessionLogger();

    logger.start("sess-1", logFile);
    logger.onSessionData("sess-1", "hello world\n");
    logger.onSessionData("sess-1", "second line\n");
    logger.stop("sess-1");

    // Give the stream time to flush
    await new Promise((r) => setTimeout(r, 50));

    const content = readFileSync(logFile, "utf-8");
    expect(content).toContain("hello world");
    expect(content).toContain("second line");
  });

  it("reports logging state", () => {
    const logFile = path.join(tempDir, "session.log");
    const logger = createSessionLogger();

    expect(logger.getState("sess-1")).toEqual({
      active: false,
      filePath: null,
      bytesWritten: 0,
    });

    logger.start("sess-1", logFile);
    const state = logger.getState("sess-1");
    expect(state.active).toBe(true);
    expect(state.filePath).toBe(logFile);

    logger.stop("sess-1");
    expect(logger.getState("sess-1").active).toBe(false);
  });

  it("ignores data for non-logged sessions", () => {
    const logger = createSessionLogger();
    // Should not throw
    logger.onSessionData("no-session", "data");
  });
});
```

**Step 2: Run it to verify it fails**

Run: `pnpm --filter @sshterm/desktop test -- loggingIpc.test`
Expected: FAIL

**Step 3: Implement createSessionLogger**

```ts
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
      // Strip ANSI escape sequences for clean logs
      const clean = data.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
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
```

**Step 4: Integrate into registerIpc.ts**

1. Import `createSessionLogger` and `registerLoggingIpc`
2. Create a module-level `const sessionLogger = createSessionLogger();`
3. Add the 3 logging channels to `registeredChannels`
4. Call `registerLoggingIpc(ipcMain, sessionLogger);`
5. In the existing `manager.onEvent(...)` callback (line ~890), add:
   ```ts
   if (event.type === "data") {
     sessionLogger.onSessionData(event.sessionId, event.data);
   }
   ```
   This intercepts all terminal data events for any session that has logging enabled.

**Step 5: Run tests**

Run: `pnpm --filter @sshterm/desktop test -- loggingIpc.test`
Expected: PASS

**Step 6: Commit**

```bash
git add apps/desktop/src/main/ipc/loggingIpc.ts apps/desktop/src/main/ipc/loggingIpc.test.ts apps/desktop/src/main/ipc/registerIpc.ts
git commit -m "feat: implement session logging handler with ANSI stripping"
```

### Task 8.3: Add logging preload bridge and UI controls

**Files:**
- Modify: `apps/desktop/src/preload/desktopApi.ts`
- Modify: `apps/ui/src/types/global.d.ts`

**Step 1: Add preload methods**

```ts
loggingStart: async (request: StartLoggingRequest): Promise<void> => {
  await ipcRenderer.invoke(ipcChannels.logging.start, startLoggingRequestSchema.parse(request));
},
loggingStop: async (request: StopLoggingRequest): Promise<void> => {
  await ipcRenderer.invoke(ipcChannels.logging.stop, stopLoggingRequestSchema.parse(request));
},
loggingGetState: async (request: GetLoggingStateRequest): Promise<LoggingStateResponse> => {
  const raw = await ipcRenderer.invoke(ipcChannels.logging.getState, getLoggingStateRequestSchema.parse(request));
  return loggingStateResponseSchema.parse(raw);
},
```

**Step 2: Add type declarations**

In `global.d.ts`:
```ts
loggingStart?: (request: StartLoggingRequest) => Promise<void>;
loggingStop?: (request: StopLoggingRequest) => Promise<void>;
loggingGetState?: (request: GetLoggingStateRequest) => Promise<LoggingStateResponse>;
```

**Step 3: Commit**

```bash
git add apps/desktop/src/preload/desktopApi.ts apps/ui/src/types/global.d.ts
git commit -m "feat: add session logging preload bridge"
```

### Task 8.4: Add logging toggle to terminal toolbar

**Files:**
- Create: `apps/ui/src/features/terminal/LoggingButton.tsx`
- Modify: terminal toolbar area (find where the terminal status bar or controls are rendered)

**Step 1: Create LoggingButton component**

A small icon button that shows logging state (red dot = recording, gray = off). Clicking it:
- If not logging: opens a native save-file dialog via prompt for now (file path input), then calls `loggingStart`
- If logging: calls `loggingStop` and shows a success toast via `toast.success("Logging stopped")`

```tsx
import { useState, useEffect } from "react";
import { toast } from "sonner";

export function LoggingButton({ sessionId }: { sessionId: string }) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    window.sshterm?.loggingGetState?.({ sessionId }).then((state) => {
      setActive(state.active);
    });
  }, [sessionId]);

  const toggle = async () => {
    if (active) {
      await window.sshterm?.loggingStop?.({ sessionId });
      setActive(false);
      toast.success("Session logging stopped");
    } else {
      const defaultName = `session-${sessionId}-${new Date().toISOString().slice(0, 10)}.log`;
      const filePath = prompt("Log file path:", defaultName);
      if (!filePath) return;
      await window.sshterm?.loggingStart?.({ sessionId, filePath });
      setActive(true);
      toast.success("Session logging started");
    }
  };

  return (
    <button
      onClick={toggle}
      className={`p-1 rounded text-xs ${active ? "text-red-400" : "text-text-muted hover:text-text-primary"}`}
      title={active ? "Stop logging" : "Start logging"}
    >
      {/* Circle/record icon */}
      <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
        <circle cx="6" cy="6" r="4" />
      </svg>
    </button>
  );
}
```

**Step 2: Add to terminal controls**

Find where the terminal toolbar renders (likely in `TerminalPane.tsx` or the tab bar area). Add `<LoggingButton sessionId={sessionId} />` next to existing controls.

**Step 3: Build and verify**

Run: `pnpm --filter @sshterm/ui build`

**Step 4: Commit**

```bash
git add apps/ui/src/features/terminal/LoggingButton.tsx
git commit -m "feat: add logging toggle button to terminal toolbar"
```

---

## Feature 9: Tab Drag-and-Drop Reorder

### Task 9.1: Add moveTab action to layoutStore

**Files:**
- Modify: `apps/ui/src/features/layout/layoutStore.ts`

**Step 1: Write the failing test**

Create `apps/ui/src/features/layout/layoutStore.moveTab.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createLayoutStore } from "./layoutStore";

describe("layoutStore.moveTab", () => {
  let store: ReturnType<typeof createLayoutStore>;

  beforeEach(() => {
    store = createLayoutStore();
  });

  it("reorders tabs", () => {
    store.getState().openTab({ sessionId: "a", title: "A" });
    store.getState().openTab({ sessionId: "b", title: "B" });
    store.getState().openTab({ sessionId: "c", title: "C" });

    store.getState().moveTab(0, 2);

    const ids = store.getState().tabs.map((t) => t.sessionId);
    expect(ids).toEqual(["b", "c", "a"]);
  });

  it("handles same index (no-op)", () => {
    store.getState().openTab({ sessionId: "a", title: "A" });
    store.getState().openTab({ sessionId: "b", title: "B" });

    store.getState().moveTab(0, 0);

    const ids = store.getState().tabs.map((t) => t.sessionId);
    expect(ids).toEqual(["a", "b"]);
  });
});
```

**Step 2: Run to verify it fails**

Run: `pnpm --filter @sshterm/ui test -- layoutStore.moveTab.test`
Expected: FAIL — `moveTab` is not a function

**Step 3: Add moveTab to layoutStore**

In `layoutStore.ts`, add to the `LayoutState` type:
```ts
moveTab: (fromIndex: number, toIndex: number) => void;
```

Add the implementation inside `createStore`:
```ts
moveTab: (fromIndex, toIndex) =>
  set((state) => {
    if (fromIndex === toIndex) return state;
    const tabs = [...state.tabs];
    const [moved] = tabs.splice(fromIndex, 1);
    tabs.splice(toIndex, 0, moved);
    return { tabs };
  }),
```

**Step 4: Run test**

Run: `pnpm --filter @sshterm/ui test -- layoutStore.moveTab.test`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/ui/src/features/layout/layoutStore.ts apps/ui/src/features/layout/layoutStore.moveTab.test.ts
git commit -m "feat: add moveTab action to layoutStore"
```

### Task 9.2: Add drag-and-drop to TabBar

**Files:**
- Modify: `apps/ui/src/features/layout/TabBar.tsx`

**Step 1: Wrap TabBar with DndContext**

Follow the exact pattern from `SidebarHostList.tsx` (lines 1-19 for imports). The tab bar needs:

1. Import from `@dnd-kit/core`: `DndContext`, `closestCenter`, `PointerSensor`, `useSensor`, `useSensors`, `DragEndEvent`
2. Import from `@dnd-kit/sortable`: `SortableContext`, `horizontalListSortingStrategy`, `useSortable`
3. Import `CSS` from `@dnd-kit/utilities`

**Step 2: Create SortableTab wrapper**

Extract the individual tab button into a `SortableTab` component that uses `useSortable`:

```tsx
function SortableTab({ tab, isActive, sessionState, onActivate, onClose, hoveredTab, onMouseEnter, onMouseLeave }: {
  tab: LayoutTab;
  isActive: boolean;
  sessionState: string | undefined;
  onActivate: () => void;
  onClose: () => void;
  hoveredTab: string | null;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tab.tabKey ?? tab.sessionId,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="flex items-end">
      {/* existing tab button JSX */}
    </div>
  );
}
```

**Step 3: Add onReorder prop to TabBarProps**

```ts
export interface TabBarProps {
  tabs: LayoutTab[];
  activeSessionId: string | null;
  onActivate: (sessionId: string) => void;
  onClose: (sessionId: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}
```

**Step 4: Wrap tabs in DndContext + SortableContext**

```tsx
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
);

const handleDragEnd = (event: DragEndEvent) => {
  const { active, over } = event;
  if (!over || active.id === over.id) return;
  const oldIndex = tabs.findIndex((t) => (t.tabKey ?? t.sessionId) === active.id);
  const newIndex = tabs.findIndex((t) => (t.tabKey ?? t.sessionId) === over.id);
  if (oldIndex !== -1 && newIndex !== -1) {
    onReorder(oldIndex, newIndex);
  }
};

return (
  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
    <SortableContext items={tabs.map((t) => t.tabKey ?? t.sessionId)} strategy={horizontalListSortingStrategy}>
      <div className="flex items-end bg-base-800 px-1 pt-2 overflow-x-auto">
        {tabs.map((tab) => (
          <SortableTab key={tab.tabKey ?? tab.sessionId} tab={tab} ... />
        ))}
      </div>
    </SortableContext>
  </DndContext>
);
```

**Step 5: Pass onReorder from Workspace.tsx**

In `Workspace.tsx` where `<TabBar>` is rendered (line 184), add:

```tsx
onReorder={(from, to) => layoutStore.getState().moveTab(from, to)}
```

**Step 6: Build and verify**

Run: `pnpm --filter @sshterm/ui build`
Expected: Build succeeds.

**Step 7: Commit**

```bash
git add apps/ui/src/features/layout/TabBar.tsx apps/ui/src/features/layout/Workspace.tsx
git commit -m "feat: add drag-and-drop tab reorder using @dnd-kit"
```

---

## Feature 10: Split Pane Keyboard Shortcuts

### Task 10.1: Add keyboard shortcuts for split pane operations

**Files:**
- Modify: `apps/ui/src/App.tsx` (or wherever the global keyboard listener lives)

The `layoutStore` already has `splitPane`, `closePane`, and `activatePane` actions. We need keyboard shortcuts:

- `Ctrl+Shift+D` — Split pane (horizontal)
- `Ctrl+Shift+E` — Split pane (vertical)
- `Ctrl+Shift+W` — Close active pane
- `Ctrl+Shift+[` — Focus previous pane
- `Ctrl+Shift+]` — Focus next pane

**Step 1: Write the test**

Create `apps/ui/src/features/layout/paneShortcuts.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createLayoutStore } from "./layoutStore";
import { handlePaneShortcut } from "./paneShortcuts";

describe("paneShortcuts", () => {
  let store: ReturnType<typeof createLayoutStore>;

  beforeEach(() => {
    store = createLayoutStore();
    store.getState().openTab({ sessionId: "s1", title: "Test" });
  });

  it("splits pane horizontally on Ctrl+Shift+D", () => {
    const handled = handlePaneShortcut(store, { ctrlKey: true, shiftKey: true, key: "D" } as KeyboardEvent);
    expect(handled).toBe(true);
    expect(store.getState().panes).toHaveLength(2);
    expect(store.getState().splitDirection).toBe("horizontal");
  });

  it("splits pane vertically on Ctrl+Shift+E", () => {
    const handled = handlePaneShortcut(store, { ctrlKey: true, shiftKey: true, key: "E" } as KeyboardEvent);
    expect(handled).toBe(true);
    expect(store.getState().panes).toHaveLength(2);
    expect(store.getState().splitDirection).toBe("vertical");
  });

  it("closes active pane on Ctrl+Shift+W", () => {
    store.getState().splitPane("s1", "horizontal");
    expect(store.getState().panes).toHaveLength(2);
    const handled = handlePaneShortcut(store, { ctrlKey: true, shiftKey: true, key: "W" } as KeyboardEvent);
    expect(handled).toBe(true);
    expect(store.getState().panes).toHaveLength(1);
  });

  it("returns false for unrelated keys", () => {
    const handled = handlePaneShortcut(store, { ctrlKey: false, shiftKey: false, key: "a" } as KeyboardEvent);
    expect(handled).toBe(false);
  });
});
```

**Step 2: Run to verify it fails**

Run: `pnpm --filter @sshterm/ui test -- paneShortcuts.test`
Expected: FAIL

**Step 3: Implement paneShortcuts.ts**

Create `apps/ui/src/features/layout/paneShortcuts.ts`:

```ts
import type { createLayoutStore } from "./layoutStore";

type LayoutStore = ReturnType<typeof createLayoutStore>;

export function handlePaneShortcut(store: LayoutStore, e: KeyboardEvent): boolean {
  if (!(e.ctrlKey || e.metaKey) || !e.shiftKey) return false;

  const state = store.getState();

  switch (e.key) {
    case "D": {
      const sessionId = state.activeSessionId;
      if (sessionId) state.splitPane(sessionId, "horizontal");
      return true;
    }
    case "E": {
      const sessionId = state.activeSessionId;
      if (sessionId) state.splitPane(sessionId, "vertical");
      return true;
    }
    case "W": {
      if (state.panes.length > 1) {
        state.closePane(state.activePaneId);
      }
      return true;
    }
    case "[": {
      const idx = state.panes.findIndex((p) => p.paneId === state.activePaneId);
      if (idx > 0) state.activatePane(state.panes[idx - 1].paneId);
      return true;
    }
    case "]": {
      const idx = state.panes.findIndex((p) => p.paneId === state.activePaneId);
      if (idx < state.panes.length - 1) state.activatePane(state.panes[idx + 1].paneId);
      return true;
    }
    default:
      return false;
  }
}
```

**Step 4: Run tests**

Run: `pnpm --filter @sshterm/ui test -- paneShortcuts.test`
Expected: PASS

**Step 5: Wire into App.tsx**

Add `useEffect` in `App.tsx`:

```ts
import { handlePaneShortcut } from "./features/layout/paneShortcuts";
import { layoutStore } from "./features/layout/layoutStore";

useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if (handlePaneShortcut(layoutStore, e)) {
      e.preventDefault();
    }
  };
  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}, []);
```

**Step 6: Build**

Run: `pnpm --filter @sshterm/ui build`

**Step 7: Commit**

```bash
git add apps/ui/src/features/layout/paneShortcuts.ts apps/ui/src/features/layout/paneShortcuts.test.ts apps/ui/src/App.tsx
git commit -m "feat: add keyboard shortcuts for split pane operations"
```

---

## Feature 11: Host Export (JSON/CSV)

### Task 11.1: Add host export IPC channel

**Files:**
- Modify: `packages/shared/src/ipc/channels.ts`
- Modify: `packages/shared/src/ipc/schemas.ts`

**Step 1: Add channel**

Add to `hostChannels`:
```ts
export const hostChannels = {
  list: "hosts:list",
  upsert: "hosts:upsert",
  remove: "hosts:remove",
  importSshConfig: "hosts:import-ssh-config",
  reorder: "hosts:reorder",
  exportHosts: "hosts:export",
} as const;
```

**Step 2: Add schemas**

```ts
export const exportHostsRequestSchema = z.object({
  format: z.enum(["json", "csv"]),
  filePath: z.string().min(1),
});

export type ExportHostsRequest = z.infer<typeof exportHostsRequestSchema>;
```

**Step 3: Build**

Run: `pnpm --filter @sshterm/shared build`

**Step 4: Commit**

```bash
git add packages/shared/src/ipc/channels.ts packages/shared/src/ipc/schemas.ts
git commit -m "feat: add host export IPC channel and schema"
```

### Task 11.2: Implement host export handler

**Files:**
- Modify: `apps/desktop/src/main/ipc/hostsIpc.ts`
- Modify: `apps/desktop/src/main/ipc/registerIpc.ts`

**Step 1: Write the test**

Create `apps/desktop/src/main/ipc/hostExport.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { exportHostsToJson, exportHostsToCsv } from "./hostsIpc";
import type { HostRecord } from "@sshterm/db";

const sampleHost: HostRecord = {
  id: "h1",
  name: "web-1",
  hostname: "192.168.1.1",
  port: 22,
  username: "admin",
  identityFile: null,
  authProfileId: null,
  groupId: null,
  notes: "production server",
  authMethod: "default",
  agentKind: "system",
  opReference: null,
  isFavorite: false,
  sortOrder: null,
  color: null,
  proxyJump: null,
  proxyJumpHostIds: null,
  keepAliveInterval: null,
  autoReconnect: false,
  reconnectMaxAttempts: 5,
  reconnectBaseInterval: 1,
};

describe("host export", () => {
  it("exports to JSON format", () => {
    const json = exportHostsToJson([sampleHost]);
    const parsed = JSON.parse(json);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe("web-1");
    expect(parsed[0].hostname).toBe("192.168.1.1");
  });

  it("exports to CSV format", () => {
    const csv = exportHostsToCsv([sampleHost]);
    const lines = csv.split("\n");
    expect(lines[0]).toContain("name");
    expect(lines[0]).toContain("hostname");
    expect(lines[1]).toContain("web-1");
    expect(lines[1]).toContain("192.168.1.1");
  });

  it("handles CSV fields with commas in notes", () => {
    const hostWithComma = { ...sampleHost, notes: "server, production" };
    const csv = exportHostsToCsv([hostWithComma]);
    expect(csv).toContain('"server, production"');
  });
});
```

**Step 2: Run to verify it fails**

Run: `pnpm --filter @sshterm/desktop test -- hostExport.test`
Expected: FAIL

**Step 3: Implement export functions**

Add to `hostsIpc.ts` (exported for testing):

```ts
export function exportHostsToJson(hosts: HostRecord[]): string {
  const exportable = hosts.map(({ id, ...rest }) => rest);
  return JSON.stringify(exportable, null, 2);
}

const CSV_FIELDS = [
  "name", "hostname", "port", "username", "identityFile",
  "groupId", "notes", "authMethod", "agentKind",
  "proxyJump", "keepAliveInterval", "autoReconnect",
] as const;

function escapeCsv(value: unknown): string {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportHostsToCsv(hosts: HostRecord[]): string {
  const header = CSV_FIELDS.join(",");
  const rows = hosts.map((host) =>
    CSV_FIELDS.map((field) => escapeCsv(host[field as keyof HostRecord])).join(",")
  );
  return [header, ...rows].join("\n");
}
```

**Step 4: Register the IPC handler**

In `registerIpc.ts`, add the export handler (in the section where host handlers are registered):

```ts
ipcMain.handle(ipcChannels.hosts.exportHosts, async (_event: unknown, request: unknown) => {
  const parsed = exportHostsRequestSchema.parse(request);
  const hosts = hostsRepo.list();
  const content = parsed.format === "json"
    ? exportHostsToJson(hosts)
    : exportHostsToCsv(hosts);
  writeFileSync(parsed.filePath, content, "utf-8");
  return { exported: hosts.length };
});
```

Add `ipcChannels.hosts.exportHosts` to `registeredChannels`.

**Step 5: Run tests**

Run: `pnpm --filter @sshterm/desktop test -- hostExport.test`
Expected: PASS

**Step 6: Commit**

```bash
git add apps/desktop/src/main/ipc/hostsIpc.ts apps/desktop/src/main/ipc/hostExport.test.ts apps/desktop/src/main/ipc/registerIpc.ts
git commit -m "feat: implement host export to JSON and CSV"
```

### Task 11.3: Add export preload bridge and UI

**Files:**
- Modify: `apps/desktop/src/preload/desktopApi.ts`
- Modify: `apps/ui/src/types/global.d.ts`
- Modify: sidebar context menu or host browser area

**Step 1: Add preload method**

```ts
exportHosts: async (request: ExportHostsRequest): Promise<{ exported: number }> => {
  const raw = await ipcRenderer.invoke(ipcChannels.hosts.exportHosts, exportHostsRequestSchema.parse(request));
  return z.object({ exported: z.number() }).parse(raw);
},
```

**Step 2: Add type declaration**

```ts
exportHosts?: (request: ExportHostsRequest) => Promise<{ exported: number }>;
```

**Step 3: Add export button to sidebar**

Find the sidebar's header/toolbar area (near the SSH Config Import button or context menu). Add an export button that:

1. Shows a dropdown: "Export as JSON" / "Export as CSV"
2. Prompts for file path (use `prompt()` for now — can upgrade to native dialog later)
3. Calls `window.sshterm.exportHosts({ format, filePath })`
4. Shows toast: `toast.success(\`Exported ${result.exported} hosts\`)`

The best location is likely in the sidebar header where the import button already lives. Check for `SshConfigImportDialog` usage to find where import is triggered.

**Step 4: Build and verify**

Run: `pnpm build`

**Step 5: Commit**

```bash
git add apps/desktop/src/preload/desktopApi.ts apps/ui/src/types/global.d.ts
git commit -m "feat: add host export preload bridge and sidebar button"
```

---

## Implementation Order Summary

Recommended order (dependency-aware):

1. **Feature 12: Toast Notifications** — foundation for user feedback in all other features
2. **Feature 7: Snippets Manager** — standalone, good warmup for the IPC pattern
3. **Feature 8: Session Logging** — standalone, main process focused
4. **Feature 9: Tab D&D** — UI-only, uses existing dnd-kit
5. **Feature 10: Split Pane Shortcuts** — UI-only, lightweight
6. **Feature 11: Host Export** — builds on existing import pattern

Total tasks: 16 (across 6 features)

## Key Patterns to Follow

**IPC contract (for features 7, 8, 11):**
1. Channel name in `packages/shared/src/ipc/channels.ts`
2. Zod schema in `packages/shared/src/ipc/schemas.ts`
3. Handler in `apps/desktop/src/main/ipc/<feature>Ipc.ts`
4. Register channel in `apps/desktop/src/main/ipc/registerIpc.ts` (both the handler call AND the channel in `registeredChannels` array)
5. Preload bridge method in `apps/desktop/src/preload/desktopApi.ts` (validates both request and response with Zod)
6. Type declaration in `apps/ui/src/types/global.d.ts`

**Existing reference implementations:**
- DB repository pattern: `packages/db/src/repositories/hostsRepository.ts`
- IPC handler pattern: `apps/desktop/src/main/ipc/hostsIpc.ts`
- Drag-and-drop with dnd-kit: `apps/ui/src/features/sidebar/SidebarHostList.tsx`
- Import dialog pattern: `apps/ui/src/features/hosts/SshConfigImportDialog.tsx`
