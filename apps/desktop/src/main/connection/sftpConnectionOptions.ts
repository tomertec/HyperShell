import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { parseSshConfig } from "@hypershell/session-core";
import type { SftpConnectionOptions } from "@hypershell/session-core";
import type { SftpConnectRequest } from "@hypershell/shared";

import type { AuthTraceTransport, CredentialResolver } from "./credentialResolver";

/**
 * Turns a host id into the options ssh2 needs for an SFTP connection.
 *
 * This is SFTP-only on purpose. The SSH terminal spawns the system `ssh`
 * binary, which applies ~/.ssh/config itself; ssh2 cannot, so this
 * reconstructs the effective config by asking OpenSSH for it (`ssh -G`) and
 * assembles the identity-file candidate list the binary would have tried.
 * Credentials proper come from the shared resolver.
 */

export interface SftpHostProfile {
  hostname: string;
  username?: string;
  port?: number;
  identityFile?: string;
  password?: string;
  proxyJump?: string;
  keepAliveSeconds?: number;
}

export interface SftpConnectionOptionsDeps {
  credentials: CredentialResolver;
  resolveHostProfile?: (profileId: string) => Promise<SftpHostProfile | null>;
  trace: (
    transport: AuthTraceTransport,
    message: string,
    details?: Record<string, unknown>
  ) => void;
}

export interface EffectiveSshConfig {
  hostname?: string;
  user?: string;
  port?: number;
  proxyJump?: string;
  identityAgent?: string;
  identityFiles: string[];
}

/**
 * Parses `ssh -G <target>` output — OpenSSH's own view of the effective
 * config for a host, after Host patterns, Match blocks and Include files are
 * applied. Pure string work, kept out of the subprocess so it can be tested.
 */
export function parseEffectiveSshConfig(stdout: string): EffectiveSshConfig {
  const effective: EffectiveSshConfig = { identityFiles: [] };

  for (const line of stdout.split(/\r?\n/)) {
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

export async function resolveSftpConnectionOptions(
  hostId: string,
  deps: SftpConnectionOptionsDeps,
  request: SftpConnectRequest
): Promise<SftpConnectionOptions | null> {
  // Pass 2 will flip matchDestination to true, so a "user@host" destination
  // resolves for SFTP the way it already does for SSH.
  const resolvedHost =
    deps.credentials.findHost(hostId, { matchDestination: false }) ??
    undefined;

  const sshConfigPath = path.join(homedir(), ".ssh", "config");
  let sshConfigHosts: ReturnType<typeof parseSshConfig>["hosts"];
  try {
    const sshConfigContent = readFileSync(sshConfigPath, "utf8");
    sshConfigHosts = parseSshConfig(sshConfigContent).hosts;
  } catch {
    sshConfigHosts = [];
  }

  const profileFromResolver = deps.resolveHostProfile
    ? await deps.resolveHostProfile(resolvedHost?.id ?? hostId)
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

  function resolveEffectiveSshConfig(target: string): EffectiveSshConfig | null {
    const result = spawnSync(resolveSshBinaryPath(), ["-G", target], {
      encoding: "utf8",
      windowsHide: true
    });
    if (result.status !== 0 || !result.stdout) {
      return null;
    }

    return parseEffectiveSshConfig(result.stdout);
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
  // The resolver traces the explicit-password case itself.
  let requestedPassword =
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

  requestedPassword = await deps.credentials.resolvePassword(
    resolvedHost ?? null,
    {
      transport: "sftp",
      existing: requestedPassword,
      ...(resolvedUsername
        ? {
            cacheLookup: {
              hostname: resolvedHostname,
              port: resolvedPort,
              username: resolvedUsername
            }
          }
        : {})
    }
  );
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

  deps.trace("sftp", "Resolved connection options", {
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
