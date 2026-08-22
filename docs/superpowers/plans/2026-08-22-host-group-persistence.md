# Host Group Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist host group assignment end-to-end: the group name typed in HostForm (and assigned by sidebar drag-and-drop) survives app restarts, backed by the existing `host_groups` table.

**Architecture:** Name-based resolution in the main process. The renderer keeps sending a group *name* (already in `upsertHostRequestSchema.group`); the upsert and reorder handlers resolve the name to a `host_groups` row (creating it when new) and store `group_id`. The hosts list/upsert responses are enriched with the resolved `group` name (added to `hostRecordSchema` — Zod strips unknown keys, so the field must be declared). `mapDbHostToUiHost` stops hardcoding `group: ""`.

**Tech Stack:** TypeScript strict, Vitest 3.1, Zod, better-sqlite3.

**Spec:** The groupId investigation earlier this session (2026-08-22). Key verified facts:
- Tags are already fully wired via `tagIds` + `tags:get-host-tags`/`tags:set-host-tags`; the comma-string `tags` field in the upsert schema is legacy and stays untouched.
- Groups: `upsertHostRequestSchema.group` (name string, `schemas.ts:208`) is validated then dropped by the handler; `mapDbHostToUiHost` hardcodes `group: ""` (`App.tsx:101`); the reorder path hardcodes `groupId: null` (`App.tsx:855`); `SidebarHostList` does full grouping UX in memory only, emitting `group: h.group || "Ungrouped"` (`SidebarHostList.tsx:393`).
- `createGroupsRepositoryFromDatabase` (packages/db) already has create/list/get/remove; `host_groups.name` is `UNIQUE`.
- Preload validates responses: `hostRecordSchema.parse` (upsert) and `z.array(hostRecordSchema)` (list) — enrichment keys not in the schema are stripped.

## Global Constraints

- **NOTHING in this feature gets committed.** It requires edits to `packages/shared/src/ipc/schemas.ts` and `apps/ui/src/app/App.tsx`, both dirty with uncommitted item-2–4 work; a partial commit would either sweep that work in or leave a non-compiling commit. All edits stay in the working tree (branch practice for items 2–4). NEVER `git add`/`git commit` in this plan.
- Local unit tests for db/desktop need the better-sqlite3 ABI swap: rename `build/Release/better_sqlite3.node` aside in the pnpm store dir, `npx prebuild-install -r node -t 24.15.0` there, run tests, then **restore the Electron-ABI file** (the running dev Electron app holds it; ABI 140 vs node's 137).
- TypeScript strict; match file style. Group-name matching is exact (the `host_groups.name UNIQUE` constraint is case-sensitive; the sidebar also keys groups by exact string).
- Deliberately out of scope: garbage-collecting emptied `host_groups` rows; the legacy `tags` string field; the JSON-file fallback store (no DB → group resolution unavailable → behaves as today, silently ungrouped); group autocomplete in HostForm.

---

### Task 1: Wire schema + main-process resolution and enrichment

**Files:**
- Modify: `packages/shared/src/ipc/schemas.ts` (2 small additions — dirty file, edit only)
- Modify: `apps/desktop/src/main/ipc/hostsIpc.ts`
- Test (create): `apps/desktop/src/main/ipc/hostsIpc.groups.test.ts`

**Interfaces:**
- Consumes: `createGroupsRepositoryFromDatabase` from `@hypershell/db`; `randomUUID` from `node:crypto`.
- Produces: `hostRecordSchema` gains `group: z.string().optional()`; `reorderHostsRequestSchema` items gain `group: z.string().optional()`; hosts list/upsert responses carry `group` (resolved name, `""` when ungrouped); upsert + reorder persist `group_id`.

- [x] **Step 1: Write the failing test** — `apps/desktop/src/main/ipc/hostsIpc.groups.test.ts`, electron mocked to a per-run temp appData dir (backupIpc.test.ts idiom):

```ts
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
```

- [x] **Step 2: Run and verify it fails**

Run (in `apps/desktop`, after the ABI swap): `npx vitest run hostsIpc.groups`
Expected: FAIL — `saved.group` is `undefined` and `saved.groupId` is null (handler drops the name); the reorder test fails on the extra `group` item key (schema rejects unknown? Zod strips — it fails on assignment not persisting).

- [x] **Step 3: Schema additions** in `packages/shared/src/ipc/schemas.ts`:
1. In `hostRecordSchema`, after the `groupId` line add:
   ```ts
   group: z.string().optional(),
   ```
2. In `reorderHostsRequestSchema` items object, after `groupId: z.string().nullable()` add:
   ```ts
   group: z.string().optional()
   ```

- [x] **Step 4: Main-process implementation** in `apps/desktop/src/main/ipc/hostsIpc.ts`:
1. Imports: add `createGroupsRepositoryFromDatabase` to the `@hypershell/db` value import; add `import { randomUUID } from "node:crypto";`.
2. Below `getOrCreateHostsRepo`, add a lazy groups repo + resolver + enrichment (reset `groupsRepo` in `closeSharedDatabase` alongside `hostsRepo`):
   ```ts
   type GroupsRepoLike = ReturnType<typeof createGroupsRepositoryFromDatabase>;

   let groupsRepo: GroupsRepoLike | null = null;

   function getGroupsRepoOrNull(): GroupsRepoLike | null {
     if (!groupsRepo) {
       const db = getDatabaseOrNull();
       if (!db) {
         return null; // JSON-fallback mode: groups stay unpersisted.
       }
       groupsRepo = createGroupsRepositoryFromDatabase(db);
     }
     return groupsRepo;
   }

   /** Resolve a group name to its host_groups id, creating the row for a new name. */
   function resolveGroupIdByName(name: string | undefined): string | null {
     const trimmed = name?.trim() ?? "";
     if (!trimmed) {
       return null;
     }
     const repo = getGroupsRepoOrNull();
     if (!repo) {
       return null;
     }
     const existing = repo.list().find((group) => group.name === trimmed);
     if (existing) {
       return existing.id;
     }
     return repo.create({ id: `group-${randomUUID()}`, name: trimmed }).id;
   }

   function resolveGroupName(groupId: string | null | undefined): string {
     if (!groupId) {
       return "";
     }
     return getGroupsRepoOrNull()?.get(groupId)?.name ?? "";
   }
   ```
3. Extend the response enrichment — rename nothing; widen `attachPasswordMetadata`'s return by adding the group name inside it:
   ```ts
   function attachPasswordMetadata(host: HostRecord): HostRecord & {
     passwordSavedAt: string | null;
     group: string;
   } {
     return {
       ...host,
       passwordSavedAt: resolvePasswordSavedAt(host),
       group: resolveGroupName(host.groupId)
     };
   }
   ```
4. Upsert handler: in the `repo.create({...})` argument list add, after `hostProfileId`:
   ```ts
   groupId: resolveGroupIdByName(parsed.group),
   ```
5. Reorder handler: replace `(repo as any).updateSortOrders(parsed.items)` with:
   ```ts
   (repo as any).updateSortOrders(
     parsed.items.map((item) => ({
       id: item.id,
       sortOrder: item.sortOrder,
       groupId: item.group !== undefined ? resolveGroupIdByName(item.group) : item.groupId,
     }))
   );
   ```

- [x] **Step 5: Run desktop tests + build**

Run: `npx vitest run` (in `apps/desktop`), then `pnpm --filter @hypershell/desktop build`
Expected: ALL PASS including the 4 new tests; tsc clean. Also run `pnpm --filter @hypershell/shared test`.

---

### Task 2: Renderer reads and sends real group data

**Files:**
- Modify: `apps/ui/src/app/App.tsx` (dirty — edit only)
- Modify: `apps/ui/src/features/sidebar/SidebarHostList.tsx` (edit only; check dirtiness is irrelevant — no commits)

**Interfaces:**
- Consumes: `group` field now present on list/upsert responses; `group` item field on reorder requests.
- Produces: no new exports.

- [x] **Step 1: Map the group name on load.** In `mapDbHostToUiHost` (`App.tsx:101`) replace `group: "",` with:
```ts
group: h.group == null ? "" : String(h.group),
```
(Leave `tags: ""` — tags are attached by `attachHostTags`.)

- [x] **Step 2: Send group names on reorder.** In the `reorderHosts` callback (`App.tsx:~854`) replace the IPC call's item mapping:
```ts
void getShell().reorderHosts({
  items: items.map((i) => ({ id: i.id, sortOrder: i.sortOrder, groupId: null, group: i.group }))
});
```

- [x] **Step 3: Stop injecting the "Ungrouped" sentinel.** In `SidebarHostList.tsx:393`, the reorder items are built with `group: h.group || "Ungrouped"` — change to `group: h.group,` so ungrouped hosts reorder with an empty name (which main resolves to null) instead of materializing a literal "Ungrouped" group. The display-side `host.group || "Ungrouped"` at `:294` stays — it's presentation only.

- [x] **Step 4: Run ui tests**

Run: `npx vitest run` (in `apps/ui`)
Expected: ALL PASS (tsc-via-vitest covers the type changes; no test asserts the old hardcoded `group: ""`).

---

### Final verification

- [x] `pnpm --filter @hypershell/shared test`, desktop tests + build, ui tests — all green.
- [x] Restore the Electron-ABI `better_sqlite3.node`.
- [x] `git status` — confirm nothing was committed; report the uncommitted file set to Tomer.
- [x] Manual QA note for Tomer (needs `pnpm --filter @hypershell/desktop build` + Electron restart to pick up main-process changes): create a host with a group, restart the app, the group survives; drag a host between groups, restart, the assignment survives.
