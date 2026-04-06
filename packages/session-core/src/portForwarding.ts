import type { SshPtySpawn, SshPtyProcess } from "./transports/sshPtyTransport";
import { buildSshPtyCommand } from "./transports/sshPtyTransport";

export interface PortForwardProfile {
  protocol: "local" | "remote" | "dynamic";
  localAddress: string;
  localPort: number;
  remoteHost: string;
  remotePort: number;
}

export interface PortForwardRequest {
  hostname: string;
  username?: string;
  port?: number;
  identityFile?: string;
  forward: PortForwardProfile;
}

export function buildForwardArg(forward: PortForwardProfile): string[] {
  if (forward.protocol === "dynamic") {
    return ["-D", `${forward.localAddress}:${forward.localPort}`];
  }

  const binding = `${forward.localAddress}:${forward.localPort}:${forward.remoteHost}:${forward.remotePort}`;

  if (forward.protocol === "remote") {
    return ["-R", binding];
  }

  return ["-L", binding];
}

export interface PortForwardHandle {
  close(): void;
  onExit(listener: (exitCode: number | null) => void): () => void;
  onError(listener: (message: string) => void): () => void;
}

export function createPortForward(
  request: PortForwardRequest,
  spawnPty: SshPtySpawn
): PortForwardHandle {
  const cmd = buildSshPtyCommand({
    hostname: request.hostname,
    username: request.username,
    port: request.port,
    identityFile: request.identityFile,
    requestTty: false,
    extraArgs: [...buildForwardArg(request.forward), "-N"]
  });

  const exitListeners = new Set<(exitCode: number | null) => void>();
  const errorListeners = new Set<(message: string) => void>();

  let pty: SshPtyProcess;
  try {
    pty = spawnPty(cmd.command, cmd.args, {
      cols: 80,
      rows: 1,
      name: "xterm-256color"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to spawn SSH for port forwarding";
    queueMicrotask(() => {
      for (const l of errorListeners) l(message);
      for (const l of exitListeners) l(null);
    });
    return {
      close() {},
      onExit(listener) { exitListeners.add(listener); return () => { exitListeners.delete(listener); }; },
      onError(listener) { errorListeners.add(listener); return () => { errorListeners.delete(listener); }; }
    };
  }

  pty.onExit((event) => {
    for (const l of exitListeners) l(event.exitCode ?? null);
  });

  return {
    close() {
      try { pty.kill(); } catch { /* already dead */ }
    },
    onExit(listener) { exitListeners.add(listener); return () => { exitListeners.delete(listener); }; },
    onError(listener) { errorListeners.add(listener); return () => { errorListeners.delete(listener); }; }
  };
}
