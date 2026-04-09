import {
  closeSessionRequestSchema,
  exportHostsRequestSchema,
  hostStatusTargetsRequestSchema,
  hostStatsRequestSchema,
  ipcChannels,
  openSessionRequestSchema,
  resizeSessionRequestSchema,
  setSignalsRequestSchema,
  writeSessionRequestSchema
} from "@hypershell/shared";
import type { HostStatsResponse } from "@hypershell/shared";
import type {
  CloseSessionRequest,
  OpenSessionRequest,
  OpenSessionResponse,
  ResizeSessionRequest,
  SftpConnectRequest,
  WriteSessionRequest
} from "@hypershell/shared";
import { createSessionManager } from "@hypershell/session-core";
import { parseSshConfig } from "@hypershell/session-core";
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
  createHostStatusService,
  type HostStatusTarget,
} from "../monitoring/hostStatusService";
import {
  get as getCachedCredential,
  set as setCachedCredential
} from "../security/credentialCache";
import {
  createHostEnvVarRepositoryFromDatabase,
  createConnectionHistoryRepositoryFromDatabase,
  createGroupsRepository,
  createSerialProfilesRepository
} from "@hypershell/db";
import type { SerialProfileRecord, SqliteDatabase, HostRecord as DbHostRecord } from "@hypershell/db";
import type {
  SessionManager,
  SessionTransportEvent,
  TransportHandle,
  OpenSessionInput,
  SerialConnectionOptions,
  SftpConnectionOptions
} from "@hypershell/session-core";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { spawnSync, execFile } from "node:child_process";
import { promisify } from "node:util";

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
] as const;

export const sessionManager = createSessionManager();
const sessionLogger = createSessionLogger();
let sessionRecorder: SessionRecordingManager | null = null;
let connectionHistoryRepository: ReturnType<typeof createConnectionHistoryRepositoryFromDatabase> | null = null;
let hostEnvVarRepository: ReturnType<typeof createHostEnvVarRepositoryFromDatabase> | null = null;

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

const groupsRepo = createGroupsRepository();
const serialProfilesRepo = createSerialProfilesRepository();

let cleanupRegisteredIpc: (() => void) | null = null;

export interface RegisterIpcOptions {
  emitSessionEvent?: (event: unknown) => void;
  emitSftpEvent?: (event: unknown) => void;
  emitSyncEvent?: (event: unknown) => void;
  emitKeyboardInteractive?: (event: unknown) => void;
  emitHostStatusEvent?: (event: unknown) => void;
  sessionManager?: SessionManager;
  resolveHostProfile?: (profileId: string) => Promise<{ hostname: string; username?: string; port?: number; identityFile?: string; password?: string; proxyJump?: string; keepAliveSeconds?: number } | null>;
  resolveSerialProfile?: (profileId: string) => SerialProfileRecord | undefined;
}

export type IpcMainLike = Pick<IpcMain, "handle"> &
  Partial<Pick<IpcMain, "removeHandler">>;

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
  resolveSerialProfile?: RegisterIpcOptions["resolveSerialProfile"]
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
      const repo = getOrCreateHostsRepo();
      const allHosts = repo.list();
      const host = repo.get(parsed.profileId)
        ?? allHosts.find((h) =>
          parsed.profileId === `${h.username}@${h.hostname}`
          || parsed.profileId === h.hostname
          || parsed.profileId === h.name
        );
      if (host) {
        resolvedHost = host;
        sshOptions = {
          hostname: host.hostname,
          username: host.username ?? undefined,
          port: host.port,
          identityFile: host.identityFile ?? undefined
        };

        if (resolvedHost?.proxyJump) {
          sshOptions.proxyJump = resolvedHost.proxyJump;
        }
        if (resolvedHost?.keepAliveInterval != null) {
          sshOptions.keepAliveSeconds = resolvedHost.keepAliveInterval;
        }

        const hostRecord = host as {
          authMethod?: string;
          authProfileId?: string | null;
          opReference?: string;
        };
        logAuthTrace(authTraceEnabled, "ssh", "Resolved host from DB", {
          hostId: host.id,
          authMethod: hostRecord.authMethod ?? "default",
          hasAuthProfile: Boolean(hostRecord.authProfileId)
        });

        if (hostRecord.authMethod === "password") {
          try {
            const savedPassword = resolveStoredHostPassword(hostRecord);
            if (savedPassword) {
              sshOptions.password = savedPassword;
              logAuthTrace(authTraceEnabled, "ssh", "Loaded saved password from secure storage", {
                hostId: host.id,
                authProfileId: hostRecord.authProfileId ?? null
              });
            } else {
              logAuthTrace(authTraceEnabled, "ssh", "Password auth selected but no saved password found", {
                hostId: host.id,
                authProfileId: hostRecord.authProfileId ?? null
              });
            }
          } catch (err) {
            console.error("[auth] failed to resolve saved host password:", err instanceof Error ? err.message : "unknown error");
          }
        }

        // 1Password op:// reference auth — resolve credential via the 1Password CLI.
        if (hostRecord.authMethod === "op-reference" && hostRecord.opReference) {
          try {
            const { resolveOnePasswordReference } = await import("../security/opResolver.js");
            const resolvedCredential = await resolveOnePasswordReference(hostRecord.opReference);
            if (resolvedCredential.length > 0) {
              sshOptions.password = resolvedCredential;
              logAuthTrace(authTraceEnabled, "ssh", "Resolved credential from 1Password reference", {
                hostId: host.id
              });
            }
          } catch (err) {
            console.error("[1password] failed to resolve reference:", err instanceof Error ? err.message : "unknown error");
          }
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

  const openInput: OpenSessionInput = {
    ...parsed,
    sshOptions: sshOptions ?? { hostname: parsed.profileId },
    serialOptions,
    autoReconnect: parsed.autoReconnect ?? Boolean(resolvedHost?.autoReconnect),
    maxReconnectAttempts: parsed.reconnectMaxAttempts ?? resolvedHost?.reconnectMaxAttempts ?? 5,
    reconnectBaseInterval: parsed.reconnectBaseInterval ?? resolvedHost?.reconnectBaseInterval ?? 1,
  };

  if (parsed.transport === "ssh") {
    logAuthTrace(authTraceEnabled, "ssh", "Opening SSH session", {
      profileId: parsed.profileId,
      hostname: openInput.sshOptions?.hostname ?? parsed.profileId,
      hasPassword: Boolean(openInput.sshOptions?.password),
      hasIdentityFile: Boolean(openInput.sshOptions?.identityFile)
    });
  }

  return manager.open(openInput);
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

async function resolveSftpConnectionOptions(
  hostId: string,
  options: RegisterIpcOptions,
  request: SftpConnectRequest
): Promise<SftpConnectionOptions | null> {
  const authTraceEnabled = isAuthTraceEnabled();
  const allHosts = getOrCreateHostsRepo().list();
  const resolvedHost = allHosts.find(
    (candidate) =>
      candidate.id === hostId ||
      candidate.name === hostId ||
      candidate.hostname === hostId
  );

  const sshConfigPath = path.join(homedir(), ".ssh", "config");
  let sshConfigHosts: ReturnType<typeof parseSshConfig>["hosts"] = [];
  try {
    const sshConfigContent = readFileSync(sshConfigPath, "utf8");
    sshConfigHosts = parseSshConfig(sshConfigContent).hosts;
  } catch {
    sshConfigHosts = [];
  }

  const profileFromResolver = options.resolveHostProfile
    ? await options.resolveHostProfile(resolvedHost?.id ?? hostId)
    : null;

  const fromConfig = resolvedHost
    ? sshConfigHosts.find(
        (entry) =>
          entry.alias === resolvedHost.name ||
          entry.alias === resolvedHost.hostname ||
          entry.hostName === resolvedHost.hostname
      )
    : sshConfigHosts.find(
        (entry) => entry.alias === hostId || entry.hostName === hostId
      );

  const hostname =
    profileFromResolver?.hostname ??
    resolvedHost?.hostname ??
    fromConfig?.hostName ??
    fromConfig?.alias ??
    hostId;
  const username =
    profileFromResolver?.username ??
    resolvedHost?.username ??
    fromConfig?.user ??
    undefined;
  const port = profileFromResolver?.port ?? resolvedHost?.port ?? fromConfig?.port ?? 22;

  function resolveSshBinaryPath(): string {
    if (process.platform !== "win32") {
      return "ssh";
    }

    const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
    if (!systemRoot) {
      return "ssh";
    }

    const bundledWindowsSshPath = path.join(
      systemRoot,
      "System32",
      "OpenSSH",
      "ssh.exe"
    );
    return existsSync(bundledWindowsSshPath) ? bundledWindowsSshPath : "ssh";
  }

  type EffectiveSshConfig = {
    hostname?: string;
    user?: string;
    port?: number;
    proxyJump?: string;
    identityAgent?: string;
    identityFiles: string[];
  };

  function resolveEffectiveSshConfig(target: string): EffectiveSshConfig | null {
    const result = spawnSync(resolveSshBinaryPath(), ["-G", target], {
      encoding: "utf8",
      windowsHide: true
    });
    if (result.status !== 0 || !result.stdout) {
      return null;
    }

    const effective: EffectiveSshConfig = {
      identityFiles: []
    };

    for (const line of result.stdout.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      const [rawKey, ...rest] = trimmed.split(/\s+/);
      const key = rawKey.toLowerCase();
      const value = rest.join(" ").trim();
      if (!value) {
        continue;
      }

      if (key === "hostname") {
        effective.hostname = value;
        continue;
      }

      if (key === "user") {
        effective.user = value;
        continue;
      }

      if (key === "port") {
        const parsedPort = Number.parseInt(value, 10);
        if (!Number.isNaN(parsedPort)) {
          effective.port = parsedPort;
        }
        continue;
      }

      if (key === "proxyjump" && value.toLowerCase() !== "none") {
        effective.proxyJump = value;
        continue;
      }

      if (key === "identityagent" && value.toLowerCase() !== "none") {
        effective.identityAgent = value;
        continue;
      }

      if (key === "identityfile" && value.toLowerCase() !== "none") {
        effective.identityFiles.push(value);
      }
    }

    return effective;
  }

  const sshTargets = [
    resolvedHost?.name,
    fromConfig?.alias,
    hostId,
    profileFromResolver?.hostname,
    resolvedHost?.hostname,
    fromConfig?.hostName
  ]
    .filter((value): value is string => Boolean(value && value.trim().length > 0))
    .filter((value, index, all) => all.indexOf(value) === index);

  let effectiveConfig: EffectiveSshConfig | null = null;
  let useHostRecordHostname = false;
  for (const target of sshTargets) {
    const candidate = resolveEffectiveSshConfig(target);
    if (!candidate) {
      continue;
    }

    // When ssh -G didn't resolve the hostname to something different from the
    // target (i.e. no HostName directive), keep the host record's explicit
    // hostname but still use user/identity/proxy info from the effective config.
    if (
      resolvedHost?.hostname &&
      resolvedHost.hostname !== target &&
      candidate.hostname === target
    ) {
      useHostRecordHostname = true;
    }

    effectiveConfig = candidate;
    break;
  }

  const expandIdentityPath = (rawPath: string): string => {
    const trimmed = rawPath.trim().replace(/^"(.*)"$/, "$1");
    const withHome = trimmed.replace(/^~(?=$|[\\/])/, homedir());
    if (process.platform !== "win32") {
      return withHome;
    }

    return withHome.replace(/%([^%]+)%/g, (_full, varName) => {
      const value = process.env[varName];
      return value ?? _full;
    });
  };

  const expandAgentPath = (rawPath: string): string | undefined => {
    const trimmed = rawPath.trim().replace(/^"(.*)"$/, "$1");
    const envRefMatch = /^\$([A-Za-z_][A-Za-z0-9_]*)$/.exec(trimmed);
    if (envRefMatch) {
      return process.env[envRefMatch[1]];
    }

    return expandIdentityPath(trimmed);
  };

  /** Returns [primaryKey, ...fallbackKeys] — all existing key paths in priority order. */
  const resolveAllIdentityFiles = (): string[] => {
    const explicitCandidates = [
      resolvedHost?.identityFile,
      profileFromResolver?.identityFile,
      fromConfig?.identityFile,
      ...(effectiveConfig?.identityFiles ?? [])
    ]
      .filter((value): value is string => Boolean(value && value.trim().length > 0))
      .map(expandIdentityPath);

    const home = homedir();
    const sshDir = path.join(home, ".ssh");
    const defaultKeyCandidates = [
      path.join(sshDir, "id_ed25519"),
      path.join(sshDir, "id_ecdsa"),
      path.join(sshDir, "id_rsa"),
      path.join(sshDir, "id_dsa"),
      path.join(sshDir, "id_ed25519_sk"),
      path.join(sshDir, "id_ecdsa_sk")
    ];

    const all = [...explicitCandidates, ...defaultKeyCandidates];
    const seen = new Set<string>();
    const result: string[] = [];
    for (const p of all) {
      const normalized = path.resolve(p);
      if (!seen.has(normalized) && existsSync(normalized)) {
        seen.add(normalized);
        result.push(normalized);
      }
    }
    return result;
  };

  const resolveIdentityFile = () => {
    const all = resolveAllIdentityFiles();
    if (all.length > 0) {
      return all[0];
    }

    return undefined;
  };

  const resolveAgentPath = (): string | undefined => {
    const explicitAgent = effectiveConfig?.identityAgent
      ? expandAgentPath(effectiveConfig.identityAgent)
      : undefined;
    if (explicitAgent) {
      return explicitAgent;
    }

    if (process.env.SSH_AUTH_SOCK) {
      return process.env.SSH_AUTH_SOCK;
    }

    // Windows OpenSSH agent uses a named pipe, not SSH_AUTH_SOCK
    if (process.platform === "win32") {
      const windowsAgentPipe = "\\\\.\\pipe\\openssh-ssh-agent";
      if (existsSync(windowsAgentPipe)) {
        return windowsAgentPipe;
      }
    }

    return undefined;
  };

  const requestedUsername =
    "username" in request && request.username?.trim()
      ? request.username.trim()
      : undefined;
  let requestedPassword =
    "password" in request && request.password ? request.password : undefined;
  const credentialCacheConfig = getCredentialCacheConfig();

  if (requestedPassword) {
    logAuthTrace(authTraceEnabled, "sftp", "Using explicit password from SFTP prompt", {
      hostId
    });
  }

  // Strip Windows domain prefix (DOMAIN\user → user) — SSH servers don't
  // understand Windows domain usernames.
  const stripDomain = (u: string | undefined): string | undefined => {
    if (!u) return u;
    return u.includes("\\") ? u.split("\\").pop() : u;
  };

  // Priority: explicit username from auth modal or host record first,
  // then fall back to ssh -G effective config.
  const resolvedUsername =
    stripDomain(requestedUsername) ??
    stripDomain(username) ??
    stripDomain(effectiveConfig?.user);
  const resolvedHostname = useHostRecordHostname
    ? hostname
    : (effectiveConfig?.hostname ?? hostname);
  const resolvedPort = effectiveConfig?.port ?? port;

  if (!requestedPassword && credentialCacheConfig.enabled && resolvedUsername) {
    const cachedPassword = getCachedCredential(
      resolvedHostname,
      resolvedPort,
      resolvedUsername,
      credentialCacheConfig.ttlMs
    );
    if (cachedPassword) {
      requestedPassword = cachedPassword;
      logAuthTrace(authTraceEnabled, "sftp", "Loaded password from in-memory credential cache", {
        hostId
      });
    }
  }

  if (!requestedPassword && resolvedHost?.authMethod === "password") {
    try {
      const savedPassword = resolveStoredHostPassword(resolvedHost);
      if (savedPassword) {
        requestedPassword = savedPassword;
        logAuthTrace(authTraceEnabled, "sftp", "Loaded saved password from secure storage", {
          hostId: resolvedHost.id,
          authProfileId: resolvedHost.authProfileId ?? null
        });
      } else {
        logAuthTrace(authTraceEnabled, "sftp", "Password auth selected but no saved password found", {
          hostId: resolvedHost.id,
          authProfileId: resolvedHost.authProfileId ?? null
        });
      }
    } catch (err) {
      console.error("[auth] failed to resolve saved host password for SFTP:", err instanceof Error ? err.message : "unknown error");
    }
  }
  if (!requestedPassword && resolvedHost?.authMethod === "op-reference" && resolvedHost.opReference) {
    try {
      const { resolveOnePasswordReference } = await import("../security/opResolver.js");
      const resolvedCredential = await resolveOnePasswordReference(resolvedHost.opReference);
      if (resolvedCredential.length > 0) {
        requestedPassword = resolvedCredential;
        logAuthTrace(authTraceEnabled, "sftp", "Resolved credential from 1Password reference", {
          hostId: resolvedHost.id
        });
      }
    } catch (err) {
      console.error("[1password] failed to resolve reference for SFTP:", err instanceof Error ? err.message : "unknown error");
    }
  }
  const resolvedProxyJump =
    profileFromResolver?.proxyJump ??
    effectiveConfig?.proxyJump ??
    fromConfig?.proxyJump;
  const keepAliveSeconds = profileFromResolver?.keepAliveSeconds;

  const allKeyPaths = resolveAllIdentityFiles();
  const privateKeyPath = allKeyPaths[0] ?? undefined;
  const fallbackKeyPaths = allKeyPaths.slice(1);
  const agentPath = resolveAgentPath();


  if (!requestedPassword && !privateKeyPath && !agentPath) {
    throw new Error(
      "SFTP auth unavailable: no usable private key or SSH agent was found. Configure IdentityFile in ~/.ssh/config, start an SSH agent, or retry and enter a password."
    );
  }

  // Determine primary auth method but always include all available credentials.
  // ssh2 will try publickey (key or agent) first, then fall back to password.
  const hasExplicitKey = Boolean(resolvedHost?.identityFile?.trim());
  const authMethod: "password" | "key" | "agent" =
    hasExplicitKey && privateKeyPath
      ? "key"
      : agentPath
        ? "agent"
        : privateKeyPath
          ? "key"
          : "password";

  logAuthTrace(authTraceEnabled, "sftp", "Resolved connection options", {
    hostId,
    authMethod,
    hasPassword: Boolean(requestedPassword),
    hasPrivateKey: Boolean(privateKeyPath),
    hasAgent: Boolean(agentPath)
  });

  return {
    hostname: resolvedHostname,
    port: resolvedPort,
    username: resolvedUsername,
    proxyJump: resolvedProxyJump,
    keepAliveSeconds,
    authMethod,
    privateKeyPath: privateKeyPath ?? undefined,
    fallbackKeyPaths: fallbackKeyPaths.length > 0 ? fallbackKeyPaths : undefined,
    agentPath: agentPath ?? undefined,
    // When user provides a password, use it as both key passphrase and password
    // fallback — ssh2 tries publickey first, then password.
    passphrase: requestedPassword ?? undefined,
    password: requestedPassword ?? undefined
  };
}

const execFileAsync = promisify(execFile);

function resolveSshBinaryPath(): string {
  if (process.platform !== "win32") {
    return "ssh";
  }

  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
  if (!systemRoot) {
    return "ssh";
  }

  const bundledWindowsSshPath = path.join(
    systemRoot,
    "System32",
    "OpenSSH",
    "ssh.exe"
  );
  return existsSync(bundledWindowsSshPath) ? bundledWindowsSshPath : "ssh";
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
  const input = manager.getSessionInput(parsed.sessionId);

  if (!input?.sshOptions) {
    throw new Error("Session not found or not an SSH session");
  }

  const { hostname, username, port, identityFile, proxyJump } = input.sshOptions;

  const sshBinary = resolveSshBinaryPath();
  const args: string[] = [
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=5"
  ];

  if (port != null) {
    args.push("-p", String(port));
  }

  if (identityFile) {
    args.push("-i", identityFile);
  }

  if (proxyJump) {
    args.push("-J", proxyJump);
  }

  const destination = username ? `${username}@${hostname}` : hostname;
  args.push(destination, STATS_COMMAND);

  const startTime = Date.now();

  try {
    const { stdout } = await execFileAsync(sshBinary, args, {
      timeout: 10000,
      windowsHide: true
    });

    const latencyMs = Date.now() - startTime;
    const stats = parseStatsOutput(stdout);

    return {
      ...stats,
      latencyMs
    };
  } catch {
    return {
      cpuLoad: null,
      memUsage: null,
      diskUsage: null,
      uptime: null,
      latencyMs: null
    };
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

    const profileId = session.profileId;
    const hostsRepo = getOrCreateHostsRepo();
    const allHosts = hostsRepo.list();
    const host = hostsRepo.get(profileId) ?? allHosts.find((candidate) =>
      profileId === `${candidate.username}@${candidate.hostname}`
      || profileId === candidate.hostname
      || profileId === candidate.name
    );

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
    options.emitSessionEvent?.(event);

    if ("type" in event && "sessionId" in event) {
      const sessionId = String(event.sessionId);

      if (event.type === "status") {
        if (event.state === "connected") {
          recordConnected(sessionId);
        } else if (event.state === "failed") {
          recordFailedAttempt(sessionId);
        }
      }

      if (event.type === "error") {
        sessionErrorMessages.set(sessionId, event.message);
        recordFailedAttempt(sessionId, event.message);
      }

      if (event.type === "exit") {
        markDisconnected(sessionId);
        recordedFailedAttemptSessions.delete(sessionId);
        sessionErrorMessages.delete(sessionId);
        sessionHostCache.delete(sessionId);

        // Wait one tick to let SessionManager finalize reconnect/disconnect state.
        setTimeout(() => {
          if (!manager.getSession(sessionId)) {
            void recorder.stop({ sessionId });
          }
        }, 0);
      }
    }

    // Session logging: intercept data events.
    if ("type" in event && event.type === "data" && "sessionId" in event && "data" in event) {
      sessionLogger.onSessionData(event.sessionId as string, event.data as string);
      recorder.onSessionData(event.sessionId as string, event.data as string);
    }
  });
  const unsubscribeHostStatusEvents = hostStatusService.onStatus((event) => {
    options.emitHostStatusEvent?.(event);
  });

  for (const channel of registeredChannels) {
    ipcMain.removeHandler?.(channel);
  }

  ipcMain.handle(ipcChannels.session.open, (event, request) =>
    openSessionHandler(event, request, manager, options.resolveHostProfile, (id) => serialProfilesRepo.get(id))
  );
  ipcMain.handle(ipcChannels.session.resize, (event, request) =>
    resizeSessionHandler(event, request, manager)
  );
  ipcMain.handle(ipcChannels.session.write, (event, request) =>
    writeSessionHandler(event, request, manager)
  );
  ipcMain.handle(ipcChannels.session.close, (event, request) =>
    closeSessionHandler(event, request, manager, (sessionId) => {
      markDisconnected(sessionId);
      recordedFailedAttemptSessions.delete(sessionId);
      sessionErrorMessages.delete(sessionId);
      sessionHostCache.delete(sessionId);
    })
  );
  ipcMain.handle(ipcChannels.session.setSignals, (_event, request) => {
    const parsed = setSignalsRequestSchema.parse(request);
    manager.setSignals(parsed.sessionId, parsed.signals);
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
    let content = "";
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
      return createSnippetsRepositoryFromDatabase(getOrCreateDatabase() as SqliteDatabase);
    }
  );
  registerSettingsIpc(ipcMain, () => getOrCreateDatabase());
  registerPortForwardIpc(ipcMain);
  registerGroupsIpc(ipcMain, () => groupsRepo);
  registerTagIpc(ipcMain, () => getOrCreateDatabase() as SqliteDatabase);
  registerSerialProfilesIpc(ipcMain, () => serialProfilesRepo);
  registerHostProfileIpc(ipcMain, () => getOrCreateDatabase() as SqliteDatabase);
  registerHostEnvVarIpc(ipcMain, () => getOrCreateDatabase() as SqliteDatabase);
  const cleanupSftp = registerSftpIpc(ipcMain, {
    db: getOrCreateDatabase() as SqliteDatabase,
    sessionManager: manager,
    resolveConnectionOptions: (hostId, request) =>
      resolveSftpConnectionOptions(hostId, options, request),
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
  registerWorkspaceIpc(ipcMain, () => getOrCreateDatabase());
  registerSshKeysIpc(ipcMain);
  registerHostPortForwardIpc(ipcMain, () => getOrCreateDatabase() as SqliteDatabase);
  registerOpIpc(ipcMain);
  const unregisterEditor = registerEditorIpc(ipcMain);
  registerSnippetsIpc(ipcMain, () => getOrCreateDatabase() as SqliteDatabase);
  registerLoggingIpc(ipcMain, sessionLogger);
  registerRecordingIpc(ipcMain, recorder);
  registerConnectionHistoryIpc(ipcMain, () => getOrCreateDatabase() as SqliteDatabase);
  registerHostFingerprintIpc(ipcMain, () => getOrCreateDatabase() as SqliteDatabase);
  registerBackupIpc(ipcMain);
  registerSessionRecoveryIpc(ipcMain, () => getOrCreateDatabase() as SqliteDatabase);

  ipcMain.handle(ipcChannels.connectionPool.stats, () => {
    // Pool stats will be wired up when the pool is created
    return [];
  });

  const cleanupFs = registerFsIpc(ipcMain);

  const cleanup = () => {
    unsubscribeSessionEvents();
    unsubscribeHostStatusEvents();
    hostStatusService.stop();
    sessionLogger.stopAll();
    void recorder.stopAll();
    sessionConnectionHistoryIds.clear();
    sessionHostCache.clear();
    sessionErrorMessages.clear();
    recordedFailedAttemptSessions.clear();
    cleanupSftp();
    cleanupFs();
    unregisterEditor();
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
    options?.resolveSerialProfile
  );

  return {
    session,
    input: capturedInput
  };
}
