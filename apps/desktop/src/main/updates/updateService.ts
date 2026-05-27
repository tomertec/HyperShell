import { app, shell } from "electron";

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
