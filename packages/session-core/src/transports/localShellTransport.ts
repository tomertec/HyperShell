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
