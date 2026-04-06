# SSH Terminal App Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Windows-first Electron desktop app with React, xterm.js, node-pty, system OpenSSH, and serialport for SSH and serial terminal workflows.

**Architecture:** Use a pnpm workspace with Electron main and preload in `apps/desktop`, the React workbench in `apps/ui`, shared contracts in `packages/shared`, persistent storage in `packages/db`, and transport/session orchestration in `packages/session-core`. Keep SSH and serial transport state out of the renderer and expose only typed IPC boundaries.

**Tech Stack:** Electron, React, TypeScript, Vite, xterm.js, node-pty, serialport, better-sqlite3, zod, zustand, Fuse.js, Vitest, Playwright

---

### Task 1: Scaffold the workspace and developer toolchain

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `vitest.workspace.ts`
- Create: `apps/desktop/package.json`
- Create: `apps/ui/package.json`
- Create: `packages/shared/package.json`
- Create: `packages/session-core/package.json`
- Create: `packages/db/package.json`
- Test: `packages/shared/src/smoke/workspace-smoke.test.ts`

**Step 1: Write the failing test**

Create `packages/shared/src/smoke/workspace-smoke.test.ts`:

```ts
import { describe, expect, it } from "vitest";

describe("workspace smoke", () => {
  it("loads shared package code", async () => {
    const mod = await import("../version");
    expect(mod.WORKSPACE_NAME).toBe("sshterm");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @sshterm/shared exec vitest run src/smoke/workspace-smoke.test.ts`
Expected: FAIL because the workspace files and `src/version.ts` do not exist yet

**Step 3: Write minimal implementation**

Create the root workspace files and package manifests, then add:

- `packages/shared/src/version.ts`

```ts
export const WORKSPACE_NAME = "sshterm";
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @sshterm/shared exec vitest run src/smoke/workspace-smoke.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json vitest.workspace.ts apps/desktop/package.json apps/ui/package.json packages/shared/package.json packages/session-core/package.json packages/db/package.json packages/shared/src/version.ts packages/shared/src/smoke/workspace-smoke.test.ts
git commit -m "chore: scaffold workspace"
```

### Task 2: Create shared schemas and IPC contracts

**Files:**
- Create: `packages/shared/src/ipc/channels.ts`
- Create: `packages/shared/src/ipc/schemas.ts`
- Create: `packages/shared/src/ipc/contracts.ts`
- Test: `packages/shared/src/ipc/schemas.test.ts`

**Step 1: Write the failing test**

Create `packages/shared/src/ipc/schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { openSessionRequestSchema } from "./schemas";

describe("openSessionRequestSchema", () => {
  it("accepts ssh requests", () => {
    const result = openSessionRequestSchema.parse({
      transport: "ssh",
      profileId: "host-1",
      cols: 120,
      rows: 40
    });

    expect(result.transport).toBe("ssh");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @sshterm/shared exec vitest run src/ipc/schemas.test.ts`
Expected: FAIL because the IPC schema module does not exist yet

**Step 3: Write minimal implementation**

Create:

- `packages/shared/src/ipc/channels.ts`
- `packages/shared/src/ipc/schemas.ts`
- `packages/shared/src/ipc/contracts.ts`

Include:

- channel constants for session, host, settings, and tray events
- zod schemas for `openSession`, `resizeSession`, `writeSession`, `closeSession`
- exported TypeScript types inferred from the schemas

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @sshterm/shared exec vitest run src/ipc/schemas.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/shared/src/ipc/channels.ts packages/shared/src/ipc/schemas.ts packages/shared/src/ipc/contracts.ts packages/shared/src/ipc/schemas.test.ts
git commit -m "feat: add shared ipc contracts"
```

### Task 3: Build the Electron shell and preload bridge

**Files:**
- Create: `apps/desktop/src/main/main.ts`
- Create: `apps/desktop/src/main/windows/createMainWindow.ts`
- Create: `apps/desktop/src/preload/index.ts`
- Create: `apps/desktop/src/main/ipc/registerIpc.ts`
- Test: `apps/desktop/src/main/ipc/registerIpc.test.ts`

**Step 1: Write the failing test**

Create `apps/desktop/src/main/ipc/registerIpc.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getRegisteredChannels } from "./registerIpc";

describe("registerIpc", () => {
  it("registers the session open channel", () => {
    expect(getRegisteredChannels()).toContain("session:open");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @sshterm/desktop exec vitest run src/main/ipc/registerIpc.test.ts`
Expected: FAIL because the Electron shell and IPC registry do not exist yet

**Step 3: Write minimal implementation**

Create:

- Electron app bootstrap in `main.ts`
- a `createMainWindow()` helper
- a preload bridge exposing a typed `window.sshterm` API
- `registerIpc.ts` that exports both the real registration function and a `getRegisteredChannels()` helper for tests

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @sshterm/desktop exec vitest run src/main/ipc/registerIpc.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/desktop/src/main/main.ts apps/desktop/src/main/windows/createMainWindow.ts apps/desktop/src/preload/index.ts apps/desktop/src/main/ipc/registerIpc.ts apps/desktop/src/main/ipc/registerIpc.test.ts
git commit -m "feat: add electron shell and preload bridge"
```

### Task 4: Add the React workbench shell and layout state

**Files:**
- Create: `apps/ui/src/main.tsx`
- Create: `apps/ui/src/app/App.tsx`
- Create: `apps/ui/src/features/layout/Workbench.tsx`
- Create: `apps/ui/src/features/layout/layoutStore.ts`
- Test: `apps/ui/src/features/layout/layoutStore.test.ts`

**Step 1: Write the failing test**

Create `apps/ui/src/features/layout/layoutStore.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createLayoutStore } from "./layoutStore";

describe("layoutStore", () => {
  it("opens a tab for a new session", () => {
    const store = createLayoutStore();
    store.getState().openTab({ sessionId: "s1", title: "server-1" });
    expect(store.getState().tabs).toHaveLength(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @sshterm/ui exec vitest run src/features/layout/layoutStore.test.ts`
Expected: FAIL because the layout store does not exist yet

**Step 3: Write minimal implementation**

Create the React app shell with:

- `App.tsx` rendering the main workbench
- `Workbench.tsx` with placeholder panes
- `layoutStore.ts` using zustand to manage tabs, splits, and active session IDs

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @sshterm/ui exec vitest run src/features/layout/layoutStore.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/ui/src/main.tsx apps/ui/src/app/App.tsx apps/ui/src/features/layout/Workbench.tsx apps/ui/src/features/layout/layoutStore.ts apps/ui/src/features/layout/layoutStore.test.ts
git commit -m "feat: add workbench shell"
```

### Task 5: Implement the SQLite schema and repositories

**Files:**
- Create: `packages/db/src/index.ts`
- Create: `packages/db/src/migrations/001_init.sql`
- Create: `packages/db/src/repositories/hostsRepository.ts`
- Create: `packages/db/src/repositories/serialProfilesRepository.ts`
- Test: `packages/db/src/repositories/hostsRepository.test.ts`

**Step 1: Write the failing test**

Create `packages/db/src/repositories/hostsRepository.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createHostsRepository } from "./hostsRepository";

describe("hostsRepository", () => {
  it("creates and lists hosts", () => {
    const repo = createHostsRepository(":memory:");
    repo.create({
      id: "host-1",
      name: "web-01",
      hostname: "web-01.example.com",
      port: 22
    });

    expect(repo.list()).toHaveLength(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @sshterm/db exec vitest run src/repositories/hostsRepository.test.ts`
Expected: FAIL because the DB package and migrations do not exist yet

**Step 3: Write minimal implementation**

Create:

- SQLite bootstrap code
- initial schema covering hosts, groups, tags, auth profiles, serial profiles, sessions, settings
- repositories for hosts and serial profiles first

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @sshterm/db exec vitest run src/repositories/hostsRepository.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/db/src/index.ts packages/db/src/migrations/001_init.sql packages/db/src/repositories/hostsRepository.ts packages/db/src/repositories/serialProfilesRepository.ts packages/db/src/repositories/hostsRepository.test.ts
git commit -m "feat: add sqlite persistence"
```

### Task 6: Add secure storage and auth profile resolution

**Files:**
- Create: `apps/desktop/src/main/security/secureStorage.ts`
- Create: `apps/desktop/src/main/security/opResolver.ts`
- Create: `packages/shared/src/auth/authSchemas.ts`
- Test: `apps/desktop/src/main/security/secureStorage.test.ts`
- Test: `apps/desktop/src/main/security/opResolver.test.ts`

**Step 1: Write the failing tests**

Create `apps/desktop/src/main/security/secureStorage.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { roundTripSecret } from "./secureStorage";

describe("secureStorage", () => {
  it("round-trips a secret payload", () => {
    expect(roundTripSecret("s3cr3t")).toBe("s3cr3t");
  });
});
```

Create `apps/desktop/src/main/security/opResolver.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isOnePasswordReference } from "./opResolver";

describe("opResolver", () => {
  it("detects op references", () => {
    expect(isOnePasswordReference("op://vault/item/field")).toBe(true);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @sshterm/desktop exec vitest run src/main/security/secureStorage.test.ts src/main/security/opResolver.test.ts`
Expected: FAIL because the security helpers do not exist yet

**Step 3: Write minimal implementation**

Create:

- secure storage wrapper over Electron `safeStorage`
- `op://` detection and command execution wrapper for later `op` CLI resolution
- auth schemas for password, keyfile, agent, and `op://`-backed auth profiles

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter @sshterm/desktop exec vitest run src/main/security/secureStorage.test.ts src/main/security/opResolver.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/desktop/src/main/security/secureStorage.ts apps/desktop/src/main/security/opResolver.ts packages/shared/src/auth/authSchemas.ts apps/desktop/src/main/security/secureStorage.test.ts apps/desktop/src/main/security/opResolver.test.ts
git commit -m "feat: add secure auth helpers"
```

### Task 7: Implement session-core and SSH PTY transport

**Files:**
- Create: `packages/session-core/src/sessionManager.ts`
- Create: `packages/session-core/src/transports/sshPtyTransport.ts`
- Create: `packages/session-core/src/transports/transportEvents.ts`
- Test: `packages/session-core/src/sessionManager.test.ts`
- Test: `packages/session-core/src/transports/sshPtyTransport.test.ts`

**Step 1: Write the failing tests**

Create `packages/session-core/src/sessionManager.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createSessionManager } from "./sessionManager";

describe("sessionManager", () => {
  it("tracks a connecting ssh session", () => {
    const manager = createSessionManager();
    manager.open({
      sessionId: "s1",
      transport: "ssh",
      profileId: "host-1",
      cols: 120,
      rows: 40
    });

    expect(manager.getSession("s1")?.state).toBe("connecting");
  });
});
```

Create `packages/session-core/src/transports/sshPtyTransport.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildSshArgs } from "./sshPtyTransport";

describe("buildSshArgs", () => {
  it("builds basic ssh arguments", () => {
    expect(buildSshArgs({
      hostname: "web-01.example.com",
      username: "admin",
      port: 22
    })).toContain("admin@web-01.example.com");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @sshterm/session-core exec vitest run src/sessionManager.test.ts src/transports/sshPtyTransport.test.ts`
Expected: FAIL because session-core does not exist yet

**Step 3: Write minimal implementation**

Create:

- a `SessionManager` with normalized lifecycle states
- a transport event model
- an SSH PTY transport that builds OpenSSH arguments and supervises a `node-pty` child process

Keep the first version limited to:

- open
- write
- resize
- close
- basic exit and error handling

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter @sshterm/session-core exec vitest run src/sessionManager.test.ts src/transports/sshPtyTransport.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/session-core/src/sessionManager.ts packages/session-core/src/transports/sshPtyTransport.ts packages/session-core/src/transports/transportEvents.ts packages/session-core/src/sessionManager.test.ts packages/session-core/src/transports/sshPtyTransport.test.ts
git commit -m "feat: add ssh session core"
```

### Task 8: Render xterm.js sessions in the React workbench

**Files:**
- Create: `apps/ui/src/features/terminal/TerminalPane.tsx`
- Create: `apps/ui/src/features/terminal/useTerminalSession.ts`
- Create: `apps/ui/src/features/terminal/terminalTheme.ts`
- Test: `apps/ui/src/features/terminal/terminalTheme.test.ts`

**Step 1: Write the failing test**

Create `apps/ui/src/features/terminal/terminalTheme.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { defaultTerminalTheme } from "./terminalTheme";

describe("defaultTerminalTheme", () => {
  it("defines background and foreground colors", () => {
    expect(defaultTerminalTheme.background).toBeTruthy();
    expect(defaultTerminalTheme.foreground).toBeTruthy();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @sshterm/ui exec vitest run src/features/terminal/terminalTheme.test.ts`
Expected: FAIL because terminal UI files do not exist yet

**Step 3: Write minimal implementation**

Create:

- a `TerminalPane` component that mounts xterm.js
- a session hook that subscribes to the preload bridge
- a theme module with a Fluent-inspired terminal palette

Wire one hard-coded session tab first, then replace it with real session IDs once IPC integration is complete.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @sshterm/ui exec vitest run src/features/terminal/terminalTheme.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/ui/src/features/terminal/TerminalPane.tsx apps/ui/src/features/terminal/useTerminalSession.ts apps/ui/src/features/terminal/terminalTheme.ts apps/ui/src/features/terminal/terminalTheme.test.ts
git commit -m "feat: add terminal renderer"
```

### Task 9: Wire end-to-end SSH session opening through IPC

**Files:**
- Modify: `apps/desktop/src/main/ipc/registerIpc.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/ui/src/features/layout/layoutStore.ts`
- Modify: `apps/ui/src/features/terminal/useTerminalSession.ts`
- Test: `apps/desktop/src/main/ipc/openSession.integration.test.ts`

**Step 1: Write the failing test**

Create `apps/desktop/src/main/ipc/openSession.integration.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { openSessionForTest } from "./registerIpc";

describe("openSession integration", () => {
  it("returns a session id for ssh requests", async () => {
    const session = await openSessionForTest({
      transport: "ssh",
      profileId: "host-1",
      cols: 120,
      rows: 40
    });

    expect(session.sessionId).toBeTruthy();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @sshterm/desktop exec vitest run src/main/ipc/openSession.integration.test.ts`
Expected: FAIL because the session IPC path is not connected yet

**Step 3: Write minimal implementation**

Connect:

- IPC request validation
- session manager open calls
- preload APIs for session events
- UI store actions for opening a new SSH tab on success

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @sshterm/desktop exec vitest run src/main/ipc/openSession.integration.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/desktop/src/main/ipc/registerIpc.ts apps/desktop/src/preload/index.ts apps/ui/src/features/layout/layoutStore.ts apps/ui/src/features/terminal/useTerminalSession.ts apps/desktop/src/main/ipc/openSession.integration.test.ts
git commit -m "feat: wire ssh sessions through ipc"
```

### Task 10: Add serial transport and serial profile support

**Files:**
- Create: `packages/session-core/src/transports/serialTransport.ts`
- Modify: `packages/session-core/src/sessionManager.ts`
- Create: `apps/ui/src/features/serial/SerialProfileForm.tsx`
- Test: `packages/session-core/src/transports/serialTransport.test.ts`

**Step 1: Write the failing test**

Create `packages/session-core/src/transports/serialTransport.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeSerialOptions } from "./serialTransport";

describe("normalizeSerialOptions", () => {
  it("defaults to 9600 baud when omitted", () => {
    expect(normalizeSerialOptions({ path: "COM3" }).baudRate).toBe(9600);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @sshterm/session-core exec vitest run src/transports/serialTransport.test.ts`
Expected: FAIL because serial transport support does not exist yet

**Step 3: Write minimal implementation**

Create:

- serial transport wrapper around `serialport`
- session manager branching for serial sessions
- serial profile form and saved configuration handling

Include:

- baud rate
- data bits
- stop bits
- parity
- flow control
- local echo flag

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @sshterm/session-core exec vitest run src/transports/serialTransport.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/session-core/src/transports/serialTransport.ts packages/session-core/src/sessionManager.ts apps/ui/src/features/serial/SerialProfileForm.tsx packages/session-core/src/transports/serialTransport.test.ts
git commit -m "feat: add serial sessions"
```

### Task 11: Implement host management and Quick Connect

**Files:**
- Create: `apps/ui/src/features/hosts/HostsView.tsx`
- Create: `apps/ui/src/features/hosts/HostForm.tsx`
- Create: `apps/ui/src/features/quick-connect/QuickConnectDialog.tsx`
- Create: `apps/ui/src/features/quick-connect/searchIndex.ts`
- Test: `apps/ui/src/features/quick-connect/searchIndex.test.ts`

**Step 1: Write the failing test**

Create `apps/ui/src/features/quick-connect/searchIndex.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { searchProfiles } from "./searchIndex";

describe("searchProfiles", () => {
  it("finds hosts by fuzzy name", () => {
    const results = searchProfiles(
      [{ id: "h1", label: "db-prod", keywords: ["database", "prod"] }],
      "dbp"
    );

    expect(results[0]?.id).toBe("h1");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @sshterm/ui exec vitest run src/features/quick-connect/searchIndex.test.ts`
Expected: FAIL because host management and quick connect files do not exist yet

**Step 3: Write minimal implementation**

Create:

- host list and edit forms
- serial profile list integration
- Fuse.js-based quick connect dialog bound to `Ctrl+K`
- action handlers that open SSH or serial sessions from search results

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @sshterm/ui exec vitest run src/features/quick-connect/searchIndex.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/ui/src/features/hosts/HostsView.tsx apps/ui/src/features/hosts/HostForm.tsx apps/ui/src/features/quick-connect/QuickConnectDialog.tsx apps/ui/src/features/quick-connect/searchIndex.ts apps/ui/src/features/quick-connect/searchIndex.test.ts
git commit -m "feat: add host management and quick connect"
```

### Task 12: Add session restore, broadcast mode, and tray controls

**Files:**
- Create: `apps/ui/src/features/sessions/sessionRecoveryStore.ts`
- Create: `apps/ui/src/features/broadcast/broadcastStore.ts`
- Create: `apps/desktop/src/main/tray/createTray.ts`
- Test: `apps/ui/src/features/broadcast/broadcastStore.test.ts`
- Test: `apps/ui/src/features/sessions/sessionRecoveryStore.test.ts`

**Step 1: Write the failing tests**

Create `apps/ui/src/features/broadcast/broadcastStore.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createBroadcastStore } from "./broadcastStore";

describe("broadcastStore", () => {
  it("only sends input when broadcast is enabled", () => {
    const store = createBroadcastStore();
    expect(store.getState().enabled).toBe(false);
  });
});
```

Create `apps/ui/src/features/sessions/sessionRecoveryStore.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createSessionRecoveryStore } from "./sessionRecoveryStore";

describe("sessionRecoveryStore", () => {
  it("persists a recoverable session list", () => {
    const store = createSessionRecoveryStore();
    store.getState().remember("s1");
    expect(store.getState().recoverableSessionIds).toContain("s1");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @sshterm/ui exec vitest run src/features/broadcast/broadcastStore.test.ts src/features/sessions/sessionRecoveryStore.test.ts`
Expected: FAIL because the stores and tray integration do not exist yet

**Step 3: Write minimal implementation**

Create:

- session recovery metadata store
- broadcast mode store with explicit enable and target selection
- tray bootstrap with quick actions for show, hide, and quick connect

Add a persistent in-app warning banner when broadcast mode is enabled.

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter @sshterm/ui exec vitest run src/features/broadcast/broadcastStore.test.ts src/features/sessions/sessionRecoveryStore.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/ui/src/features/sessions/sessionRecoveryStore.ts apps/ui/src/features/broadcast/broadcastStore.ts apps/desktop/src/main/tray/createTray.ts apps/ui/src/features/broadcast/broadcastStore.test.ts apps/ui/src/features/sessions/sessionRecoveryStore.test.ts
git commit -m "feat: add session recovery and tray controls"
```

### Task 13: Add SSH config import, port forwarding profiles, and host monitoring

**Files:**
- Create: `packages/session-core/src/ssh/parseSshConfig.ts`
- Create: `apps/ui/src/features/hosts/SshConfigImportDialog.tsx`
- Create: `apps/ui/src/features/port-forwarding/PortForwardProfileForm.tsx`
- Create: `apps/desktop/src/main/monitoring/hostMonitor.ts`
- Test: `packages/session-core/src/ssh/parseSshConfig.test.ts`

**Step 1: Write the failing test**

Create `packages/session-core/src/ssh/parseSshConfig.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseSshConfig } from "./parseSshConfig";

describe("parseSshConfig", () => {
  it("reads host aliases from ssh config text", () => {
    const result = parseSshConfig(`
Host web
  HostName web-01.example.com
  User admin
`);

    expect(result[0]?.alias).toBe("web");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @sshterm/session-core exec vitest run src/ssh/parseSshConfig.test.ts`
Expected: FAIL because SSH config import support does not exist yet

**Step 3: Write minimal implementation**

Create:

- SSH config parser and import mapping
- import dialog for preview and select
- stored port forwarding profiles
- basic host monitor using periodic ping or TCP reachability checks

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @sshterm/session-core exec vitest run src/ssh/parseSshConfig.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/session-core/src/ssh/parseSshConfig.ts apps/ui/src/features/hosts/SshConfigImportDialog.tsx apps/ui/src/features/port-forwarding/PortForwardProfileForm.tsx apps/desktop/src/main/monitoring/hostMonitor.ts packages/session-core/src/ssh/parseSshConfig.test.ts
git commit -m "feat: add import and monitoring workflows"
```

### Task 14: Add end-to-end verification and packaging tasks

**Files:**
- Create: `apps/ui/playwright.config.ts`
- Create: `apps/ui/tests/quick-connect.spec.ts`
- Create: `docs/testing/windows-smoke-checklist.md`
- Create: `docs/release/windows-packaging.md`

**Step 1: Write the failing test**

Create `apps/ui/tests/quick-connect.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("quick connect opens from keyboard shortcut", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Control+K");
  await expect(page.getByRole("dialog", { name: /quick connect/i })).toBeVisible();
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @sshterm/ui exec playwright test tests/quick-connect.spec.ts`
Expected: FAIL because the app is not yet wired for end-to-end testing

**Step 3: Write minimal implementation**

Create:

- Playwright config for the UI package
- a Windows smoke checklist for manual terminal validation
- a packaging guide for Electron Windows builds and signing prerequisites

Wire the app so the quick connect dialog is accessible in the renderer test environment.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @sshterm/ui exec playwright test tests/quick-connect.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/ui/playwright.config.ts apps/ui/tests/quick-connect.spec.ts docs/testing/windows-smoke-checklist.md docs/release/windows-packaging.md
git commit -m "test: add release verification coverage"
```

## Notes

- Keep the initial implementation Windows-first but do not hardcode Windows assumptions into `packages/shared`, `packages/db`, or `packages/session-core`.
- Favor small commits after each task.
- Do not start SFTP, sync, visual tunnel builder, X11, or key-management UI work until the terminal-first v1 is stable.

Plan complete and saved to `docs/plans/2026-04-05-ssh-terminal-app-implementation.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?
