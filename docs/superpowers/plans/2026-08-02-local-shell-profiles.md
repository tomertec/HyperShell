# Local Shell Profiles Implementation Plan (Phases 1–3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local PowerShell / CMD / WSL shell profiles to HyperShell — auto-detected on first run, editable, and launchable from the sidebar, new-tab menu, command palette, and welcome screen.

**Architecture:** A new `"local"` transport joins `ssh | serial | sftp | telnet`. The generic PTY lifecycle is first extracted out of `sshPtyTransport.ts` into `ptyProcess.ts` so both SSH and local shells share it. Profiles live in a new `local_profiles` SQLite table, seeded by a pure detection function and reconciled non-destructively on every startup. The renderer may only name a `profileId`; the main process resolves the executable itself.

**Tech Stack:** TypeScript (strict, ES2022), Electron, node-pty (ConPTY on Windows), better-sqlite3, Zod, React 19 + Zustand, Tailwind v4, Vitest 3.1, Playwright.

**Spec:** [`docs/superpowers/specs/2026-08-02-local-shell-profiles-design.md`](../specs/2026-08-02-local-shell-profiles-design.md)

## Global Constraints

- **TypeScript strict mode**, target ES2022. No `any` in exported signatures.
- **Zod validates every IPC payload in both directions** — preload and main parse against the same schema from `packages/shared/src/ipc/`.
- **`packages/session-core` has zero renderer dependencies.** No Electron imports, no React.
- **`session.open` with `transport: "local"` must never accept `executable`, `args`, or `cwd` from the renderer.** Only `profileId`. This is a security boundary, asserted by test in Task 14.
- **Detected profiles are created with `args = []`** — never `-NoProfile`, `-Command`, or `-File`. Those skip the user's `$PROFILE` or break interactivity.
- **`HOME` and `USERPROFILE` are never set or overridden** on a spawned shell.
- **`wsl.exe -l -q` output is UTF-16LE.** Always decode explicitly.
- **Local sessions never auto-reconnect** and never register with `NetworkMonitor`.
- **Icon values are exactly** `"powershell" | "cmd" | "linux" | "bash" | "terminal"`. No other strings.
- **Every task ends with a commit.** Never use `git restore`, `git checkout -- .`, `git reset`, or `git clean` — this repo has `core.autocrlf=true` and unrelated files routinely show as modified from line-ending noise alone. Stage only the exact files you touched.
- **Known local test failure:** `better-sqlite3` in this workspace is built for Electron's ABI (`NODE_MODULE_VERSION 140`) while vitest runs under Node (`137`). Every DB-touching test file fails locally with an identical `NODE_MODULE_VERSION` error, and `pnpm rebuild:sqlite` does **not** fix it. This is expected and CI is green. When a step below says a DB test should pass, verify instead that the only failure is that ABI error and that zero failures come from your logic. Tasks are ordered so that most tests avoid the database entirely.

---

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `packages/session-core/src/transports/ptyProcess.ts` | Generic PTY lifecycle shared by SSH and local shells |
| `packages/session-core/src/transports/ptyProcess.test.ts` | Lifecycle + env-hygiene tests against a fake spawn |
| `packages/session-core/src/transports/localShellTransport.ts` | Local shell transport factory |
| `packages/session-core/src/transports/localShellTransport.test.ts` | Command/cwd/env construction tests |
| `packages/session-core/src/localShells/detectLocalShells.ts` | Pure shell detection over injected probes |
| `packages/session-core/src/localShells/detectLocalShells.test.ts` | Detection + UTF-16LE WSL parsing tests |
| `packages/db/src/migrations/015_local_profiles.sql` | `local_profiles` + `local_profile_env_vars` tables |
| `packages/db/src/repositories/localProfilesRepository.ts` | CRUD, hide/available, reorder, env vars |
| `packages/db/src/repositories/localProfilesRepository.test.ts` | Repository tests |
| `apps/desktop/src/main/localShells/reconcileLocalProfiles.ts` | Non-destructive detected↔stored reconciliation |
| `apps/desktop/src/main/localShells/reconcileLocalProfiles.test.ts` | Reconciliation tests against a fake store |
| `apps/desktop/src/main/ipc/localProfilesIpc.ts` | `local-profiles:*` IPC handlers |
| `apps/desktop/src/preload/api/localApi.ts` | Preload slice |
| `apps/ui/src/features/local/localProfilesStore.ts` | Zustand store |
| `apps/ui/src/features/local/LocalProfileForm.tsx` | Add/edit form |
| `apps/ui/src/features/local/LocalProfileIcon.tsx` | The five inline SVG glyphs |
| `apps/ui/src/features/sidebar/SidebarLocalList.tsx` | Sidebar "Local" section |
| `apps/ui/src/features/layout/NewTabMenu.tsx` | `+` button dropdown |
| `apps/desktop/tests/local-shell.spec.ts` | Electron E2E: real shell + security boundary |

**Modified:** `transportEvents.ts`, `sshPtyTransport.ts`, `sessionManager.ts`, `session-core/src/index.ts`, `db/src/index.ts`, `shared/src/ipc/channels.ts`, `shared/src/ipc/schemas.ts`, `desktop/src/main/ipc/registerIpc.ts`, `desktop/src/preload/desktopApi.ts`, `ui/src/types/global.d.ts`, `ui/src/features/layout/layoutStore.ts`, `ui/src/features/layout/Workspace.tsx`, `ui/src/features/layout/TabBar.tsx`, `ui/src/features/terminal/TerminalPane.tsx`, `ui/src/features/terminal/useTerminalSession.ts`, `ui/src/features/terminal/terminalSessionModel.ts`, `ui/src/features/sidebar/Sidebar.tsx`, `ui/src/features/welcome/WelcomeScreen.tsx`, `ui/src/features/command-palette/CommandPalette.tsx`, `ui/src/features/settings/settingsStore.ts`, `ui/src/app/App.tsx`.

---

### Task 1: Extract the generic PTY core

The single riskiest change in the plan — it edits working SSH code. It is gated by `sshPtyTransport.test.ts` passing **unchanged**.

**Files:**
- Create: `packages/session-core/src/transports/ptyProcess.ts`
- Create: `packages/session-core/src/transports/ptyProcess.test.ts`
- Modify: `packages/session-core/src/transports/sshPtyTransport.ts`

**Interfaces:**
- Consumes: `OpenSessionRequest`, `SessionTransportEvent`, `TransportHandle` from `./transportEvents`.
- Produces: `createPtyProcess(request, config, deps?) => TransportHandle`, `sanitizePtyEnv(env) => NodeJS.ProcessEnv`, and the types `PtySpawn`, `PtyProcessLike`, `PtyExitEvent`, `PtySpawnOptions`, `DisposableLike`, `PtyProcessConfig`, `PtyProcessDeps`. `sshPtyTransport.ts` re-exports `SshPtySpawn`, `SshPtyProcess`, `SshPtyExitEvent`, `SshPtySpawnOptions`, `DisposableLike` as aliases so existing importers keep compiling.

**One deliberate deviation from the spec:** the spec describes `ptyProcess` stripping `ELECTRON_*` / `NODE_OPTIONS` before every spawn. Here `sanitizePtyEnv` is exported but **not** applied automatically — `createPtyProcess` passes `config.env` through untouched, and only `localShellTransport` (Task 3) calls `sanitizePtyEnv`. That keeps this task strictly behavior-preserving for SSH, which is what makes "SSH tests pass unchanged" a meaningful gate. The user-facing outcome for local shells is identical.

- [ ] **Step 1: Write the failing test**

Create `packages/session-core/src/transports/ptyProcess.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createPtyProcess, sanitizePtyEnv } from "./ptyProcess";
import type { PtyProcessLike, PtySpawn } from "./ptyProcess";
import type { OpenSessionRequest, SessionTransportEvent } from "./transportEvents";

function createFakePty() {
  const dataListeners: Array<(data: string) => void> = [];
  const exitListeners: Array<(event: { exitCode: number }) => void> = [];
  const written: string[] = [];
  const resized: Array<{ cols: number; rows: number }> = [];
  let killed = false;

  const pty: PtyProcessLike = {
    write: (data) => void written.push(data),
    resize: (cols, rows) => void resized.push({ cols, rows }),
    kill: () => void (killed = true),
    onData: (listener) => {
      dataListeners.push(listener);
      return { dispose: () => {} };
    },
    onExit: (listener) => {
      exitListeners.push(listener);
      return { dispose: () => {} };
    }
  };

  return {
    pty,
    written,
    resized,
    isKilled: () => killed,
    emitData: (data: string) => dataListeners.forEach((l) => l(data)),
    emitExit: (exitCode: number) => exitListeners.forEach((l) => l({ exitCode }))
  };
}

const request: OpenSessionRequest = {
  sessionId: "session-1",
  transport: "local",
  profileId: "profile-1",
  cols: 80,
  rows: 24
};

describe("createPtyProcess", () => {
  it("spawns the command and forwards data events", () => {
    const fake = createFakePty();
    const spawnPty = vi.fn(() => fake.pty) as unknown as PtySpawn;
    const events: SessionTransportEvent[] = [];

    const handle = createPtyProcess(
      request,
      { command: "cmd.exe", args: ["/K"], cols: 80, rows: 24 },
      { spawnPty }
    );
    handle.onEvent((event) => void events.push(event));

    fake.emitData("hello");

    expect(spawnPty).toHaveBeenCalledWith(
      "cmd.exe",
      ["/K"],
      expect.objectContaining({ cols: 80, rows: 24 })
    );
    expect(events).toContainEqual({ type: "data", sessionId: "session-1", data: "hello" });
  });

  it("emits exit with the process exit code", () => {
    const fake = createFakePty();
    const events: SessionTransportEvent[] = [];

    const handle = createPtyProcess(
      request,
      { command: "cmd.exe", args: [], cols: 80, rows: 24 },
      { spawnPty: (() => fake.pty) as unknown as PtySpawn }
    );
    handle.onEvent((event) => void events.push(event));

    fake.emitExit(3);

    expect(events).toContainEqual({ type: "exit", sessionId: "session-1", exitCode: 3 });
  });

  it("lets an onData hook write back into the pty", () => {
    const fake = createFakePty();

    createPtyProcess(
      request,
      { command: "ssh", args: [], cols: 80, rows: 24 },
      {
        spawnPty: (() => fake.pty) as unknown as PtySpawn,
        onData: (data, pty) => {
          if (data.includes("password:")) {
            pty.write("secret\r");
          }
        }
      }
    );

    fake.emitData("password:");

    expect(fake.written).toEqual(["secret\r"]);
  });

  it("emits an error and exits when spawning throws", () => {
    const events: SessionTransportEvent[] = [];
    const handle = createPtyProcess(
      request,
      { command: "missing.exe", args: [], cols: 80, rows: 24 },
      {
        spawnPty: (() => {
          throw new Error("ENOENT");
        }) as unknown as PtySpawn
      }
    );
    handle.onEvent((event) => void events.push(event));

    return new Promise<void>((resolve) => {
      queueMicrotask(() => {
        expect(events.some((e) => e.type === "error" && e.message.includes("ENOENT"))).toBe(true);
        expect(events.some((e) => e.type === "exit")).toBe(true);
        resolve();
      });
    });
  });
});

describe("sanitizePtyEnv", () => {
  it("strips Electron and Node injected variables", () => {
    const result = sanitizePtyEnv({
      PATH: "C:\\Windows",
      ELECTRON_RUN_AS_NODE: "1",
      ELECTRON_NO_ATTACH_CONSOLE: "1",
      NODE_OPTIONS: "--require foo"
    });

    expect(result.PATH).toBe("C:\\Windows");
    expect(result.ELECTRON_RUN_AS_NODE).toBeUndefined();
    expect(result.ELECTRON_NO_ATTACH_CONSOLE).toBeUndefined();
    expect(result.NODE_OPTIONS).toBeUndefined();
  });

  it("leaves HOME and USERPROFILE untouched", () => {
    const result = sanitizePtyEnv({ HOME: "/home/t", USERPROFILE: "C:\\Users\\t" });

    expect(result.HOME).toBe("/home/t");
    expect(result.USERPROFILE).toBe("C:\\Users\\t");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run packages/session-core/src/transports/ptyProcess.test.ts`
Expected: FAIL — `Failed to resolve import "./ptyProcess"`.

- [ ] **Step 3: Create `ptyProcess.ts`**

```ts
import type {
  OpenSessionRequest,
  SessionTransportEvent,
  TransportHandle
} from "./transportEvents";
import { toErrorMessage as toSharedErrorMessage } from "@hypershell/shared";

export interface PtySpawnOptions {
  name?: string;
  cols: number;
  rows: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export interface DisposableLike {
  dispose(): void;
}

export interface PtyExitEvent {
  exitCode: number;
  signal?: number;
}

export interface PtyProcessLike {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
  onData(listener: (data: string) => void): DisposableLike;
  onExit(listener: (event: PtyExitEvent) => void): DisposableLike;
}

export type PtySpawn = (
  file: string,
  args: string[],
  options: PtySpawnOptions
) => PtyProcessLike;

export interface PtyProcessConfig {
  command: string;
  args: string[];
  cols: number;
  rows: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  termName?: string;
}

export interface PtyProcessDeps {
  spawnPty?: PtySpawn;
  /** Runs for each chunk before it is emitted. `pty.write` feeds data back in. */
  onData?: (data: string, pty: { write(data: string): void }) => void;
}

// node-pty is loaded via require() at runtime (provided by esbuild banner's createRequire)
declare const require: (id: string) => unknown;

/** Variables Electron injects that would change how tools behave inside a shell. */
const STRIPPED_ENV_KEYS = new Set(["NODE_OPTIONS"]);

export function sanitizePtyEnv(baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};

  for (const [key, value] of Object.entries(baseEnv)) {
    if (key.startsWith("ELECTRON_") || STRIPPED_ENV_KEYS.has(key)) {
      continue;
    }
    result[key] = value;
  }

  return result;
}

export function getDefaultSpawnPty(): PtySpawn {
  const loaded = require("node-pty") as { spawn?: PtySpawn };

  if (!loaded.spawn) {
    throw new Error("node-pty did not provide a spawn function");
  }

  return loaded.spawn;
}

function toErrorMessage(error: unknown): string {
  return toSharedErrorMessage(error, "Unknown PTY error");
}

export function createPtyProcess(
  request: OpenSessionRequest,
  config: PtyProcessConfig,
  deps: PtyProcessDeps = {}
): TransportHandle {
  const listeners = new Set<(event: SessionTransportEvent) => void>();
  const spawnPty = deps.spawnPty ?? getDefaultSpawnPty();
  let pty: PtyProcessLike | null = null;
  let dataSubscription: DisposableLike | null = null;
  let exitSubscription: DisposableLike | null = null;
  let isClosed = false;
  let hasExited = false;

  const emit = (event: SessionTransportEvent): void => {
    for (const listener of listeners) {
      listener(event);
    }
  };

  const cleanup = (): void => {
    dataSubscription?.dispose();
    exitSubscription?.dispose();
    dataSubscription = null;
    exitSubscription = null;
  };

  const emitExit = (exitCode: number | null): void => {
    if (hasExited) {
      return;
    }

    hasExited = true;
    cleanup();

    emit({ type: "exit", sessionId: request.sessionId, exitCode });
  };

  try {
    pty = spawnPty(config.command, config.args, {
      name: config.termName ?? "xterm-256color",
      cols: config.cols,
      rows: config.rows,
      cwd: config.cwd,
      env: config.env
    });
  } catch (error) {
    queueMicrotask(() => {
      emit({
        type: "error",
        sessionId: request.sessionId,
        message: toErrorMessage(error)
      });
      emitExit(null);
    });
  }

  if (pty) {
    const activePty = pty;

    dataSubscription = activePty.onData((data) => {
      if (hasExited || isClosed) {
        return;
      }

      if (deps.onData) {
        deps.onData(data, {
          write(value: string) {
            try {
              activePty.write(value);
            } catch {
              // Ignore write failures; the caller's flow continues.
            }
          }
        });
      }

      emit({ type: "data", sessionId: request.sessionId, data });
    });

    exitSubscription = activePty.onExit((event) => {
      emitExit(event.exitCode ?? null);
    });

    queueMicrotask(() => {
      if (isClosed || hasExited) {
        return;
      }

      emit({ type: "status", sessionId: request.sessionId, state: "connected" });
    });
  }

  return {
    write(data: string) {
      if (!pty || hasExited || isClosed) {
        return;
      }

      try {
        pty.write(data);
      } catch (error) {
        emit({
          type: "error",
          sessionId: request.sessionId,
          message: toErrorMessage(error)
        });
      }
    },
    resize(cols: number, rows: number) {
      if (!pty || hasExited || isClosed) {
        return;
      }

      try {
        pty.resize(cols, rows);
      } catch (error) {
        emit({
          type: "error",
          sessionId: request.sessionId,
          message: toErrorMessage(error)
        });
      }
    },
    close() {
      if (isClosed || hasExited) {
        return;
      }

      isClosed = true;

      if (!pty) {
        emitExit(null);
        return;
      }

      try {
        pty.kill();
      } catch (error) {
        emit({
          type: "error",
          sessionId: request.sessionId,
          message: toErrorMessage(error)
        });

        emitExit(null);
      }
    },
    onEvent(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run packages/session-core/src/transports/ptyProcess.test.ts`
Expected: PASS — 6 tests.

Note: `transport: "local"` in the fixture will be a TypeScript error until Task 3 widens `SessionTransportKind`. Vitest runs through esbuild and does not typecheck, so the test passes now; Task 3 clears the type error.

- [ ] **Step 5: Rewrite `sshPtyTransport.ts` to delegate**

Replace the PTY-lifecycle half of the file. Keep `buildSshArgs`, `buildSshPtyCommand`, `normalizePromptText`, `isPasswordPrompt`, `buildPtyEnv`, and the `SshConnectionProfile` / `SshPtyCommand` interfaces exactly as they are. Replace the type declarations and `createSshPtyTransport` with:

```ts
import {
  createPtyProcess,
  getDefaultSpawnPty,
  type DisposableLike,
  type PtyExitEvent,
  type PtyProcessLike,
  type PtySpawn,
  type PtySpawnOptions
} from "./ptyProcess";

// Preserved names for existing importers.
export type SshPtySpawnOptions = PtySpawnOptions;
export type SshPtyExitEvent = PtyExitEvent;
export type SshPtyProcess = PtyProcessLike;
export type SshPtySpawn = PtySpawn;
export type { DisposableLike };

export interface CreateSshPtyTransportDeps {
  spawnPty?: SshPtySpawn;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  termName?: string;
}

export interface SshPtyTransport extends TransportHandle {
  command: SshPtyCommand;
  request: OpenSessionRequest;
}

export function createSshPtyTransport(
  request: OpenSessionRequest,
  profile: SshConnectionProfile,
  deps: CreateSshPtyTransportDeps = {}
): SshPtyTransport {
  const command = buildSshPtyCommand(profile);
  let authSecretSent = false;
  let promptBuffer = "";

  const handle = createPtyProcess(
    request,
    {
      command: command.command,
      args: command.args,
      cols: request.cols,
      rows: request.rows,
      cwd: deps.cwd,
      env: buildPtyEnv(deps.env ?? process.env, profile.envVars),
      termName: deps.termName
    },
    {
      spawnPty: deps.spawnPty ?? getDefaultSpawnPty(),
      onData(data, pty) {
        if (authSecretSent || !profile.password) {
          return;
        }

        promptBuffer = `${promptBuffer}${data}`.slice(-512);
        if (!isPasswordPrompt(promptBuffer)) {
          return;
        }

        authSecretSent = true;
        pty.write(`${profile.password}\r`);
        // Clear password from memory after transmission
        profile.password = undefined;
      }
    }
  );

  return { ...handle, command, request };
}
```

Delete the now-unused local `getDefaultSpawnPty`, `toErrorMessage`, and the old `DisposableLike` / `SshPtyProcess` / `SshPtyExitEvent` / `SshPtySpawnOptions` / `SshPtySpawn` interface declarations from this file. Leave `buildPtyEnv` in place — it is SSH's env merge and is still called above.

- [ ] **Step 6: Run the SSH tests unchanged — this is the gate**

Run: `pnpm exec vitest run packages/session-core/src/transports/sshPtyTransport.test.ts`
Expected: PASS, with **zero edits to the test file**. If any test fails, the extraction changed behavior — fix `ptyProcess.ts` or the delegation, never the test.

- [ ] **Step 7: Run the whole session-core suite**

Run: `pnpm exec vitest run packages/session-core`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/session-core/src/transports/ptyProcess.ts packages/session-core/src/transports/ptyProcess.test.ts packages/session-core/src/transports/sshPtyTransport.ts
git commit -m "refactor(session-core): extract shared PTY core from sshPtyTransport"
```

---

### Task 2: Add the `local` transport kind

**Files:**
- Modify: `packages/session-core/src/transports/transportEvents.ts`
- Modify: `packages/shared/src/ipc/schemas.ts:13`

**Interfaces:**
- Consumes: nothing.
- Produces: `SessionTransportKind` includes `"local"`; `LocalConnectionOptions { executable: string; args?: string[]; cwd?: string; envVars?: Record<string, string> }`; `OpenSessionRequest.localOptions?: LocalConnectionOptions`; `transportSchema` accepts `"local"`.

- [ ] **Step 1: Widen the transport union**

In `packages/session-core/src/transports/transportEvents.ts` line 1:

```ts
export type SessionTransportKind = "ssh" | "serial" | "sftp" | "telnet" | "local";
```

Add after `TelnetConnectionOptions`:

```ts
export interface LocalConnectionOptions {
  executable: string;
  args?: string[];
  cwd?: string;
  envVars?: Record<string, string>;
}
```

Add to `OpenSessionRequest`:

```ts
  localOptions?: LocalConnectionOptions;
```

- [ ] **Step 2: Widen the shared Zod enum and declare the icon domain**

In `packages/shared/src/ipc/schemas.ts` line 13:

```ts
export const transportSchema = z.enum(["ssh", "serial", "sftp", "telnet", "local"]);
```

Add the icon domain here too, so exactly one declaration of this union exists in the
monorepo and `session-core`, `db`, and the renderer all import it rather than restating it:

```ts
export const localProfileIconSchema = z.enum([
  "powershell",
  "cmd",
  "linux",
  "bash",
  "terminal"
]);

export type LocalProfileIcon = z.infer<typeof localProfileIconSchema>;
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @hypershell/session-core build && pnpm --filter @hypershell/shared build`
Expected: PASS. The `transport: "local"` fixture in `ptyProcess.test.ts` now typechecks.

- [ ] **Step 4: Commit**

```bash
git add packages/session-core/src/transports/transportEvents.ts packages/shared/src/ipc/schemas.ts
git commit -m "feat(shared): add local transport kind"
```

---

### Task 3: Local shell transport

**Files:**
- Create: `packages/session-core/src/transports/localShellTransport.ts`
- Create: `packages/session-core/src/transports/localShellTransport.test.ts`
- Modify: `packages/session-core/src/sessionManager.ts:111-140`
- Modify: `packages/session-core/src/index.ts`

**Interfaces:**
- Consumes: `createPtyProcess`, `sanitizePtyEnv`, `PtyProcessDeps`, `PtySpawn` from `./ptyProcess`; `LocalConnectionOptions`, `OpenSessionRequest`, `TransportHandle` from `./transportEvents`.
- Produces: `createLocalShellTransport(request, profile, deps?) => TransportHandle`; `OpenSessionInput.localOptions?: LocalConnectionOptions` on `SessionManager.open`.

- [ ] **Step 1: Write the failing test**

Create `packages/session-core/src/transports/localShellTransport.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createLocalShellTransport } from "./localShellTransport";
import type { PtyProcessLike, PtySpawn } from "./ptyProcess";
import type { OpenSessionRequest } from "./transportEvents";

const noopPty: PtyProcessLike = {
  write: () => {},
  resize: () => {},
  kill: () => {},
  onData: () => ({ dispose: () => {} }),
  onExit: () => ({ dispose: () => {} })
};

const request: OpenSessionRequest = {
  sessionId: "session-1",
  transport: "local",
  profileId: "profile-1",
  cols: 120,
  rows: 30
};

describe("createLocalShellTransport", () => {
  it("spawns the profile executable with its args and cwd", () => {
    const spawnPty = vi.fn(() => noopPty) as unknown as PtySpawn;

    createLocalShellTransport(
      request,
      {
        executable: "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
        args: [],
        cwd: "C:\\projects"
      },
      { spawnPty }
    );

    expect(spawnPty).toHaveBeenCalledWith(
      "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
      [],
      expect.objectContaining({ cols: 120, rows: 30, cwd: "C:\\projects" })
    );
  });

  it("strips Electron variables and applies profile env vars", () => {
    const spawnPty = vi.fn(() => noopPty) as unknown as PtySpawn;

    createLocalShellTransport(
      request,
      { executable: "cmd.exe", envVars: { MY_FLAG: "1" } },
      {
        spawnPty,
        baseEnv: { PATH: "C:\\Windows", ELECTRON_RUN_AS_NODE: "1", NODE_OPTIONS: "--x" }
      }
    );

    const env = vi.mocked(spawnPty).mock.calls[0][2].env ?? {};
    expect(env.PATH).toBe("C:\\Windows");
    expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined();
    expect(env.NODE_OPTIONS).toBeUndefined();
    expect(env.MY_FLAG).toBe("1");
  });

  it("rejects env var names that are not valid identifiers", () => {
    const spawnPty = vi.fn(() => noopPty) as unknown as PtySpawn;

    createLocalShellTransport(
      request,
      { executable: "cmd.exe", envVars: { "BAD NAME": "1", GOOD_NAME: "2" } },
      { spawnPty, baseEnv: {} }
    );

    const env = vi.mocked(spawnPty).mock.calls[0][2].env ?? {};
    expect(env["BAD NAME"]).toBeUndefined();
    expect(env.GOOD_NAME).toBe("2");
  });

  it("defaults args to an empty array so the shell loads its own profile", () => {
    const spawnPty = vi.fn(() => noopPty) as unknown as PtySpawn;

    createLocalShellTransport(request, { executable: "pwsh.exe" }, { spawnPty });

    expect(vi.mocked(spawnPty).mock.calls[0][1]).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run packages/session-core/src/transports/localShellTransport.test.ts`
Expected: FAIL — `Failed to resolve import "./localShellTransport"`.

- [ ] **Step 3: Create `localShellTransport.ts`**

```ts
import { ENV_VAR_NAME_REGEX } from "@hypershell/shared";
import {
  createPtyProcess,
  sanitizePtyEnv,
  type PtySpawn
} from "./ptyProcess";
import type {
  LocalConnectionOptions,
  OpenSessionRequest,
  TransportHandle
} from "./transportEvents";

export interface CreateLocalShellTransportDeps {
  spawnPty?: PtySpawn;
  /** Overridable for tests; defaults to the main process environment. */
  baseEnv?: NodeJS.ProcessEnv;
  termName?: string;
}

function buildLocalEnv(
  baseEnv: NodeJS.ProcessEnv,
  envVars?: Record<string, string>
): NodeJS.ProcessEnv {
  const merged = sanitizePtyEnv(baseEnv);

  for (const [name, value] of Object.entries(envVars ?? {})) {
    if (!ENV_VAR_NAME_REGEX.test(name)) {
      continue;
    }
    merged[name] = String(value);
  }

  return merged;
}

export function createLocalShellTransport(
  request: OpenSessionRequest,
  profile: LocalConnectionOptions,
  deps: CreateLocalShellTransportDeps = {}
): TransportHandle {
  return createPtyProcess(
    request,
    {
      command: profile.executable,
      args: profile.args ?? [],
      cols: request.cols,
      rows: request.rows,
      cwd: profile.cwd,
      env: buildLocalEnv(deps.baseEnv ?? process.env, profile.envVars),
      termName: deps.termName
    },
    { spawnPty: deps.spawnPty }
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run packages/session-core/src/transports/localShellTransport.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Wire the transport into `SessionManager`**

In `packages/session-core/src/sessionManager.ts`, add the import beside the existing transport imports:

```ts
import { createLocalShellTransport } from "./transports/localShellTransport";
```

Add `LocalConnectionOptions` to the type-only import from `./transports/transportEvents`, add to `OpenSessionInput`:

```ts
  localOptions?: LocalConnectionOptions;
```

and add this branch inside `createDefaultTransport`, immediately after the `serial` branch:

```ts
  if (request.transport === "local") {
    const opts = request.localOptions ?? { executable: request.profileId };
    return createLocalShellTransport(request, {
      executable: opts.executable,
      args: opts.args,
      cwd: opts.cwd,
      envVars: opts.envVars
    });
  }
```

Then find where `open()` builds the `OpenSessionRequest` passed to `createTransport` and include `localOptions: input.localOptions` alongside the existing `telnetOptions` / `serialOptions` pass-through.

- [ ] **Step 6: Suppress reconnect for local sessions**

In `sessionManager.ts`, locate where `autoReconnect` is resolved for a new session (the assignment that feeds `snapshot.autoReconnect`). Force it off for local:

```ts
    const autoReconnect = input.transport === "local" ? false : (input.autoReconnect ?? false);
```

and guard the network-monitor subscription so it is not registered when `input.transport === "local"`.

- [ ] **Step 7: Export from the package index**

In `packages/session-core/src/index.ts`, add:

```ts
export { createLocalShellTransport } from "./transports/localShellTransport";
export type { CreateLocalShellTransportDeps } from "./transports/localShellTransport";
export { createPtyProcess, sanitizePtyEnv } from "./transports/ptyProcess";
export type { LocalConnectionOptions } from "./transports/transportEvents";
```

- [ ] **Step 8: Run the session-core suite**

Run: `pnpm exec vitest run packages/session-core`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/session-core/src/transports/localShellTransport.ts packages/session-core/src/transports/localShellTransport.test.ts packages/session-core/src/sessionManager.ts packages/session-core/src/index.ts
git commit -m "feat(session-core): add local shell transport"
```

---

### Task 4: Shell detection

**Files:**
- Create: `packages/session-core/src/localShells/detectLocalShells.ts`
- Create: `packages/session-core/src/localShells/detectLocalShells.test.ts`
- Modify: `packages/session-core/src/index.ts`

**Interfaces:**
- Consumes: `LocalProfileIcon` from `@hypershell/shared` (Task 2), plus Node built-ins.
- Produces: `detectLocalShells(probes) => DetectedShell[]`, `parseWslDistros(stdout: Buffer) => string[]`, `createDefaultProbes() => DetectProbes`, and types `DetectedShell { detectKey, name, executable, args, icon }`, `DetectProbes { platform, env, fileExists, runCommand }`.

- [ ] **Step 1: Write the failing test**

Create `packages/session-core/src/localShells/detectLocalShells.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { detectLocalShells, parseWslDistros } from "./detectLocalShells";
import type { DetectProbes } from "./detectLocalShells";

function windowsProbes(overrides: Partial<DetectProbes> = {}): DetectProbes {
  const present = new Set([
    "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    "C:\\Windows\\System32\\cmd.exe",
    "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
    "C:\\Program Files\\Git\\bin\\bash.exe"
  ]);

  return {
    platform: "win32",
    env: {
      SystemRoot: "C:\\Windows",
      ProgramFiles: "C:\\Program Files"
    },
    fileExists: (candidate) => present.has(candidate),
    runCommand: () => null,
    ...overrides
  };
}

describe("parseWslDistros", () => {
  it("decodes UTF-16LE output from wsl -l -q", () => {
    const stdout = Buffer.from("Ubuntu-22.04\r\nDebian\r\n", "utf16le");

    expect(parseWslDistros(stdout)).toEqual(["Ubuntu-22.04", "Debian"]);
  });

  it("returns an empty list for empty output", () => {
    expect(parseWslDistros(Buffer.from("", "utf16le"))).toEqual([]);
  });

  it("does not mistake UTF-16 padding for distro names", () => {
    const stdout = Buffer.from("Ubuntu\r\n", "utf16le");

    expect(parseWslDistros(stdout).every((name) => !name.includes("\u0000"))).toBe(true);
  });
});

describe("detectLocalShells", () => {
  it("finds the standard Windows shells", () => {
    const shells = detectLocalShells(windowsProbes());
    const keys = shells.map((shell) => shell.detectKey);

    expect(keys).toContain("windows-powershell");
    expect(keys).toContain("pwsh7");
    expect(keys).toContain("cmd");
    expect(keys).toContain("git-bash");
  });

  it("gives every detected shell empty args so it loads its own profile", () => {
    for (const shell of detectLocalShells(windowsProbes())) {
      expect(shell.args).toEqual([]);
    }
  });

  it("assigns the right icon per shell", () => {
    const shells = detectLocalShells(windowsProbes());
    const byKey = Object.fromEntries(shells.map((s) => [s.detectKey, s.icon]));

    expect(byKey["windows-powershell"]).toBe("powershell");
    expect(byKey.pwsh7).toBe("powershell");
    expect(byKey.cmd).toBe("cmd");
    expect(byKey["git-bash"]).toBe("bash");
  });

  it("omits shells that are not installed", () => {
    const probes = windowsProbes({ fileExists: () => false });

    expect(detectLocalShells(probes)).toEqual([]);
  });

  it("adds one profile per WSL distro", () => {
    const probes = windowsProbes({
      runCommand: (file, args) =>
        file.toLowerCase().includes("wsl") && args.includes("-q")
          ? Buffer.from("Ubuntu-22.04\r\nDebian\r\n", "utf16le")
          : null
    });

    const shells = detectLocalShells(probes);
    const ubuntu = shells.find((s) => s.detectKey === "wsl:Ubuntu-22.04");

    expect(ubuntu).toBeDefined();
    expect(ubuntu?.name).toBe("Ubuntu-22.04 (WSL)");
    expect(ubuntu?.args).toEqual(["-d", "Ubuntu-22.04"]);
    expect(ubuntu?.icon).toBe("linux");
    expect(shells.some((s) => s.detectKey === "wsl:Debian")).toBe(true);
  });

  it("falls back to $SHELL on non-Windows platforms", () => {
    const shells = detectLocalShells({
      platform: "linux",
      env: { SHELL: "/bin/zsh" },
      fileExists: (candidate) => candidate === "/bin/zsh",
      runCommand: () => null
    });

    expect(shells).toEqual([
      { detectKey: "default-shell", name: "zsh", executable: "/bin/zsh", args: [], icon: "terminal" }
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run packages/session-core/src/localShells/detectLocalShells.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `detectLocalShells.ts`**

```ts
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import type { LocalProfileIcon } from "@hypershell/shared";

export interface DetectedShell {
  detectKey: string;
  name: string;
  executable: string;
  args: string[];
  icon: LocalProfileIcon;
}

export interface DetectProbes {
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  fileExists(candidate: string): boolean;
  /** Returns raw stdout, or null when the command is unavailable or fails. */
  runCommand(file: string, args: string[]): Buffer | null;
}

export function createDefaultProbes(): DetectProbes {
  return {
    platform: process.platform,
    env: process.env,
    fileExists: (candidate) => existsSync(candidate),
    runCommand: (file, args) => {
      try {
        return execFileSync(file, args, { timeout: 5_000, windowsHide: true });
      } catch {
        return null;
      }
    }
  };
}

/** `wsl.exe -l -q` writes UTF-16LE. Decoding as UTF-8 yields NUL-interleaved names. */
export function parseWslDistros(stdout: Buffer): string[] {
  return stdout
    .toString("utf16le")
    .split(/\r?\n/)
    .map((line) => line.replace(/\u0000/g, "").trim())
    .filter((line) => line.length > 0);
}

function detectWindowsShells(probes: DetectProbes): DetectedShell[] {
  const shells: DetectedShell[] = [];
  const systemRoot = probes.env.SystemRoot ?? probes.env.WINDIR ?? "C:\\Windows";
  const programFiles = probes.env.ProgramFiles ?? "C:\\Program Files";

  const windowsPowerShell = path.join(
    systemRoot,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe"
  );
  if (probes.fileExists(windowsPowerShell)) {
    shells.push({
      detectKey: "windows-powershell",
      name: "Windows PowerShell",
      executable: windowsPowerShell,
      args: [],
      icon: "powershell"
    });
  }

  const pwsh7 = path.join(programFiles, "PowerShell", "7", "pwsh.exe");
  if (probes.fileExists(pwsh7)) {
    shells.push({
      detectKey: "pwsh7",
      name: "PowerShell",
      executable: pwsh7,
      args: [],
      icon: "powershell"
    });
  }

  const cmd = path.join(systemRoot, "System32", "cmd.exe");
  if (probes.fileExists(cmd)) {
    shells.push({
      detectKey: "cmd",
      name: "Command Prompt",
      executable: cmd,
      args: [],
      icon: "cmd"
    });
  }

  const gitBash = path.join(programFiles, "Git", "bin", "bash.exe");
  if (probes.fileExists(gitBash)) {
    shells.push({
      detectKey: "git-bash",
      name: "Git Bash",
      executable: gitBash,
      args: [],
      icon: "bash"
    });
  }

  const wsl = path.join(systemRoot, "System32", "wsl.exe");
  const wslOutput = probes.runCommand(wsl, ["-l", "-q"]);
  if (wslOutput) {
    for (const distro of parseWslDistros(wslOutput)) {
      shells.push({
        detectKey: `wsl:${distro}`,
        name: `${distro} (WSL)`,
        executable: wsl,
        args: ["-d", distro],
        icon: "linux"
      });
    }
  }

  return shells;
}

function detectPosixShells(probes: DetectProbes): DetectedShell[] {
  const candidates = [probes.env.SHELL, "/bin/zsh", "/bin/bash", "/bin/sh"].filter(
    (candidate): candidate is string => Boolean(candidate)
  );

  for (const candidate of candidates) {
    if (probes.fileExists(candidate)) {
      return [
        {
          detectKey: "default-shell",
          name: path.basename(candidate),
          executable: candidate,
          args: [],
          icon: "terminal"
        }
      ];
    }
  }

  return [];
}

export function detectLocalShells(probes: DetectProbes): DetectedShell[] {
  return probes.platform === "win32"
    ? detectWindowsShells(probes)
    : detectPosixShells(probes);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run packages/session-core/src/localShells/detectLocalShells.test.ts`
Expected: PASS — 9 tests.

- [ ] **Step 5: Export from the package index**

In `packages/session-core/src/index.ts`:

```ts
export {
  createDefaultProbes,
  detectLocalShells,
  parseWslDistros
} from "./localShells/detectLocalShells";
export type { DetectProbes, DetectedShell } from "./localShells/detectLocalShells";
```

- [ ] **Step 6: Commit**

```bash
git add packages/session-core/src/localShells packages/session-core/src/index.ts
git commit -m "feat(session-core): detect installed local shells"
```

---

### Task 5: Database migration and repository

**Files:**
- Create: `packages/db/src/migrations/015_local_profiles.sql`
- Create: `packages/db/src/repositories/localProfilesRepository.ts`
- Create: `packages/db/src/repositories/localProfilesRepository.test.ts`
- Modify: `packages/db/src/index.ts`
- Modify: `packages/db/src/repositories/index.ts`

**Interfaces:**
- Consumes: `SqliteDatabase`, `openDatabase` from `../index`.
- Produces: `createLocalProfilesRepositoryFromDatabase(db)` returning `{ create, get, getByDetectKey, list, remove, setHidden, setAvailable, reorder, listEnvVars, replaceEnvVars }`, plus types `LocalProfileRecord`, `LocalProfileInput`, `LocalProfileEnvVar`.

`LocalProfileRecord` is:

```ts
export type LocalProfileRecord = {
  id: string;
  name: string;
  executable: string;
  args: string[];
  startingDirectory: string | null;
  icon: LocalProfileIcon;
  color: string | null;
  elevated: boolean;
  source: "user" | "detected";
  detectKey: string | null;
  isAvailable: boolean;
  isHidden: boolean;
  sortOrder: number;
};
```

- [ ] **Step 1: Write the migration**

Create `packages/db/src/migrations/015_local_profiles.sql`:

```sql
CREATE TABLE IF NOT EXISTS local_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  executable TEXT NOT NULL,
  args_json TEXT NOT NULL DEFAULT '[]',
  starting_directory TEXT,
  icon TEXT NOT NULL DEFAULT 'terminal',
  color TEXT,
  elevated INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'user',
  detect_key TEXT UNIQUE,
  is_available INTEGER NOT NULL DEFAULT 1,
  is_hidden INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS local_profile_env_vars (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES local_profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  is_enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_local_profile_env_vars_profile
  ON local_profile_env_vars(profile_id);
```

- [ ] **Step 2: Run the migration on open**

In `packages/db/src/index.ts`, add the file read beside `hostEnvVarsSql` (around line 45):

```ts
  const localProfilesSql = readFileSync(
    new URL("./migrations/015_local_profiles.sql", import.meta.url),
    "utf8"
  );
```

and execute it after the migration-014 block, just before `return db;`:

```ts
  // Migration 015: local shell profiles + their environment variables
  db.exec(localProfilesSql);
```

Both statements are `CREATE TABLE IF NOT EXISTS`, so a plain `db.exec` is idempotent — no try/catch guard needed.

- [ ] **Step 3: Write the failing repository test**

Create `packages/db/src/repositories/localProfilesRepository.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { openDatabase } from "../index";
import { createLocalProfilesRepositoryFromDatabase } from "./localProfilesRepository";

function createRepo() {
  return createLocalProfilesRepositoryFromDatabase(openDatabase(":memory:"));
}

const baseInput = {
  id: "profile-1",
  name: "PowerShell",
  executable: "C:\\Program Files\\PowerShell\\7\\pwsh.exe"
};

describe("localProfilesRepository", () => {
  it("round-trips a profile with defaults applied", () => {
    const repo = createRepo();
    const created = repo.create(baseInput);

    expect(created).toMatchObject({
      id: "profile-1",
      name: "PowerShell",
      args: [],
      startingDirectory: null,
      icon: "terminal",
      color: null,
      elevated: false,
      source: "user",
      detectKey: null,
      isAvailable: true,
      isHidden: false
    });
  });

  it("round-trips args as a JSON array", () => {
    const repo = createRepo();
    repo.create({ ...baseInput, args: ["-d", "Ubuntu-22.04"] });

    expect(repo.get("profile-1")?.args).toEqual(["-d", "Ubuntu-22.04"]);
  });

  it("looks a profile up by detect key", () => {
    const repo = createRepo();
    repo.create({ ...baseInput, source: "detected", detectKey: "pwsh7" });

    expect(repo.getByDetectKey("pwsh7")?.id).toBe("profile-1");
    expect(repo.getByDetectKey("cmd")).toBeUndefined();
  });

  it("updates availability and hidden flags independently", () => {
    const repo = createRepo();
    repo.create({ ...baseInput, source: "detected", detectKey: "pwsh7" });

    repo.setAvailable("profile-1", false);
    repo.setHidden("profile-1", true);

    const profile = repo.get("profile-1");
    expect(profile?.isAvailable).toBe(false);
    expect(profile?.isHidden).toBe(true);
  });

  it("lists profiles ordered by sort order then name", () => {
    const repo = createRepo();
    repo.create({ id: "b", name: "Bravo", executable: "b.exe", sortOrder: 2 });
    repo.create({ id: "a", name: "Alpha", executable: "a.exe", sortOrder: 1 });

    expect(repo.list().map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("persists a new sort order", () => {
    const repo = createRepo();
    repo.create({ id: "a", name: "Alpha", executable: "a.exe", sortOrder: 1 });
    repo.create({ id: "b", name: "Bravo", executable: "b.exe", sortOrder: 2 });

    repo.reorder([
      { id: "b", sortOrder: 1 },
      { id: "a", sortOrder: 2 }
    ]);

    expect(repo.list().map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("replaces env vars wholesale and cascades on delete", () => {
    const repo = createRepo();
    repo.create(baseInput);

    repo.replaceEnvVars("profile-1", [{ name: "FOO", value: "1", isEnabled: true }]);
    expect(repo.listEnvVars("profile-1")).toEqual([
      expect.objectContaining({ name: "FOO", value: "1", isEnabled: true })
    ]);

    repo.replaceEnvVars("profile-1", [{ name: "BAR", value: "2", isEnabled: false }]);
    expect(repo.listEnvVars("profile-1").map((v) => v.name)).toEqual(["BAR"]);

    repo.remove("profile-1");
    expect(repo.listEnvVars("profile-1")).toEqual([]);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm exec vitest run packages/db/src/repositories/localProfilesRepository.test.ts`
Expected: FAIL — module not found. If it instead fails with `NODE_MODULE_VERSION 140 ... 137`, that is the known ABI mismatch from Global Constraints; the logic cannot be verified locally, so rely on CI for this file and confirm the error text is exactly the ABI one.

- [ ] **Step 5: Create `localProfilesRepository.ts`**

```ts
import type { LocalProfileIcon } from "@hypershell/shared";
import type { SqliteDatabase } from "../index";
import { openDatabase } from "../index";

export type LocalProfileRecord = {
  id: string;
  name: string;
  executable: string;
  args: string[];
  startingDirectory: string | null;
  icon: LocalProfileIcon;
  color: string | null;
  elevated: boolean;
  source: "user" | "detected";
  detectKey: string | null;
  isAvailable: boolean;
  isHidden: boolean;
  sortOrder: number;
};

export type LocalProfileInput = {
  id: string;
  name: string;
  executable: string;
  args?: string[];
  startingDirectory?: string | null;
  icon?: LocalProfileIcon;
  color?: string | null;
  elevated?: boolean;
  source?: "user" | "detected";
  detectKey?: string | null;
  isAvailable?: boolean;
  isHidden?: boolean;
  sortOrder?: number;
};

export type LocalProfileEnvVar = {
  name: string;
  value: string;
  isEnabled: boolean;
};

type LocalProfileRow = {
  id: string;
  name: string;
  executable: string;
  args_json: string;
  starting_directory: string | null;
  icon: string;
  color: string | null;
  elevated: number;
  source: string;
  detect_key: string | null;
  is_available: number;
  is_hidden: number;
  sort_order: number;
};

const PROFILE_COLUMNS = `
  id, name, executable, args_json, starting_directory, icon, color,
  elevated, source, detect_key, is_available, is_hidden, sort_order
`;

function parseArgs(argsJson: string): string[] {
  try {
    const parsed = JSON.parse(argsJson) as unknown;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function mapRow(row: LocalProfileRow): LocalProfileRecord {
  return {
    id: row.id,
    name: row.name,
    executable: row.executable,
    args: parseArgs(row.args_json),
    startingDirectory: row.starting_directory,
    icon: row.icon as LocalProfileIcon,
    color: row.color,
    elevated: row.elevated !== 0,
    source: row.source === "detected" ? "detected" : "user",
    detectKey: row.detect_key,
    isAvailable: row.is_available !== 0,
    isHidden: row.is_hidden !== 0,
    sortOrder: row.sort_order
  };
}

export function createLocalProfilesRepository(databasePath = ":memory:") {
  return createLocalProfilesRepositoryFromDatabase(openDatabase(databasePath));
}

export function createLocalProfilesRepositoryFromDatabase(db: SqliteDatabase) {
  const upsertProfile = db.prepare(`
    INSERT INTO local_profiles (
      id, name, executable, args_json, starting_directory, icon, color,
      elevated, source, detect_key, is_available, is_hidden, sort_order
    )
    VALUES (
      @id, @name, @executable, @argsJson, @startingDirectory, @icon, @color,
      @elevated, @source, @detectKey, @isAvailable, @isHidden, @sortOrder
    )
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      executable = excluded.executable,
      args_json = excluded.args_json,
      starting_directory = excluded.starting_directory,
      icon = excluded.icon,
      color = excluded.color,
      elevated = excluded.elevated,
      source = excluded.source,
      detect_key = excluded.detect_key,
      is_available = excluded.is_available,
      is_hidden = excluded.is_hidden,
      sort_order = excluded.sort_order,
      updated_at = CURRENT_TIMESTAMP
  `);

  const selectById = db.prepare(`SELECT ${PROFILE_COLUMNS} FROM local_profiles WHERE id = ?`);
  const selectByDetectKey = db.prepare(
    `SELECT ${PROFILE_COLUMNS} FROM local_profiles WHERE detect_key = ?`
  );
  const selectAll = db.prepare(`
    SELECT ${PROFILE_COLUMNS} FROM local_profiles
    ORDER BY sort_order ASC, name COLLATE NOCASE ASC
  `);
  const deleteProfile = db.prepare(`DELETE FROM local_profiles WHERE id = ?`);
  const updateHidden = db.prepare(
    `UPDATE local_profiles SET is_hidden = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  );
  const updateAvailable = db.prepare(
    `UPDATE local_profiles SET is_available = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  );
  const updateSortOrder = db.prepare(
    `UPDATE local_profiles SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  );

  const deleteEnvVars = db.prepare(`DELETE FROM local_profile_env_vars WHERE profile_id = ?`);
  const insertEnvVar = db.prepare(`
    INSERT INTO local_profile_env_vars (id, profile_id, name, value, is_enabled, sort_order)
    VALUES (@id, @profileId, @name, @value, @isEnabled, @sortOrder)
  `);
  const selectEnvVars = db.prepare(`
    SELECT name, value, is_enabled FROM local_profile_env_vars
    WHERE profile_id = ? ORDER BY sort_order ASC, name ASC
  `);

  function get(id: string): LocalProfileRecord | undefined {
    const row = selectById.get(id) as LocalProfileRow | undefined;
    return row ? mapRow(row) : undefined;
  }

  return {
    create(input: LocalProfileInput): LocalProfileRecord {
      upsertProfile.run({
        id: input.id,
        name: input.name,
        executable: input.executable,
        argsJson: JSON.stringify(input.args ?? []),
        startingDirectory: input.startingDirectory ?? null,
        icon: input.icon ?? "terminal",
        color: input.color ?? null,
        elevated: input.elevated ? 1 : 0,
        source: input.source ?? "user",
        detectKey: input.detectKey ?? null,
        isAvailable: input.isAvailable === false ? 0 : 1,
        isHidden: input.isHidden ? 1 : 0,
        sortOrder: input.sortOrder ?? 0
      });

      const created = get(input.id);
      if (!created) {
        throw new Error(`Local profile ${input.id} was not persisted`);
      }

      return created;
    },
    get,
    getByDetectKey(detectKey: string): LocalProfileRecord | undefined {
      const row = selectByDetectKey.get(detectKey) as LocalProfileRow | undefined;
      return row ? mapRow(row) : undefined;
    },
    list(): LocalProfileRecord[] {
      return (selectAll.all() as LocalProfileRow[]).map(mapRow);
    },
    remove(id: string): boolean {
      return deleteProfile.run(id).changes > 0;
    },
    setHidden(id: string, hidden: boolean): void {
      updateHidden.run(hidden ? 1 : 0, id);
    },
    setAvailable(id: string, available: boolean): void {
      updateAvailable.run(available ? 1 : 0, id);
    },
    reorder(items: Array<{ id: string; sortOrder: number }>): void {
      const run = db.transaction((rows: Array<{ id: string; sortOrder: number }>) => {
        for (const row of rows) {
          updateSortOrder.run(row.sortOrder, row.id);
        }
      });
      run(items);
    },
    listEnvVars(profileId: string): LocalProfileEnvVar[] {
      const rows = selectEnvVars.all(profileId) as Array<{
        name: string;
        value: string;
        is_enabled: number;
      }>;

      return rows.map((row) => ({
        name: row.name,
        value: row.value,
        isEnabled: row.is_enabled !== 0
      }));
    },
    replaceEnvVars(profileId: string, vars: LocalProfileEnvVar[]): void {
      const run = db.transaction((rows: LocalProfileEnvVar[]) => {
        deleteEnvVars.run(profileId);
        rows.forEach((row, index) => {
          insertEnvVar.run({
            id: `${profileId}:${index}:${row.name}`,
            profileId,
            name: row.name,
            value: row.value,
            isEnabled: row.isEnabled ? 1 : 0,
            sortOrder: index
          });
        });
      });
      run(vars);
    }
  };
}
```

- [ ] **Step 6: Export the repository**

In `packages/db/src/repositories/index.ts`, add:

```ts
export * from "./localProfilesRepository";
```

- [ ] **Step 7: Run the test**

Run: `pnpm exec vitest run packages/db/src/repositories/localProfilesRepository.test.ts`
Expected: PASS — 7 tests. If the only failure is the `NODE_MODULE_VERSION` ABI error, that is expected locally per Global Constraints; proceed and let CI verify.

- [ ] **Step 8: Commit**

```bash
git add packages/db/src/migrations/015_local_profiles.sql packages/db/src/repositories/localProfilesRepository.ts packages/db/src/repositories/localProfilesRepository.test.ts packages/db/src/index.ts packages/db/src/repositories/index.ts
git commit -m "feat(db): add local_profiles schema and repository"
```

---

### Task 6: Non-destructive reconciliation

**Files:**
- Create: `apps/desktop/src/main/localShells/reconcileLocalProfiles.ts`
- Create: `apps/desktop/src/main/localShells/reconcileLocalProfiles.test.ts`

**Interfaces:**
- Consumes: `DetectedShell` from `@hypershell/session-core`; `LocalProfileRecord` from `@hypershell/db`.
- Produces: `reconcileLocalProfiles(store, detected, createId) => ReconcileSummary { inserted: string[]; markedUnavailable: string[]; markedAvailable: string[] }` and the `LocalProfileStore` interface it needs — deliberately a narrow structural type so the test uses a plain fake and never touches SQLite.

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/src/main/localShells/reconcileLocalProfiles.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { reconcileLocalProfiles } from "./reconcileLocalProfiles";
import type { LocalProfileStore, StoredProfile } from "./reconcileLocalProfiles";
import type { DetectedShell } from "@hypershell/session-core";

function createFakeStore(initial: StoredProfile[] = []): LocalProfileStore & {
  rows: StoredProfile[];
} {
  const rows = [...initial];

  return {
    rows,
    list: () => rows.map((row) => ({ ...row })),
    create: (input) => {
      const row: StoredProfile = {
        id: input.id,
        name: input.name,
        executable: input.executable,
        detectKey: input.detectKey ?? null,
        source: "detected",
        isAvailable: true,
        isHidden: false,
        sortOrder: input.sortOrder ?? 0
      };
      rows.push(row);
      return row;
    },
    setAvailable: (id, available) => {
      const row = rows.find((candidate) => candidate.id === id);
      if (row) {
        row.isAvailable = available;
      }
    }
  };
}

const pwsh: DetectedShell = {
  detectKey: "pwsh7",
  name: "PowerShell",
  executable: "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
  args: [],
  icon: "powershell"
};

const cmd: DetectedShell = {
  detectKey: "cmd",
  name: "Command Prompt",
  executable: "C:\\Windows\\System32\\cmd.exe",
  args: [],
  icon: "cmd"
};

let counter = 0;
const createId = () => `generated-${(counter += 1)}`;

describe("reconcileLocalProfiles", () => {
  it("inserts a profile for each newly detected shell", () => {
    const store = createFakeStore();

    const summary = reconcileLocalProfiles(store, [pwsh, cmd], createId);

    expect(summary.inserted).toHaveLength(2);
    expect(store.rows.map((row) => row.detectKey).sort()).toEqual(["cmd", "pwsh7"]);
  });

  it("is idempotent — a second pass inserts nothing", () => {
    const store = createFakeStore();
    reconcileLocalProfiles(store, [pwsh], createId);

    const summary = reconcileLocalProfiles(store, [pwsh], createId);

    expect(summary.inserted).toEqual([]);
    expect(store.rows).toHaveLength(1);
  });

  it("never overwrites user edits to a detected profile", () => {
    const store = createFakeStore([
      {
        id: "existing",
        name: "My Renamed Shell",
        executable: "C:\\custom\\pwsh.exe",
        detectKey: "pwsh7",
        source: "detected",
        isAvailable: true,
        isHidden: false,
        sortOrder: 5
      }
    ]);

    reconcileLocalProfiles(store, [pwsh], createId);

    expect(store.rows[0]).toMatchObject({
      name: "My Renamed Shell",
      executable: "C:\\custom\\pwsh.exe",
      sortOrder: 5
    });
  });

  it("does not resurrect a hidden detected profile", () => {
    const store = createFakeStore([
      {
        id: "tombstoned",
        name: "Command Prompt",
        executable: "C:\\Windows\\System32\\cmd.exe",
        detectKey: "cmd",
        source: "detected",
        isAvailable: true,
        isHidden: true,
        sortOrder: 0
      }
    ]);

    const summary = reconcileLocalProfiles(store, [cmd], createId);

    expect(summary.inserted).toEqual([]);
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].isHidden).toBe(true);
  });

  it("marks a vanished shell unavailable instead of deleting it", () => {
    const store = createFakeStore();
    reconcileLocalProfiles(store, [pwsh, cmd], createId);

    const summary = reconcileLocalProfiles(store, [pwsh], createId);

    const cmdRow = store.rows.find((row) => row.detectKey === "cmd");
    expect(cmdRow?.isAvailable).toBe(false);
    expect(summary.markedUnavailable).toEqual([cmdRow?.id]);
    expect(store.rows).toHaveLength(2);
  });

  it("restores availability when a shell reappears", () => {
    const store = createFakeStore();
    reconcileLocalProfiles(store, [pwsh, cmd], createId);
    reconcileLocalProfiles(store, [pwsh], createId);

    const summary = reconcileLocalProfiles(store, [pwsh, cmd], createId);

    const cmdRow = store.rows.find((row) => row.detectKey === "cmd");
    expect(cmdRow?.isAvailable).toBe(true);
    expect(summary.markedAvailable).toEqual([cmdRow?.id]);
  });

  it("leaves user-created profiles completely alone", () => {
    const store = createFakeStore([
      {
        id: "mine",
        name: "Custom",
        executable: "C:\\tools\\my.exe",
        detectKey: null,
        source: "user",
        isAvailable: true,
        isHidden: false,
        sortOrder: 0
      }
    ]);

    const summary = reconcileLocalProfiles(store, [pwsh], createId);

    expect(summary.markedUnavailable).toEqual([]);
    expect(store.rows.find((row) => row.id === "mine")?.isAvailable).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run apps/desktop/src/main/localShells/reconcileLocalProfiles.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `reconcileLocalProfiles.ts`**

```ts
import type { LocalProfileIcon } from "@hypershell/shared";
import type { DetectedShell } from "@hypershell/session-core";

/** The narrow slice of the local profiles repository reconciliation needs. */
export type StoredProfile = {
  id: string;
  name: string;
  executable: string;
  detectKey: string | null;
  source: "user" | "detected";
  isAvailable: boolean;
  isHidden: boolean;
  sortOrder: number;
};

export interface LocalProfileStore {
  list(): StoredProfile[];
  create(input: {
    id: string;
    name: string;
    executable: string;
    args: string[];
    icon: LocalProfileIcon;
    source: "detected";
    detectKey: string;
    sortOrder: number;
  }): unknown;
  setAvailable(id: string, available: boolean): void;
}

export interface ReconcileSummary {
  inserted: string[];
  markedUnavailable: string[];
  markedAvailable: string[];
}

/**
 * Inserts rows for shells we have never seen, and flips availability for rows whose
 * shell appeared or vanished. Never mutates a user-editable field: a renamed or
 * recoloured detected profile survives every pass, and a hidden one is a tombstone
 * that must not be re-inserted.
 */
export function reconcileLocalProfiles(
  store: LocalProfileStore,
  detected: DetectedShell[],
  createId: () => string
): ReconcileSummary {
  const summary: ReconcileSummary = {
    inserted: [],
    markedUnavailable: [],
    markedAvailable: []
  };

  const existing = store.list();
  const byDetectKey = new Map(
    existing
      .filter((row) => row.detectKey !== null)
      .map((row) => [row.detectKey as string, row])
  );
  const detectedKeys = new Set(detected.map((shell) => shell.detectKey));
  let nextSortOrder = existing.reduce((max, row) => Math.max(max, row.sortOrder), 0);

  for (const shell of detected) {
    const row = byDetectKey.get(shell.detectKey);

    if (!row) {
      const id = createId();
      nextSortOrder += 1;
      store.create({
        id,
        name: shell.name,
        executable: shell.executable,
        args: shell.args,
        icon: shell.icon,
        source: "detected",
        detectKey: shell.detectKey,
        sortOrder: nextSortOrder
      });
      summary.inserted.push(id);
      continue;
    }

    if (!row.isAvailable) {
      store.setAvailable(row.id, true);
      summary.markedAvailable.push(row.id);
    }
  }

  for (const row of existing) {
    if (row.source !== "detected" || row.detectKey === null) {
      continue;
    }

    if (!detectedKeys.has(row.detectKey) && row.isAvailable) {
      store.setAvailable(row.id, false);
      summary.markedUnavailable.push(row.id);
    }
  }

  return summary;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run apps/desktop/src/main/localShells/reconcileLocalProfiles.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/localShells
git commit -m "feat(desktop): reconcile detected shells with stored local profiles"
```

---

### Task 7: Shared IPC contract

**Files:**
- Modify: `packages/shared/src/ipc/channels.ts`
- Modify: `packages/shared/src/ipc/schemas.ts`
- Create: `packages/shared/src/ipc/localProfileSchemas.test.ts`

**Interfaces:**
- Consumes: `transportSchema` (already widened in Task 2).
- Produces: `ipcChannels.localProfiles.{ list, upsert, remove, setHidden, reorder, rescan }`; schemas `localProfileIconSchema`, `localProfileEnvVarSchema`, `localProfileRecordSchema`, `upsertLocalProfileRequestSchema`, `removeLocalProfileRequestSchema`, `setLocalProfileHiddenRequestSchema`, `reorderLocalProfilesRequestSchema`; types `LocalProfileIcon`, `LocalProfileEnvVar`, `LocalProfileRecord`, `UpsertLocalProfileRequest`, `RemoveLocalProfileRequest`, `SetLocalProfileHiddenRequest`, `ReorderLocalProfilesRequest`.

- [ ] **Step 1: Add the channel names**

In `packages/shared/src/ipc/channels.ts`, add beside `serialProfileChannels`:

```ts
export const localProfileChannels = {
  list: "local-profiles:list",
  upsert: "local-profiles:upsert",
  remove: "local-profiles:remove",
  setHidden: "local-profiles:set-hidden",
  reorder: "local-profiles:reorder",
  rescan: "local-profiles:rescan"
} as const;
```

and register it in the exported `ipcChannels` object beside `serialProfiles: serialProfileChannels`:

```ts
  localProfiles: localProfileChannels,
```

- [ ] **Step 2: Write the failing schema test**

Create `packages/shared/src/ipc/localProfileSchemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  localProfileRecordSchema,
  openSessionRequestSchema,
  upsertLocalProfileRequestSchema
} from "./schemas";

describe("local profile schemas", () => {
  it("accepts a full profile record", () => {
    const parsed = localProfileRecordSchema.parse({
      id: "p1",
      name: "PowerShell",
      executable: "C:\\pwsh.exe",
      args: [],
      startingDirectory: null,
      icon: "powershell",
      color: null,
      elevated: false,
      source: "detected",
      detectKey: "pwsh7",
      isAvailable: true,
      isHidden: false,
      sortOrder: 1
    });

    expect(parsed.icon).toBe("powershell");
  });

  it("rejects an icon outside the fixed set", () => {
    expect(() =>
      localProfileRecordSchema.parse({
        id: "p1",
        name: "X",
        executable: "x.exe",
        args: [],
        startingDirectory: null,
        icon: "rocket",
        color: null,
        elevated: false,
        source: "user",
        detectKey: null,
        isAvailable: true,
        isHidden: false,
        sortOrder: 0
      })
    ).toThrow();
  });

  it("requires a non-empty executable on upsert", () => {
    expect(() =>
      upsertLocalProfileRequestSchema.parse({ id: "p1", name: "X", executable: "" })
    ).toThrow();
  });

  it("strips renderer-supplied executable from a local open-session request", () => {
    const parsed = openSessionRequestSchema.parse({
      transport: "local",
      profileId: "p1",
      cols: 80,
      rows: 24,
      localOptions: { executable: "C:\\evil.exe" }
    });

    expect("localOptions" in parsed).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm exec vitest run packages/shared/src/ipc/localProfileSchemas.test.ts`
Expected: FAIL — the schemas do not exist yet.

- [ ] **Step 4: Add the schemas**

Append to `packages/shared/src/ipc/schemas.ts`, after the serial profile schemas section:

`localProfileIconSchema` and the `LocalProfileIcon` type already exist from Task 2 — reuse
them, do not redeclare.

```ts
// --- Local shell profile schemas ---

export const localProfileEnvVarSchema = z.object({
  name: z.string().regex(ENV_VAR_NAME_REGEX),
  value: z.string(),
  isEnabled: z.boolean()
});

export const localProfileRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  executable: z.string().min(1),
  args: z.array(z.string()),
  startingDirectory: z.string().nullable(),
  icon: localProfileIconSchema,
  color: z.string().nullable(),
  elevated: z.boolean(),
  source: z.enum(["user", "detected"]),
  detectKey: z.string().nullable(),
  isAvailable: z.boolean(),
  isHidden: z.boolean(),
  sortOrder: z.number().int()
});

export const upsertLocalProfileRequestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  executable: z.string().min(1),
  args: z.array(z.string()).optional(),
  startingDirectory: z.string().nullable().optional(),
  icon: localProfileIconSchema.optional(),
  color: z.string().nullable().optional(),
  elevated: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  envVars: z.array(localProfileEnvVarSchema).optional()
});

export const removeLocalProfileRequestSchema = z.object({
  id: z.string().min(1)
});

export const setLocalProfileHiddenRequestSchema = z.object({
  id: z.string().min(1),
  hidden: z.boolean()
});

export const reorderLocalProfilesRequestSchema = z.object({
  items: z.array(z.object({ id: z.string().min(1), sortOrder: z.number().int() }))
});

export type LocalProfileEnvVar = z.infer<typeof localProfileEnvVarSchema>;
export type LocalProfileRecord = z.infer<typeof localProfileRecordSchema>;
export type UpsertLocalProfileRequest = z.infer<typeof upsertLocalProfileRequestSchema>;
export type RemoveLocalProfileRequest = z.infer<typeof removeLocalProfileRequestSchema>;
export type SetLocalProfileHiddenRequest = z.infer<typeof setLocalProfileHiddenRequestSchema>;
export type ReorderLocalProfilesRequest = z.infer<typeof reorderLocalProfilesRequestSchema>;
```

`ENV_VAR_NAME_REGEX` is already exported from this package — import it at the top of the file if it is not already in scope.

- [ ] **Step 5: Enforce the security boundary in `openSessionRequestSchema`**

`openSessionRequestSchema` is defined at `packages/shared/src/ipc/schemas.ts:31`. Zod object schemas strip unknown keys by default, but `localOptions` must not become a known key on this schema — deliberately **do not add it**. The `localOptions` field exists only on the main-process-internal `OpenSessionInput` type from `session-core`.

Confirm the schema does not use `.passthrough()`. If it does, remove that call so unknown keys are stripped.

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm exec vitest run packages/shared/src/ipc/localProfileSchemas.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/ipc/channels.ts packages/shared/src/ipc/schemas.ts packages/shared/src/ipc/localProfileSchemas.test.ts
git commit -m "feat(shared): add local profile IPC contract"
```

---

### Task 8: Main-process IPC handlers

**Files:**
- Create: `apps/desktop/src/main/ipc/localProfilesIpc.ts`
- Modify: `apps/desktop/src/main/ipc/registerIpc.ts`

**Interfaces:**
- Consumes: repository from Task 5, `reconcileLocalProfiles` from Task 6, `detectLocalShells` + `createDefaultProbes` from Task 4, schemas from Task 7.
- Produces: `registerLocalProfilesIpc(ipcMain, getRepo)`; a `resolveLocalProfile(profileId)` path inside `openSessionHandler` that returns `LocalConnectionOptions`.

- [ ] **Step 1: Create the handler module**

Create `apps/desktop/src/main/ipc/localProfilesIpc.ts`:

```ts
import { randomUUID } from "node:crypto";
import {
  ipcChannels,
  removeLocalProfileRequestSchema,
  reorderLocalProfilesRequestSchema,
  setLocalProfileHiddenRequestSchema,
  upsertLocalProfileRequestSchema,
  type LocalProfileRecord
} from "@hypershell/shared";
import { createDefaultProbes, detectLocalShells } from "@hypershell/session-core";
import type { createLocalProfilesRepositoryFromDatabase } from "@hypershell/db";
import { reconcileLocalProfiles } from "../localShells/reconcileLocalProfiles";
import type { IpcMainLike } from "./registerIpc";

type LocalProfilesRepo = ReturnType<typeof createLocalProfilesRepositoryFromDatabase>;

function toRecord(profile: ReturnType<LocalProfilesRepo["list"]>[number]): LocalProfileRecord {
  return {
    id: profile.id,
    name: profile.name,
    executable: profile.executable,
    args: profile.args,
    startingDirectory: profile.startingDirectory,
    icon: profile.icon,
    color: profile.color,
    elevated: profile.elevated,
    source: profile.source,
    detectKey: profile.detectKey,
    isAvailable: profile.isAvailable,
    isHidden: profile.isHidden,
    sortOrder: profile.sortOrder
  };
}

/** Runs detection and folds the result into the store. Safe to call repeatedly. */
export function runLocalShellDetection(repo: LocalProfilesRepo): void {
  const detected = detectLocalShells(createDefaultProbes());
  reconcileLocalProfiles(repo, detected, () => randomUUID());
}

export function registerLocalProfilesIpc(
  ipcMain: IpcMainLike,
  getRepo: () => LocalProfilesRepo
): void {
  ipcMain.handle(ipcChannels.localProfiles.list, async (): Promise<LocalProfileRecord[]> => {
    return getRepo().list().map(toRecord);
  });

  ipcMain.handle(
    ipcChannels.localProfiles.upsert,
    async (_event: unknown, request: unknown): Promise<LocalProfileRecord> => {
      const parsed = upsertLocalProfileRequestSchema.parse(request);
      const repo = getRepo();
      const existing = repo.get(parsed.id);

      const created = repo.create({
        id: parsed.id,
        name: parsed.name,
        executable: parsed.executable,
        args: parsed.args ?? existing?.args ?? [],
        startingDirectory: parsed.startingDirectory ?? existing?.startingDirectory ?? null,
        icon: parsed.icon ?? existing?.icon ?? "terminal",
        color: parsed.color ?? existing?.color ?? null,
        elevated: parsed.elevated ?? existing?.elevated ?? false,
        // Source and detect key are owned by detection, never by the renderer.
        source: existing?.source ?? "user",
        detectKey: existing?.detectKey ?? null,
        isAvailable: existing?.isAvailable ?? true,
        isHidden: existing?.isHidden ?? false,
        sortOrder: parsed.sortOrder ?? existing?.sortOrder ?? 0
      });

      if (parsed.envVars) {
        repo.replaceEnvVars(parsed.id, parsed.envVars);
      }

      return toRecord(created);
    }
  );

  ipcMain.handle(
    ipcChannels.localProfiles.remove,
    async (_event: unknown, request: unknown): Promise<void> => {
      const parsed = removeLocalProfileRequestSchema.parse(request);
      const repo = getRepo();
      const existing = repo.get(parsed.id);

      if (!existing) {
        return;
      }

      // Deleting a detected profile outright would let the next detection pass
      // re-insert it, so hide it instead — the tombstone reconciliation respects.
      if (existing.source === "detected") {
        repo.setHidden(parsed.id, true);
        return;
      }

      repo.remove(parsed.id);
    }
  );

  ipcMain.handle(
    ipcChannels.localProfiles.setHidden,
    async (_event: unknown, request: unknown): Promise<void> => {
      const parsed = setLocalProfileHiddenRequestSchema.parse(request);
      getRepo().setHidden(parsed.id, parsed.hidden);
    }
  );

  ipcMain.handle(
    ipcChannels.localProfiles.reorder,
    async (_event: unknown, request: unknown): Promise<void> => {
      const parsed = reorderLocalProfilesRequestSchema.parse(request);
      getRepo().reorder(parsed.items);
    }
  );

  ipcMain.handle(ipcChannels.localProfiles.rescan, async (): Promise<LocalProfileRecord[]> => {
    const repo = getRepo();
    runLocalShellDetection(repo);
    return repo.list().map(toRecord);
  });
}
```

- [ ] **Step 2: Wire it into `registerIpc.ts`**

Add the import beside `registerSerialProfilesIpc` (line 45):

```ts
import { registerLocalProfilesIpc, runLocalShellDetection } from "./localProfilesIpc";
```

Add to the `registeredChannels` array beside the `serialProfiles` entries (line 129):

```ts
  ipcChannels.localProfiles.list,
  ipcChannels.localProfiles.upsert,
  ipcChannels.localProfiles.remove,
  ipcChannels.localProfiles.setHidden,
  ipcChannels.localProfiles.reorder,
  ipcChannels.localProfiles.rescan,
```

Create the repository beside `serialProfilesRepo` (line 320):

```ts
const localProfilesRepo = createLocalProfilesRepository();
```

importing `createLocalProfilesRepository` from `@hypershell/db` alongside the existing repository imports. Then register the handlers and run first-boot detection beside `registerSerialProfilesIpc` (line 1407):

```ts
  registerLocalProfilesIpc(ipcMain, () => localProfilesRepo);
  runLocalShellDetection(localProfilesRepo);
```

Detection runs here, during IPC registration, so the first renderer `list` call already sees a reconciled table.

- [ ] **Step 3: Resolve local profiles in `openSessionHandler`**

`openSessionHandler` starts at `registerIpc.ts:465`. Add a `local` branch after the existing `ssh` branch, and thread the result into the `manager.open(...)` call at the end of the function:

```ts
  let localOptions:
    | { executable: string; args?: string[]; cwd?: string; envVars?: Record<string, string> }
    | undefined;

  if (parsed.transport === "local") {
    const profile = resolveLocalProfile?.(parsed.profileId);

    if (!profile) {
      throw new Error(`Unknown local profile: ${parsed.profileId}`);
    }

    if (!profile.isAvailable) {
      throw new Error(`Local shell is not available: ${profile.name}`);
    }

    localOptions = {
      executable: profile.executable,
      args: profile.args,
      cwd: profile.startingDirectory ?? undefined,
      envVars: profile.envVars
    };
  }
```

Add `resolveLocalProfile` as a fifth parameter to `openSessionHandler`, mirroring `resolveSerialProfile`:

```ts
  resolveLocalProfile?: (profileId: string) =>
    | {
        name: string;
        executable: string;
        args: string[];
        startingDirectory: string | null;
        isAvailable: boolean;
        envVars?: Record<string, string>;
      }
    | undefined
```

and pass `localOptions` into `manager.open({ ... })` alongside the existing `serialOptions` / `telnetOptions`.

At the two call sites (lines 1317 and 1582) pass the resolver:

```ts
    (id: string) => {
      const profile = localProfilesRepo.get(id);
      if (!profile) {
        return undefined;
      }

      const envVars = Object.fromEntries(
        localProfilesRepo
          .listEnvVars(id)
          .filter((entry) => entry.isEnabled)
          .map((entry) => [entry.name, entry.value])
      );

      return {
        name: profile.name,
        executable: profile.executable,
        args: profile.args,
        startingDirectory: profile.startingDirectory,
        isAvailable: profile.isAvailable,
        envVars
      };
    }
```

- [ ] **Step 4: Build the desktop workspace**

Run: `pnpm --filter @hypershell/desktop build`
Expected: PASS with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/ipc/localProfilesIpc.ts apps/desktop/src/main/ipc/registerIpc.ts
git commit -m "feat(desktop): add local profile IPC handlers and session resolution"
```

---

### Task 9: Preload bridge

**Files:**
- Create: `apps/desktop/src/preload/api/localApi.ts`
- Modify: `apps/desktop/src/preload/desktopApi.ts`
- Modify: `apps/ui/src/types/global.d.ts`

**Interfaces:**
- Consumes: schemas and channels from Task 7.
- Produces: `LocalApi { listLocalProfiles, upsertLocalProfile, removeLocalProfile, setLocalProfileHidden, reorderLocalProfiles, rescanLocalProfiles }`, merged into `DesktopApi` and declared on `window.hypershell`.

- [ ] **Step 1: Create the preload slice**

Create `apps/desktop/src/preload/api/localApi.ts`:

```ts
import {
  ipcChannels,
  localProfileRecordSchema,
  removeLocalProfileRequestSchema,
  reorderLocalProfilesRequestSchema,
  setLocalProfileHiddenRequestSchema,
  upsertLocalProfileRequestSchema,
  type LocalProfileRecord,
  type RemoveLocalProfileRequest,
  type ReorderLocalProfilesRequest,
  type SetLocalProfileHiddenRequest,
  type UpsertLocalProfileRequest
} from "@hypershell/shared";
import { z } from "zod";
import type { PreloadIpcRenderer, PreloadLogger } from "./types";

export interface LocalApi {
  listLocalProfiles(): Promise<LocalProfileRecord[]>;
  upsertLocalProfile(request: UpsertLocalProfileRequest): Promise<LocalProfileRecord>;
  removeLocalProfile(request: RemoveLocalProfileRequest): Promise<void>;
  setLocalProfileHidden(request: SetLocalProfileHiddenRequest): Promise<void>;
  reorderLocalProfiles(request: ReorderLocalProfilesRequest): Promise<void>;
  rescanLocalProfiles(): Promise<LocalProfileRecord[]>;
}

const localProfileRecordArraySchema = z.array(localProfileRecordSchema);

export function createLocalApi(
  ipcRenderer: PreloadIpcRenderer,
  _logger: PreloadLogger
): LocalApi {
  return {
    async listLocalProfiles(): Promise<LocalProfileRecord[]> {
      const result = await ipcRenderer.invoke(ipcChannels.localProfiles.list);
      return localProfileRecordArraySchema.parse(result);
    },
    async upsertLocalProfile(request: UpsertLocalProfileRequest): Promise<LocalProfileRecord> {
      const parsed = upsertLocalProfileRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.localProfiles.upsert, parsed);
      return localProfileRecordSchema.parse(result);
    },
    async removeLocalProfile(request: RemoveLocalProfileRequest): Promise<void> {
      const parsed = removeLocalProfileRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.localProfiles.remove, parsed);
    },
    async setLocalProfileHidden(request: SetLocalProfileHiddenRequest): Promise<void> {
      const parsed = setLocalProfileHiddenRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.localProfiles.setHidden, parsed);
    },
    async reorderLocalProfiles(request: ReorderLocalProfilesRequest): Promise<void> {
      const parsed = reorderLocalProfilesRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.localProfiles.reorder, parsed);
    },
    async rescanLocalProfiles(): Promise<LocalProfileRecord[]> {
      const result = await ipcRenderer.invoke(ipcChannels.localProfiles.rescan);
      return localProfileRecordArraySchema.parse(result);
    }
  };
}
```

- [ ] **Step 2: Merge the slice into `desktopApi.ts`**

Add the import, extend the `DesktopApi` interface with `LocalApi`, and spread `...createLocalApi(ipcRenderer, logger),` into the returned object — following the exact pattern used by `createSerialApi`.

- [ ] **Step 3: Declare it on `window.hypershell`**

In `apps/ui/src/types/global.d.ts`, add to the `hypershell` interface:

```ts
    listLocalProfiles?(): Promise<LocalProfileRecord[]>;
    upsertLocalProfile?(request: UpsertLocalProfileRequest): Promise<LocalProfileRecord>;
    removeLocalProfile?(request: { id: string }): Promise<void>;
    setLocalProfileHidden?(request: { id: string; hidden: boolean }): Promise<void>;
    reorderLocalProfiles?(request: {
      items: Array<{ id: string; sortOrder: number }>;
    }): Promise<void>;
    rescanLocalProfiles?(): Promise<LocalProfileRecord[]>;
```

Import `LocalProfileRecord` and `UpsertLocalProfileRequest` from `@hypershell/shared` at the top of the file, matching how existing record types are imported there. Methods are optional (`?`) to match the file's existing convention for bridge methods.

- [ ] **Step 4: Build**

Run: `pnpm --filter @hypershell/desktop build && pnpm --filter @hypershell/ui build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/preload/api/localApi.ts apps/desktop/src/preload/desktopApi.ts apps/ui/src/types/global.d.ts
git commit -m "feat(preload): expose local profile API to the renderer"
```

---

### Task 10: Renderer store and icons

**Files:**
- Create: `apps/ui/src/features/local/localProfilesStore.ts`
- Create: `apps/ui/src/features/local/localProfilesStore.test.ts`
- Create: `apps/ui/src/features/local/LocalProfileIcon.tsx`

**Interfaces:**
- Consumes: `window.hypershell.listLocalProfiles` etc. from Task 9.
- Produces: `localProfilesStore` (Zustand vanilla store) with state `{ profiles, loading, load(), save(input), remove(id), setHidden(id, hidden), reorder(items), rescan() }` and the selector `selectLaunchableProfiles(profiles)`; `<LocalProfileIcon icon={...} className={...} />`.

- [ ] **Step 1: Write the failing store test**

Create `apps/ui/src/features/local/localProfilesStore.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { localProfilesStore, selectLaunchableProfiles } from "./localProfilesStore";
import type { LocalProfileRecord } from "@hypershell/shared";

function profile(overrides: Partial<LocalProfileRecord> = {}): LocalProfileRecord {
  return {
    id: "p1",
    name: "PowerShell",
    executable: "pwsh.exe",
    args: [],
    startingDirectory: null,
    icon: "powershell",
    color: null,
    elevated: false,
    source: "detected",
    detectKey: "pwsh7",
    isAvailable: true,
    isHidden: false,
    sortOrder: 1,
    ...overrides
  };
}

describe("selectLaunchableProfiles", () => {
  it("keeps available, visible profiles", () => {
    expect(selectLaunchableProfiles([profile()])).toHaveLength(1);
  });

  it("drops hidden profiles", () => {
    expect(selectLaunchableProfiles([profile({ isHidden: true })])).toEqual([]);
  });

  it("drops unavailable profiles", () => {
    expect(selectLaunchableProfiles([profile({ isAvailable: false })])).toEqual([]);
  });
});

describe("localProfilesStore", () => {
  beforeEach(() => {
    localProfilesStore.setState({ profiles: [], loading: false });
  });

  it("loads profiles from the bridge", async () => {
    const listLocalProfiles = vi.fn().mockResolvedValue([profile()]);
    vi.stubGlobal("window", { hypershell: { listLocalProfiles } });

    await localProfilesStore.getState().load();

    expect(localProfilesStore.getState().profiles).toHaveLength(1);
    expect(localProfilesStore.getState().loading).toBe(false);
  });

  it("leaves state empty when the bridge is unavailable", async () => {
    vi.stubGlobal("window", { hypershell: {} });

    await localProfilesStore.getState().load();

    expect(localProfilesStore.getState().profiles).toEqual([]);
  });

  it("reloads after a save", async () => {
    const listLocalProfiles = vi.fn().mockResolvedValue([profile({ name: "Renamed" })]);
    const upsertLocalProfile = vi.fn().mockResolvedValue(profile({ name: "Renamed" }));
    vi.stubGlobal("window", { hypershell: { listLocalProfiles, upsertLocalProfile } });

    await localProfilesStore
      .getState()
      .save({ id: "p1", name: "Renamed", executable: "pwsh.exe" });

    expect(upsertLocalProfile).toHaveBeenCalled();
    expect(localProfilesStore.getState().profiles[0].name).toBe("Renamed");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @hypershell/ui exec vitest run src/features/local/localProfilesStore.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the store**

```ts
import { createStore } from "zustand/vanilla";
import type {
  LocalProfileRecord,
  UpsertLocalProfileRequest
} from "@hypershell/shared";

export type LocalProfilesState = {
  profiles: LocalProfileRecord[];
  loading: boolean;
  load: () => Promise<void>;
  save: (input: UpsertLocalProfileRequest) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setHidden: (id: string, hidden: boolean) => Promise<void>;
  reorder: (items: Array<{ id: string; sortOrder: number }>) => Promise<void>;
  rescan: () => Promise<void>;
};

/** Profiles the user can actually launch — hidden and missing shells are excluded. */
export function selectLaunchableProfiles(
  profiles: LocalProfileRecord[]
): LocalProfileRecord[] {
  return profiles.filter((profile) => !profile.isHidden && profile.isAvailable);
}

export const localProfilesStore = createStore<LocalProfilesState>()((set, get) => ({
  profiles: [],
  loading: false,

  load: async () => {
    const list = window.hypershell?.listLocalProfiles;
    if (!list) {
      return;
    }

    set({ loading: true });
    try {
      set({ profiles: await list(), loading: false });
    } catch {
      set({ loading: false });
    }
  },

  save: async (input) => {
    await window.hypershell?.upsertLocalProfile?.(input);
    await get().load();
  },

  remove: async (id) => {
    await window.hypershell?.removeLocalProfile?.({ id });
    await get().load();
  },

  setHidden: async (id, hidden) => {
    await window.hypershell?.setLocalProfileHidden?.({ id, hidden });
    await get().load();
  },

  reorder: async (items) => {
    await window.hypershell?.reorderLocalProfiles?.({ items });
    await get().load();
  },

  rescan: async () => {
    const profiles = await window.hypershell?.rescanLocalProfiles?.();
    if (profiles) {
      set({ profiles });
    }
  }
}));
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @hypershell/ui exec vitest run src/features/local/localProfilesStore.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Create the icon component**

Create `apps/ui/src/features/local/LocalProfileIcon.tsx`. Five inline SVGs keyed by the fixed icon set — the codebase has no icon library, so these are hand-written paths at `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, `strokeWidth={1.5}`:

```tsx
import type { LocalProfileIcon as LocalProfileIconKey } from "@hypershell/shared";

interface LocalProfileIconProps {
  icon: LocalProfileIconKey;
  className?: string;
}

const PATHS: Record<LocalProfileIconKey, string> = {
  // Chevron + underscore — the PowerShell prompt.
  powershell: "M5 6l5 6-5 6M13 18h6",
  // Filled window with a caret.
  cmd: "M3 5h18v14H3zM7 10l2.5 2L7 14M12 15h5",
  // Simple penguin silhouette.
  linux: "M12 3c2.2 0 3.5 1.8 3.5 4 0 1.6.6 2.4 1.6 3.6C18.4 12.2 19 13.5 19 15c0 3-3 5-7 5s-7-2-7-5c0-1.5.6-2.8 1.9-4.4C7.9 9.4 8.5 8.6 8.5 7c0-2.2 1.3-4 3.5-4z",
  // Dollar prompt.
  bash: "M4 5h16v14H4zM9 15c.8.7 1.9 1 3 1 1.7 0 3-.8 3-2s-1.3-1.6-3-2-3-.8-3-2 1.3-2 3-2c1.1 0 2.2.3 3 1M12 6v12",
  // Generic terminal window.
  terminal: "M3 5h18v14H3zM7 10l3 2-3 2M13 14h4"
};

export function LocalProfileIcon({ icon, className }: LocalProfileIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={PATHS[icon]} />
    </svg>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/ui/src/features/local/localProfilesStore.ts apps/ui/src/features/local/localProfilesStore.test.ts apps/ui/src/features/local/LocalProfileIcon.tsx
git commit -m "feat(ui): add local profiles store and icons"
```

---

### Task 11: Sidebar section

**Files:**
- Create: `apps/ui/src/features/sidebar/SidebarLocalList.tsx`
- Modify: `apps/ui/src/features/sidebar/Sidebar.tsx`
- Modify: `apps/ui/src/features/settings/settingsStore.ts`
- Modify: `apps/ui/src/app/App.tsx`

**Interfaces:**
- Consumes: `localProfilesStore`, `selectLaunchableProfiles`, `LocalProfileIcon` from Task 10.
- Produces: `SidebarLocalList` props `{ profiles, onConnect, onEdit, onNew, onRescan, onToggleHidden, showHidden, onToggleShowHidden }`; `Sidebar` gains `localProfiles`, `onConnectLocal`, `onEditLocal`, `onNewLocal`, `onRescanLocal`; settings gain `general.showLocalInSidebar` (default `true`); `App.tsx` gains `handleConnectLocal(profile)`.

- [ ] **Step 1: Add the setting**

In `apps/ui/src/features/settings/settingsStore.ts`, add `showLocalInSidebar: true` to the `general` defaults immediately after `showSerialInSidebar`, and add the matching field to the general settings type.

- [ ] **Step 2: Create `SidebarLocalList.tsx`**

Model it on `SidebarSerialList.tsx` — same section chrome, same row markup, same hover affordances. Each row renders `<LocalProfileIcon icon={profile.icon} className="h-3.5 w-3.5" />`, the profile name, and a colour dot when `profile.color` is set. Rows for `profile.isAvailable === false` render with `opacity-50`, `aria-disabled="true"`, and no click handler. The section header carries two overflow actions: **Rescan** (calls `onRescan`) and **Show hidden** (toggles `showHidden`). When `showHidden` is on, hidden profiles appear with a "hidden" badge and an un-hide action.

Rows are draggable, persisting order through `onReorder` exactly as `SidebarHostList` does.

- [ ] **Step 3: Mount the section in `Sidebar.tsx`**

Add the new props to `SidebarProps` and the destructured parameter list, read the setting:

```tsx
  const showLocalInSidebar = useStore(
    settingsStore,
    (s) => s.settings.general.showLocalInSidebar
  );
```

and render `<SidebarLocalList ... />` inside a `<SidebarSection title="Local">` above the Hosts section when `showLocalInSidebar` is true.

- [ ] **Step 4: Wire the connect handler in `App.tsx`**

Load profiles on mount:

```tsx
  useEffect(() => {
    void localProfilesStore.getState().load();
  }, []);
```

and add the handler that opens a tab, following the existing `handleConnectSerial`:

```tsx
  const handleConnectLocal = useCallback((profile: LocalProfileRecord) => {
    layoutStore.getState().openTab({
      sessionId: `local-${profile.id}-${Date.now()}`,
      title: profile.name,
      transport: "local",
      profileId: profile.id,
      type: "terminal"
    });
  }, []);
```

- [ ] **Step 5: Verify in the running app**

Run: `pnpm --filter @hypershell/desktop build && pnpm --filter @hypershell/desktop start`
Expected: the sidebar shows a **Local** section listing Windows PowerShell, PowerShell, Command Prompt, and every WSL distro. Clicking PowerShell opens a working shell.

**Acceptance check (both required):**

1. Open the **PowerShell** profile and confirm it loaded your own `$PROFILE` — the prompt and aliases from `Documents\PowerShell\Microsoft.PowerShell_profile.ps1` must be present. If the prompt is bare, the profile was skipped: check that the profile row's `args` is `[]`. Note that the separate **Windows PowerShell** (5.1) entry reads `Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1`, a different file — a bare prompt there is correct, not a defect.
2. Open a **WSL** profile and confirm `.bashrc` loaded (run `alias` and check your own aliases appear). If the WSL section is missing entirely, the UTF-16LE decode in `parseWslDistros` is the first thing to check.

- [ ] **Step 6: Commit**

```bash
git add apps/ui/src/features/sidebar/SidebarLocalList.tsx apps/ui/src/features/sidebar/Sidebar.tsx apps/ui/src/features/settings/settingsStore.ts apps/ui/src/app/App.tsx
git commit -m "feat(ui): add local shells sidebar section"
```

---

### Task 12: Terminal pane wiring and exit behavior

**Files:**
- Modify: `apps/ui/src/features/terminal/terminalSessionModel.ts:77-112`
- Modify: `apps/ui/src/features/terminal/terminalSessionModel.test.ts`
- Modify: `apps/ui/src/features/terminal/useTerminalSession.ts:28`
- Modify: `apps/ui/src/features/terminal/TerminalPane.tsx:10-19`
- Modify: `apps/ui/src/features/layout/layoutStore.ts:6`
- Modify: `apps/ui/src/features/layout/Workspace.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `SessionEventEffect.exitCode?: number | null`; `UseTerminalSessionInput.transport` and `TerminalPaneProps.transport` include `"local"`; `TerminalPaneProps.onProcessExit?: (exitCode: number | null) => void`; `LayoutTab.transport` includes `"local"`.

- [ ] **Step 1: Write the failing test**

Add to `apps/ui/src/features/terminal/terminalSessionModel.test.ts`:

```ts
  it("surfaces the exit code on an exit event", () => {
    const effect = mapSessionEvent("session-1", {
      type: "exit",
      sessionId: "session-1",
      exitCode: 0
    });

    expect(effect.state).toBe("disconnected");
    expect(effect.clearSessionId).toBe(true);
    expect(effect.exitCode).toBe(0);
  });

  it("surfaces a non-zero exit code", () => {
    const effect = mapSessionEvent("session-1", {
      type: "exit",
      sessionId: "session-1",
      exitCode: 1
    });

    expect(effect.exitCode).toBe(1);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @hypershell/ui exec vitest run src/features/terminal/terminalSessionModel.test.ts`
Expected: FAIL — `expected undefined to be 0`.

- [ ] **Step 3: Carry the exit code through**

In `terminalSessionModel.ts`, add `exitCode?: number | null;` to `SessionEventEffect` and return it from the exit branch:

```ts
  if (event.type === "exit") {
    return {
      handled: true,
      state: "disconnected",
      clearSessionId: true,
      exitCode: event.exitCode
    };
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @hypershell/ui exec vitest run src/features/terminal/terminalSessionModel.test.ts`
Expected: PASS.

- [ ] **Step 5: Add `"local"` to the transport unions and thread `onProcessExit`**

- `useTerminalSession.ts:28` — `transport: "ssh" | "serial" | "telnet" | "local";` and add `onExit?: (exitCode: number | null) => void;` to `UseTerminalSessionInput`. In the session-event handler, after applying the effect, call `input.onExit?.(effect.exitCode ?? null)` when `effect.exitCode !== undefined`.
- `TerminalPane.tsx:11` — same union widening, plus `onProcessExit?: (exitCode: number | null) => void;` on `TerminalPaneProps`, passed through as `onExit` to `useTerminalSession`.
- `layoutStore.ts:6` — `transport?: "ssh" | "serial" | "sftp" | "telnet" | "local";`

- [ ] **Step 6: Close the tab on a clean exit**

In `Workspace.tsx`, where `<TerminalPane ... />` is rendered, add:

```tsx
                      onProcessExit={(exitCode) => {
                        // Clean exit closes the tab so `exit` feels native; a failure
                        // keeps it open so the exit code stays readable.
                        if (tab.transport === "local" && exitCode === 0) {
                          closeTab(tab.sessionId);
                        }
                      }}
```

- [ ] **Step 7: Verify manually**

Run: `pnpm --filter @hypershell/desktop build && pnpm --filter @hypershell/desktop start`
Expected: open a Command Prompt profile, type `exit` → the tab closes. Open it again, run `cmd /c exit 3` then `exit`… simpler check: run `exit 3` in cmd → the tab stays open showing the disconnected state.

- [ ] **Step 8: Commit**

```bash
git add apps/ui/src/features/terminal apps/ui/src/features/layout/layoutStore.ts apps/ui/src/features/layout/Workspace.tsx
git commit -m "feat(ui): close local shell tabs on clean exit"
```

---

### Task 13: New-tab menu, command palette, welcome chips

**Files:**
- Create: `apps/ui/src/features/layout/NewTabMenu.tsx`
- Modify: `apps/ui/src/features/layout/TabBar.tsx`
- Modify: `apps/ui/src/features/command-palette/CommandPalette.tsx`
- Modify: `apps/ui/src/features/welcome/WelcomeScreen.tsx`
- Create: `apps/ui/tests/local-profiles.spec.ts`

**Interfaces:**
- Consumes: `localProfilesStore`, `selectLaunchableProfiles`, `LocalProfileIcon`, and the `handleConnectLocal` callback from Task 11.
- Produces: `NewTabMenu` props `{ profiles, onSelect }`.

- [ ] **Step 1: Create `NewTabMenu.tsx`**

A dropdown anchored to the `+` button. Structure and behavior:

```tsx
import { useEffect, useRef } from "react";
import type { LocalProfileRecord } from "@hypershell/shared";
import { LocalProfileIcon } from "../local/LocalProfileIcon";

interface NewTabMenuProps {
  profiles: LocalProfileRecord[];
  onSelect: (profile: LocalProfileRecord) => void;
  onClose: () => void;
}

export function NewTabMenu({ profiles, onSelect, onClose }: NewTabMenuProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [onClose]);

  return (
    <div
      ref={containerRef}
      role="menu"
      aria-label="New tab"
      className="absolute right-0 top-full z-50 mt-1 min-w-48 rounded-md border border-border/60 bg-base-800 py-1 shadow-lg"
    >
      {profiles.map((profile) => (
        <button
          key={profile.id}
          role="menuitem"
          type="button"
          onClick={() => {
            onSelect(profile);
            onClose();
          }}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-text-secondary hover:bg-base-700 hover:text-text-primary"
        >
          <LocalProfileIcon icon={profile.icon} className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{profile.name}</span>
        </button>
      ))}
    </div>
  );
}
```

Arrow-key movement between items comes from the browser's default focus order here; if the axe check in Step 6 flags roving focus, add explicit `ArrowDown`/`ArrowUp` handling that moves focus between the `menuitem` buttons.

- [ ] **Step 2: Mount it in `TabBar.tsx`**

Replace the `+` button's direct click handler with a toggle that opens `NewTabMenu` when at least one local profile is launchable; when none are, keep the existing behavior so nothing regresses on a machine with no detected shells.

- [ ] **Step 3: Add command palette entries**

In `CommandPalette.tsx`, add one command per launchable profile, `id: \`local:${profile.id}\``, title `Open local shell: ${profile.name}`, invoking the same connect handler.

- [ ] **Step 4: Add welcome chips**

In `WelcomeScreen.tsx`, render a row of profile chips below the existing quick-connect form — icon plus name, clicking opens the shell. Render nothing when the launchable list is empty.

- [ ] **Step 5: Write the browser E2E test**

Create `apps/ui/tests/local-profiles.spec.ts`, following the existing specs in that directory for setup and the `window.hypershell` stub pattern:

```ts
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const profiles = [
  {
    id: "p1",
    name: "PowerShell",
    executable: "pwsh.exe",
    args: [],
    startingDirectory: null,
    icon: "powershell",
    color: null,
    elevated: false,
    source: "detected",
    detectKey: "pwsh7",
    isAvailable: true,
    isHidden: false,
    sortOrder: 1
  },
  {
    id: "p2",
    name: "Gone Shell",
    executable: "missing.exe",
    args: [],
    startingDirectory: null,
    icon: "terminal",
    color: null,
    elevated: false,
    source: "detected",
    detectKey: "gone",
    isAvailable: false,
    isHidden: false,
    sortOrder: 2
  }
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript((seed) => {
    (window as unknown as { hypershell: unknown }).hypershell = {
      listLocalProfiles: async () => seed,
      rescanLocalProfiles: async () => seed
    };
  }, profiles);
});

test("lists local profiles in the sidebar", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("button", { name: "PowerShell" })).toBeVisible();
});

test("marks an unavailable profile as disabled", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Gone Shell")).toHaveAttribute("aria-disabled", "true");
});

test("the new-tab menu lists launchable profiles only", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /new tab/i }).click();

  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: "PowerShell" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Gone Shell" })).toHaveCount(0);
});

test("local profile surfaces have no accessibility violations", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /new tab/i }).click();

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
```

- [ ] **Step 6: Run the browser E2E suite**

Run: `pnpm --filter @hypershell/ui test:e2e`
Expected: PASS. Adjust the selectors above to match the accessible names your components actually expose — do not weaken an assertion to make it pass.

- [ ] **Step 7: Commit**

```bash
git add apps/ui/src/features/layout/NewTabMenu.tsx apps/ui/src/features/layout/TabBar.tsx apps/ui/src/features/command-palette/CommandPalette.tsx apps/ui/src/features/welcome/WelcomeScreen.tsx apps/ui/tests/local-profiles.spec.ts
git commit -m "feat(ui): add local shell launchers to tab bar, palette, and welcome"
```

---

### Task 14: Profile editor form

**Files:**
- Create: `apps/ui/src/features/local/LocalProfileForm.tsx`
- Modify: `apps/ui/src/features/sidebar/SidebarLocalList.tsx`
- Modify: `apps/ui/src/app/App.tsx`

**Interfaces:**
- Consumes: `localProfilesStore.save`, `localProfilesStore.remove`, `LocalProfileIcon`, and the existing file-picker bridge method used by other forms.
- Produces: `LocalProfileForm` props `{ profile: LocalProfileRecord | null; envVars: LocalProfileEnvVar[]; onSave(input: UpsertLocalProfileRequest): void; onCancel(): void; onDelete?(id: string): void }`.

- [ ] **Step 1: Build the form**

Model it on `SerialProfileForm.tsx` for layout, labelling, and modal chrome. Fields:

| Field | Control | Notes |
|---|---|---|
| Name | text, required | Unique — the DB enforces it; surface a friendly error on conflict |
| Executable | text + **Browse…** | Browse uses the same file-picker bridge method the SSH key form uses |
| Arguments | text | Space-separated, parsed to `string[]`; show the hint "Leave empty so the shell loads your own profile" |
| Starting directory | text + **Browse…** | Optional; empty means inherit |
| Icon | segmented control | Exactly the five keys, rendered with `LocalProfileIcon` |
| Colour | swatch picker | Reuse the host colour picker; null clears |
| Environment variables | name/value rows | Reuse the host env-var editor component |

For a `source === "detected"` profile, show a note that Delete hides it rather than removing it, since detection would otherwise re-add it.

Every input needs an associated `<label>` — the axe check in Task 13 covers this surface.

- [ ] **Step 2: Wire it up**

Add "New local profile" and per-row "Edit" affordances to `SidebarLocalList`, and hold the open/edit state in `App.tsx` beside the serial profile form state.

- [ ] **Step 3: Verify manually**

Run: `pnpm --filter @hypershell/desktop build && pnpm --filter @hypershell/desktop start`
Expected:
1. Create a profile "PowerShell (projects)" with executable `pwsh.exe` and starting directory `C:\Users\tomer.TEC\projects` → it opens there.
2. Edit a detected profile's name and colour, restart the app → the edit survives detection.
3. Delete a detected profile → it disappears; restart → it stays gone.
4. Delete a custom profile → it disappears permanently.

- [ ] **Step 4: Run the full unit suite**

Run: `pnpm test`
Expected: PASS, except for pre-existing `NODE_MODULE_VERSION` ABI failures in DB-touching files (see Global Constraints). Zero failures may come from files this plan created or modified other than that error.

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/features/local/LocalProfileForm.tsx apps/ui/src/features/sidebar/SidebarLocalList.tsx apps/ui/src/app/App.tsx
git commit -m "feat(ui): add local profile editor"
```

---

### Task 15: Electron E2E and documentation

**Files:**
- Create: `apps/desktop/tests/local-shell.spec.ts`
- Modify: `CLAUDE.md`
- Modify: `docs/ipc-reference.md`

**Interfaces:**
- Consumes: everything above.
- Produces: no new code interfaces.

- [ ] **Step 1: Write the Electron E2E spec**

Create `apps/desktop/tests/local-shell.spec.ts`, following the existing specs in that directory for the app-launch fixture and `HYPERSHELL_DATA_DIR` handling:

```ts
import { test, expect } from "@playwright/test";
import { launchApp, closeApp } from "./helpers/launch";

test.describe("local shell profiles", () => {
  test("detects at least one local shell on this machine", async () => {
    const app = await launchApp();
    const page = await app.firstWindow();

    const profiles = await page.evaluate(() => window.hypershell.listLocalProfiles());

    expect(profiles.length).toBeGreaterThan(0);
    expect(profiles.every((p) => Array.isArray(p.args))).toBe(true);

    await closeApp(app);
  });

  test("detected profiles carry no arguments so the shell loads its own profile", async () => {
    const app = await launchApp();
    const page = await app.firstWindow();

    const profiles = await page.evaluate(() => window.hypershell.listLocalProfiles());
    const powershell = profiles.find((p) => p.detectKey === "pwsh7" || p.detectKey === "windows-powershell");

    expect(powershell?.args).toEqual([]);

    await closeApp(app);
  });

  test("opens a real local shell and receives output", async () => {
    const app = await launchApp();
    const page = await app.firstWindow();

    const profiles = await page.evaluate(() => window.hypershell.listLocalProfiles());
    const cmd = profiles.find((p) => p.detectKey === "cmd");
    expect(cmd).toBeDefined();

    const output = await page.evaluate(async (profileId) => {
      const session = await window.hypershell.openSession({
        transport: "local",
        profileId,
        cols: 80,
        rows: 24
      });

      return await new Promise<string>((resolve) => {
        let buffer = "";
        const unsubscribe = window.hypershell.onSessionEvent((event) => {
          if (event.sessionId !== session.sessionId) return;
          if (event.type === "data") {
            buffer += event.data;
            if (buffer.includes("hypershell-e2e-ok")) {
              unsubscribe?.();
              void window.hypershell.closeSession({ sessionId: session.sessionId });
              resolve(buffer);
            }
          }
        });

        void window.hypershell.writeSession({
          sessionId: session.sessionId,
          data: "echo hypershell-e2e-ok\r"
        });
      });
    }, cmd!.id);

    expect(output).toContain("hypershell-e2e-ok");

    await closeApp(app);
  });

  test("rejects a renderer-supplied executable on a local session", async () => {
    const app = await launchApp();
    const page = await app.firstWindow();

    const result = await page.evaluate(async () => {
      try {
        const session = await window.hypershell.openSession({
          transport: "local",
          profileId: "does-not-exist",
          cols: 80,
          rows: 24,
          localOptions: { executable: "calc.exe" }
        } as never);
        return { ok: true, sessionId: session.sessionId };
      } catch (error) {
        return { ok: false, message: String(error) };
      }
    });

    // The unknown profileId must fail, and localOptions must never be honoured.
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Unknown local profile");

    await closeApp(app);
  });
});
```

Adjust the import of `launchApp` / `closeApp` to whatever the existing specs in `apps/desktop/tests/` use — reuse their fixture rather than adding a second one.

- [ ] **Step 2: Run the Electron E2E suite**

```bash
pnpm --filter @hypershell/desktop run build:bundle
pnpm --filter @hypershell/desktop rebuild:native
pnpm ci:test:e2e:electron
```

Expected: PASS — 4 new tests plus the existing suite.

- [ ] **Step 3: Document the transport**

In `CLAUDE.md`, under **Session transports**, add:

```markdown
- **Local** — spawns a local shell (PowerShell, cmd.exe, WSL, Git Bash) in node-pty via the shared `ptyProcess` core. Profiles are auto-detected on startup and stored in `local_profiles`; the renderer may only pass a `profileId`, never an executable.
```

Add to **Known Gotchas**:

```markdown
- **A local shell ignores your PowerShell profile** — the profile row has non-empty `args`. Detected profiles must launch bare (`args = []`); `-NoProfile`/`-Command`/`-File` all skip `$PROFILE`.
- **WSL distros missing from the Local section** — `wsl.exe -l -q` emits UTF-16LE. Decoding it as UTF-8 yields NUL-interleaved names that match nothing.
```

Bump the migration count in the **Database** line from 6 to reflect `015`.

- [ ] **Step 4: Document the IPC channels**

Add the six `local-profiles:*` channels to `docs/ipc-reference.md`, matching the format used for `serial-profiles:*`.

- [ ] **Step 5: Full gate**

```bash
pnpm lint
pnpm build
pnpm test
pnpm ci:test:e2e
```

Expected: all PASS, except the known `NODE_MODULE_VERSION` failures described in Global Constraints.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/tests/local-shell.spec.ts CLAUDE.md docs/ipc-reference.md
git commit -m "test(desktop): cover local shell sessions and document the transport"
```

---

## Done Criteria

- A fresh install detects and lists every installed shell with no configuration.
- Opening the PowerShell profile loads the user's own `$PROFILE`.
- Renaming, recolouring, or re-pointing a detected profile survives a restart.
- Deleting a detected profile keeps it gone across restarts.
- Installing a WSL distro and pressing Rescan makes it appear without a restart.
- `exit` closes the tab; a non-zero exit leaves it open.
- `session.open` cannot be made to run an executable the renderer names.

Run-as-administrator is **not** covered here — see [`2026-08-02-local-shell-elevation.md`](./2026-08-02-local-shell-elevation.md).
