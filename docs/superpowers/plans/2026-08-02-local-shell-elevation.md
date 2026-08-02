# Local Shell Elevation Implementation Plan (Phase 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a local shell profile launch elevated, by relaunching HyperShell under UAC in a separate window badged "Administrator".

**Architecture:** A medium-integrity process cannot host an elevated ConPTY, so there is no elevated tab in the existing window. Instead the running instance shells out to `Start-Process -Verb RunAs` against its own executable with `--elevated-local-shell --profile-id <id>`. The elevated instance boots normally, resolves that profile from the same SQLite database, opens exactly one session for it, and badges its window.

**Tech Stack:** Electron, Node `child_process`, Zod, React 19, Vitest, Playwright.

**Prerequisite:** [`2026-08-02-local-shell-profiles.md`](./2026-08-02-local-shell-profiles.md) Tasks 1–15 must be complete and merged. This plan consumes the `local_profiles` table, `localProfilesRepository`, and the `elevated` column created there.

**Spec:** [`docs/superpowers/specs/2026-08-02-local-shell-profiles-design.md`](../specs/2026-08-02-local-shell-profiles-design.md) §7.

## Global Constraints

- **The command line carries a `profileId` only** — never an executable, arguments, or a working directory. The elevated instance resolves the profile from the database itself, so a crafted command line cannot name a program to run elevated.
- **Windows only.** On every other platform, `elevated` is ignored and the profile opens normally. The form control is hidden off Windows.
- **The database is shared between the two instances.** `openDatabase` already sets `journal_mode = WAL` and `busy_timeout = 5000` (`packages/db/src/index.ts:54-56`), which is exactly the multi-process configuration this needs. Do not add a second data directory, and do not add a single-instance lock — `main.ts` has none today and the elevated instance depends on that.
- **Never pass user-controlled text through a shell string.** The relaunch uses `execFile` with an argument array, and the PowerShell `-ArgumentList` entries are single-quoted with embedded quotes doubled.
- **Every task ends with a commit.** Never use `git restore`, `git checkout -- .`, `git reset`, or `git clean` — this repo has `core.autocrlf=true` and unrelated files routinely show as modified from line-ending noise alone. Stage only the files you touched.
- **Known local test failure:** DB-touching vitest files fail with `NODE_MODULE_VERSION 140 ... 137` because `better-sqlite3` is built for Electron's ABI. Expected; CI is green. Confirm any failure is exactly that error.

---

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `apps/desktop/src/main/localShells/elevatedShellArgs.ts` | Parse and build the `--elevated-local-shell` command line |
| `apps/desktop/src/main/localShells/elevatedShellArgs.test.ts` | Parsing and quoting tests |
| `apps/desktop/src/main/localShells/elevateLocalProfile.ts` | The `Start-Process -Verb RunAs` relaunch |
| `apps/desktop/src/main/localShells/elevateLocalProfile.test.ts` | Relaunch tests against an injected spawn |

**Modified:** `apps/desktop/src/main/main.ts`, `apps/desktop/src/main/windows/createMainWindow.ts`, `apps/desktop/src/main/ipc/localProfilesIpc.ts`, `apps/desktop/src/main/ipc/registerIpc.ts`, `packages/shared/src/ipc/channels.ts`, `packages/shared/src/ipc/schemas.ts`, `apps/desktop/src/preload/api/localApi.ts`, `apps/ui/src/types/global.d.ts`, `apps/ui/src/app/App.tsx`, `apps/ui/src/features/local/LocalProfileForm.tsx`, `apps/ui/src/features/layout/AppShell.tsx`, `CLAUDE.md`.

---

### Task 1: Command-line contract

**Files:**
- Create: `apps/desktop/src/main/localShells/elevatedShellArgs.ts`
- Create: `apps/desktop/src/main/localShells/elevatedShellArgs.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `ELEVATED_SHELL_FLAG = "--elevated-local-shell"`, `parseElevatedShellArgs(argv: string[]) => { profileId: string } | null`, `buildElevatedShellArgs(profileId: string) => string[]`, `quotePowerShellLiteral(value: string) => string`.

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/src/main/localShells/elevatedShellArgs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildElevatedShellArgs,
  parseElevatedShellArgs,
  quotePowerShellLiteral
} from "./elevatedShellArgs";

describe("parseElevatedShellArgs", () => {
  it("returns null for a normal launch", () => {
    expect(parseElevatedShellArgs(["C:\\app\\hypershell.exe"])).toBeNull();
  });

  it("extracts the profile id", () => {
    const parsed = parseElevatedShellArgs([
      "C:\\app\\hypershell.exe",
      "--elevated-local-shell",
      "--profile-id",
      "abc-123"
    ]);

    expect(parsed).toEqual({ profileId: "abc-123" });
  });

  it("returns null when the flag is present but the id is missing", () => {
    expect(
      parseElevatedShellArgs(["C:\\app\\hypershell.exe", "--elevated-local-shell"])
    ).toBeNull();
  });

  it("returns null when the id is empty", () => {
    expect(
      parseElevatedShellArgs([
        "C:\\app\\hypershell.exe",
        "--elevated-local-shell",
        "--profile-id",
        ""
      ])
    ).toBeNull();
  });

  it("ignores anything that looks like an executable override", () => {
    const parsed = parseElevatedShellArgs([
      "C:\\app\\hypershell.exe",
      "--elevated-local-shell",
      "--profile-id",
      "abc-123",
      "--exec",
      "calc.exe"
    ]);

    expect(parsed).toEqual({ profileId: "abc-123" });
  });
});

describe("buildElevatedShellArgs", () => {
  it("builds the flag pair", () => {
    expect(buildElevatedShellArgs("abc-123")).toEqual([
      "--elevated-local-shell",
      "--profile-id",
      "abc-123"
    ]);
  });

  it("round-trips through the parser", () => {
    const argv = ["C:\\app\\hypershell.exe", ...buildElevatedShellArgs("id-with-dashes")];

    expect(parseElevatedShellArgs(argv)).toEqual({ profileId: "id-with-dashes" });
  });
});

describe("quotePowerShellLiteral", () => {
  it("wraps a value in single quotes", () => {
    expect(quotePowerShellLiteral("abc")).toBe("'abc'");
  });

  it("doubles embedded single quotes so the value cannot break out", () => {
    expect(quotePowerShellLiteral("a'; Start-Process calc; '")).toBe(
      "'a''; Start-Process calc; '''"
    );
  });

  it("leaves a Windows path intact", () => {
    expect(quotePowerShellLiteral("C:\\Program Files\\HyperShell\\HyperShell.exe")).toBe(
      "'C:\\Program Files\\HyperShell\\HyperShell.exe'"
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run apps/desktop/src/main/localShells/elevatedShellArgs.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `elevatedShellArgs.ts`**

```ts
export const ELEVATED_SHELL_FLAG = "--elevated-local-shell";
const PROFILE_ID_FLAG = "--profile-id";

export interface ElevatedShellArgs {
  profileId: string;
}

/**
 * Reads the elevated-launch contract off argv. Only a profile id crosses the
 * command line — the elevated instance resolves the executable from the database
 * itself, so a crafted command line cannot choose what runs elevated.
 */
export function parseElevatedShellArgs(argv: string[]): ElevatedShellArgs | null {
  if (!argv.includes(ELEVATED_SHELL_FLAG)) {
    return null;
  }

  const index = argv.indexOf(PROFILE_ID_FLAG);
  if (index === -1) {
    return null;
  }

  const profileId = argv[index + 1];
  if (!profileId || profileId.startsWith("--")) {
    return null;
  }

  return { profileId };
}

export function buildElevatedShellArgs(profileId: string): string[] {
  return [ELEVATED_SHELL_FLAG, PROFILE_ID_FLAG, profileId];
}

/** Single-quotes a value for a PowerShell literal string, doubling embedded quotes. */
export function quotePowerShellLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run apps/desktop/src/main/localShells/elevatedShellArgs.test.ts`
Expected: PASS — 10 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/localShells/elevatedShellArgs.ts apps/desktop/src/main/localShells/elevatedShellArgs.test.ts
git commit -m "feat(desktop): add elevated local shell command-line contract"
```

---

### Task 2: The elevated relaunch

**Files:**
- Create: `apps/desktop/src/main/localShells/elevateLocalProfile.ts`
- Create: `apps/desktop/src/main/localShells/elevateLocalProfile.test.ts`

**Interfaces:**
- Consumes: `buildElevatedShellArgs`, `quotePowerShellLiteral` from Task 1.
- Produces: `elevateLocalProfile(profileId, deps) => Promise<void>`; `ElevateDeps { execFile?, exePath?, platform? }`.

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/src/main/localShells/elevateLocalProfile.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { elevateLocalProfile } from "./elevateLocalProfile";

function createDeps(overrides = {}) {
  return {
    execFile: vi.fn((_file: string, _args: string[], cb: (error: Error | null) => void) =>
      cb(null)
    ),
    exePath: "C:\\Program Files\\HyperShell\\HyperShell.exe",
    platform: "win32" as NodeJS.Platform,
    ...overrides
  };
}

describe("elevateLocalProfile", () => {
  it("invokes PowerShell Start-Process with the RunAs verb", async () => {
    const deps = createDeps();

    await elevateLocalProfile("abc-123", deps);

    const [file, args] = deps.execFile.mock.calls[0];
    expect(file).toBe("powershell.exe");
    expect(args.join(" ")).toContain("Start-Process");
    expect(args.join(" ")).toContain("-Verb RunAs");
  });

  it("passes only the flag and the profile id", async () => {
    const deps = createDeps();

    await elevateLocalProfile("abc-123", deps);

    const command = deps.execFile.mock.calls[0][1].join(" ");
    expect(command).toContain("--elevated-local-shell");
    expect(command).toContain("abc-123");
    expect(command).not.toContain(".exe'\"");
  });

  it("quotes its own executable path so spaces are safe", async () => {
    const deps = createDeps();

    await elevateLocalProfile("abc-123", deps);

    const command = deps.execFile.mock.calls[0][1].join(" ");
    expect(command).toContain("'C:\\Program Files\\HyperShell\\HyperShell.exe'");
  });

  it("neutralises a quote injected through the profile id", async () => {
    const deps = createDeps();

    await elevateLocalProfile("a'; Start-Process calc; '", deps);

    const command = deps.execFile.mock.calls[0][1].join(" ");
    expect(command).toContain("''");
    expect(command).not.toMatch(/'a'; Start-Process calc/);
  });

  it("rejects on a non-Windows platform without spawning anything", async () => {
    const deps = createDeps({ platform: "darwin" as NodeJS.Platform });

    await expect(elevateLocalProfile("abc-123", deps)).rejects.toThrow(/Windows/);
    expect(deps.execFile).not.toHaveBeenCalled();
  });

  it("rejects when the user declines the UAC prompt", async () => {
    const deps = createDeps({
      execFile: vi.fn((_file: string, _args: string[], cb: (error: Error | null) => void) =>
        cb(new Error("The operation was canceled by the user."))
      )
    });

    await expect(elevateLocalProfile("abc-123", deps)).rejects.toThrow(/canceled/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run apps/desktop/src/main/localShells/elevateLocalProfile.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `elevateLocalProfile.ts`**

```ts
import { execFile as nodeExecFile } from "node:child_process";
import { buildElevatedShellArgs, quotePowerShellLiteral } from "./elevatedShellArgs";

type ExecFileLike = (
  file: string,
  args: string[],
  callback: (error: Error | null) => void
) => unknown;

export interface ElevateDeps {
  execFile?: ExecFileLike;
  exePath?: string;
  platform?: NodeJS.Platform;
}

/**
 * Relaunches HyperShell elevated for one profile.
 *
 * A medium-integrity process cannot host an elevated ConPTY, and bridging one over
 * a named pipe would hand a medium-integrity client control of a high-integrity
 * shell. So we do what Windows Terminal does: ask the shell to start a fresh,
 * elevated copy of ourselves behind a real UAC prompt.
 */
export async function elevateLocalProfile(
  profileId: string,
  deps: ElevateDeps = {}
): Promise<void> {
  const platform = deps.platform ?? process.platform;

  if (platform !== "win32") {
    throw new Error("Running a local shell as administrator is only supported on Windows");
  }

  const execFile = deps.execFile ?? (nodeExecFile as unknown as ExecFileLike);
  const exePath = deps.exePath ?? process.execPath;

  const argumentList = buildElevatedShellArgs(profileId)
    .map(quotePowerShellLiteral)
    .join(", ");

  const command = [
    "Start-Process",
    "-FilePath",
    quotePowerShellLiteral(exePath),
    "-ArgumentList",
    argumentList,
    "-Verb",
    "RunAs"
  ].join(" ");

  await new Promise<void>((resolve, reject) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", command],
      (error) => (error ? reject(error) : resolve())
    );
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run apps/desktop/src/main/localShells/elevateLocalProfile.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/localShells/elevateLocalProfile.ts apps/desktop/src/main/localShells/elevateLocalProfile.test.ts
git commit -m "feat(desktop): relaunch elevated for run-as-administrator profiles"
```

---

### Task 3: Elevated boot path

**Files:**
- Modify: `apps/desktop/src/main/main.ts`
- Modify: `apps/desktop/src/main/windows/createMainWindow.ts`
- Modify: `apps/desktop/src/main/ipc/registerIpc.ts`
- Modify: `apps/desktop/src/main/ipc/localProfilesIpc.ts`
- Modify: `packages/shared/src/ipc/channels.ts`
- Modify: `packages/shared/src/ipc/schemas.ts`

**Interfaces:**
- Consumes: `parseElevatedShellArgs` from Task 1; `localProfilesRepo` and `openSessionHandler` from the prerequisite plan.
- Produces: channel `ipcChannels.localProfiles.elevatedBootstrap`; schema `elevatedBootstrapResponseSchema` → `{ sessionId: string; title: string } | null`; `registerLocalProfilesIpc` gains a third parameter `getElevatedBootstrap: () => { sessionId: string; title: string } | null`.

- [ ] **Step 1: Add the channel and schema**

In `packages/shared/src/ipc/channels.ts`, add to `localProfileChannels`:

```ts
  elevatedBootstrap: "local-profiles:elevated-bootstrap"
```

In `packages/shared/src/ipc/schemas.ts`, beside the other local profile schemas:

```ts
export const elevatedBootstrapResponseSchema = z
  .object({
    sessionId: z.string().min(1),
    title: z.string().min(1)
  })
  .nullable();

export type ElevatedBootstrapResponse = z.infer<typeof elevatedBootstrapResponseSchema>;
```

- [ ] **Step 2: Open the elevated session at boot**

In `apps/desktop/src/main/main.ts`, immediately after the app is ready and IPC has been registered, add:

```ts
const elevatedArgs = parseElevatedShellArgs(process.argv);

if (elevatedArgs) {
  // The elevated instance exists to run exactly one profile. It resolves the
  // executable from the shared database rather than trusting its command line.
  setElevatedBootstrap(await openElevatedSession(elevatedArgs.profileId));
}
```

Implement `openElevatedSession(profileId)` in `apps/desktop/src/main/ipc/localProfilesIpc.ts`, exported alongside the handlers. It resolves the profile through `localProfilesRepo`, calls the same `sessionManager.open({ transport: "local", localOptions: { ... } })` path `openSessionHandler` uses, and returns `{ sessionId, title: profile.name }`. If the profile is missing or unavailable it returns `null` and the window boots normally.

Store the result in a module-level `let elevatedBootstrap` in `localProfilesIpc.ts` with `setElevatedBootstrap` / `getElevatedBootstrap` accessors, and register the handler:

```ts
  ipcMain.handle(
    ipcChannels.localProfiles.elevatedBootstrap,
    async (): Promise<ElevatedBootstrapResponse> => getElevatedBootstrap()
  );
```

Add `ipcChannels.localProfiles.elevatedBootstrap` to the `registeredChannels` array in `registerIpc.ts`.

- [ ] **Step 3: Badge the elevated window**

In `apps/desktop/src/main/windows/createMainWindow.ts`, where `windowOptions` is assembled before `new BrowserWindow(windowOptions)` (line 157), set the title when the elevated flag is present:

```ts
  const isElevatedLaunch = parseElevatedShellArgs(process.argv) !== null;
  const title = isElevatedLaunch ? "HyperShell (Administrator)" : "HyperShell";
```

and pass `title` into `windowOptions`.

- [ ] **Step 4: Build**

Run: `pnpm --filter @hypershell/desktop build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/main.ts apps/desktop/src/main/windows/createMainWindow.ts apps/desktop/src/main/ipc/registerIpc.ts apps/desktop/src/main/ipc/localProfilesIpc.ts packages/shared/src/ipc/channels.ts packages/shared/src/ipc/schemas.ts
git commit -m "feat(desktop): boot a single elevated session when relaunched under UAC"
```

---

### Task 4: Renderer wiring

**Files:**
- Modify: `apps/desktop/src/preload/api/localApi.ts`
- Modify: `apps/ui/src/types/global.d.ts`
- Modify: `apps/ui/src/app/App.tsx`
- Modify: `apps/ui/src/features/local/LocalProfileForm.tsx`
- Modify: `apps/ui/src/features/layout/AppShell.tsx`

**Interfaces:**
- Consumes: `elevatedBootstrapResponseSchema`, `elevateLocalProfile` via a new IPC method.
- Produces: `LocalApi.getElevatedBootstrap()`; `LocalProfileForm` exposes the `elevated` checkbox; `App.tsx` routes elevated launches.

- [ ] **Step 1: Add the preload method**

In `apps/desktop/src/preload/api/localApi.ts`, add to `LocalApi` and the returned object:

```ts
    async getElevatedBootstrap(): Promise<ElevatedBootstrapResponse> {
      const result = await ipcRenderer.invoke(ipcChannels.localProfiles.elevatedBootstrap);
      return elevatedBootstrapResponseSchema.parse(result);
    },
```

Declare `getElevatedBootstrap?(): Promise<{ sessionId: string; title: string } | null>;` on `window.hypershell` in `apps/ui/src/types/global.d.ts`.

- [ ] **Step 2: Attach to the pre-opened session on startup**

In `App.tsx`, add an effect that runs once on mount, before the Welcome screen would render:

```tsx
  useEffect(() => {
    void (async () => {
      const bootstrap = await window.hypershell?.getElevatedBootstrap?.();
      if (!bootstrap) {
        return;
      }

      layoutStore.getState().openTab({
        sessionId: bootstrap.sessionId,
        title: bootstrap.title,
        transport: "local",
        type: "terminal",
        // Main already opened this session; the pane must attach, not reconnect.
        preopened: true
      });
    })();
  }, []);
```

`preopened` already exists on `LayoutTab` and is exactly this case.

- [ ] **Step 3: Route elevated profiles on connect**

In the `handleConnectLocal` callback added by the prerequisite plan, branch before opening a tab:

```tsx
    if (profile.elevated) {
      // Elevation opens a separate elevated window; nothing opens in this one.
      void window.hypershell?.elevateLocalProfile?.({ id: profile.id });
      return;
    }
```

Add the matching `local-profiles:elevate` channel, schema (`{ id: string }`), main handler calling `elevateLocalProfile(parsed.id)` from Task 2, preload method, and `global.d.ts` declaration — following the same six-step pattern the other local profile channels use.

Show a toast on rejection, since the user declining UAC surfaces as an error:

```tsx
      void window.hypershell?.elevateLocalProfile?.({ id: profile.id }).catch(() => {
        toast.error("Elevation was cancelled");
      });
```

- [ ] **Step 4: Add the form control**

In `LocalProfileForm.tsx`, add a "Run as administrator" checkbox bound to `elevated`, rendered only when the app is running on Windows. Beneath it, a help line: "Opens a separate elevated window. Windows cannot host an elevated shell inside this one."

- [ ] **Step 5: Badge the elevated window in the UI**

In `AppShell.tsx`, when `getElevatedBootstrap()` returned a value, render an "Administrator" pill in the title bar area so the elevated window is unmistakable at a glance.

- [ ] **Step 6: Verify manually**

Run: `pnpm --filter @hypershell/desktop build && pnpm --filter @hypershell/desktop start`
Expected:
1. Mark a PowerShell profile "Run as administrator" and click it → a UAC prompt appears.
2. Accept → a second HyperShell window opens, titled "HyperShell (Administrator)", showing one PowerShell tab.
3. In that shell, `([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)` prints `True`.
4. Decline the UAC prompt → the original window shows the "Elevation was cancelled" toast and opens nothing.
5. The original window's hosts and profiles are unchanged, and the elevated window shows the same profile list — confirming both instances share the database without error.

- [ ] **Step 7: Full gate**

```bash
pnpm lint
pnpm build
pnpm test
pnpm ci:test:e2e
```

Expected: all PASS, except the known `NODE_MODULE_VERSION` failures.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src/preload/api/localApi.ts apps/ui/src/types/global.d.ts apps/ui/src/app/App.tsx apps/ui/src/features/local/LocalProfileForm.tsx apps/ui/src/features/layout/AppShell.tsx
git commit -m "feat(ui): launch elevated local shells in a separate admin window"
```

---

### Task 5: Documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/ipc-reference.md`

- [ ] **Step 1: Document the behavior**

Add to **Known Gotchas** in `CLAUDE.md`:

```markdown
- **"Run as administrator" opens a second window, not an elevated tab** — this is deliberate. A medium-integrity process cannot host an elevated ConPTY, and bridging one over a named pipe would hand a medium-integrity client control of a high-integrity shell. HyperShell relaunches itself under UAC instead, passing only a profile id; the elevated instance resolves the executable from the shared database. Both instances use the same SQLite file, which is safe because `openDatabase` runs in WAL mode with a 5s busy timeout.
```

- [ ] **Step 2: Document the channels**

Add `local-profiles:elevate` and `local-profiles:elevated-bootstrap` to `docs/ipc-reference.md`.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/ipc-reference.md
git commit -m "docs: document local shell elevation"
```

---

## Done Criteria

- A profile marked "Run as administrator" produces a real UAC prompt.
- Accepting opens a separate window titled "HyperShell (Administrator)" with exactly one tab for that profile, and the shell is genuinely elevated.
- Declining leaves the original window untouched and reports the cancellation.
- The command line carries no executable — only a profile id.
- Both instances run against the same database without corruption or lock errors.
- On non-Windows platforms the checkbox is hidden and `elevated` is ignored.
