# Host Option Defaults (Arch Review Item 6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every host option's default exactly one owner (`HOST_OPTION_DEFAULTS` in `@hypershell/shared`), make all three host stores normalize through one function, and wire the four decorative migration `.sql` files (004, 005, 013, 014) so editing them actually does something.

**Architecture:** A new `packages/shared/src/hosts/hostOptions.ts` exports `HOST_OPTION_DEFAULTS`. A new exported `normalizeHostInput(input): HostRecord` in `packages/db` applies those defaults once; the SQLite repository, the in-memory repository, and the JSON-file fallback in `hostsIpc.ts` all call it. Tests pin the SQLite DDL defaults to the module and pin every `.sql` file in `migrations/` to being read by `openDatabase`. The Zod IPC schemas are untouched (they carry no defaults — their `.optional()` fields are wire-format opt-ins).

**Tech Stack:** TypeScript strict, Vitest 3.1, better-sqlite3, pnpm workspaces.

**Spec:** Candidate 6 of the 2026-08-21 architecture review (`architecture-review-20260821-095921.html`, session scratchpad `7e4cdeda…` — a temp dir, so the substance is restated in Context below).

## Context (restated from the review, verified 2026-08-22 against the working tree)

- One boolean (`tmuxDetect`) has its default written **six** times: `packages/db/src/index.ts:199` (inline DDL `DEFAULT 0` — *not* the `.sql` file), `hostsRepository.ts` SQLite `create` (`? 1 : 0`), in-memory `create` (`?? false`), `hostsIpc.ts` JSON fallback (`?? false` twice: `readHosts` + `create`), the upsert handler (`parsed.tmuxDetect ?? false`), and `HostForm.tsx:124` (`tmuxDetect: false`). Nothing checks the six agree. Same pattern for `shellIntegration` (default `true`, written as `=== false ? 0 : 1` in one adapter and `=== false ? false : true` in two others), `isFavorite`, `autoReconnect`, `reconnectMaxAttempts`/`reconnectBaseInterval`, `authMethod` (`"default"`), `agentKind` (`"system"`), `port` (22).
- Four migration files are decorative: `004_favorites.sql`, `005_host_enhancements.sql`, `013_tags_color.sql`, `014_tmux_detect.sql` are never read — `openDatabase` hardcodes their DDL inline (`index.ts:122`, `:130–134`, `:190` under a comment mislabelled "Migration 012b", `:199`). Verified: the file contents match the inline DDL exactly, so switching to reading the files is behavior-preserving.
- `CLAUDE.md` says "16 migrations (001-016)"; there are 18.
- **Scope decision:** the review's fuller vision (deriving the row mapper and form controls from a column-spec table) is deliberately deferred — it's type-gymnastics for little defect-prevention beyond what single-ownership of defaults + one normalize function already buys. This plan kills the actual defect: six unchecked copies of each default.

## Global Constraints

- **The working tree carries ~100 dirty files of uncommitted review-item 2–4 work. NEVER `git add -A` / `git add -u` / `git commit -a`. Stage only the exact files each task names.** Files known dirty that this plan touches but must NOT commit: `apps/ui/src/features/hosts/HostForm.tsx`, `CLAUDE.md` (repo root). Files verified clean that this plan commits: everything under `packages/db/`, `packages/shared/src/index.ts`, `apps/desktop/src/main/ipc/hostsIpc.ts`.
- TypeScript strict mode; match existing file style (no new lint idioms).
- Run tests per-workspace (`pnpm --filter @hypershell/<name> test`), not the root `pnpm test`. If better-sqlite3 throws a NODE_MODULE_VERSION/ABI error, run `pnpm rebuild better-sqlite3` at the repo root and retry — do not chase phantom test failures (known local gotcha).
- Commit messages end with the Co-Authored-By/Claude-Session trailer per session config.
- `DEFAULT_RECONNECT_MAX_ATTEMPTS` = 5 and `DEFAULT_RECONNECT_BASE_INTERVAL` = 1 live in `packages/shared/src/ipc/schemas.ts:10` (that file is dirty — import from it, never edit it).

---

### Task 1: Wire the four decorative migration files

**Files:**
- Modify: `packages/db/src/index.ts`
- Test: `packages/db/src/openDatabase.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: no exported API change — `openDatabase(path)` behavior identical on both fresh and already-migrated databases. Internal helpers `readMigration(filename: string): string` and `execGuardedStatements(db: SqliteDatabase, sql: string): void`.

- [x] **Step 1: Write the failing tripwire test** — append to `packages/db/src/openDatabase.test.ts` (it already imports `mkdtempSync, rmSync`, `tmpdir`, `join`; add `readFileSync, readdirSync` to the `node:fs` import and `fileURLToPath` from `node:url`):

```ts
describe("migration files", () => {
  it("reads every migration file in migrations/ (none are decorative)", () => {
    const srcDir = fileURLToPath(new URL(".", import.meta.url));
    const indexSource = readFileSync(join(srcDir, "index.ts"), "utf8");
    const migrationFiles = readdirSync(join(srcDir, "migrations")).filter((f) =>
      f.endsWith(".sql")
    );
    expect(migrationFiles.length).toBeGreaterThanOrEqual(18);
    for (const file of migrationFiles) {
      expect(
        indexSource,
        `${file} is never read by openDatabase — editing it does nothing`
      ).toContain(file);
    }
  });

  it("applies the file-driven migrations to a fresh database", () => {
    const db = openDatabase(":memory:");
    const hostCols = (db.pragma("table_info(hosts)") as PragmaRow[]).map((c) => c.name);
    expect(hostCols).toEqual(
      expect.arrayContaining(["is_favorite", "sort_order", "color", "tmux_detect"])
    );
    const groupCols = (db.pragma("table_info(host_groups)") as PragmaRow[]).map((c) => c.name);
    expect(groupCols).toContain("sort_order");
    const tagCols = (db.pragma("table_info(tags)") as PragmaRow[]).map((c) => c.name);
    expect(tagCols).toContain("color");
    db.close();
  });

  it("reopens an already-migrated database without throwing", () => {
    const dir = mkdtempSync(join(tmpdir(), "hypershell-remigrate-"));
    const dbPath = join(dir, "test.db");
    try {
      openDatabase(dbPath).close();
      expect(() => openDatabase(dbPath).close()).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [x] **Step 2: Run and verify the tripwire fails**

Run: `pnpm --filter @hypershell/db test -- openDatabase`
Expected: "reads every migration file" FAILS on `004_favorites.sql` (first decorative file); the other two new tests pass (they describe current behavior).

- [x] **Step 3: Add the helpers and switch the four migrations to file reads** in `packages/db/src/index.ts`.

Add below `isIgnorableMigrationError`:

```ts
function readMigration(filename: string): string {
  return readFileSync(new URL(`./migrations/${filename}`, import.meta.url), "utf8");
}

/**
 * Run one migration statement-by-statement, tolerating "already exists" /
 * "duplicate column" from databases that ran a prior version. Comment lines
 * are stripped before splitting on `;` — a `;` inside a comment would
 * otherwise cut a statement in half and produce a syntax error, which is not
 * an ignorable duplicate.
 */
function execGuardedStatements(db: SqliteDatabase, sql: string): void {
  const statements = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const statement of statements) {
    try {
      db.exec(statement);
    } catch (error) {
      if (!isIgnorableMigrationError(error)) {
        throw error;
      }
    }
  }
}
```

Then, inside `openDatabase`:
1. Replace the Migration 004 inline block (`db.exec("ALTER TABLE hosts ADD COLUMN is_favorite ...")` + try/catch) with:
   `execGuardedStatements(db, readMigration("004_favorites.sql"));` (keep the `// Migration 004:` comment).
2. Replace the Migration 005 inline 3-statement loop with `execGuardedStatements(db, readMigration("005_host_enhancements.sql"));`.
3. Replace the "Migration 012b" inline `ALTER TABLE tags ADD COLUMN color TEXT` block with `execGuardedStatements(db, readMigration("013_tags_color.sql"));` and fix the comment to `// Migration 013: add color to tags (Task 2.10)`.
4. Replace the Migration 014 inline `ALTER TABLE hosts ADD COLUMN tmux_detect ...` block with `execGuardedStatements(db, readMigration("014_tmux_detect.sql"));`.
5. Collapse the now-duplicated guarded-loop idiom: the 003 block (both the lone `identity_file` ALTER and the file loop), 006, 011, 017, and 018 blocks all become `execGuardedStatements(db, ...)` calls (018's comment-stripping rationale comment moves onto the helper, where it now lives; keep each `// Migration NNN:` comment). The top-of-function `readFileSync` consts may be replaced by inline `readMigration("NNN_name.sql")` calls at their use sites — keep migrations 001, 002, 007, 008, 009, 010, 012, 015 as plain `db.exec(...)` (their DDL is `IF NOT EXISTS`-idempotent) and keep 016's conditional-recreate logic exactly as is, just sourcing its SQL via `readMigration`.

- [x] **Step 4: Run the db workspace tests**

Run: `pnpm --filter @hypershell/db test`
Expected: ALL PASS, including the three new tests and every existing repository test (the repositories are the real consumers of the migrated schema).

- [x] **Step 5: Commit**

```bash
git add packages/db/src/index.ts packages/db/src/openDatabase.test.ts
git commit -m "fix(db): read the four decorative migration files instead of inline DDL"
```

---

### Task 2: `HOST_OPTION_DEFAULTS` in shared + DDL agreement test

**Files:**
- Create: `packages/shared/src/hosts/hostOptions.ts`
- Modify: `packages/shared/src/index.ts` (add one export line)
- Test: `packages/db/src/repositories/hostsRepository.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_RECONNECT_MAX_ATTEMPTS`, `DEFAULT_RECONNECT_BASE_INTERVAL` from `../ipc/schemas`.
- Produces: `HOST_OPTION_DEFAULTS: { port: 22; authMethod: "default"; agentKind: "system"; isFavorite: false; autoReconnect: false; reconnectMaxAttempts: 5; reconnectBaseInterval: 1; tmuxDetect: false; shellIntegration: true }` exported from `@hypershell/shared`. Tasks 3–5 import it.

- [x] **Step 1: Write the failing DDL-agreement test** — append to `packages/db/src/repositories/hostsRepository.test.ts`:

```ts
import { HOST_OPTION_DEFAULTS } from "@hypershell/shared";

describe("host option defaults", () => {
  // Default site #1 is the SQL DDL. This pins it to the module that owns
  // the other five sites, so the six can no longer drift silently.
  it("hosts table DDL defaults agree with HOST_OPTION_DEFAULTS", () => {
    const db = openDatabase(":memory:");
    db.prepare(
      "INSERT INTO hosts (id, name, hostname) VALUES ('raw', 'raw', 'raw.example.com')"
    ).run();
    const repo = createHostsRepositoryFromDatabase(db);
    expect(repo.get("raw")).toMatchObject(HOST_OPTION_DEFAULTS);
    db.close();
  });
});
```

(Place the `import` with the existing imports at the top of the file, not inside the describe.)

- [x] **Step 2: Run and verify it fails**

Run: `pnpm --filter @hypershell/db test -- hostsRepository`
Expected: FAIL — `HOST_OPTION_DEFAULTS` is not exported from `@hypershell/shared`.

- [x] **Step 3: Create the module** — `packages/shared/src/hosts/hostOptions.ts`:

```ts
import {
  DEFAULT_RECONNECT_BASE_INTERVAL,
  DEFAULT_RECONNECT_MAX_ATTEMPTS
} from "../ipc/schemas";

/**
 * The single owner of every host option's default value. Keys are HostRecord
 * field names.
 *
 * The SQLite column defaults must agree with these values — enforced by the
 * "hosts table DDL defaults agree with HOST_OPTION_DEFAULTS" test in
 * packages/db/src/repositories/hostsRepository.test.ts. Every store and the
 * host form read defaults from here; do not write a host default anywhere else.
 */
export const HOST_OPTION_DEFAULTS = {
  port: 22,
  authMethod: "default",
  agentKind: "system",
  isFavorite: false,
  autoReconnect: false,
  reconnectMaxAttempts: DEFAULT_RECONNECT_MAX_ATTEMPTS,
  reconnectBaseInterval: DEFAULT_RECONNECT_BASE_INTERVAL,
  tmuxDetect: false,
  shellIntegration: true,
} as const;
```

Add to `packages/shared/src/index.ts` (after the `./auth/authSchemas` line):

```ts
export * from "./hosts/hostOptions";
```

- [x] **Step 4: Run shared + db tests**

Run: `pnpm --filter @hypershell/shared test && pnpm --filter @hypershell/db test`
Expected: ALL PASS, including the new agreement test.

- [x] **Step 5: Commit**

```bash
git add packages/shared/src/hosts/hostOptions.ts packages/shared/src/index.ts packages/db/src/repositories/hostsRepository.test.ts
git commit -m "feat(shared): HOST_OPTION_DEFAULTS owns every host option default"
```

---

### Task 3: One `normalizeHostInput`, used by both db adapters

**Files:**
- Modify: `packages/db/src/repositories/hostsRepository.ts`
- Test: `packages/db/src/repositories/hostsRepository.test.ts`

**Interfaces:**
- Consumes: `HOST_OPTION_DEFAULTS` from `@hypershell/shared`.
- Produces: `export function normalizeHostInput(input: HostInput): HostRecord` from `hostsRepository.ts` — flows through `repositories/index.ts` (`export *`) and `db/src/index.ts` to `@hypershell/db`. Task 4 imports it from `@hypershell/db`.

- [x] **Step 1: Write the failing tests** — append to `hostsRepository.test.ts` inside the `host option defaults` describe, and add `normalizeHostInput` to the import from `./hostsRepository`:

```ts
it("normalizeHostInput fills every option from HOST_OPTION_DEFAULTS", () => {
  expect(
    normalizeHostInput({ id: "n1", name: "n", hostname: "n.example.com" })
  ).toMatchObject(HOST_OPTION_DEFAULTS);
});

it("normalizeHostInput nulls the nullable fields and keeps explicit values", () => {
  const record = normalizeHostInput({
    id: "n2",
    name: "n",
    hostname: "n.example.com",
    notes: "hi",
    shellIntegration: false,
  });
  expect(record.username).toBeNull();
  expect(record.groupId).toBeNull();
  expect(record.sortOrder).toBeNull();
  expect(record.keepAliveInterval).toBeNull();
  expect(record.notes).toBe("hi");
  expect(record.shellIntegration).toBe(false);
});
```

- [x] **Step 2: Run and verify they fail**

Run: `pnpm --filter @hypershell/db test -- hostsRepository`
Expected: FAIL — `normalizeHostInput` is not exported.

- [x] **Step 3: Implement.** In `hostsRepository.ts`, add `HOST_OPTION_DEFAULTS` to the existing `@hypershell/shared` import, then add below the `HostRow` type:

```ts
/**
 * Apply every host-option default in one place. All three host stores — the
 * SQLite repository, the in-memory fallback below, and the JSON-file fallback
 * in apps/desktop hostsIpc.ts — normalize through this function, so each
 * default is written exactly once (in HOST_OPTION_DEFAULTS).
 */
export function normalizeHostInput(input: HostInput): HostRecord {
  return {
    id: input.id,
    name: input.name,
    hostname: input.hostname,
    port: input.port ?? HOST_OPTION_DEFAULTS.port,
    username: input.username ?? null,
    identityFile: input.identityFile ?? null,
    hostProfileId: input.hostProfileId ?? null,
    authProfileId: input.authProfileId ?? null,
    groupId: input.groupId ?? null,
    notes: input.notes ?? null,
    authMethod: input.authMethod ?? HOST_OPTION_DEFAULTS.authMethod,
    agentKind: input.agentKind ?? HOST_OPTION_DEFAULTS.agentKind,
    opReference: input.opReference ?? null,
    isFavorite: input.isFavorite ?? HOST_OPTION_DEFAULTS.isFavorite,
    sortOrder: input.sortOrder ?? null,
    color: input.color ?? null,
    proxyJump: input.proxyJump ?? null,
    proxyJumpHostIds: input.proxyJumpHostIds ?? null,
    keepAliveInterval: input.keepAliveInterval ?? null,
    autoReconnect: input.autoReconnect ?? HOST_OPTION_DEFAULTS.autoReconnect,
    reconnectMaxAttempts:
      input.reconnectMaxAttempts ?? HOST_OPTION_DEFAULTS.reconnectMaxAttempts,
    reconnectBaseInterval:
      input.reconnectBaseInterval ?? HOST_OPTION_DEFAULTS.reconnectBaseInterval,
    tmuxDetect: input.tmuxDetect ?? HOST_OPTION_DEFAULTS.tmuxDetect,
    shellIntegration: input.shellIntegration ?? HOST_OPTION_DEFAULTS.shellIntegration,
  };
}

/** SQLite stores booleans as 0/1; everything else binds as-is. */
function toRowParams(record: HostRecord) {
  return {
    ...record,
    isFavorite: record.isFavorite ? 1 : 0,
    autoReconnect: record.autoReconnect ? 1 : 0,
    tmuxDetect: record.tmuxDetect ? 1 : 0,
    shellIntegration: record.shellIntegration ? 1 : 0,
  };
}
```

Semantics note (verify while editing, all four boolean inputs are typed `boolean | undefined`): the old `input.x ? 1 : 0` truthiness, `?? false`, and `x === false ? false : true` idioms are all equivalent to `?? default` for that type — no behavior change.

Then:
1. SQLite `create` — replace the entire inline `const normalized = {...}` block and `insertHost.run(normalized)` with:
   ```ts
   insertHost.run(toRowParams(normalizeHostInput(input)));
   ```
2. In-memory `create` — replace the entire inline `const record: HostRecord = {...}` with:
   ```ts
   const record = normalizeHostInput(input);
   ```
3. `mapRow` — replace the literal defaults with module references: `row.auth_method ?? HOST_OPTION_DEFAULTS.authMethod`, `row.agent_kind ?? HOST_OPTION_DEFAULTS.agentKind`, `row.reconnect_max_attempts ?? HOST_OPTION_DEFAULTS.reconnectMaxAttempts`, `row.reconnect_base_interval ?? HOST_OPTION_DEFAULTS.reconnectBaseInterval`. If `DEFAULT_RECONNECT_MAX_ATTEMPTS`/`DEFAULT_RECONNECT_BASE_INTERVAL` are now unused in the file, drop them from the import.

- [x] **Step 4: Run db tests**

Run: `pnpm --filter @hypershell/db test`
Expected: ALL PASS — the pre-existing `defaults advanced SSH fields`, `defaults shell integration to enabled`, and `persists a shell integration opt-out` tests are the behavior lock on this refactor.

- [x] **Step 5: Commit**

```bash
git add packages/db/src/repositories/hostsRepository.ts packages/db/src/repositories/hostsRepository.test.ts
git commit -m "refactor(db): normalize host input once via normalizeHostInput"
```

---

### Task 4: JSON fallback and upsert handler stop re-deriving defaults

**Files:**
- Modify: `apps/desktop/src/main/ipc/hostsIpc.ts`
- Test (create): `apps/desktop/src/main/ipc/hostsIpc.fallback.test.ts`

**Interfaces:**
- Consumes: `normalizeHostInput` from `@hypershell/db`; `HOST_OPTION_DEFAULTS` from `@hypershell/shared`.
- Produces: `createFileBackedHostsRepo` gains an `export` keyword (needed by the test; no other API change).

- [x] **Step 1: Write the failing test** — create `apps/desktop/src/main/ipc/hostsIpc.fallback.test.ts` (electron mock idiom copied from `backupIpc.test.ts`; extend the mock's shape only if import-time errors demand it, e.g. a `safeStorage` stub for `../security/secureStorage`):

```ts
import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { HOST_OPTION_DEFAULTS } from "@hypershell/shared";

vi.mock("electron", () => ({
  app: { getPath: () => tmpdir() },
  safeStorage: { isEncryptionAvailable: () => false },
}));

import { createFileBackedHostsRepo } from "./hostsIpc";

function tempStorePath(): { dir: string; file: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "hypershell-hosts-fallback-"));
  return { dir, file: path.join(dir, "hosts.fallback.json") };
}

describe("createFileBackedHostsRepo", () => {
  it("hydrates a sparse stored host with HOST_OPTION_DEFAULTS", () => {
    const { dir, file } = tempStorePath();
    try {
      writeFileSync(
        file,
        JSON.stringify([{ id: "a", name: "a", hostname: "a.example.com" }]),
        "utf8"
      );
      const repo = createFileBackedHostsRepo(file);
      expect(repo.get("a")).toMatchObject(HOST_OPTION_DEFAULTS);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("creates with defaults and round-trips a shellIntegration opt-out", () => {
    const { dir, file } = tempStorePath();
    try {
      const repo = createFileBackedHostsRepo(file);
      expect(
        repo.create({ id: "b", name: "b", hostname: "b.example.com" })
      ).toMatchObject(HOST_OPTION_DEFAULTS);
      repo.create({
        id: "c",
        name: "c",
        hostname: "c.example.com",
        shellIntegration: false,
      });
      const reread = createFileBackedHostsRepo(file);
      expect(reread.get("c")?.shellIntegration).toBe(false);
      expect(reread.get("b")?.shellIntegration).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [x] **Step 2: Run and verify it fails**

Run: `pnpm --filter @hypershell/desktop test -- hostsIpc.fallback`
Expected: FAIL — `createFileBackedHostsRepo` is not exported.

- [x] **Step 3: Implement** in `hostsIpc.ts`:
1. Import `normalizeHostInput` alongside the existing `@hypershell/db` value import; add `HOST_OPTION_DEFAULTS` to the `@hypershell/shared` import and remove `DEFAULT_RECONNECT_BASE_INTERVAL` / `DEFAULT_RECONNECT_MAX_ATTEMPTS` from it (they become unused below).
2. `function createFileBackedHostsRepo` → `export function createFileBackedHostsRepo`.
3. In `readHosts`, replace the literal defaults in the item mapping (coercions stay — the JSON is untrusted): `port: Number(item?.port ?? HOST_OPTION_DEFAULTS.port)`, `authMethod: item?.authMethod == null ? HOST_OPTION_DEFAULTS.authMethod : String(item.authMethod)`, `agentKind: item?.agentKind == null ? HOST_OPTION_DEFAULTS.agentKind : String(item.agentKind)`, `isFavorite: Boolean(item?.isFavorite ?? HOST_OPTION_DEFAULTS.isFavorite)`, `autoReconnect: Boolean(item?.autoReconnect ?? HOST_OPTION_DEFAULTS.autoReconnect)`, `reconnectMaxAttempts: Number(item?.reconnectMaxAttempts ?? HOST_OPTION_DEFAULTS.reconnectMaxAttempts)`, `reconnectBaseInterval: Number(item?.reconnectBaseInterval ?? HOST_OPTION_DEFAULTS.reconnectBaseInterval)`, `tmuxDetect: Boolean(item?.tmuxDetect ?? HOST_OPTION_DEFAULTS.tmuxDetect)`, `shellIntegration: Boolean(item?.shellIntegration ?? HOST_OPTION_DEFAULTS.shellIntegration)` (that last one keeps the `=== false ? false : true` semantics: stored `false` stays false, missing means true).
4. In the fallback repo's `create`, replace the entire inline `const normalized: HostRecord = {...}` block with:
   ```ts
   const normalized = normalizeHostInput(input);
   ```
5. In the `hosts.upsert` handler: keep `const requestedAuthMethod = parsed.authMethod ?? HOST_OPTION_DEFAULTS.authMethod` (the password branch needs the resolved value), and in the `repo.create({...})` call drop every re-derived default — pass `agentKind: parsed.agentKind`, `isFavorite: parsed.isFavorite`, `autoReconnect: parsed.autoReconnect`, `reconnectMaxAttempts: parsed.reconnectMaxAttempts`, `reconnectBaseInterval: parsed.reconnectBaseInterval`, `tmuxDetect: parsed.tmuxDetect` (the `?? null` passthroughs on nullable fields may also drop to bare `parsed.x` — `repo.create` normalizes; `authProfileId: nextAuthProfileId`, `authMethod: requestedAuthMethod`, and `shellIntegration: parsed.shellIntegration` stay as they are).

- [x] **Step 4: Run desktop tests and build**

Run: `pnpm --filter @hypershell/desktop test && pnpm --filter @hypershell/desktop build`
Expected: ALL PASS; build clean (tsc is the drift check for the import changes).

- [x] **Step 5: Commit**

```bash
git add apps/desktop/src/main/ipc/hostsIpc.ts apps/desktop/src/main/ipc/hostsIpc.fallback.test.ts
git commit -m "refactor(desktop): hosts JSON fallback and upsert use shared host defaults"
```

---

### Task 5: HostForm defaults + doc fixes (NO COMMIT — files are dirty with item 2–4 work)

**Files:**
- Modify: `apps/ui/src/features/hosts/HostForm.tsx` (dirty — edit, do not commit)
- Modify: `CLAUDE.md` repo root (dirty — edit, do not commit)

**Interfaces:**
- Consumes: `HOST_OPTION_DEFAULTS` from `@hypershell/shared`.
- Produces: nothing new.

- [x] **Step 1: Swap the form's literal defaults.** In `HostForm.tsx`, add `HOST_OPTION_DEFAULTS` to the `@hypershell/shared` import. In the empty-form-state constant (~lines 115–128) replace: `autoReconnect: false` → `autoReconnect: HOST_OPTION_DEFAULTS.autoReconnect`, `reconnectMaxAttempts: DEFAULT_RECONNECT_MAX_ATTEMPTS` → `HOST_OPTION_DEFAULTS.reconnectMaxAttempts`, `reconnectBaseInterval: DEFAULT_RECONNECT_BASE_INTERVAL` → `HOST_OPTION_DEFAULTS.reconnectBaseInterval`, `tmuxDetect: false` → `HOST_OPTION_DEFAULTS.tmuxDetect`, `shellIntegration: true` → `HOST_OPTION_DEFAULTS.shellIntegration`. If the constant carries a port default matching `22` (string or number), source it from `HOST_OPTION_DEFAULTS.port` (`String(HOST_OPTION_DEFAULTS.port)` if the field is a text input). Replace the two `Number(e.target.value) || DEFAULT_RECONNECT_*` onChange fallbacks (~lines 1082, 1094) with `HOST_OPTION_DEFAULTS.reconnectMaxAttempts` / `.reconnectBaseInterval`. Remove `DEFAULT_RECONNECT_MAX_ATTEMPTS` / `DEFAULT_RECONNECT_BASE_INTERVAL` from the import if now unused in the file. Touch nothing else in this file — it carries uncommitted renderer-seam work.

- [x] **Step 2: Fix the migration count in CLAUDE.md.** Line 47: `migrations (001-016)` → `migrations (001-018)`. Line 147: `16 migrations` → `18 migrations`. Touch nothing else.

- [x] **Step 3: Run ui tests + lint**

Run: `pnpm --filter @hypershell/ui test && pnpm --filter @hypershell/ui lint`
Expected: ALL PASS (no HostForm unit test exists; tsc-via-vitest and ESLint are the check here).

- [x] **Step 4: Do NOT commit.** `HostForm.tsx` and `CLAUDE.md` already carry uncommitted item 2–4 changes; these edits ride with them until Tomer commits that work. State this in the final report.

---

### Final verification (after all tasks)

- [x] `pnpm --filter @hypershell/shared test`
- [x] `pnpm --filter @hypershell/db test`
- [x] `pnpm --filter @hypershell/desktop test`
- [x] `pnpm --filter @hypershell/ui test`
- [x] `pnpm lint`
- [x] `git status --porcelain` — confirm no `packages/db`, `packages/shared` (other than intended), or `hostsIpc.ts` files remain unstaged-modified, and that no dirty item-2–4 file was committed: `git show --stat HEAD~3..HEAD` must list only files this plan names.
