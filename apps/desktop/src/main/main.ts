import { app, ipcMain, powerMonitor } from "electron";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  createSavedSessionRepositoryFromDatabase,
  type HostRecord,
  type SavedSessionInput,
  type SqliteDatabase,
} from "@hypershell/db";

import { createHostMonitor } from "./monitoring/hostMonitor";
import { registerIpc, sessionManager } from "./ipc/registerIpc";
import { performAutoBackup } from "./ipc/backupIpc";
import { createAppMenu } from "./menu/createAppMenu";
import { createTray } from "./tray/createTray";
import { createMainWindow } from "./windows/createMainWindow";
import { createMainProcessLifecycle } from "./mainLifecycle";
import { clearAll as clearCredentialCache } from "./security/credentialCache";
import { getOrCreateDatabase, getOrCreateHostsRepo } from "./ipc/hostsIpc";

const SESSION_RECOVERY_SAVE_INTERVAL_MS = 30_000;

let savedSessionRepository:
  | ReturnType<typeof createSavedSessionRepositoryFromDatabase>
  | null = null;
let sessionRecoveryTimer: ReturnType<typeof setInterval> | null = null;

function getSavedSessionRepository():
  | ReturnType<typeof createSavedSessionRepositoryFromDatabase>
  | null {
  if (savedSessionRepository) {
    return savedSessionRepository;
  }

  const db = getOrCreateDatabase() as SqliteDatabase | null;
  if (!db) {
    return null;
  }

  savedSessionRepository = createSavedSessionRepositoryFromDatabase(db);
  return savedSessionRepository;
}

function resolveHostForProfile(
  hosts: HostRecord[],
  profileId: string
): HostRecord | undefined {
  return hosts.find(
    (host) =>
      host.id === profileId ||
      (host.username ? profileId === `${host.username}@${host.hostname}` : false) ||
      profileId === host.hostname ||
      profileId === host.name
  );
}

function collectSavedSessions(): SavedSessionInput[] {
  const sessions = sessionManager.listSessions();
  const hosts = getOrCreateHostsRepo().list();

  return sessions.map((session) => {
    const host =
      session.transport === "ssh"
        ? resolveHostForProfile(hosts, session.profileId)
        : undefined;
    return {
      id: session.sessionId,
      hostId: host?.id ?? null,
      transport: session.transport,
      profileId: session.profileId,
      title: host?.name ?? session.profileId,
    };
  });
}

function persistSessionRecoverySnapshot(): void {
  if (sessionManager.listSessions().length === 0) {
    return;
  }
  const repo = getSavedSessionRepository();
  if (!repo) {
    return;
  }
  repo.replaceAll(collectSavedSessions());
}

function getRendererUrl(): string {
  if (process.env.SSHTERM_RENDERER_URL) {
    return process.env.SSHTERM_RENDERER_URL;
  }

  const bundledRendererEntry = path.join(
    import.meta.dirname,
    "..",
    "renderer",
    "index.html"
  );

  if (existsSync(bundledRendererEntry)) {
    return pathToFileURL(bundledRendererEntry).toString();
  }

  return "http://localhost:5173";
}

const mainProcessLifecycle = createMainProcessLifecycle({
  app,
  ipcMain,
  createMainWindow,
  createTray,
  createHostMonitor,
  registerIpc,
  getRendererUrl
});

async function bootstrap(): Promise<void> {
  createAppMenu();
  performAutoBackup();
  await mainProcessLifecycle.bootstrap();

  if (!sessionRecoveryTimer) {
    sessionRecoveryTimer = setInterval(
      persistSessionRecoverySnapshot,
      SESSION_RECOVERY_SAVE_INTERVAL_MS
    );
  }

  if (process.platform === "win32") {
    powerMonitor.on("lock-screen", () => {
      clearCredentialCache();
    });
  }
}

void bootstrap();

app.on("before-quit", () => {
  if (sessionRecoveryTimer) {
    clearInterval(sessionRecoveryTimer);
    sessionRecoveryTimer = null;
  }
  getSavedSessionRepository()?.markAllGraceful();
  clearCredentialCache();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
