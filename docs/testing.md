# Testing

## Frameworks

| Type | Framework | Config |
|------|-----------|--------|
| Unit tests | Vitest 3.1 | `vitest.config.ts` (workspace mode) |
| E2E tests | Playwright 1.54 | `apps/ui/playwright.config.ts` |

## Running Tests

```bash
# All unit tests
pnpm test

# Single workspace
pnpm --filter @sshterm/ui test
pnpm --filter @sshterm/desktop test
pnpm --filter @sshterm/session-core test
pnpm --filter @sshterm/db test

# Watch mode
pnpm --filter @sshterm/ui test -- --watch

# Single test file
pnpm --filter @sshterm/ui test -- src/features/layout/layoutStore.test.ts

# E2E (headless)
pnpm --filter @sshterm/ui test:e2e

# E2E (headed — shows browser)
pnpm --filter @sshterm/ui test:e2e:headed

# CI commands
pnpm ci:test        # Unit tests
pnpm ci:test:e2e    # E2E with server auto-start
```

## Test File Convention

Test files live **next to their source** as `*.test.ts` or `*.test.tsx`:

```
features/layout/
  ├── layoutStore.ts
  ├── layoutStore.test.ts    ← unit test
  ├── Workspace.tsx
  └── TabBar.tsx
```

## Key Test Files

### UI (`apps/ui/`)
- `layoutStore.test.ts` — Tab/pane layout operations
- `broadcastStore.test.ts` — Broadcast mode state
- `sessionRecoveryStore.test.ts` — Session recovery logic
- `searchIndex.test.ts` — Quick Connect fuzzy search
- `useFileKeyboard.test.ts` — SFTP keyboard navigation
- `fileUtils.test.ts` — File sorting, size formatting, path utilities

### Desktop (`apps/desktop/`)
- `main.lifecycle.test.ts` — App bootstrap/cleanup lifecycle
- `registerIpc.test.ts` — IPC handler registration
- `transferManager.test.ts` — SFTP transfer queue

### Session Core (`packages/session-core/`)
- `syncEngine.test.ts` — SFTP bidirectional sync
- `parseSshConfig.test.ts` — SSH config parser
- `portForwarding.test.ts` — Port forward profile management

### Database (`packages/db/`)
- `hostsRepository.test.ts` — Host CRUD operations
- `serialProfilesRepository.test.ts` — Serial profile CRUD
- `sftpBookmarksRepository.test.ts` — Bookmark operations
- `workspaceRepository.test.ts` — Workspace save/load

## E2E Tests

Playwright tests are in `apps/ui/tests/`. They run against headless Chromium with:
- 30-second timeout per test
- Auto-starts Vite dev server on `127.0.0.1:5173`
- Configured in `playwright.config.ts`

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
4. Run Playwright E2E tests
5. Both Ubuntu and Windows runners

All checks must pass before merge.
