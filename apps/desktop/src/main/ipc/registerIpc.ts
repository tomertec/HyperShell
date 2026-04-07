import {
  closeSessionRequestSchema,
  hostStatsRequestSchema,
  ipcChannels,
  openSessionRequestSchema,
  resizeSessionRequestSchema,
  setSignalsRequestSchema,
  writeSessionRequestSchema
} from "@sshterm/shared";
import type { HostStatsResponse } from "@sshterm/shared";
import type {
  CloseSessionRequest,
  OpenSessionRequest,
  OpenSessionResponse,
  ResizeSessionRequest,
  SftpConnectRequest,
  WriteSessionRequest
} from "@sshterm/shared";
import { createSessionManager } from "@sshterm/session-core";
import { parseSshConfig } from "@sshterm/session-core";
import { registerHostIpc, getOrCreateHostsRepo, getOrCreateDatabase } from "./hostsIpc";
import { registerSettingsIpc } from "./settingsIpc";
import { registerSshConfigIpc } from "./sshConfigIpc";
import { registerPortForwardIpc } from "./portForwardIpc";
import { registerGroupsIpc } from "./groupsIpc";
import { registerSerialProfilesIpc } from "./serialProfilesIpc";
import { registerSftpIpc } from "./sftpIpc";
import { registerFsIpc } from "./fsIpc";
import { registerWorkspaceIpc } from "./workspaceIpc";
import { registerSshKeysIpc } from "./sshKeysIpc";
import { registerHostPortForwardIpc } from "./hostPortForwardIpc";
import { createGroupsRepository, createSerialProfilesRepository } from "@sshterm/db";
import type { SerialProfileRecord } from "@sshterm/db";
import type {
  SessionManager,
  SessionTransportEvent,
  TransportHandle,
  SerialConnectionOptions,
  SftpConnectionOptions
} from "@sshterm/session-core";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
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
  ipcChannels.hosts.importSshConfig,
  ipcChannels.settings.get,
  ipcChannels.settings.update,
  ipcChannels.portForward.start,
  ipcChannels.portForward.stop,
  ipcChannels.portForward.list,
  ipcChannels.groups.list,
  ipcChannels.groups.upsert,
  ipcChannels.groups.remove,
  ipcChannels.serialProfiles.list,
  ipcChannels.serialProfiles.upsert,
  ipcChannels.serialProfiles.remove,
  ipcChannels.serialProfiles.listPorts,
  ipcChannels.session.setSignals,
  ipcChannels.session.hostStats,
  ipcChannels.sftp.connect,
  ipcChannels.sftp.disconnect,
  ipcChannels.sftp.list,
  ipcChannels.sftp.stat,
  ipcChannels.sftp.mkdir,
  ipcChannels.sftp.rename,
  ipcChannels.sftp.delete,
  ipcChannels.sftp.readFile,
  ipcChannels.sftp.writeFile,
  ipcChannels.sftp.transferStart,
  ipcChannels.sftp.transferCancel,
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
] as const;

const sessionManager = createSessionManager();

const groupsRepo = createGroupsRepository();
const serialProfilesRepo = createSerialProfilesRepository();

let cleanupRegisteredIpc: (() => void) | null = null;

export interface RegisterIpcOptions {
  emitSessionEvent?: (event: unknown) => void;
  emitSftpEvent?: (event: unknown) => void;
  emitSyncEvent?: (event: unknown) => void;
  sessionManager?: SessionManager;
  resolveHostProfile?: (profileId: string) => Promise<{ hostname: string; username?: string; port?: number; identityFile?: string; proxyJump?: string; keepAliveSeconds?: number } | null>;
  resolveSerialProfile?: (profileId: string) => SerialProfileRecord | undefined;
}

export type IpcMainLike = Pick<IpcMain, "handle"> &
  Partial<Pick<IpcMain, "removeHandler">>;

async function openSessionHandler(
  _event: IpcMainInvokeEvent,
  request: OpenSessionRequest,
  manager: SessionManager = sessionManager,
  resolveHostProfile?: RegisterIpcOptions["resolveHostProfile"],
  resolveSerialProfile?: RegisterIpcOptions["resolveSerialProfile"]
): Promise<OpenSessionResponse> {
  const parsed = openSessionRequestSchema.parse(request);

  let resolvedHost: any = null;

  let sshOptions: { hostname: string; username?: string; port?: number; identityFile?: string; proxyJump?: string; keepAliveSeconds?: number } | undefined;

  if (parsed.transport === "ssh") {
    if (resolveHostProfile) {
      const profile = await resolveHostProfile(parsed.profileId);
      if (profile) {
        sshOptions = profile;
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

        // Advanced SSH options from host record
        const hostAdvanced = host as any;
        if (hostAdvanced.proxyJump) {
          sshOptions.proxyJump = hostAdvanced.proxyJump;
        }
        if (hostAdvanced.keepAliveInterval != null) {
          sshOptions.keepAliveSeconds = hostAdvanced.keepAliveInterval;
        }

        // 1Password op:// reference auth — resolve credential via the 1Password CLI.
        const hostRecord = host as { authMethod?: string; opReference?: string };
        if (hostRecord.authMethod === "op-reference" && hostRecord.opReference) {
          try {
            const { resolveOnePasswordReference } = await import("../security/opResolver.js");
            await resolveOnePasswordReference(hostRecord.opReference);
            // TODO: pass resolved credential to SSH transport options
          } catch (err) {
            console.error("[1password] failed to resolve reference:", err);
          }
        }
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

  return manager.open({
    ...parsed,
    sshOptions: sshOptions ?? { hostname: parsed.profileId },
    serialOptions,
    autoReconnect: parsed.autoReconnect ?? Boolean(resolvedHost?.autoReconnect),
    maxReconnectAttempts: parsed.reconnectMaxAttempts ?? resolvedHost?.reconnectMaxAttempts ?? 5,
    reconnectBaseInterval: parsed.reconnectBaseInterval ?? resolvedHost?.reconnectBaseInterval ?? 1,
  });
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
  manager: SessionManager = sessionManager
): Promise<void> {
  const parsed = closeSessionRequestSchema.parse(_request);
  manager.close(parsed.sessionId);
}

async function resolveSftpConnectionOptions(
  hostId: string,
  options: RegisterIpcOptions,
  request: SftpConnectRequest
): Promise<SftpConnectionOptions | null> {
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
  const requestedPassword =
    "password" in request && request.password ? request.password : undefined;

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
    "-o", "ConnectTimeout=5",
    "-o", "StrictHostKeyChecking=no"
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
  const unsubscribeSessionEvents = manager.onEvent((event) => {
    options.emitSessionEvent?.(event);
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
    closeSessionHandler(event, request, manager)
  );
  ipcMain.handle(ipcChannels.session.setSignals, (_event, request) => {
    const parsed = setSignalsRequestSchema.parse(request);
    manager.setSignals(parsed.sessionId, parsed.signals);
  });
  ipcMain.handle(ipcChannels.session.hostStats, (event, request) =>
    hostStatsHandler(event, request, manager)
  );

  registerHostIpc(ipcMain);
  registerSshConfigIpc(ipcMain, () => getOrCreateHostsRepo());
  registerSettingsIpc(ipcMain, () => getOrCreateDatabase());
  registerPortForwardIpc(ipcMain);
  registerGroupsIpc(ipcMain, () => groupsRepo);
  registerSerialProfilesIpc(ipcMain, () => serialProfilesRepo);
  const cleanupSftp = registerSftpIpc(ipcMain, {
    db: getOrCreateDatabase() as any,
    sessionManager: manager,
    resolveConnectionOptions: (hostId, request) =>
      resolveSftpConnectionOptions(hostId, options, request),
    emitSftpEvent: (event) => {
      options.emitSftpEvent?.(event);
    },
    emitSyncEvent: (event) => {
      options.emitSyncEvent?.(event);
    }
  });
  registerWorkspaceIpc(ipcMain, () => getOrCreateDatabase());
  registerSshKeysIpc(ipcMain);
  registerHostPortForwardIpc(ipcMain, () => getOrCreateDatabase() as any);

  ipcMain.handle(ipcChannels.connectionPool.stats, () => {
    // Pool stats will be wired up when the pool is created
    return [];
  });

  const cleanupFs = registerFsIpc(ipcMain);

  const cleanup = () => {
    unsubscribeSessionEvents();
    cleanupSftp();
    cleanupFs();
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
  const testSessionManager = createSessionManager({
    createTransport(input) {
      return createInertTransport(input.sessionId);
    }
  });

  return openSessionHandler({} as IpcMainInvokeEvent, request, testSessionManager);
}
