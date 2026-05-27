# In-App Auto-Update via GitHub Releases — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make HyperShell detect newer GitHub Releases and update itself in-app (Windows + Linux), with a macOS download-link fallback, using `electron-updater`.

**Architecture:** A main-process `updateService` wraps `electron-updater`'s `autoUpdater` (notify-first: `autoDownload: false`). It pushes a normalized `UpdateState` to the renderer over a new `updates:*` IPC group (Zod-validated). The renderer mirrors that state in a Zustand store and renders a dismissible `UpdateBanner` plus a Settings → Updates section. On macOS the service skips `autoUpdater` and uses the GitHub Releases API + `shell.openExternal`. The release pipeline is changed only to emit and upload `electron-updater` metadata.

**Tech Stack:** Electron, electron-builder/electron-updater, TypeScript (ESM, esbuild), Zod, React, Zustand, Framer Motion, Vitest.

**Design spec:** `docs/superpowers/specs/2026-05-27-app-auto-update-via-github-design.md`

**Conventions used throughout (defined here, referenced by later tasks):**
- `UpdateStatus` = `"idle" | "checking" | "available" | "downloading" | "downloaded" | "manual-available" | "up-to-date" | "error"`.
- `UpdateState` = `{ status, currentVersion, availableVersion?, progressPercent?, releaseUrl?, error?, lastCheckedAt? }`.
- Channels object name: `updateChannels`; methods `check/download/install/openRelease/getState/state`.
- Preload methods: `checkForUpdates / downloadUpdate / installUpdate / openUpdateRelease / getUpdateState / onUpdateState`.
- Repo for the GitHub API: `tomertec/HyperShell`.

---

### Task 1: Add `electron-updater` dependency, esbuild external, and electron-builder publish config

**Files:**
- Modify: `apps/desktop/package.json` (dependencies)
- Modify: `apps/desktop/esbuild.config.mjs:23-31` (external array)
- Modify: `apps/desktop/electron-builder.yml:74` (`publish: null`)

- [ ] **Step 1: Add the dependency**

Run from repo root:
```bash
pnpm --filter @hypershell/desktop add electron-updater@^6.3.9
```
Expected: `electron-updater` appears under `dependencies` in `apps/desktop/package.json` and the lockfile updates.

- [ ] **Step 2: Mark `electron-updater` external in esbuild**

In `apps/desktop/esbuild.config.mjs`, add `"electron-updater"` to the `external` array so it is `require`d from packaged `node_modules` at runtime (same treatment as `ssh2`), not bundled:

```js
  external: [
    "electron",
    "electron-updater",
    "better-sqlite3",
    "node-pty",
    "serialport",
    "@serialport/bindings-cpp",
    "ssh2",
    "cpu-features",
  ],
```

- [ ] **Step 3: Configure the GitHub publish provider**

In `apps/desktop/electron-builder.yml`, replace the final line `publish: null` with:

```yaml
publish:
  provider: github
  owner: tomertec
  repo: HyperShell
```

This makes electron-builder generate `latest.yml` / `latest-linux.yml` / `.blockmap` into `apps/desktop/release/` and bundle `app-update.yml` into app resources. Packaging still uses `--publish never` (unchanged scripts), so nothing is auto-uploaded by electron-builder.

- [ ] **Step 4: Verify the workspace still builds**

Run:
```bash
pnpm --filter @hypershell/desktop build
```
Expected: PASS (tsc typecheck + esbuild bundle succeed). `electron-updater` is not bundled into `dist/main/main.js`.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/package.json apps/desktop/esbuild.config.mjs apps/desktop/electron-builder.yml pnpm-lock.yaml
git commit -m "feat(updates): add electron-updater dep and publish config"
```

---

### Task 2: Shared IPC channels + Zod schemas for updates

**Files:**
- Modify: `packages/shared/src/ipc/channels.ts:213-245`
- Create: `packages/shared/src/ipc/updateSchemas.ts`
- Create: `packages/shared/src/ipc/updateSchemas.test.ts`
- Modify: `packages/shared/src/index.ts:1-6`

- [ ] **Step 1: Write the failing schema test**

Create `packages/shared/src/ipc/updateSchemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { updateStateSchema } from "./updateSchemas";

describe("updateStateSchema", () => {
  it("accepts a minimal idle state", () => {
    const result = updateStateSchema.parse({
      status: "idle",
      currentVersion: "0.1.9"
    });

    expect(result.status).toBe("idle");
    expect(result.availableVersion).toBeUndefined();
  });

  it("accepts a downloading state with progress", () => {
    const result = updateStateSchema.parse({
      status: "downloading",
      currentVersion: "0.1.9",
      availableVersion: "0.2.0",
      progressPercent: 42
    });

    expect(result.progressPercent).toBe(42);
  });

  it("rejects an unknown status", () => {
    expect(() =>
      updateStateSchema.parse({ status: "bogus", currentVersion: "0.1.9" })
    ).toThrow();
  });

  it("rejects progress outside 0-100", () => {
    expect(() =>
      updateStateSchema.parse({
        status: "downloading",
        currentVersion: "0.1.9",
        progressPercent: 150
      })
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
pnpm --filter @hypershell/shared exec vitest run src/ipc/updateSchemas.test.ts
```
Expected: FAIL — cannot resolve `./updateSchemas`.

- [ ] **Step 3: Create the schema module**

Create `packages/shared/src/ipc/updateSchemas.ts`:

```ts
import { z } from "zod";

export const updateStatusSchema = z.enum([
  "idle",
  "checking",
  "available",
  "downloading",
  "downloaded",
  "manual-available",
  "up-to-date",
  "error"
]);

export type UpdateStatus = z.infer<typeof updateStatusSchema>;

export const updateStateSchema = z.object({
  status: updateStatusSchema,
  currentVersion: z.string(),
  availableVersion: z.string().optional(),
  progressPercent: z.number().min(0).max(100).optional(),
  releaseUrl: z.string().optional(),
  error: z.string().optional(),
  lastCheckedAt: z.string().optional()
});

export type UpdateState = z.infer<typeof updateStateSchema>;
```

- [ ] **Step 4: Add the channels**

In `packages/shared/src/ipc/channels.ts`, add this block immediately after `appChannels` (after line 215):

```ts
export const updateChannels = {
  check: "updates:check",
  download: "updates:download",
  install: "updates:install",
  openRelease: "updates:open-release",
  getState: "updates:get-state",
  state: "updates:state"
} as const;
```

Then add `update: updateChannels,` to the `ipcChannels` aggregate object (after the `app: appChannels,` line, before the closing `} as const;`):

```ts
  app: appChannels,
  update: updateChannels,
} as const;
```

- [ ] **Step 5: Export the schemas from the package index**

In `packages/shared/src/index.ts`, add after the existing `export * from "./ipc/sftpSchemas";` line:

```ts
export * from "./ipc/updateSchemas";
```

- [ ] **Step 6: Run the test to verify it passes**

Run:
```bash
pnpm --filter @hypershell/shared exec vitest run src/ipc/updateSchemas.test.ts
```
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/ipc/channels.ts packages/shared/src/ipc/updateSchemas.ts packages/shared/src/ipc/updateSchemas.test.ts packages/shared/src/index.ts
git commit -m "feat(updates): add updates IPC channels and Zod state schema"
```

---

### Task 3: Pure update logic (semver compare + GitHub release parser)

**Files:**
- Create: `apps/desktop/src/main/updates/updateLogic.ts`
- Create: `apps/desktop/src/main/updates/updateLogic.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/src/main/updates/updateLogic.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { isNewerVersion, parseLatestRelease, parseSemver } from "./updateLogic";

describe("parseSemver", () => {
  it("parses x.y.z and strips a leading v", () => {
    expect(parseSemver("v1.2.3")).toEqual([1, 2, 3]);
    expect(parseSemver("0.1.9")).toEqual([0, 1, 9]);
  });

  it("returns null for non-semver input", () => {
    expect(parseSemver("nightly")).toBeNull();
  });
});

describe("isNewerVersion", () => {
  it("is true when candidate is greater", () => {
    expect(isNewerVersion("0.1.9", "0.2.0")).toBe(true);
    expect(isNewerVersion("0.1.9", "1.0.0")).toBe(true);
  });

  it("is false when candidate is equal or older", () => {
    expect(isNewerVersion("0.1.9", "0.1.9")).toBe(false);
    expect(isNewerVersion("0.2.0", "0.1.9")).toBe(false);
  });

  it("is false when either version is unparseable", () => {
    expect(isNewerVersion("0.1.9", "garbage")).toBe(false);
  });
});

describe("parseLatestRelease", () => {
  it("extracts version and html url, stripping the v", () => {
    const result = parseLatestRelease({
      tag_name: "v0.2.0",
      html_url: "https://github.com/tomertec/HyperShell/releases/tag/v0.2.0",
      draft: false,
      prerelease: false
    });

    expect(result).toEqual({
      version: "0.2.0",
      htmlUrl: "https://github.com/tomertec/HyperShell/releases/tag/v0.2.0"
    });
  });

  it("returns null for drafts and prereleases", () => {
    expect(
      parseLatestRelease({ tag_name: "v0.2.0", html_url: "x", draft: true })
    ).toBeNull();
    expect(
      parseLatestRelease({ tag_name: "v0.2.0", html_url: "x", prerelease: true })
    ).toBeNull();
  });

  it("returns null for malformed payloads", () => {
    expect(parseLatestRelease(null)).toBeNull();
    expect(parseLatestRelease({ tag_name: 5 })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
pnpm --filter @hypershell/desktop exec vitest run src/main/updates/updateLogic.test.ts
```
Expected: FAIL — cannot resolve `./updateLogic`.

- [ ] **Step 3: Implement the pure logic**

Create `apps/desktop/src/main/updates/updateLogic.ts`:

```ts
export function parseSemver(version: string): [number, number, number] | null {
  const cleaned = version.trim().replace(/^v/i, "");
  const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function isNewerVersion(current: string, candidate: string): boolean {
  const a = parseSemver(current);
  const b = parseSemver(candidate);
  if (!a || !b) {
    return false;
  }
  for (let index = 0; index < 3; index += 1) {
    if (b[index] > a[index]) {
      return true;
    }
    if (b[index] < a[index]) {
      return false;
    }
  }
  return false;
}

export interface ParsedRelease {
  version: string;
  htmlUrl: string;
}

export function parseLatestRelease(payload: unknown): ParsedRelease | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  if (record.draft === true || record.prerelease === true) {
    return null;
  }

  const tag = record.tag_name;
  const htmlUrl = record.html_url;
  if (typeof tag !== "string" || typeof htmlUrl !== "string") {
    return null;
  }

  const version = tag.replace(/^v/i, "");
  if (!parseSemver(version)) {
    return null;
  }

  return { version, htmlUrl };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
pnpm --filter @hypershell/desktop exec vitest run src/main/updates/updateLogic.test.ts
```
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/updates/updateLogic.ts apps/desktop/src/main/updates/updateLogic.test.ts
git commit -m "feat(updates): add pure semver + github release parsing logic"
```

---

### Task 4: Update service (autoUpdater wrapper + macOS fetch path)

**Files:**
- Create: `apps/desktop/src/main/updates/updateService.ts`
- Create: `apps/desktop/src/main/updates/updateService.test.ts`

The service is a factory with injected dependencies so it is fully testable with fakes. A lazily-constructed singleton (`getUpdateService`) wires the real `electron-updater`, `app`, `shell`, and `fetch`.

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/src/main/updates/updateService.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { UpdateState } from "@hypershell/shared";

import { createUpdateService, type UpdaterLike } from "./updateService";

function createFakeUpdater() {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const updater: UpdaterLike = {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    allowPrerelease: true,
    on(event, listener) {
      listeners.set(event, listener);
    },
    checkForUpdates: vi.fn().mockResolvedValue(undefined),
    downloadUpdate: vi.fn().mockResolvedValue(undefined),
    quitAndInstall: vi.fn()
  };
  const fire = (event: string, ...args: unknown[]) =>
    listeners.get(event)?.(...args);
  return { updater, fire };
}

function setup(overrides: Record<string, unknown> = {}) {
  const states: UpdateState[] = [];
  const { updater, fire } = createFakeUpdater();
  const service = createUpdateService({
    platform: "win32",
    isPackaged: true,
    getVersion: () => "0.1.9",
    emit: (state) => states.push(state),
    getUpdater: () => updater,
    ...overrides
  });
  return { service, updater, fire, states };
}

describe("createUpdateService (win32)", () => {
  it("configures the updater for notify-first behaviour on check", async () => {
    const { service, updater } = setup();
    await service.check();
    expect(updater.autoDownload).toBe(false);
    expect(updater.autoInstallOnAppQuit).toBe(false);
    expect(updater.allowPrerelease).toBe(false);
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it("emits available state on update-available", async () => {
    const { service, fire, states } = setup();
    await service.check();
    fire("update-available", { version: "0.2.0" });
    const last = states.at(-1);
    expect(last?.status).toBe("available");
    expect(last?.availableVersion).toBe("0.2.0");
  });

  it("emits downloading progress then downloaded", async () => {
    const { service, fire, states } = setup();
    await service.check();
    fire("download-progress", { percent: 41.6 });
    fire("update-downloaded", { version: "0.2.0" });
    expect(states.at(-2)).toMatchObject({ status: "downloading", progressPercent: 42 });
    expect(states.at(-1)).toMatchObject({ status: "downloaded", availableVersion: "0.2.0" });
  });

  it("emits up-to-date on update-not-available", async () => {
    const { service, fire, states } = setup();
    await service.check();
    fire("update-not-available", {});
    expect(states.at(-1)?.status).toBe("up-to-date");
  });

  it("emits error on updater error", async () => {
    const { service, fire, states } = setup();
    await service.check();
    fire("error", new Error("network down"));
    expect(states.at(-1)).toMatchObject({ status: "error", error: "network down" });
  });

  it("is a no-op when not packaged", async () => {
    const { service, updater } = setup({ isPackaged: false });
    await service.check();
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
    expect(service.getState().status).toBe("idle");
  });

  it("schedules an initial check on start", () => {
    vi.useFakeTimers();
    const { service, updater } = setup();
    service.start();
    vi.runOnlyPendingTimers();
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

describe("createUpdateService (darwin)", () => {
  it("emits manual-available when the API reports a newer version", async () => {
    const states: UpdateState[] = [];
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: "v0.3.0",
        html_url: "https://example/releases/v0.3.0"
      })
    });
    const service = createUpdateService({
      platform: "darwin",
      isPackaged: true,
      getVersion: () => "0.1.9",
      emit: (state) => states.push(state),
      fetchFn: fetchFn as unknown as typeof fetch,
      releaseApiUrl: "https://example/api"
    });

    await service.check({ manual: true });

    expect(fetchFn).toHaveBeenCalledWith("https://example/api", expect.anything());
    expect(states.at(-1)).toMatchObject({
      status: "manual-available",
      availableVersion: "0.3.0",
      releaseUrl: "https://example/releases/v0.3.0"
    });
  });

  it("emits up-to-date when the API version is not newer", async () => {
    const states: UpdateState[] = [];
    const service = createUpdateService({
      platform: "darwin",
      isPackaged: true,
      getVersion: () => "0.9.0",
      emit: (state) => states.push(state),
      fetchFn: (async () => ({
        ok: true,
        json: async () => ({ tag_name: "v0.3.0", html_url: "x" })
      })) as unknown as typeof fetch,
      releaseApiUrl: "https://example/api"
    });

    await service.check({ manual: true });
    expect(states.at(-1)?.status).toBe("up-to-date");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
pnpm --filter @hypershell/desktop exec vitest run src/main/updates/updateService.test.ts
```
Expected: FAIL — cannot resolve `./updateService`.

- [ ] **Step 3: Implement the service**

Create `apps/desktop/src/main/updates/updateService.ts`:

```ts
import type { UpdateState, UpdateStatus } from "@hypershell/shared";

import { isNewerVersion, parseLatestRelease } from "./updateLogic";

const INITIAL_CHECK_DELAY_MS = 10_000;
const PERIODIC_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

export interface UpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowPrerelease: boolean;
  on(event: string, listener: (...args: unknown[]) => void): void;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(): void;
}

export interface UpdateServiceDeps {
  platform: NodeJS.Platform;
  isPackaged: boolean;
  getVersion: () => string;
  emit: (state: UpdateState) => void;
  logger?: Pick<Console, "warn" | "error">;
  getUpdater?: () => UpdaterLike;
  fetchFn?: typeof fetch;
  releaseApiUrl?: string;
  openExternal?: (url: string) => void;
  now?: () => Date;
}

export interface UpdateService {
  start(): void;
  check(options?: { manual?: boolean }): Promise<void>;
  download(): Promise<void>;
  install(): void;
  openRelease(): void;
  getState(): UpdateState;
}

export function createUpdateService(deps: UpdateServiceDeps): UpdateService {
  const logger = deps.logger ?? console;
  const now = deps.now ?? (() => new Date());

  let state: UpdateState = { status: "idle", currentVersion: deps.getVersion() };
  let updater: UpdaterLike | null = null;
  let started = false;

  function patch(next: Partial<UpdateState>): void {
    state = { ...state, currentVersion: deps.getVersion(), ...next };
    deps.emit(state);
  }

  function setStatus(status: UpdateStatus, extra: Partial<UpdateState> = {}): void {
    patch({ status, ...extra });
  }

  function wireUpdater(instance: UpdaterLike): void {
    instance.autoDownload = false;
    instance.autoInstallOnAppQuit = false;
    instance.allowPrerelease = false;

    instance.on("checking-for-update", () => setStatus("checking"));
    instance.on("update-available", (info) => {
      const version = (info as { version?: string } | undefined)?.version;
      setStatus("available", { availableVersion: version, error: undefined });
    });
    instance.on("update-not-available", () => {
      setStatus("up-to-date", { lastCheckedAt: now().toISOString() });
    });
    instance.on("download-progress", (progress) => {
      const percent = (progress as { percent?: number } | undefined)?.percent ?? 0;
      setStatus("downloading", { progressPercent: Math.round(percent) });
    });
    instance.on("update-downloaded", (info) => {
      const version = (info as { version?: string } | undefined)?.version;
      setStatus("downloaded", { availableVersion: version });
    });
    instance.on("error", (error) => {
      const message = error instanceof Error ? error.message : String(error ?? "update error");
      setStatus("error", { error: message });
    });
  }

  function getUpdaterInstance(): UpdaterLike | null {
    if (!deps.getUpdater) {
      return null;
    }
    if (!updater) {
      updater = deps.getUpdater();
      wireUpdater(updater);
    }
    return updater;
  }

  async function checkDarwin(manual: boolean): Promise<void> {
    const fetchFn = deps.fetchFn;
    const url = deps.releaseApiUrl;
    if (!fetchFn || !url) {
      return;
    }

    setStatus("checking");
    try {
      const response = await fetchFn(url, {
        headers: { Accept: "application/vnd.github+json" }
      });
      if (!("ok" in response) || !response.ok) {
        throw new Error(`GitHub API responded ${("status" in response) ? response.status : "error"}`);
      }
      const payload = await response.json();
      const release = parseLatestRelease(payload);
      const checkedAt = now().toISOString();
      if (release && isNewerVersion(deps.getVersion(), release.version)) {
        patch({
          status: "manual-available",
          availableVersion: release.version,
          releaseUrl: release.htmlUrl,
          lastCheckedAt: checkedAt,
          error: undefined
        });
        return;
      }
      patch({ status: "up-to-date", lastCheckedAt: checkedAt });
    } catch (error) {
      const message = error instanceof Error ? error.message : "could not check for updates";
      logger.warn?.("[updates] macOS check failed", error);
      if (manual) {
        setStatus("error", { error: message });
      }
    }
  }

  async function check(options: { manual?: boolean } = {}): Promise<void> {
    if (!deps.isPackaged) {
      return;
    }
    if (deps.platform === "darwin") {
      await checkDarwin(options.manual ?? false);
      return;
    }
    const instance = getUpdaterInstance();
    if (!instance) {
      return;
    }
    try {
      await instance.checkForUpdates();
    } catch (error) {
      const message = error instanceof Error ? error.message : "could not check for updates";
      logger.warn?.("[updates] check failed", error);
      if (options.manual) {
        setStatus("error", { error: message });
      }
    }
  }

  function start(): void {
    if (started || !deps.isPackaged) {
      return;
    }
    started = true;
    if (deps.platform !== "win32" && deps.platform !== "linux" && deps.platform !== "darwin") {
      return;
    }
    setTimeout(() => void check(), INITIAL_CHECK_DELAY_MS);
    setInterval(() => void check(), PERIODIC_CHECK_INTERVAL_MS).unref?.();
  }

  async function download(): Promise<void> {
    const instance = getUpdaterInstance();
    if (!instance) {
      return;
    }
    setStatus("downloading", { progressPercent: 0 });
    try {
      await instance.downloadUpdate();
    } catch (error) {
      const message = error instanceof Error ? error.message : "download failed";
      logger.error?.("[updates] download failed", error);
      setStatus("error", { error: message });
    }
  }

  function install(): void {
    const instance = getUpdaterInstance();
    instance?.quitAndInstall();
  }

  function openRelease(): void {
    if (state.releaseUrl && deps.openExternal) {
      deps.openExternal(state.releaseUrl);
    }
  }

  return {
    start,
    check,
    download,
    install,
    openRelease,
    getState: () => state
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
pnpm --filter @hypershell/desktop exec vitest run src/main/updates/updateService.test.ts
```
Expected: PASS (win32 + darwin describe blocks green).

- [ ] **Step 5: Add the lazily-wired real singleton**

Append to the bottom of `apps/desktop/src/main/updates/updateService.ts`:

```ts
import { app, shell } from "electron";

const RELEASE_API_URL =
  "https://api.github.com/repos/tomertec/HyperShell/releases/latest";

let realService: UpdateService | null = null;
let stateEmitter: (state: UpdateState) => void = () => {};

export function setUpdateStateEmitter(fn: (state: UpdateState) => void): void {
  stateEmitter = fn;
}

export function getUpdateService(): UpdateService {
  if (realService) {
    return realService;
  }
  realService = createUpdateService({
    platform: process.platform,
    isPackaged: app.isPackaged,
    getVersion: () => app.getVersion(),
    emit: (state) => stateEmitter(state),
    logger: console,
    getUpdater: () => {
      // electron-updater is CommonJS and external to the esbuild bundle;
      // require it lazily so dev/test never loads it.
      const updaterModule = require("electron-updater") as {
        autoUpdater: UpdaterLike;
      };
      return updaterModule.autoUpdater;
    },
    fetchFn: fetch,
    releaseApiUrl: RELEASE_API_URL,
    openExternal: (url) => {
      void shell.openExternal(url);
    }
  });
  return realService;
}
```

(`require` is provided by the esbuild banner via `createRequire`; `electron-updater` is in the `external` list from Task 1.)

- [ ] **Step 6: Verify the package still typechecks**

Run:
```bash
pnpm --filter @hypershell/desktop build
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/main/updates/updateService.ts apps/desktop/src/main/updates/updateService.test.ts
git commit -m "feat(updates): add main-process update service"
```

---

### Task 5: Register IPC handlers + wire emitter and startup check

**Files:**
- Modify: `apps/desktop/src/main/ipc/registerIpc.ts` (imports, `RegisterIpcOptions:316-326`, `registeredChannels` list ~`183-213`, handler block ~`1462`)
- Modify: `apps/desktop/src/main/mainLifecycle.ts:136-149`
- Modify: `apps/desktop/src/main/main.ts:13,124`

- [ ] **Step 1: Import the service in registerIpc**

In `apps/desktop/src/main/ipc/registerIpc.ts`, add near the other local main imports (top of file, after existing imports):

```ts
import { getUpdateService, setUpdateStateEmitter } from "../updates/updateService";
```

- [ ] **Step 2: Add `emitUpdateState` to the options interface**

In `RegisterIpcOptions` (line 316), add the field alongside the other emit callbacks:

```ts
export interface RegisterIpcOptions {
  emitSessionEvent?: (event: unknown) => void;
  emitSftpEvent?: (event: unknown) => void;
  emitSyncEvent?: (event: unknown) => void;
  emitKeyboardInteractive?: (event: unknown) => void;
  emitHostStatusEvent?: (event: unknown) => void;
  emitUpdateState?: (state: unknown) => void;
  sessionManager?: SessionManager;
  db?: unknown;
  resolveHostProfile?: (profileId: string) => Promise<{ hostname: string; username?: string; port?: number; identityFile?: string; password?: string; proxyJump?: string; keepAliveSeconds?: number } | null>;
  resolveSerialProfile?: (profileId: string) => SerialProfileRecord | undefined;
}
```

- [ ] **Step 3: Register the request channels for cleanup**

In the `registeredChannels` array, add these entries just before the closing `] as const;` (after `ipcChannels.app.setTheme,` at line 212):

```ts
  ipcChannels.update.check,
  ipcChannels.update.download,
  ipcChannels.update.install,
  ipcChannels.update.openRelease,
  ipcChannels.update.getState,
```

- [ ] **Step 4: Wire the emitter and register handlers**

Inside `registerIpc()`, after the existing `ipcMain.handle(ipcChannels.app.setTheme, ...)` registration (around line 1447-1462) and near the other `ipcMain.handle` calls, add:

```ts
  setUpdateStateEmitter((state) => {
    options.emitUpdateState?.(state);
  });

  ipcMain.handle(ipcChannels.update.check, () =>
    getUpdateService().check({ manual: true })
  );
  ipcMain.handle(ipcChannels.update.download, () => getUpdateService().download());
  ipcMain.handle(ipcChannels.update.install, () => {
    getUpdateService().install();
  });
  ipcMain.handle(ipcChannels.update.openRelease, () => {
    getUpdateService().openRelease();
  });
  ipcMain.handle(ipcChannels.update.getState, () => getUpdateService().getState());
```

- [ ] **Step 5: Push update state to the renderer in mainLifecycle**

In `apps/desktop/src/main/mainLifecycle.ts`, add the emitter to the `registerIpc` options object (after `emitHostStatusEvent`, line 146-148):

```ts
      emitHostStatusEvent: (event: unknown) => {
        sendToMainWindow(ipcChannels.hosts.status, event);
      },
      emitUpdateState: (event: unknown) => {
        sendToMainWindow(ipcChannels.update.state, event);
      },
```

- [ ] **Step 6: Start update checks after bootstrap**

In `apps/desktop/src/main/main.ts`, add the import (after line 13's `registerIpc` import):

```ts
import { getUpdateService } from "./updates/updateService";
```

Then in `bootstrap()`, after `await mainProcessLifecycle.bootstrap();` (line 124):

```ts
  await mainProcessLifecycle.bootstrap();
  getUpdateService().start();
```

- [ ] **Step 7: Verify build + existing IPC tests still pass**

Run:
```bash
pnpm --filter @hypershell/desktop build
pnpm --filter @hypershell/desktop exec vitest run src/main/ipc/registerIpc.test.ts
```
Expected: build PASS; registerIpc tests PASS (the test mocks `electron` and uses `.toContain` for channels, so new channels do not break it).

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src/main/ipc/registerIpc.ts apps/desktop/src/main/mainLifecycle.ts apps/desktop/src/main/main.ts
git commit -m "feat(updates): register updates IPC and start checks on launch"
```

---

### Task 6: Preload methods + renderer type declarations

**Files:**
- Modify: `apps/desktop/src/preload/desktopApi.ts` (imports ~`1-60`, `DesktopApi` interface `315`, returned object `644`)
- Modify: `apps/ui/src/types/global.d.ts` (imports, `Window.hypershell` interface ~`158-166`)

- [ ] **Step 1: Import the schema and type in the preload**

In `apps/desktop/src/preload/desktopApi.ts`, add `updateStateSchema` to the existing `@hypershell/shared` import block and import the `UpdateState` type. Add to the value import (near `ipcChannels`):

```ts
  updateStateSchema,
```

And add a type import (place beside other `import type { ... } from "@hypershell/shared"` lines, or extend one):

```ts
import type { UpdateState } from "@hypershell/shared";
```

- [ ] **Step 2: Add methods to the `DesktopApi` interface**

In the `DesktopApi` interface (line 315), add:

```ts
  checkForUpdates(): Promise<void>;
  downloadUpdate(): Promise<void>;
  installUpdate(): Promise<void>;
  openUpdateRelease(): Promise<void>;
  getUpdateState(): Promise<UpdateState>;
  onUpdateState(listener: (state: UpdateState) => void): () => void;
```

- [ ] **Step 3: Implement the methods on the returned object**

In the object returned by `createDesktopApi` (line 644), add these members (next to `onHostStatus`):

```ts
    async checkForUpdates(): Promise<void> {
      await ipcRenderer.invoke(ipcChannels.update.check);
    },
    async downloadUpdate(): Promise<void> {
      await ipcRenderer.invoke(ipcChannels.update.download);
    },
    async installUpdate(): Promise<void> {
      await ipcRenderer.invoke(ipcChannels.update.install);
    },
    async openUpdateRelease(): Promise<void> {
      await ipcRenderer.invoke(ipcChannels.update.openRelease);
    },
    async getUpdateState(): Promise<UpdateState> {
      const raw = await ipcRenderer.invoke(ipcChannels.update.getState);
      return updateStateSchema.parse(raw);
    },
    onUpdateState(listener: (state: UpdateState) => void): () => void {
      assertListener(listener, "onUpdateState");

      const wrappedListener = (_event: unknown, payload: unknown) => {
        const parsed = updateStateSchema.safeParse(payload);
        if (!parsed.success) {
          logger.warn?.("Ignored invalid update state payload from IPC", parsed.error);
          return;
        }

        try {
          listener(parsed.data);
        } catch (error) {
          logger.error?.("Update state listener threw", error);
        }
      };

      ipcRenderer.on(ipcChannels.update.state, wrappedListener);

      return () => {
        ipcRenderer.removeListener(ipcChannels.update.state, wrappedListener);
      };
    },
```

- [ ] **Step 4: Declare the methods in `global.d.ts`**

In `apps/ui/src/types/global.d.ts`, add `UpdateState` to the `@hypershell/shared` type import block, then add to the `Window["hypershell"]` interface (near `onHostStatus`, line 162):

```ts
      checkForUpdates?: () => Promise<void>;
      downloadUpdate?: () => Promise<void>;
      installUpdate?: () => Promise<void>;
      openUpdateRelease?: () => Promise<void>;
      getUpdateState?: () => Promise<UpdateState>;
      onUpdateState?: (listener: (state: UpdateState) => void) => () => void;
```

- [ ] **Step 5: Verify both packages typecheck**

Run:
```bash
pnpm --filter @hypershell/desktop build
pnpm --filter @hypershell/ui exec tsc --noEmit
```
Expected: PASS (no type errors referencing `UpdateState` or the new methods).

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/preload/desktopApi.ts apps/ui/src/types/global.d.ts
git commit -m "feat(updates): expose update IPC methods through preload bridge"
```

---

### Task 7: Renderer update store

**Files:**
- Create: `apps/ui/src/features/updates/updateStore.ts`
- Create: `apps/ui/src/features/updates/updateStore.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/ui/src/features/updates/updateStore.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";

import { useUpdateStore, shouldShowBanner } from "./updateStore";

describe("updateStore", () => {
  beforeEach(() => {
    useUpdateStore.setState({ update: null, dismissedVersion: null });
  });

  it("stores pushed state", () => {
    useUpdateStore.getState().setState({
      status: "available",
      currentVersion: "0.1.9",
      availableVersion: "0.2.0"
    });
    expect(useUpdateStore.getState().update?.status).toBe("available");
  });

  it("records the dismissed version", () => {
    useUpdateStore.getState().setState({
      status: "available",
      currentVersion: "0.1.9",
      availableVersion: "0.2.0"
    });
    useUpdateStore.getState().dismiss();
    expect(useUpdateStore.getState().dismissedVersion).toBe("0.2.0");
  });

  it("shows the banner for actionable states", () => {
    expect(
      shouldShowBanner(
        { status: "available", currentVersion: "0.1.9", availableVersion: "0.2.0" },
        null
      )
    ).toBe(true);
    expect(
      shouldShowBanner(
        { status: "downloaded", currentVersion: "0.1.9", availableVersion: "0.2.0" },
        null
      )
    ).toBe(true);
  });

  it("hides the banner for idle/up-to-date and dismissed versions", () => {
    expect(shouldShowBanner({ status: "idle", currentVersion: "0.1.9" }, null)).toBe(false);
    expect(
      shouldShowBanner({ status: "up-to-date", currentVersion: "0.1.9" }, null)
    ).toBe(false);
    expect(
      shouldShowBanner(
        { status: "available", currentVersion: "0.1.9", availableVersion: "0.2.0" },
        "0.2.0"
      )
    ).toBe(false);
  });

  it("keeps the banner while downloading even if dismissed earlier", () => {
    expect(
      shouldShowBanner(
        { status: "downloading", currentVersion: "0.1.9", availableVersion: "0.2.0", progressPercent: 10 },
        "0.2.0"
      )
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
pnpm --filter @hypershell/ui exec vitest run src/features/updates/updateStore.test.ts
```
Expected: FAIL — cannot resolve `./updateStore`.

- [ ] **Step 3: Implement the store**

Create `apps/ui/src/features/updates/updateStore.ts`:

```ts
import { create } from "zustand";
import type { UpdateState } from "@hypershell/shared";

interface UpdateStoreState {
  update: UpdateState | null;
  dismissedVersion: string | null;
  setState: (state: UpdateState) => void;
  dismiss: () => void;
  refresh: () => Promise<void>;
  check: () => Promise<void>;
  download: () => Promise<void>;
  install: () => Promise<void>;
  openRelease: () => Promise<void>;
}

export function shouldShowBanner(
  update: UpdateState | null,
  dismissedVersion: string | null
): boolean {
  if (!update) {
    return false;
  }
  const actionable =
    update.status === "available" ||
    update.status === "manual-available" ||
    update.status === "downloading" ||
    update.status === "downloaded";
  if (!actionable) {
    return false;
  }
  // While actively downloading/downloaded, keep showing regardless of dismissal.
  if (update.status === "downloading" || update.status === "downloaded") {
    return true;
  }
  return update.availableVersion !== dismissedVersion;
}

export const useUpdateStore = create<UpdateStoreState>((set, get) => ({
  update: null,
  dismissedVersion: null,
  setState(state) {
    set({ update: state });
  },
  dismiss() {
    set({ dismissedVersion: get().update?.availableVersion ?? null });
  },
  async refresh() {
    const state = await window.hypershell?.getUpdateState?.();
    if (state) {
      set({ update: state });
    }
  },
  async check() {
    await window.hypershell?.checkForUpdates?.();
  },
  async download() {
    await window.hypershell?.downloadUpdate?.();
  },
  async install() {
    await window.hypershell?.installUpdate?.();
  },
  async openRelease() {
    await window.hypershell?.openUpdateRelease?.();
  }
}));
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
pnpm --filter @hypershell/ui exec vitest run src/features/updates/updateStore.test.ts
```
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/features/updates/updateStore.ts apps/ui/src/features/updates/updateStore.test.ts
git commit -m "feat(updates): add renderer update store"
```

---

### Task 8: Update banner + App wiring

**Files:**
- Create: `apps/ui/src/features/updates/UpdateBanner.tsx`
- Modify: `apps/ui/src/app/App.tsx` (import, subscription effect ~`498`, JSX ~`1596`)

- [ ] **Step 1: Create the banner component**

Create `apps/ui/src/features/updates/UpdateBanner.tsx`:

```tsx
import { AnimatePresence, motion } from "framer-motion";
import { useStore } from "zustand";

import { shouldShowBanner, useUpdateStore } from "./updateStore";

export function UpdateBanner() {
  const update = useStore(useUpdateStore, (s) => s.update);
  const dismissedVersion = useStore(useUpdateStore, (s) => s.dismissedVersion);
  const dismiss = useStore(useUpdateStore, (s) => s.dismiss);
  const download = useStore(useUpdateStore, (s) => s.download);
  const install = useStore(useUpdateStore, (s) => s.install);
  const openRelease = useStore(useUpdateStore, (s) => s.openRelease);

  const visible = shouldShowBanner(update, dismissedVersion);

  return (
    <AnimatePresence>
      {visible && update ? (
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-border bg-base-700 px-4 py-2 text-sm text-text-primary shadow-lg"
          role="status"
        >
          {update.status === "available" ? (
            <>
              <span>
                HyperShell{" "}
                <strong>v{update.availableVersion}</strong> is available
              </span>
              <button
                type="button"
                onClick={() => void download()}
                className="rounded bg-accent px-2 py-1 text-xs font-semibold text-white"
              >
                Download
              </button>
            </>
          ) : null}

          {update.status === "downloading" ? (
            <span>
              Downloading update… {update.progressPercent ?? 0}%
            </span>
          ) : null}

          {update.status === "downloaded" ? (
            <>
              <span>
                Update <strong>v{update.availableVersion}</strong> ready
              </span>
              <button
                type="button"
                onClick={() => void install()}
                className="rounded bg-accent px-2 py-1 text-xs font-semibold text-white"
              >
                Restart &amp; install
              </button>
            </>
          ) : null}

          {update.status === "manual-available" ? (
            <>
              <span>
                HyperShell <strong>v{update.availableVersion}</strong> is available
              </span>
              <button
                type="button"
                onClick={() => void openRelease()}
                className="rounded bg-accent px-2 py-1 text-xs font-semibold text-white"
              >
                Download
              </button>
            </>
          ) : null}

          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss update notification"
            className="ml-1 text-text-muted hover:text-text-primary"
          >
            ✕
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Import the banner and store in App.tsx**

In `apps/ui/src/app/App.tsx`, add near the other feature imports (after the tunnels import at line 51):

```ts
import { UpdateBanner } from "../features/updates/UpdateBanner";
import { useUpdateStore } from "../features/updates/updateStore";
```

- [ ] **Step 3: Subscribe to update-state pushes**

In `apps/ui/src/app/App.tsx`, after the existing `onSessionEvent` effect (ends at line 498), add a new effect:

```ts
  useEffect(() => {
    const store = useUpdateStore.getState();
    void store.refresh();

    if (!window.hypershell?.onUpdateState) {
      return;
    }
    return window.hypershell.onUpdateState((state) => {
      useUpdateStore.getState().setState(state);
    });
  }, []);
```

- [ ] **Step 4: Render the banner**

In `apps/ui/src/app/App.tsx`, add `<UpdateBanner />` next to `<TransferPopup />` (line 1596):

```tsx
      <TransferPopup />

      <UpdateBanner />
```

- [ ] **Step 5: Verify typecheck + build**

Run:
```bash
pnpm --filter @hypershell/ui exec tsc --noEmit
pnpm --filter @hypershell/ui build
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/ui/src/features/updates/UpdateBanner.tsx apps/ui/src/app/App.tsx
git commit -m "feat(updates): add update banner and wire renderer subscription"
```

---

### Task 9: Settings → Updates section

**Files:**
- Modify: `apps/ui/src/features/settings/SettingsPanel.tsx` (tabs array `133-142`, render switch `728-734`, new section component)

- [ ] **Step 1: Add the tab entry**

In `apps/ui/src/features/settings/SettingsPanel.tsx`, add a new tab object to the tabs array immediately after the `import` tab (after line 141, before the closing `];` at 142):

```tsx
  {
    id: "updates",
    label: "Updates",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M8 3v5l3 2M8 1a7 7 0 1 0 7 7"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
```

- [ ] **Step 2: Add the `UpdatesSection` component**

In `apps/ui/src/features/settings/SettingsPanel.tsx`, add this component near the other section components (e.g. directly after `GeneralSection`, before the panel's main component). It uses the update store:

```tsx
function UpdatesSection() {
  const update = useStore(useUpdateStore, (s) => s.update);
  const check = useStore(useUpdateStore, (s) => s.check);
  const refresh = useStore(useUpdateStore, (s) => s.refresh);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const currentVersion = update?.currentVersion ?? "—";
  const checking = update?.status === "checking";

  function statusLine(): string {
    if (!update) {
      return "";
    }
    switch (update.status) {
      case "checking":
        return "Checking for updates…";
      case "available":
      case "manual-available":
        return `Update available: v${update.availableVersion}`;
      case "downloading":
        return `Downloading: ${update.progressPercent ?? 0}%`;
      case "downloaded":
        return `Update v${update.availableVersion} ready to install`;
      case "up-to-date":
        return "You're on the latest version.";
      case "error":
        return `Couldn't check — ${update.error ?? "try again"}`;
      default:
        return "";
    }
  }

  return (
    <div className="grid gap-6">
      <div>
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
          Application Updates
        </h3>
        <div className="grid gap-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-text-primary">Current version</div>
              <div className="text-xs text-text-muted">v{currentVersion}</div>
            </div>
            <button
              type="button"
              onClick={() => void check()}
              disabled={checking}
              className="rounded border border-border px-3 py-1.5 text-xs font-semibold text-text-primary hover:bg-base-600 disabled:opacity-50"
            >
              {checking ? "Checking…" : "Check for updates"}
            </button>
          </div>
          {statusLine() ? (
            <div className="text-xs text-text-muted">{statusLine()}</div>
          ) : null}
          {update?.lastCheckedAt ? (
            <div className="text-xs text-text-muted">
              Last checked: {new Date(update.lastCheckedAt).toLocaleString()}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Import the store and render the section**

Add the import near the top of `SettingsPanel.tsx` (after the `BackupRestorePanel` import at line 18):

```ts
import { useUpdateStore } from "../updates/updateStore";
```

Ensure `useEffect` and `useStore` are imported at the top of the file (they are already used by other sections; if `useEffect` is not imported, add it to the existing `react` import). Then add to the render switch (after line 734's `import` case):

```tsx
        {activeCategory === "updates" && <UpdatesSection />}
```

- [ ] **Step 4: Verify typecheck + build**

Run:
```bash
pnpm --filter @hypershell/ui exec tsc --noEmit
pnpm --filter @hypershell/ui build
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/features/settings/SettingsPanel.tsx
git commit -m "feat(updates): add Updates section to settings"
```

---

### Task 10: Release pipeline metadata upload + bootstrap note

**Files:**
- Modify: `.github/workflows/windows-release.yml:87-101`
- Modify: `.github/workflows/linux-release.yml` (the "attach to release" step — mirror Windows)
- Modify: `docs/INDEX.md` or create `docs/auto-update.md` (operator note)

- [ ] **Step 1: Update the Windows upload step (installer first, metadata last)**

In `.github/workflows/windows-release.yml`, replace the body of the "Attach Windows installer to GitHub release" step (lines 92-101) with ordered uploads:

```bash
          TAG="${GITHUB_REF#refs/tags/}"
          gh release create "$TAG" --generate-notes --title "$TAG" || true
          cd apps/desktop/release
          EXE=$(find . -name '*.exe' | head -1)
          if [ -z "$EXE" ]; then
            echo "No installer found, skipping upload"
            exit 0
          fi
          echo "Uploading installer $EXE to release $TAG"
          gh release upload "$TAG" "$EXE" --clobber
          # Upload auto-update metadata LAST so a polling client never sees
          # an advertised version before its installer asset exists.
          gh release upload "$TAG" latest.yml --clobber || true
          for BLOCKMAP in *.blockmap; do
            [ -e "$BLOCKMAP" ] && gh release upload "$TAG" "$BLOCKMAP" --clobber || true
          done
```

- [ ] **Step 2: Update the Linux upload step (artifacts first, metadata last)**

In `.github/workflows/linux-release.yml`, the "Attach Linux artifacts to GitHub release" step already exists (lines 67-79) with `env: GH_TOKEN` and the tag guard. Replace the `run: |` script body (lines 72-79) with ordered uploads that add the metadata last:

```bash
          TAG="${GITHUB_REF#refs/tags/}"
          gh release create "$TAG" --generate-notes --title "$TAG" || true
          for FILE in apps/desktop/release/*.{AppImage,deb}; do
            if [ -f "$FILE" ]; then
              echo "Uploading $FILE to release $TAG"
              gh release upload "$TAG" "$FILE" --clobber
            fi
          done
          # Upload auto-update metadata LAST so a polling client never sees
          # an advertised version before its installer asset exists.
          if [ -f apps/desktop/release/latest-linux.yml ]; then
            gh release upload "$TAG" apps/desktop/release/latest-linux.yml --clobber || true
          fi
          for BLOCKMAP in apps/desktop/release/*.blockmap; do
            [ -e "$BLOCKMAP" ] && gh release upload "$TAG" "$BLOCKMAP" --clobber || true
          done
```

- [ ] **Step 3: Document the bootstrap caveat**

Create `docs/auto-update.md`:

```markdown
# Auto-Update (electron-updater + GitHub Releases)

HyperShell checks GitHub Releases on launch and every ~4h. On Windows and
Linux it downloads and installs in-app (notify + one-click). On macOS it
shows a "Download" link to the release page (the macOS build is not signed
/ notarized, so unsigned auto-install is not offered).

## Bootstrap caveat (first auto-update-enabled release)

Auto-update relies on `app-update.yml`, which is only bundled into builds
produced **after** `publish: github` was added to `electron-builder.yml`.

Consequence: the **first** release built with auto-update enabled cannot
deliver itself to existing users — they must install it manually one last
time. Every release **after** that one auto-updates normally. Call this out
in the release notes for the first auto-update build.

## Release metadata

The CI release jobs upload, in this order, to each GitHub Release:
1. The installer (`*.exe` / `*.AppImage`)
2. `latest.yml` / `latest-linux.yml`
3. `*.blockmap`

Order matters: clients poll `latest*.yml`; uploading it before the
installer would briefly advertise a version whose asset 404s.
```

Add a link to it from `docs/INDEX.md` under the appropriate section (match the existing list style in that file).

- [ ] **Step 4: Validate workflow YAML**

Run:
```bash
node -e "const yaml=require('js-yaml');const fs=require('fs');for(const f of ['.github/workflows/windows-release.yml','.github/workflows/linux-release.yml']){yaml.load(fs.readFileSync(f,'utf8'));console.log(f+' OK');}"
```
Expected: both files print `OK` (valid YAML). If `js-yaml` is not resolvable at the repo root, run this inside `apps/desktop` (which depends on electron-builder → js-yaml) or skip and rely on the GitHub Actions linter.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/windows-release.yml .github/workflows/linux-release.yml docs/auto-update.md docs/INDEX.md
git commit -m "ci(updates): upload electron-updater metadata + document bootstrap"
```

---

### Final verification

- [ ] **Step 1: Full workspace build + tests**

Run:
```bash
pnpm build
pnpm test
```
Expected: build PASS; all unit tests PASS, including the new `updateSchemas`, `updateLogic`, `updateService`, and `updateStore` suites.

- [ ] **Step 2: Manual verification (documented, run before tagging a release)**

This cannot run in CI (installers can't relaunch headlessly). Perform once locally:
- Build two versions (e.g. 0.1.99 then 0.2.0) and point a local `dev-app-update.yml` (or a real test GitHub release) at them.
- **Windows:** launch the older build → banner appears → Download → progress → "Restart & install" → confirm the **installer shows no UI** and the app relaunches on the new version. If the NSIS installer shows UI during the update, evaluate setting `oneClick: true` in `electron-builder.yml` for the update path (verify, do not pre-flip).
- **Linux (AppImage):** repeat; confirm the AppImage is swapped and relaunches.
- **macOS:** confirm the banner shows a "Download" button that opens the GitHub release page in the browser (no in-app install).
