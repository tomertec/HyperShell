import { describe, expect, it, vi } from "vitest";
import { createPtyProcess, sanitizePtyEnv } from "./ptyProcess";
import type { PtyProcessLike, PtySpawn } from "./ptyProcess";
import type { OpenSessionRequest, SessionTransportEvent } from "./transportEvents";

function createFakePty() {
  const dataListeners: Array<(data: string) => void> = [];
  const exitListeners: Array<(event: { exitCode: number }) => void> = [];
  const written: string[] = [];
  const resized: Array<{ cols: number; rows: number }> = [];
  let killed = false;

  const pty: PtyProcessLike = {
    write: (data) => void written.push(data),
    resize: (cols, rows) => void resized.push({ cols, rows }),
    kill: () => void (killed = true),
    onData: (listener) => {
      dataListeners.push(listener);
      return { dispose: () => {} };
    },
    onExit: (listener) => {
      exitListeners.push(listener);
      return { dispose: () => {} };
    }
  };

  return {
    pty,
    written,
    resized,
    isKilled: () => killed,
    emitData: (data: string) => dataListeners.forEach((l) => l(data)),
    emitExit: (exitCode: number) => exitListeners.forEach((l) => l({ exitCode }))
  };
}

const request: OpenSessionRequest = {
  sessionId: "session-1",
  transport: "local",
  profileId: "profile-1",
  cols: 80,
  rows: 24
};

describe("createPtyProcess", () => {
  it("spawns the command and forwards data events", () => {
    const fake = createFakePty();
    const spawnPty = vi.fn(() => fake.pty) as unknown as PtySpawn;
    const events: SessionTransportEvent[] = [];

    const handle = createPtyProcess(
      request,
      { command: "cmd.exe", args: ["/K"], cols: 80, rows: 24 },
      { spawnPty }
    );
    handle.onEvent((event) => void events.push(event));

    fake.emitData("hello");

    expect(spawnPty).toHaveBeenCalledWith(
      "cmd.exe",
      ["/K"],
      expect.objectContaining({ cols: 80, rows: 24 })
    );
    expect(events).toContainEqual({ type: "data", sessionId: "session-1", data: "hello" });
  });

  it("emits exit with the process exit code", () => {
    const fake = createFakePty();
    const events: SessionTransportEvent[] = [];

    const handle = createPtyProcess(
      request,
      { command: "cmd.exe", args: [], cols: 80, rows: 24 },
      { spawnPty: (() => fake.pty) as unknown as PtySpawn }
    );
    handle.onEvent((event) => void events.push(event));

    fake.emitExit(3);

    expect(events).toContainEqual({ type: "exit", sessionId: "session-1", exitCode: 3 });
  });

  it("lets an onData hook write back into the pty", () => {
    const fake = createFakePty();

    createPtyProcess(
      request,
      { command: "ssh", args: [], cols: 80, rows: 24 },
      {
        spawnPty: (() => fake.pty) as unknown as PtySpawn,
        onData: (data, pty) => {
          if (data.includes("password:")) {
            pty.write("secret\r");
          }
        }
      }
    );

    fake.emitData("password:");

    expect(fake.written).toEqual(["secret\r"]);
  });

  it("emits an error and exits when spawning throws", () => {
    const events: SessionTransportEvent[] = [];
    const handle = createPtyProcess(
      request,
      { command: "missing.exe", args: [], cols: 80, rows: 24 },
      {
        spawnPty: (() => {
          throw new Error("ENOENT");
        }) as unknown as PtySpawn
      }
    );
    handle.onEvent((event) => void events.push(event));

    return new Promise<void>((resolve) => {
      queueMicrotask(() => {
        expect(events.some((e) => e.type === "error" && e.message.includes("ENOENT"))).toBe(true);
        expect(events.some((e) => e.type === "exit")).toBe(true);
        resolve();
      });
    });
  });
});

describe("sanitizePtyEnv", () => {
  it("strips Electron and Node injected variables", () => {
    const result = sanitizePtyEnv({
      PATH: "C:\\Windows",
      ELECTRON_RUN_AS_NODE: "1",
      ELECTRON_NO_ATTACH_CONSOLE: "1",
      NODE_OPTIONS: "--require foo"
    });

    expect(result.PATH).toBe("C:\\Windows");
    expect(result.ELECTRON_RUN_AS_NODE).toBeUndefined();
    expect(result.ELECTRON_NO_ATTACH_CONSOLE).toBeUndefined();
    expect(result.NODE_OPTIONS).toBeUndefined();
  });

  it("leaves HOME and USERPROFILE untouched", () => {
    const result = sanitizePtyEnv({ HOME: "/home/t", USERPROFILE: "C:\\Users\\t" });

    expect(result.HOME).toBe("/home/t");
    expect(result.USERPROFILE).toBe("C:\\Users\\t");
  });
});
