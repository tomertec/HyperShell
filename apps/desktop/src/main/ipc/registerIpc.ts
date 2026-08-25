import { randomUUID } from "node:crypto";

import {
  closeSessionRequestSchema,
  exportHostsRequestSchema,
  hostStatusTargetsRequestSchema,
  hostStatsRequestSchema,
  ipcChannels,
  openSessionRequestSchema,
  resizeSessionRequestSchema,
  setSignalsRequestSchema,
  writeSessionRequestSchema,
  DEFAULT_RECONNECT_BASE_INTERVAL,
  DEFAULT_RECONNECT_MAX_ATTEMPTS
} from "@hypershell/shared";
import type { HostStatsResponse } from "@hypershell/shared";
import type {
  CloseSessionRequest,
  OpenSessionRequest,
  OpenSessionResponse,
  ResizeSessionRequest,
  WriteSessionRequest
} from "@hypershell/shared";
import {
  createNetworkMonitor,
  createProcessTitlePoller,
  createSessionManager,
  createSsh2ConnectionPool,
  createWindowsProcessTreeProvider,
} from "@hypershell/session-core";
import {
  registerHostIpc,
  getOrCreateHostsRepo,
  getOrCreateDatabase,
  resolveStoredHostPassword
} from "./hostsIpc";
import {
  exportHostsToCsv,
  exportHostsToJson,
  exportHostsToSshConfig
} from "./hostExport";
import { registerSettingsIpc } from "./settingsIpc";
import { registerSshConfigIpc } from "./sshConfigIpc";
import { registerPortForwardIpc } from "./portForwardIpc";
import { registerGroupsIpc } from "./groupsIpc";
import { registerTagIpc } from "./tagIpc";
import { registerSerialProfilesIpc } from "./serialProfilesIpc";
import { registerLocalProfilesIpc } from "./localProfilesIpc";
import { registerHostProfileIpc } from "./hostProfileIpc";
import { registerHostEnvVarIpc } from "./hostEnvVarIpc";
import { registerSftpIpc } from "./sftpIpc";
import { registerFsIpc } from "./fsIpc";
import { registerWorkspaceIpc } from "./workspaceIpc";
import { registerSshKeysIpc } from "./sshKeysIpc";
import { registerHostPortForwardIpc } from "./hostPortForwardIpc";
import { registerOpIpc } from "./opIpc";
import { registerEditorIpc } from "./editorIpc";
import { registerSnippetsIpc } from "./snippetsIpc";
import { createSessionLogger, registerLoggingIpc } from "./loggingIpc";
import {
  createSessionRecordingManager,
  registerRecordingIpc,
  type SessionRecordingManager,
} from "./recordingIpc";
import { registerConnectionHistoryIpc } from "./connectionHistoryIpc";
import { registerHostFingerprintIpc } from "./hostFingerprintIpc";
import { registerPuttyImportIpc } from "./puttyImportIpc";
import { registerSshManagerImportIpc } from "./sshManagerImportIpc";
import { registerBackupIpc } from "./backupIpc";
import { registerSessionRecoveryIpc } from "./sessionRecoveryIpc";
import {
  createRendererSessionOwnership,
  type ReapableRenderer,
} from "../rendererSessionOwnership";
import { registerTmuxIpc } from "./tmuxIpc";
import { routeSessionEvent } from "./routeSessionEvent";
import { registerGhosttyIpc } from "./ghosttyIpc";
import { createGhosttyHostProcess } from "../ghosttyHost/hostProcess";
import { createGhosttyHostClient, type GhosttyHostClient, type GhosttyRendererEvent } from "../ghosttyHost/ghosttyHostClient";
import { resolveGhosttyHostPath } from "../ghosttyHost/hostPath";
import { registerClaudeIpc } from "./claudeIpc";
import { buildClaudeResumeCommand } from "./claudeResumeCommand";
import { applyClaudeSessionArgs } from "./claudeSessionArgs";
import { createClaudeSessionBinder } from "../claudeSessionBinder";
import { getClaudeSessionInfo, scanRecentClaudeSessions, watchClaudeSessions } from "../claudeSessions";
import { getUpdateService, setUpdateStateEmitter } from "../updates/updateService";
import {
  createHostStatusService,
  type HostStatusTarget,
} from "../monitoring/hostStatusService";
import {
  get as getCachedCredential,
  set as setCachedCredential
} from "../security/credentialCache";
import {
  createCredentialResolver,
  stripDomain,
  type CredentialResolver
} from "../connection/credentialResolver";
import { resolveSftpConnectionOptions } from "../connection/sftpConnectionOptions";
import {
  createHostEnvVarRepositoryFromDatabase,
  createConnectionHistoryRepositoryFromDatabase,
  createGroupsRepository,
  createSerialProfilesRepository,
  createLocalProfilesRepository,
  createLocalProfilesRepositoryFromDatabase
} from "@hypershell/db";
import type { SerialProfileRecord, SqliteDatabase, HostRecord as DbHostRecord } from "@hypershell/db";
import type {
  SessionManager,
  SessionTransportEvent,
  TransportHandle,
  OpenSessionInput,
  SerialConnectionOptions,
  TelnetConnectionOptions
} from "@hypershell/session-core";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { BrowserWindow } from "electron";
import { writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

const registeredChannels = [
  ipcChannels.session.open,
  ipcChannels.session.resize,
  ipcChannels.session.write,
  ipcChannels.session.close,
  ipcChannels.hosts.list,
  ipcChannels.hosts.upsert,
  ipcChannels.hosts.remove,
  ipcChannels.hosts.reorder,
  ipcChannels.hosts.importSshConfig,
  ipcChannels.hosts.exportHosts,
  ipcChannels.hosts.scanPutty,
  ipcChannels.hosts.scanSshManager,
  ipcChannels.hosts.importSshManager,
  ipcChannels.hosts.setStatusTargets,
  ipcChannels.settings.get,
  ipcChannels.settings.update,
  ipcChannels.portForward.start,
  ipcChannels.portForward.stop,
  ipcChannels.portForward.list,
  ipcChannels.groups.list,
  ipcChannels.groups.upsert,
  ipcChannels.groups.remove,
  ipcChannels.tags.list,
  ipcChannels.tags.upsert,
  ipcChannels.tags.remove,
  ipcChannels.tags.getHostTags,
  ipcChannels.tags.setHostTags,
  ipcChannels.serialProfiles.list,
  ipcChannels.serialProfiles.upsert,
  ipcChannels.serialProfiles.remove,
  ipcChannels.serialProfiles.listPorts,
  ipcChannels.localProfiles.list,
  ipcChannels.localProfiles.upsert,
  ipcChannels.localProfiles.remove,
  ipcChannels.localProfiles.setHidden,
  ipcChannels.localProfiles.reorder,
  ipcChannels.localProfiles.getEnvVars,
  ipcChannels.localProfiles.rescan,
  ipcChannels.hostProfiles.list,
  ipcChannels.hostProfiles.upsert,
  ipcChannels.hostProfiles.remove,
  ipcChannels.hostEnvVars.list,
  ipcChannels.hostEnvVars.replace,
  ipcChannels.session.setSignals,
  ipcChannels.session.hostStats,
  ipcChannels.session.saveState,
  ipcChannels.session.loadSavedState,
  ipcChannels.session.clearSavedState,
  ipcChannels.sftp.connect,
  ipcChannels.sftp.disconnect,
  ipcChannels.sftp.list,
  ipcChannels.sftp.stat,
  ipcChannels.sftp.chmod,
  ipcChannels.sftp.mkdir,
  ipcChannels.sftp.rename,
  ipcChannels.sftp.delete,
  ipcChannels.sftp.readFile,
  ipcChannels.sftp.writeFile,
  ipcChannels.sftp.transferStart,
  ipcChannels.sftp.transferCancel,
  ipcChannels.sftp.transferPause,
  ipcChannels.sftp.transferResume,
  ipcChannels.sftp.transferList,
  ipcChannels.sftp.transferResolveConflict,
  ipcChannels.sftp.event,
  ipcChannels.sftp.bookmarksList,
  ipcChannels.sftp.bookmarksUpsert,
  ipcChannels.sftp.bookmarksRemove,
  ipcChannels.sftp.bookmarksReorder,
  ipcChannels.sftp.syncStart,
  ipcChannels.sftp.syncStop,
  ipcChannels.sftp.syncList,
  ipcChannels.sftp.syncEvent,
  ipcChannels.workspace.save,
  ipcChannels.workspace.load,
  ipcChannels.workspace.list,
  ipcChannels.workspace.remove,
  ipcChannels.workspace.saveLast,
  ipcChannels.workspace.loadLast,
  ipcChannels.fs.list,
  ipcChannels.fs.stat,
  ipcChannels.fs.getHome,
  ipcChannels.fs.getDrives,
  ipcChannels.fs.listSshKeys,
  ipcChannels.sshKeys.list,
  ipcChannels.sshKeys.generate,
  ipcChannels.sshKeys.getFingerprint,
  ipcChannels.sshKeys.remove,
  ipcChannels.hostPortForward.list,
  ipcChannels.hostPortForward.upsert,
  ipcChannels.hostPortForward.remove,
  ipcChannels.hostPortForward.reorder,
  ipcChannels.connectionPool.stats,
  ipcChannels.op.listVaults,
  ipcChannels.op.listItems,
  ipcChannels.op.getItemFields,
  ipcChannels.editor.openEditor,
  ipcChannels.snippets.list,
  ipcChannels.snippets.upsert,
  ipcChannels.snippets.remove,
  ipcChannels.logging.start,
  ipcChannels.logging.stop,
  ipcChannels.logging.getState,
  ipcChannels.recording.start,
  ipcChannels.recording.stop,
  ipcChannels.recording.getState,
  ipcChannels.recording.list,
  ipcChannels.recording.delete,
  ipcChannels.recording.getFrames,
  ipcChannels.recording.export,
  ipcChannels.connectionHistory.listByHost,
  ipcChannels.connectionHistory.listRecent,
  ipcChannels.hostFingerprint.lookup,
  ipcChannels.hostFingerprint.trust,
  ipcChannels.hostFingerprint.remove,
  ipcChannels.backup.create,
  ipcChannels.backup.restore,
  ipcChannels.backup.list,
  ipcChannels.backup.showOpenDialog,
  ipcChannels.tmux.probe,
  ipcChannels.claude.sessionInfo,
  ipcChannels.app.setTheme,
  ipcChannels.update.check,
  ipcChannels.update.download,
  ipcChannels.update.install,
  ipcChannels.update.openRelease,
  ipcChannels.update.getState,
  ipcChannels.ghostty.surfaceCreate,
  ipcChannels.ghostty.surfaceDestroy,
  ipcChannels.ghostty.surfaceBounds,
  ipcChannels.ghostty.surfaceVisible,
  ipcChannels.ghostty.surfaceFocus,
  ipcChannels.ghostty.surfaceCommand,
  ipcChannels.ghostty.overlayGuard,
  ipcChannels.ghostty.updateConfig,
  ipcChannels.session.broadcastTargets,
] as const;

const networkMonitor = createNetworkMonitor({
  probeIntervalMs: process.env.VITEST || process.env.NODE_ENV === "test" ? 0 : 10_000
});
export const sessionManager = createSessionManager({
  networkMonitor,
  processTitlePoller: createProcessTitlePoller({
    provider: createWindowsProcessTreeProvider()
  })
});

// Ghostty host + client wiring. Constructing these never spawns the host
// process — GhosttyHostProcess only spawns inside its own start(), which we
// call lazily (see ensureGhosttyHostStarted) on the first surface-create IPC
// call, not here at module load. That keeps every test/registerIpc-import
// spawn-free.
//
// `manager` is resolved fresh inside registerIpc() on every call (tests pass
// a fake sessionManager via options.sessionManager), so writeSession/
// resizeSession/emitGhosttyEvent below read through mutable indirection
// variables that registerIpc() updates on each call, rather than closing
// over the module-level `sessionManager` directly.
let activeSessionManagerForGhostty: SessionManager = sessionManager;
let ghosttyEventEmitter: (event: GhosttyRendererEvent) => void = () => {};
const ghosttyBroadcastState: { enabled: boolean; targetSessionIds: string[] } = {
  enabled: false,
  targetSessionIds: []
};
let ghosttyGlobalConfigBlob = "";

export let ghosttyClient: GhosttyHostClient | null = null;
let ghosttyHost: ReturnType<typeof createGhosttyHostProcess> | null = null;
let ghosttyHostStartPromise: Promise<void> | null = null;

try {
  const exePath = resolveGhosttyHostPath();
  // `client` is referenced by the host's callbacks before it exists — see
  // ghosttyHostClient.ts's CreateGhosttyHostClientOptions doc comment for why
  // this forward-reference ordering is required.
  let client: GhosttyHostClient;
  const host = createGhosttyHostProcess({
    exePath,
    onFrame: (frame) => client.onFrame(frame),
    onRestart: () => client.onRestart(),
    onDead: (reason) => {
      console.error(`[ghostty] host process died: ${reason}`);
    }
  });
  client = createGhosttyHostClient({
    host,
    writeSession: (sessionId, data) => activeSessionManagerForGhostty.write(sessionId, data),
    resizeSession: (sessionId, cols, rows) => activeSessionManagerForGhostty.resize(sessionId, cols, rows),
    emitGhosttyEvent: (event) => ghosttyEventEmitter(event),
    getBroadcastTargets: () =>
      ghosttyBroadcastState.enabled ? ghosttyBroadcastState.targetSessionIds : null,
    getGlobalConfig: () => ghosttyGlobalConfigBlob
  });
  ghosttyHost = host;
  ghosttyClient = client;
} catch (error) {
  // Dev without GHOSTTY_HOST_PATH set (and no packaged process.resourcesPath)
  // must not break unrelated app startup — ghostty features degrade to a
  // clear per-call error (see ghosttyIpc.ts's requireClient) instead.
  console.error("[ghostty] host process unavailable; ghostty features disabled", error);
}

function ensureGhosttyHostStarted(): Promise<void> {
  if (!ghosttyHost) {
    return Promise.reject(new Error("ghostty host process is unavailable"));
  }
  if (!ghosttyHostStartPromise) {
    const host = ghosttyHost;
    ghosttyHostStartPromise = host.start().catch((error: unknown) => {
      // Allow a later surface-create to retry instead of latching a
      // permanent failure from a transient first-launch problem.
      ghosttyHostStartPromise = null;
      throw error;
    });
  }
  return ghosttyHostStartPromise;
}

const ssh2ConnectionPool = createSsh2ConnectionPool();
const sessionLogger = createSessionLogger();
// Tracks which Claude conversation each local tab is running, including ones
// started by typing `claude` at a prompt rather than from a Claude profile.
export const claudeSessionBinder = createClaudeSessionBinder({
  scanRecent: scanRecentClaudeSessions,
  watch: watchClaudeSessions,
});
let sessionRecorder: SessionRecordingManager | null = null;
let connectionHistoryRepository: ReturnType<typeof createConnectionHistoryRepositoryFromDatabase> | null = null;
let hostEnvVarRepository: ReturnType<typeof createHostEnvVarRepositoryFromDatabase> | null = null;
let localProfilesRepository: ReturnType<typeof createLocalProfilesRepositoryFromDatabase> | null = null;

export function disposeSessionRuntime(): void {
  claudeSessionBinder.dispose();
  sessionManager.destroyAll();
  ssh2ConnectionPool.destroyAll();
  networkMonitor.dispose();
}

function getSessionRecorder(): SessionRecordingManager {
  if (!sessionRecorder) {
    sessionRecorder = createSessionRecordingManager(
      getOrCreateDatabase() as SqliteDatabase
    );
  }
  return sessionRecorder;
}

const recordingIpcManager: SessionRecordingManager = {
  start(request) {
    return getSessionRecorder().start(request);
  },
  stop(request) {
    if (!sessionRecorder) {
      return Promise.resolve(null);
    }
    return sessionRecorder.stop(request);
  },
  getState(sessionId) {
    if (!sessionRecorder) {
      return { active: false, recording: null };
    }
    return sessionRecorder.getState(sessionId);
  },
  list() {
    return getSessionRecorder().list();
  },
  delete(id) {
    return getSessionRecorder().delete(id);
  },
  getFrames(id) {
    return getSessionRecorder().getFrames(id);
  },
  exportRecording(id, filePath) {
    return getSessionRecorder().exportRecording(id, filePath);
  },
  onSessionData(sessionId, data) {
    sessionRecorder?.onSessionData(sessionId, data);
  },
  stopAll() {
    if (!sessionRecorder) {
      return Promise.resolve();
    }
    return sessionRecorder.stopAll();
  },
};

function getConnectionHistoryRepository():
  | ReturnType<typeof createConnectionHistoryRepositoryFromDatabase>
  | null {
  if (connectionHistoryRepository) {
    return connectionHistoryRepository;
  }

  const db = getOrCreateDatabase() as SqliteDatabase | null;
  if (!db) {
    return null;
  }

  connectionHistoryRepository = createConnectionHistoryRepositoryFromDatabase(db);
  return connectionHistoryRepository;
}

let credentialResolver: CredentialResolver | null = null;

/**
 * Shared by openSessionHandler (SSH) and resolveSftpConnectionOptions (SFTP) —
 * the two used to carry their own copies of host lookup and secret resolution,
 * and the copies drifted. See connection/credentialResolver.ts.
 */
function getCredentialResolver(): CredentialResolver {
  if (credentialResolver) {
    return credentialResolver;
  }

  credentialResolver = createCredentialResolver({
    hosts: () => getOrCreateHostsRepo(),
    readStoredPassword: (host) => resolveStoredHostPassword(host),
    readOnePasswordReference: async (reference) => {
      const { resolveOnePasswordReference } = await import(
        "../security/opResolver.js"
      );
      return resolveOnePasswordReference(reference);
    },
    readCachedCredential: (hostname, port, username, ttlMs) =>
      getCachedCredential(hostname, port, username, ttlMs),
    credentialCacheConfig: () => getCredentialCacheConfig(),
    trace: (transport, message, details) =>
      logAuthTrace(isAuthTraceEnabled(), transport, message, details)
  });

  return credentialResolver;
}

function getHostEnvVarRepository():
  | ReturnType<typeof createHostEnvVarRepositoryFromDatabase>
  | null {
  if (hostEnvVarRepository) {
    return hostEnvVarRepository;
  }

  const db = getOrCreateDatabase() as SqliteDatabase | null;
  if (!db) {
    return null;
  }

  hostEnvVarRepository = createHostEnvVarRepositoryFromDatabase(db);
  return hostEnvVarRepository;
}

/**
 * Local profiles must live in the shared file database or nothing the user does
 * to them survives a quit — including the generated profile ids that a restored
 * local tab in `saved_sessions` refers back to. The in-memory fallback exists
 * only for the case where the database itself could not be opened (see Plan
 * Amendment 2); it keeps the feature usable for the session rather than
 * throwing on every call.
 */
function getLocalProfilesRepo(): ReturnType<typeof createLocalProfilesRepositoryFromDatabase> {
  if (localProfilesRepository) {
    return localProfilesRepository;
  }

  const db = getOrCreateDatabase() as SqliteDatabase | null;
  localProfilesRepository = db
    ? createLocalProfilesRepositoryFromDatabase(db)
    : createLocalProfilesRepository();

  return localProfilesRepository;
}

export function resolveLocalProfileForSession(id: string):
  | {
      name: string;
      executable: string;
      args: string[];
      startingDirectory: string | null;
      isAvailable: boolean;
      envVars: Record<string, string>;
      claudeSession: boolean;
      claudeSessionMode: "continue" | "new";
    }
  | undefined {
  const repo = getLocalProfilesRepo();
  const profile = repo.get(id);
  if (!profile) {
    return undefined;
  }

  const envVars = Object.fromEntries(
    repo
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
    envVars,
    claudeSession: profile.claudeSession,
    claudeSessionMode: profile.claudeSessionMode
  };
}

const groupsRepo = createGroupsRepository();
const serialProfilesRepo = createSerialProfilesRepository();

let cleanupRegisteredIpc: (() => void) | null = null;

export interface RegisterIpcOptions {
  emitSessionEvent?: (event: unknown) => void;
  emitSftpEvent?: (event: unknown) => void;
  emitSyncEvent?: (event: unknown) => void;
  emitKeyboardInteractive?: (event: unknown) => void;
  emitHostStatusEvent?: (event: unknown) => void;
  emitUpdateState?: (state: unknown) => void;
  emitGhosttyEvent?: (event: unknown) => void;
  sessionManager?: SessionManager;
  db?: unknown;
  resolveHostProfile?: (profileId: string) => Promise<{ hostname: string; username?: string; port?: number; identityFile?: string; password?: string; proxyJump?: string; keepAliveSeconds?: number } | null>;
  resolveSerialProfile?: (profileId: string) => SerialProfileRecord | undefined;
}

export type IpcMainLike = Pick<IpcMain, "handle"> &
  Partial<Pick<IpcMain, "on" | "removeHandler" | "removeListener">>;

const APP_SETTINGS_KEY = "app.settings";
const DEFAULT_CONNECTION_HISTORY_RETENTION_DAYS = 90;
const DEFAULT_CREDENTIAL_CACHE_ENABLED = true;
const DEFAULT_CREDENTIAL_CACHE_TTL_MINUTES = 15;
const MIN_CREDENTIAL_CACHE_TTL_MINUTES = 1;
const MAX_CREDENTIAL_CACHE_TTL_MINUTES = 24 * 60;

function toComparablePath(inputPath: string): string {
  return process.platform === "win32" ? inputPath.toLowerCase() : inputPath;
}

function isPathWithinRoot(targetPath: string, rootPath: string): boolean {
  const relative = path.relative(rootPath, targetPath);
  if (relative === "" || relative === ".") {
    return true;
  }

  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

type DbWithPrepare = {
  prepare(sql: string): {
    get(...args: unknown[]): unknown;
  };
};

type StoredAppSettings = {
  debug?: {
    authTracing?: unknown;
  };
  general?: {
    connectionHistoryRetentionDays?: unknown;
  };
  security?: {
    credentialCacheEnabled?: unknown;
    credentialCacheTtlMinutes?: unknown;
  };
};

function readStoredAppSettings(): StoredAppSettings | null {
  const db = getOrCreateDatabase() as DbWithPrepare | null;
  if (!db) {
    return null;
  }

  try {
    const row = db
      .prepare("SELECT value FROM app_settings WHERE key = ?")
      .get(APP_SETTINGS_KEY) as { value?: unknown } | undefined;
    if (!row || typeof row.value !== "string") {
      return null;
    }
    return JSON.parse(row.value) as StoredAppSettings;
  } catch {
    return null;
  }
}

function getConnectionHistoryRetentionDays(): number {
  if (process.env.VITEST || process.env.NODE_ENV === "test") {
    return DEFAULT_CONNECTION_HISTORY_RETENTION_DAYS;
  }

  const parsed = readStoredAppSettings();
  const rawDays = parsed?.general?.connectionHistoryRetentionDays;
  const numericDays =
    typeof rawDays === "number" ? rawDays : Number.parseInt(String(rawDays), 10);
  if (!Number.isFinite(numericDays)) {
    return DEFAULT_CONNECTION_HISTORY_RETENTION_DAYS;
  }
  return Math.min(3650, Math.max(1, Math.floor(numericDays)));
}

function isAuthTraceEnabled(): boolean {
  if (process.env.VITEST || process.env.NODE_ENV === "test") {
    return false;
  }

  return Boolean(readStoredAppSettings()?.debug?.authTracing);
}

function getCredentialCacheConfig(): { enabled: boolean; ttlMs: number } {
  const parsed = readStoredAppSettings();
  const enabled =
    typeof parsed?.security?.credentialCacheEnabled === "boolean"
      ? parsed.security.credentialCacheEnabled
      : DEFAULT_CREDENTIAL_CACHE_ENABLED;

  const rawTtlMinutes = parsed?.security?.credentialCacheTtlMinutes;
  const numericTtlMinutes =
    typeof rawTtlMinutes === "number"
      ? rawTtlMinutes
      : Number.parseInt(String(rawTtlMinutes), 10);

  const ttlMinutes = Number.isFinite(numericTtlMinutes)
    ? Math.min(
        MAX_CREDENTIAL_CACHE_TTL_MINUTES,
        Math.max(MIN_CREDENTIAL_CACHE_TTL_MINUTES, Math.floor(numericTtlMinutes))
      )
    : DEFAULT_CREDENTIAL_CACHE_TTL_MINUTES;

  return {
    enabled,
    ttlMs: ttlMinutes * 60_000
  };
}

function logAuthTrace(
  enabled: boolean,
  scope: "ssh" | "sftp",
  message: string,
  metadata?: Record<string, unknown>
): void {
  if (!enabled) {
    return;
  }

  const prefix = `[hypershell][auth:${scope}] ${message}`;
  if (metadata) {
    console.info(prefix, metadata);
    return;
  }
  console.info(prefix);
}

async function openSessionHandler(
  _event: IpcMainInvokeEvent,
  request: OpenSessionRequest,
  manager: SessionManager = sessionManager,
  resolveHostProfile?: RegisterIpcOptions["resolveHostProfile"],
  resolveSerialProfile?: RegisterIpcOptions["resolveSerialProfile"],
  resolveLocalProfile?: (profileId: string) =>
    | {
        name: string;
        executable: string;
        args: string[];
        startingDirectory: string | null;
        isAvailable: boolean;
        envVars?: Record<string, string>;
        claudeSession?: boolean;
        claudeSessionMode?: "continue" | "new";
      }
    | undefined
): Promise<OpenSessionResponse> {
  const parsed = openSessionRequestSchema.parse(request);
  const authTraceEnabled = isAuthTraceEnabled();

  let resolvedHost: DbHostRecord | null = null;

  let sshOptions:
    | {
        hostname: string;
        username?: string;
        port?: number;
        identityFile?: string;
        password?: string;
        proxyJump?: string;
        keepAliveSeconds?: number;
        envVars?: Record<string, string>;
        shellIntegration?: boolean;
      }
    | undefined;

  if (parsed.transport === "ssh") {
    logAuthTrace(authTraceEnabled, "ssh", "Open request received", {
      profileId: parsed.profileId
    });

    if (resolveHostProfile) {
      const profile = await resolveHostProfile(parsed.profileId);
      if (profile) {
        sshOptions = profile;
        logAuthTrace(authTraceEnabled, "ssh", "Resolved profile from resolver", {
          profileId: parsed.profileId,
          hasPassword: Boolean(profile.password),
          hasIdentityFile: Boolean(profile.identityFile)
        });
      }
    }

    // Fall back to host record from database for identity file.
    // profileId may be a host ID or a "user@host" destination string.
    if (!sshOptions) {
      const host = getCredentialResolver().findHost(parsed.profileId);
      if (host) {
        resolvedHost = host;
        sshOptions = {
          hostname: host.hostname,
          username: host.username ?? undefined,
          port: host.port,
          identityFile: host.identityFile ?? undefined,
          shellIntegration: host.shellIntegration ?? true
        };

        if (resolvedHost?.proxyJump) {
          sshOptions.proxyJump = resolvedHost.proxyJump;
        }
        if (resolvedHost?.keepAliveInterval != null) {
          sshOptions.keepAliveSeconds = resolvedHost.keepAliveInterval;
        }

        logAuthTrace(authTraceEnabled, "ssh", "Resolved host from DB", {
          hostId: host.id,
          authMethod: host.authMethod ?? "default",
          hasAuthProfile: Boolean(host.authProfileId)
        });

        // SSH reads the credential cache but never writes it: it authenticates
        // through sshPtyTransport's password-prompt watcher, so there is no
        // auth-success signal to write back on. Only SFTP populates the cache.
        // The key must therefore be spelled the way SFTP spells it — hence
        // stripDomain. It still misses when ssh_config, not the host record,
        // supplies the username, hostname or port, since computing those would
        // mean running `ssh -G` here too.
        const cacheUsername = stripDomain(host.username ?? undefined);
        const password = await getCredentialResolver().resolvePassword(host, {
          transport: "ssh",
          ...(cacheUsername
            ? {
                cacheLookup: {
                  hostname: host.hostname,
                  port: host.port,
                  username: cacheUsername
                }
              }
            : {})
        });
        if (password) {
          sshOptions.password = password;
        }
      }
    }

    const hostForEnvVars =
      resolvedHost ??
      getOrCreateHostsRepo().get(parsed.profileId) ??
      null;
    if (hostForEnvVars) {
      resolvedHost = hostForEnvVars;
      const envVars = getHostEnvVarRepository()?.toEnabledEnvMap(hostForEnvVars.id) ?? {};
      if (Object.keys(envVars).length > 0) {
        sshOptions = {
          ...(sshOptions ?? {
            hostname: hostForEnvVars.hostname,
            username: hostForEnvVars.username ?? undefined,
            port: hostForEnvVars.port,
          }),
          envVars,
        };
      }
    }
  }

  let localOptions:
    | {
        executable: string;
        args?: string[];
        cwd?: string;
        envVars?: Record<string, string>;
        startupCommand?: string;
      }
    | undefined;
  let claudeSessionId: string | undefined;

  if (parsed.transport === "local") {
    const profile = resolveLocalProfile?.(parsed.profileId);

    if (!profile) {
      throw new Error(`Unknown local profile: ${parsed.profileId}`);
    }

    if (!profile.isAvailable) {
      throw new Error(`Local shell is not available: ${profile.name}`);
    }

    const claudeLaunch = applyClaudeSessionArgs(
      {
        args: profile.args,
        claudeSession: profile.claudeSession ?? false,
        claudeSessionMode: profile.claudeSessionMode ?? "continue"
      },
      parsed.claudeResumeSessionId,
      () => randomUUID()
    );
    claudeSessionId = claudeLaunch.claudeSessionId;

    // A shell profile cannot resume through launch args — the conversation was
    // started by typing `claude` at its prompt, so it has to be reattached the
    // same way. The working directory comes from Claude's own session file
    // rather than the renderer; a conversation that no longer exists is left
    // alone, since `claude --resume` would exit and take the shell with it.
    let startupCommand: string | undefined;

    if (!profile.claudeSession && parsed.claudeResumeSessionId) {
      const info = await getClaudeSessionInfo(parsed.claudeResumeSessionId);
      if (info) {
        startupCommand =
          buildClaudeResumeCommand({
            executable: profile.executable,
            claudeSessionId: parsed.claudeResumeSessionId,
            cwd: info.cwd
          }) ?? undefined;

        if (startupCommand) {
          claudeSessionId = parsed.claudeResumeSessionId;
        }
      }
    }

    localOptions = {
      executable: profile.executable,
      args: claudeLaunch.args,
      cwd: profile.startingDirectory ?? undefined,
      envVars: profile.envVars,
      startupCommand
    };
  }

  let serialOptions: SerialConnectionOptions | undefined;

  if (parsed.transport === "serial") {
    const profile = resolveSerialProfile?.(parsed.profileId);
    if (profile) {
      serialOptions = {
        path: profile.path,
        baudRate: profile.baudRate,
        dataBits: profile.dataBits as 5 | 6 | 7 | 8,
        stopBits: profile.stopBits as 1 | 2,
        parity: profile.parity as "none" | "even" | "odd" | "mark" | "space",
        flowControl: profile.flowControl as "none" | "hardware" | "software",
        localEcho: profile.localEcho,
        dtr: profile.dtr,
        rts: profile.rts
      };
    }
  }

  let telnetOptions: TelnetConnectionOptions | undefined;

  if (parsed.transport === "telnet" && parsed.telnetOptions) {
    telnetOptions = {
      hostname: parsed.telnetOptions.hostname,
      port: parsed.telnetOptions.port,
      mode: parsed.telnetOptions.mode,
      terminalType: parsed.telnetOptions.terminalType,
    };
  }

  const openInput: OpenSessionInput = {
    ...parsed,
    sshOptions: sshOptions ?? { hostname: parsed.profileId },
    serialOptions,
    telnetOptions,
    localOptions,
    autoReconnect: parsed.autoReconnect ?? Boolean(resolvedHost?.autoReconnect),
    maxReconnectAttempts:
      parsed.reconnectMaxAttempts ?? resolvedHost?.reconnectMaxAttempts ?? DEFAULT_RECONNECT_MAX_ATTEMPTS,
    reconnectBaseInterval:
      parsed.reconnectBaseInterval ?? resolvedHost?.reconnectBaseInterval ?? DEFAULT_RECONNECT_BASE_INTERVAL,
  };

  if (parsed.transport === "ssh") {
    logAuthTrace(authTraceEnabled, "ssh", "Opening SSH session", {
      profileId: parsed.profileId,
      hostname: openInput.sshOptions?.hostname ?? parsed.profileId,
      hasPassword: Boolean(openInput.sshOptions?.password),
      hasIdentityFile: Boolean(openInput.sshOptions?.identityFile)
    });
  }

  const opened = await manager.open(openInput);

  return claudeSessionId ? { ...opened, claudeSessionId } : opened;
}

async function resizeSessionHandler(
  _event: IpcMainInvokeEvent,
  _request: ResizeSessionRequest,
  manager: SessionManager = sessionManager
): Promise<void> {
  const parsed = resizeSessionRequestSchema.parse(_request);
  manager.resize(parsed.sessionId, parsed.cols, parsed.rows);
}

async function writeSessionHandler(
  _event: IpcMainInvokeEvent,
  _request: WriteSessionRequest,
  manager: SessionManager = sessionManager
): Promise<void> {
  const parsed = writeSessionRequestSchema.parse(_request);
  manager.write(parsed.sessionId, parsed.data);
}

async function closeSessionHandler(
  _event: IpcMainInvokeEvent,
  _request: CloseSessionRequest,
  manager: SessionManager = sessionManager,
  onBeforeClose?: (sessionId: string) => void
): Promise<void> {
  const parsed = closeSessionRequestSchema.parse(_request);
  void sessionRecorder?.stop({ sessionId: parsed.sessionId });
  onBeforeClose?.(parsed.sessionId);
  manager.close(parsed.sessionId);
}


const STATS_COMMAND = `echo "CPU:$(cat /proc/loadavg 2>/dev/null | cut -d' ' -f1-3 || sysctl -n vm.loadavg 2>/dev/null | tr -d '{}');MEM:$(free -m 2>/dev/null | awk 'NR==2{printf \\"%d/%dMB\\",$3,$2}' || vm_stat 2>/dev/null | awk '/Pages (active|wired|free)/{s+=$NF}END{printf \\"%dMB\\",s*4096/1048576}');DISK:$(df -h / 2>/dev/null | awk 'NR==2{print $5}');UP:$(uptime -p 2>/dev/null || uptime | sed 's/.*up/up/' | sed 's/,.*load.*//' | xargs)"`;

function parseStatsOutput(raw: string): Omit<HostStatsResponse, "latencyMs"> {
  const result: Omit<HostStatsResponse, "latencyMs"> = {
    cpuLoad: null,
    memUsage: null,
    diskUsage: null,
    uptime: null
  };

  try {
    const parts = raw.trim().split(";");
    for (const part of parts) {
      const colonIdx = part.indexOf(":");
      if (colonIdx < 0) continue;
      const key = part.slice(0, colonIdx).trim();
      const value = part.slice(colonIdx + 1).trim();
      if (!value) continue;

      switch (key) {
        case "CPU":
          result.cpuLoad = value;
          break;
        case "MEM":
          result.memUsage = value;
          break;
        case "DISK":
          result.diskUsage = value;
          break;
        case "UP":
          result.uptime = value;
          break;
      }
    }
  } catch {
    // parse errors are non-fatal
  }

  return result;
}

async function hostStatsHandler(
  _event: IpcMainInvokeEvent,
  request: unknown,
  manager: SessionManager = sessionManager
): Promise<HostStatsResponse> {
  const parsed = hostStatsRequestSchema.parse(request);
  const session = manager.getSession(parsed.sessionId);

  if (!session || session.state !== "connected" || session.transport !== "ssh") {
    return { cpuLoad: null, memUsage: null, diskUsage: null, uptime: null, latencyMs: null };
  }

  const startTime = Date.now();

  try {
    const stdout = await manager.execCommand(parsed.sessionId, STATS_COMMAND);
    const latencyMs = Date.now() - startTime;
    const stats = parseStatsOutput(stdout);
    return { ...stats, latencyMs };
  } catch {
    return { cpuLoad: null, memUsage: null, diskUsage: null, uptime: null, latencyMs: null };
  }
}

export function getRegisteredChannels(): readonly string[] {
  return registeredChannels;
}

export function registerIpc(
  ipcMain: IpcMainLike,
  options: RegisterIpcOptions = {}
): () => void {
  cleanupRegisteredIpc?.();

  const manager = options.sessionManager ?? sessionManager;
  activeSessionManagerForGhostty = manager;
  ghosttyEventEmitter = (event) => {
    options.emitGhosttyEvent?.(event);
  };
  const rendererSessions = createRendererSessionOwnership((sessionId) =>
    manager.close(sessionId)
  );
  const getDb = () => options.db ?? getOrCreateDatabase();
  const recorder = recordingIpcManager;
  const hostStatusService = createHostStatusService();
  const sessionConnectionHistoryIds = new Map<string, string>();
  const sessionHostCache = new Map<string, string | null>();
  const sessionErrorMessages = new Map<string, string>();
  const recordedFailedAttemptSessions = new Set<string>();

  const resolveHostIdForSession = (sessionId: string): string | null => {
    if (sessionHostCache.has(sessionId)) {
      return sessionHostCache.get(sessionId) ?? null;
    }

    const session = manager.getSession(sessionId);
    if (!session || session.transport !== "ssh") {
      sessionHostCache.set(sessionId, null);
      return null;
    }

    const host = getCredentialResolver().findHost(session.profileId);

    const hostId = host?.id ?? null;
    sessionHostCache.set(sessionId, hostId);
    return hostId;
  };

  const markDisconnected = (sessionId: string): void => {
    const recordId = sessionConnectionHistoryIds.get(sessionId);
    if (!recordId) {
      return;
    }
    const repo = getConnectionHistoryRepository();
    if (!repo) {
      return;
    }
    repo.markDisconnected(recordId);
    sessionConnectionHistoryIds.delete(sessionId);
  };

  const recordConnected = (sessionId: string): void => {
    const repo = getConnectionHistoryRepository();
    if (!repo) {
      return;
    }
    const hostId = resolveHostIdForSession(sessionId);
    if (!hostId) {
      return;
    }

    markDisconnected(sessionId);
    const record = repo.record(hostId, true);
    sessionConnectionHistoryIds.set(sessionId, record.id);
    recordedFailedAttemptSessions.delete(sessionId);
    sessionErrorMessages.delete(sessionId);
  };

  const recordFailedAttempt = (sessionId: string, errorMessage?: string): void => {
    if (recordedFailedAttemptSessions.has(sessionId)) {
      return;
    }
    if (sessionConnectionHistoryIds.has(sessionId)) {
      return;
    }

    const repo = getConnectionHistoryRepository();
    if (!repo) {
      return;
    }
    const hostId = resolveHostIdForSession(sessionId);
    if (!hostId) {
      return;
    }

    const message = errorMessage ?? sessionErrorMessages.get(sessionId);
    repo.record(hostId, false, message);
    recordedFailedAttemptSessions.add(sessionId);
  };

  const resolveHostStatusTargets = (hostIds: string[]): HostStatusTarget[] => {
    const hostsById = new Map<string, DbHostRecord>();
    for (const host of getOrCreateHostsRepo().list()) {
      hostsById.set(host.id, host);
    }

    const targets: HostStatusTarget[] = [];
    for (const hostId of hostIds) {
      const host = hostsById.get(hostId);
      if (!host) {
        continue;
      }
      targets.push({
        hostId: host.id,
        hostname: host.hostname,
        port: host.port ?? 22,
      });
    }

    return targets;
  };

  if (!process.env.VITEST && process.env.NODE_ENV !== "test") {
    const connectionHistoryRepo = getConnectionHistoryRepository();
    if (connectionHistoryRepo) {
      connectionHistoryRepo.cleanup(getConnectionHistoryRetentionDays());
    }
  }

  const unsubscribeSessionEvents = manager.onEvent((event) => {
    routeSessionEvent(event, {
      emitSessionEvent: (e) => options.emitSessionEvent?.(e),
      feedData: (sessionId, data) => ghosttyClient?.feedData(sessionId, data),
      sessionClosed: (sessionId, exitCode) => ghosttyClient?.sessionClosed(sessionId, exitCode),
      sessionLogger,
      recorder,
      claudeSessionBinder,
      recordConnected,
      recordFailedAttempt,
      markDisconnected,
      sessionErrorMessages,
      recordedFailedAttemptSessions,
      sessionHostCache,
      rendererSessions,
      hasSession: (sessionId) => Boolean(manager.getSession(sessionId))
    });
  });
  const unsubscribeClaudeBindings = claudeSessionBinder.onBinding(
    (sessionId, claudeSessionId) => {
      options.emitSessionEvent?.({
        type: "claude-session",
        sessionId,
        claudeSessionId
      });
    }
  );
  const unsubscribeHostStatusEvents = hostStatusService.onStatus((event) => {
    options.emitHostStatusEvent?.(event);
  });

  for (const channel of registeredChannels) {
    ipcMain.removeHandler?.(channel);
  }

  ipcMain.handle(ipcChannels.session.open, async (event, request) => {
    const opened = await openSessionHandler(
      event,
      request,
      manager,
      options.resolveHostProfile,
      (id) => serialProfilesRepo.get(id),
      resolveLocalProfileForSession
    );

    const sender = (event as { sender?: ReapableRenderer } | undefined)?.sender;
    if (sender) {
      if (sender.isDestroyed()) {
        // The window died while the open was in flight, so its "destroyed"
        // reap has already run — remembering now would register the session
        // to a renderer that will never come back, leaking the pty until app
        // exit. Close it here instead.
        manager.close(opened.sessionId);
      } else {
        rendererSessions.watch(sender);
        rendererSessions.remember(sender.id, opened.sessionId);
      }
    }

    return opened;
  });
  ipcMain.handle(ipcChannels.session.resize, (event, request) =>
    resizeSessionHandler(event, request, manager)
  );
  ipcMain.handle(ipcChannels.session.write, (event, request) =>
    writeSessionHandler(event, request, manager)
  );
  ipcMain.handle(ipcChannels.session.close, (event, request) =>
    closeSessionHandler(event, request, manager, (sessionId) => {
      rendererSessions.forget(sessionId);
      markDisconnected(sessionId);
      recordedFailedAttemptSessions.delete(sessionId);
      sessionErrorMessages.delete(sessionId);
      sessionHostCache.delete(sessionId);
    })
  );
  ipcMain.handle(ipcChannels.session.setSignals, (_event, request) => {
    const parsed = setSignalsRequestSchema.parse(request);
    manager.setSignals(parsed.sessionId, parsed.signals);
    return { ok: true };
  });
  ipcMain.handle(ipcChannels.session.hostStats, (event, request) =>
    hostStatsHandler(event, request, manager)
  );

  registerHostIpc(ipcMain);
  ipcMain.handle(ipcChannels.hosts.exportHosts, async (_event: unknown, request: unknown) => {
    const parsed = exportHostsRequestSchema.parse(request);
    // Validate export path is absolute and within a safe directory
    const resolved = path.resolve(parsed.filePath);
    if (!path.isAbsolute(parsed.filePath)) {
      throw new Error("Absolute path is required for host export");
    }
    if (process.platform === "win32" && resolved.toLowerCase().startsWith("\\\\.")) {
      throw new Error("Blocked device path");
    }
    const comparableResolved = toComparablePath(resolved);
    const allowedRoots = [homedir(), tmpdir()].map((root) =>
      toComparablePath(path.resolve(root))
    );
    if (!allowedRoots.some((root) => isPathWithinRoot(comparableResolved, root))) {
      throw new Error("Export path must be within the user home or temp directory");
    }
    const repo = getOrCreateHostsRepo();
    const hosts = repo.list();
    let content: string;
    switch (parsed.format) {
      case "json":
        content = exportHostsToJson(hosts);
        break;
      case "csv":
        content = exportHostsToCsv(hosts);
        break;
      case "ssh-config":
        content = exportHostsToSshConfig(hosts);
        break;
      default:
        throw new Error("Unsupported export format");
    }
    writeFileSync(resolved, content, "utf-8");
    return { exported: hosts.length };
  });
  ipcMain.handle(
    ipcChannels.hosts.setStatusTargets,
    (_event: unknown, request: unknown) => {
      const parsed = hostStatusTargetsRequestSchema.parse(request);
      if (parsed.hostIds.length === 0) {
        hostStatusService.setTargets([]);
        hostStatusService.stop();
        return;
      }
      hostStatusService.setTargets(resolveHostStatusTargets(parsed.hostIds));
      hostStatusService.start();
    }
  );
  registerSshConfigIpc(ipcMain, () => getOrCreateHostsRepo());
  registerPuttyImportIpc(ipcMain);
  registerSshManagerImportIpc(
    ipcMain,
    () => getOrCreateHostsRepo(),
    () => groupsRepo,
    () => {
      const { createSnippetsRepositoryFromDatabase } = require("@hypershell/db");
      return createSnippetsRepositoryFromDatabase(getDb() as SqliteDatabase);
    }
  );
  registerSettingsIpc(ipcMain, () => getDb());
  registerPortForwardIpc(ipcMain);
  registerGroupsIpc(ipcMain, () => groupsRepo);
  registerTagIpc(ipcMain, () => getDb() as SqliteDatabase);
  registerSerialProfilesIpc(ipcMain, () => serialProfilesRepo);
  const localProfilesIpc = registerLocalProfilesIpc(ipcMain, getLocalProfilesRepo);
  // Deliberately not awaited and deliberately not synchronous: detection shells
  // out to `wsl.exe`, and `registerIpc` runs before the main window exists.
  // `scheduleDetection` defers the pass to a later macrotask and swallows its
  // own failures, so a wedged shell probe can never leave the app with no
  // window and no tray. `local-profiles:list` awaits the returned promise.
  void localProfilesIpc.scheduleDetection();
  registerHostProfileIpc(ipcMain, () => getDb() as SqliteDatabase);
  registerHostEnvVarIpc(ipcMain, () => getDb() as SqliteDatabase);
  const cleanupSftp = registerSftpIpc(ipcMain, {
    db: getDb() as SqliteDatabase,
    sessionManager: manager,
    connectionPool: ssh2ConnectionPool,
    resolveConnectionOptions: (hostId, request) =>
      resolveSftpConnectionOptions(
        hostId,
        {
          credentials: getCredentialResolver(),
          resolveHostProfile: options.resolveHostProfile,
          trace: (transport, message, details) =>
            logAuthTrace(isAuthTraceEnabled(), transport, message, details)
        },
        request
      ),
    onConnected: ({ connectionOptions }) => {
      if (!connectionOptions.password || !connectionOptions.username) {
        return;
      }

      const { enabled, ttlMs } = getCredentialCacheConfig();
      if (!enabled) {
        return;
      }

      setCachedCredential(
        connectionOptions.hostname,
        connectionOptions.port ?? 22,
        connectionOptions.username,
        connectionOptions.password,
        ttlMs
      );
    },
    emitSftpEvent: (event) => {
      options.emitSftpEvent?.(event);
    },
    emitSyncEvent: (event) => {
      options.emitSyncEvent?.(event);
    },
    emitKeyboardInteractive: (event) => {
      options.emitKeyboardInteractive?.(event);
    },
  });
  registerWorkspaceIpc(ipcMain, () => getDb());
  registerSshKeysIpc(ipcMain);
  registerHostPortForwardIpc(ipcMain, () => getDb() as SqliteDatabase);
  registerOpIpc(ipcMain);
  const unregisterEditor = registerEditorIpc(ipcMain);
  registerSnippetsIpc(ipcMain, () => getDb() as SqliteDatabase);
  registerLoggingIpc(ipcMain, sessionLogger);
  registerRecordingIpc(ipcMain, recorder);
  registerConnectionHistoryIpc(ipcMain, () => getDb() as SqliteDatabase);
  registerHostFingerprintIpc(ipcMain, () => getDb() as SqliteDatabase);
  registerBackupIpc(ipcMain);
  registerSessionRecoveryIpc(ipcMain, () => getDb() as SqliteDatabase);
  registerTmuxIpc(ipcMain, () => getOrCreateHostsRepo());
  registerClaudeIpc();

  const cleanupGhostty = registerGhosttyIpc(ipcMain, {
    client: ghosttyClient,
    ensureHostStarted: ensureGhosttyHostStarted,
    setGlobalConfigBlob: (blob) => {
      ghosttyGlobalConfigBlob = blob;
    },
    setBroadcastState: (state) => {
      ghosttyBroadcastState.enabled = state.enabled;
      ghosttyBroadcastState.targetSessionIds = state.targetSessionIds;
    }
  });

  ipcMain.handle(ipcChannels.app.setTheme, (event: IpcMainInvokeEvent, theme: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const isLight = theme === "light";
    try {
      win.setTitleBarOverlay({
        color: isLight ? "#e3e8f0" : "#0a1929",
        symbolColor: isLight ? "#3e4f63" : "#8899aa",
      });
      win.setBackgroundColor(isLight ? "#e3e8f0" : "#07111f");
    } catch {
      // setTitleBarOverlay may not be available on all platforms
    }
  });

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

  ipcMain.handle(ipcChannels.connectionPool.stats, () => {
    return ssh2ConnectionPool.getStats();
  });

  const cleanupFs = registerFsIpc(ipcMain);

  const cleanup = () => {
    unsubscribeSessionEvents();
    unsubscribeClaudeBindings();
    unsubscribeHostStatusEvents();
    hostStatusService.stop();
    sessionLogger.stopAll();
    void recorder.stopAll();
    sessionConnectionHistoryIds.clear();
    sessionHostCache.clear();
    sessionErrorMessages.clear();
    recordedFailedAttemptSessions.clear();
    cleanupSftp();
    ssh2ConnectionPool.destroyAll();
    cleanupFs();
    unregisterEditor();
    cleanupGhostty();
    for (const channel of registeredChannels) {
      ipcMain.removeHandler?.(channel);
    }

    if (cleanupRegisteredIpc === cleanup) {
      cleanupRegisteredIpc = null;
    }
  };

  cleanupRegisteredIpc = cleanup;
  return cleanup;
}

function createInertTransport(sessionId: string): TransportHandle {
  const listeners = new Set<(event: SessionTransportEvent) => void>();

  return {
    write() {},
    resize() {},
    close() {
      for (const listener of listeners) {
        listener({
          type: "exit",
          sessionId,
          exitCode: null
        });
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

export async function openSessionForTest(
  request: OpenSessionRequest
): Promise<OpenSessionResponse> {
  const result = await openSessionForTestInspectInput(request);
  return result.session;
}

export async function openSessionForTestInspectInput(
  request: OpenSessionRequest,
  options?: {
    resolveHostProfile?: RegisterIpcOptions["resolveHostProfile"] | null;
    resolveSerialProfile?: RegisterIpcOptions["resolveSerialProfile"];
  }
): Promise<{ session: OpenSessionResponse; input: OpenSessionInput | undefined }> {
  let capturedInput: OpenSessionInput | undefined;
  const testSessionManager = createSessionManager({
    createTransport(input) {
      return createInertTransport(input.sessionId);
    },
    sessionIdFactory: () => "test-session-1"
  });

  const originalOpen = testSessionManager.open.bind(testSessionManager);
  const managerWithCapture: SessionManager = {
    ...testSessionManager,
    open(input) {
      capturedInput = input;
      return originalOpen(input);
    }
  };

  const effectiveResolveHostProfile =
    options?.resolveHostProfile === undefined
      ? async (profileId: string) => ({ hostname: profileId })
      : options.resolveHostProfile ?? undefined;

  const session = await openSessionHandler(
    {} as IpcMainInvokeEvent,
    request,
    managerWithCapture,
    effectiveResolveHostProfile,
    options?.resolveSerialProfile,
    resolveLocalProfileForSession
  );

  return {
    session,
    input: capturedInput
  };
}
