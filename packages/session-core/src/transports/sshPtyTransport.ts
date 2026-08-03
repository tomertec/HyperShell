import type { OpenSessionRequest, TransportHandle } from "./transportEvents";
import { ENV_VAR_NAME_REGEX } from "@hypershell/shared";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  createPtyProcess,
  getDefaultSpawnPty,
  type DisposableLike,
  type PtyExitEvent,
  type PtyProcessLike,
  type PtySpawn,
  type PtySpawnOptions
} from "./ptyProcess";

export interface SshConnectionProfile {
  hostname: string;
  username?: string;
  port?: number;
  identityFile?: string;
  password?: string;
  proxyJump?: string;
  keepAliveSeconds?: number;
  requestTty?: boolean;
  extraArgs?: string[];
  envVars?: Record<string, string>;
}

export interface SshPtyCommand {
  command: string;
  args: string[];
}

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

export function buildSshArgs(profile: SshConnectionProfile): string[] {
  const args: string[] = [];

  if (profile.port != null) {
    args.push("-p", String(profile.port));
  }

  if (profile.identityFile) {
    args.push("-i", profile.identityFile);
  }

  if (profile.proxyJump) {
    if (!/^[\w.@:,[\]-]+$/.test(profile.proxyJump)) {
      throw new Error("Invalid proxyJump format");
    }
    args.push("-J", profile.proxyJump);
  }

  if (profile.keepAliveSeconds != null) {
    args.push("-o", `ServerAliveInterval=${profile.keepAliveSeconds}`);
    args.push("-o", "ServerAliveCountMax=3");
  }

  if (profile.requestTty !== false) {
    args.push("-tt");
  }

  if (profile.extraArgs?.length) {
    args.push(...profile.extraArgs);
  }

  const destination = profile.username
    ? `${profile.username}@${profile.hostname}`
    : profile.hostname;

  args.push(destination);
  return args;
}

export function buildSshPtyCommand(profile: SshConnectionProfile): SshPtyCommand {
  let command = "ssh";
  if (process.platform === "win32") {
    const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
    if (systemRoot) {
      const bundledWindowsSshPath = path.join(
        systemRoot,
        "System32",
        "OpenSSH",
        "ssh.exe"
      );
      if (existsSync(bundledWindowsSshPath)) {
        command = bundledWindowsSshPath;
      }
    }
  }

  return {
    command,
    args: buildSshArgs(profile)
  };
}

export interface SshPtyTransport extends TransportHandle {
  command: SshPtyCommand;
  request: OpenSessionRequest;
}

function buildPtyEnv(
  baseEnv: NodeJS.ProcessEnv,
  envVars?: Record<string, string>
): NodeJS.ProcessEnv {
  if (!envVars || Object.keys(envVars).length === 0) {
    return { ...baseEnv };
  }

  const merged: NodeJS.ProcessEnv = { ...baseEnv };
  for (const [name, value] of Object.entries(envVars)) {
    if (!ENV_VAR_NAME_REGEX.test(name)) {
      continue;
    }
    merged[name] = String(value);
  }
  return merged;
}

// Matching control characters is the entire purpose of these patterns.
/* eslint-disable no-control-regex */
function normalizePromptText(value: string): string {
  return value
    // CSI/OSC/escape sequences that can wrap prompts.
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, "")
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\u001b[@-Z\\-_]/g, "")
    // Keep tabs/newlines/carriage returns/spaces; drop other controls.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
}
/* eslint-enable no-control-regex */

function isPasswordPrompt(value: string): boolean {
  return /\b(?:password|passphrase|verification code|security code|otp)\b[^:\r\n]{0,120}:\s*$/i.test(
    normalizePromptText(value)
  );
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
