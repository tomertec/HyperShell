# Testing

## Frameworks

| Type | Framework | Config |
|------|-----------|--------|
| Unit tests | Vitest 3.1 | `vitest.config.ts` (workspace mode) |
| Browser E2E | Playwright 1.54 | `apps/ui/playwright.config.ts` |
| Electron E2E | Playwright 1.54 | `apps/desktop/playwright.electron.config.ts` |

The two E2E suites cover different layers and neither replaces the other. The
browser suite drives the renderer in Chromium against the Vite dev server — it
is fast, but `window.hypershell` is not there, so it cannot observe the preload
bridge, IPC schema enforcement, native modules, renderer/Node isolation, the
on-disk database, or extra windows. The Electron suite boots the real shell and
covers exactly those.

## Running Tests

```bash
# All unit tests
pnpm test

# Single workspace — only these two have their own vitest.config.ts
pnpm --filter @hypershell/ui test
pnpm --filter @hypershell/desktop test

# session-core, shared and db have a `test` script but NO vitest.config.ts, so
# `pnpm --filter <pkg> test` resolves the ROOT config, whose
# projects: ["apps/*", "packages/*"] globs match nothing from inside the
# package — it fails with "No projects were found". Run them by project from
# the repo root instead:
npx vitest run --project @hypershell/session-core
npx vitest run --project @hypershell/shared
npx vitest run --project @hypershell/db

# Watch mode
pnpm --filter @hypershell/ui test -- --watch

# Single test file
pnpm --filter @hypershell/ui test -- src/features/layout/layoutStore.test.ts

# Browser E2E (headless)
pnpm --filter @hypershell/ui test:e2e

# Browser E2E (headed — shows browser)
pnpm --filter @hypershell/ui test:e2e:headed

# Electron E2E — needs the bundled renderer and Electron-ABI native modules
pnpm --filter @hypershell/desktop run build:bundle
pnpm --filter @hypershell/desktop rebuild:native
pnpm --filter @hypershell/desktop test:e2e

# CI commands
pnpm ci:test                 # Unit tests
pnpm ci:test:e2e             # Browser E2E with server auto-start
pnpm ci:test:e2e:electron    # Electron E2E (build + rebuild:native first)
```

> `rebuild:native` builds `better-sqlite3` against Electron's ABI, which is what
> the Electron suite needs and what breaks `pnpm test` afterwards. Run
> `pnpm rebuild:sqlite` to switch the module back to the Node ABI for Vitest.

## Test File Convention

Test files live **next to their source** as `*.test.ts` or `*.test.tsx`:

```
features/layout/
  ├── layoutStore.ts
  ├── layoutStore.test.ts    ← unit test
  ├── Workspace.tsx
  └── TabBar.tsx
```

## React Component Tests (`apps/ui` only)

`.test.tsx` files can mount real components with React Testing Library:

| Piece | Where |
|-------|-------|
| `@testing-library/react` 16, `@testing-library/user-event` 14, `jsdom` 30 | `apps/ui` devDependencies |
| `environment: "jsdom"` + `@vitejs/plugin-react` | `apps/ui/vitest.config.ts` |
| RTL cleanup between tests | `apps/ui/vitest.setup.ts` |
| Canary that the toolchain still works | `apps/ui/src/testToolchain.smoke.test.tsx` |

**Do not add `afterEach(cleanup)` to individual test files.** This project does not enable
`test.globals`, so RTL cannot auto-register its cleanup — `vitest.setup.ts` registers it centrally
instead. Without that, any `.test.tsx` with more than one test case leaks the previous test's DOM
and queries fail with "found multiple elements".

The jsdom environment applies to the **whole** `apps/ui` workspace, including plain `.test.ts`
files. A test needing real Node semantics opts out per-file:

```typescript
// @vitest-environment node
```

Component tests are for logic that only exists once rendered — which control a state produces, or
that a stale async response cannot write state. Prefer extracting a pure function and testing that
in a `.test.ts` where the behaviour allows it; `transferRowControls.ts` and `requestGuard.ts` are
the pattern.

## Key Test Files

### UI (`apps/ui/`)
- `layoutStore.test.ts` — Tab/pane layout operations
- `broadcastStore.test.ts` — Broadcast mode state
- `sessionRecoveryStore.test.ts` — Session recovery logic
- `searchIndex.test.ts` — Quick Connect fuzzy search
- `useFileKeyboard.test.ts` — SFTP keyboard navigation
- `fileUtils.test.ts` — File sorting, size formatting, path utilities
- `transferRowControls.test.ts` — Which controls a transfer row shows; the single source of truth
  both transfer monitors consume, so they cannot disagree
- `requestGuard.test.ts` — Monotonic request tokens used to discard superseded directory listings
- `LocalPane.staleResponse.test.tsx` — A stale out-of-root redirect cannot write state after a
  newer navigation
- `EditorApp.test.tsx` — Failed reads open read-only, Save As refuses an existing destination,
  a missing preload method is not reported as a successful save

### Desktop (`apps/desktop/`)
- `main.lifecycle.test.ts` — App bootstrap/cleanup lifecycle
- `registerIpc.test.ts` — IPC handler registration
- `transferManager.test.ts` — SFTP transfer queue

### Session Core (`packages/session-core/`)
- `syncEngine.test.ts` — SFTP bidirectional sync, streaming downloads, per-file failure isolation
- `sftpTransport.atomicWrite.test.ts` — The rename fallback chain and `writeFile`'s temp-and-rename
  path, including symlink resolution and the unwritable-directory error
- `parseSshConfig.test.ts` — SSH config parser
- `portForwarding.test.ts` — Port forward profile management

### Database (`packages/db/`)
- `hostsRepository.test.ts` — Host CRUD operations
- `serialProfilesRepository.test.ts` — Serial profile CRUD
- `sftpBookmarksRepository.test.ts` — Bookmark operations
- `workspaceRepository.test.ts` — Workspace save/load

## Browser E2E Tests

Playwright tests are in `apps/ui/tests/`. They run against headless Chromium with:
- 30-second timeout per test
- Auto-starts Vite dev server on `127.0.0.1:5173`
- Configured in `playwright.config.ts`

`accessibility.spec.ts` runs axe (`@axe-core/playwright`) over the welcome view
and the shared `Modal`, and asserts the behaviours axe cannot detect on its own:
dialog role and label, a named close button, named settings switches, Tab focus
trapped inside the dialog, and focus restored to the trigger on close. The
`color-contrast` rule is disabled — palette work is tracked separately from this
structural contract.

## Electron E2E Tests

Playwright tests are in `apps/desktop/tests/`, configured by
`playwright.electron.config.ts`. They launch the real Electron binary against
`dist/main/main.js` and cover the layers the browser suite structurally cannot:

| Spec | Covers |
|------|--------|
| `startup.spec.ts` | Window creation, preload bridge presence, renderer/Node isolation, IPC schema rejection, native-module load, data-dir isolation |
| `settings-persistence.spec.ts` | Settings written in one process are readable after a full restart |
| `hosts-crud.spec.ts` | Host create/update/remove through the real repository, survival across restart, schema rejection |
| `backup-restore.spec.ts` | Backup creation and round-trip restore; rejection of non-SQLite content, wrong extension, and missing files |
| `editor-window.spec.ts` | Editor `BrowserWindow` creation and per-session reuse |
| `session-lifecycle.spec.ts` | Full session lifecycle — open, connected, write, data back, close — against a local TCP echo server via the raw telnet transport |

**Isolation.** Each test gets a fresh temp directory passed as
`HYPERSHELL_DATA_DIR`; `apps/desktop/src/main/appDataDir.ts` redirects Electron's
`appData` and `userData` roots to it. This is required, not merely tidy: the
database lives at `appData/HyperShell/hypershell.db`, which Electron's
`--user-data-dir` switch does not move, so without the override a test run would
open and mutate real host records.

**Mocking.** Nothing inside the app is stubbed. The session spec uses the raw
telnet transport because it is a plain socket passthrough with no external
binary and no negotiation — the SSH transport shells out to the system `ssh`
and serial needs hardware, so neither yields a deterministic lifecycle.

## Writing a New Test

```typescript
// src/features/myFeature/myStore.test.ts
import { describe, it, expect } from "vitest";
import { createStore } from "./myStore";

describe("myStore", () => {
  it("does the thing", () => {
    const store = createStore();
    store.getState().doThing();
    expect(store.getState().result).toBe("expected");
  });
});
```

## CI Pipeline

The PR gates workflow (`.github/workflows/pr-gates.yml`) runs on every pull request:
1. Checkout + pnpm install
2. Build all workspaces
3. Run all unit tests
4. Run browser Playwright E2E tests
5. `electron-e2e` (windows-latest): build the desktop bundle, rebuild native
   modules for Electron, run the Electron E2E suite
5. Both Ubuntu and Windows runners

All checks must pass before merge.
