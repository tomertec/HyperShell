import { describe, expect, it, vi } from "vitest";
import { createLocalShellTransport } from "./localShellTransport";
import type { PtyProcessLike, PtySpawn } from "./ptyProcess";
import type { OpenSessionRequest } from "./transportEvents";

const noopPty: PtyProcessLike = {
  write: () => {},
  resize: () => {},
  kill: () => {},
  onData: () => ({ dispose: () => {} }),
  onExit: () => ({ dispose: () => {} })
};

const request: OpenSessionRequest = {
  sessionId: "session-1",
  transport: "local",
  profileId: "profile-1",
  cols: 120,
  rows: 30
};

describe("createLocalShellTransport", () => {
  it("spawns the profile executable with its args and cwd", () => {
    const spawnPty = vi.fn(() => noopPty) as unknown as PtySpawn;

    createLocalShellTransport(
      request,
      {
        executable: "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
        args: [],
        cwd: "C:\\projects"
      },
      { spawnPty }
    );

    expect(spawnPty).toHaveBeenCalledWith(
      "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
      [],
      expect.objectContaining({ cols: 120, rows: 30, cwd: "C:\\projects" })
    );
  });

  it("strips Electron variables and applies profile env vars", () => {
    const spawnPty = vi.fn(() => noopPty) as unknown as PtySpawn;

    createLocalShellTransport(
      request,
      { executable: "cmd.exe", envVars: { MY_FLAG: "1" } },
      {
        spawnPty,
        baseEnv: { PATH: "C:\\Windows", ELECTRON_RUN_AS_NODE: "1", NODE_OPTIONS: "--x" }
      }
    );

    const env = vi.mocked(spawnPty).mock.calls[0][2].env ?? {};
    expect(env.PATH).toBe("C:\\Windows");
    expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined();
    expect(env.NODE_OPTIONS).toBeUndefined();
    expect(env.MY_FLAG).toBe("1");
  });

  it("rejects env var names that are not valid identifiers", () => {
    const spawnPty = vi.fn(() => noopPty) as unknown as PtySpawn;

    createLocalShellTransport(
      request,
      { executable: "cmd.exe", envVars: { "BAD NAME": "1", GOOD_NAME: "2" } },
      { spawnPty, baseEnv: {} }
    );

    const env = vi.mocked(spawnPty).mock.calls[0][2].env ?? {};
    expect(env["BAD NAME"]).toBeUndefined();
    expect(env.GOOD_NAME).toBe("2");
  });

  it("defaults args to an empty array so the shell loads its own profile", () => {
    const spawnPty = vi.fn(() => noopPty) as unknown as PtySpawn;

    createLocalShellTransport(request, { executable: "pwsh.exe" }, { spawnPty });

    expect(vi.mocked(spawnPty).mock.calls[0][1]).toEqual([]);
  });
});
