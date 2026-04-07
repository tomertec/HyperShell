import { describe, expect, it } from "vitest";

import type { SessionTransportEvent } from "./transportEvents";
import {
  buildSshArgs,
  buildSshPtyCommand,
  createSshPtyTransport,
  type SshPtyExitEvent,
  type SshPtyProcess
} from "./sshPtyTransport";

function createFakePty() {
  const writes: string[] = [];
  const resizeCalls: Array<{ cols: number; rows: number }> = [];
  let killCalls = 0;
  let onData: (data: string) => void = () => {};
  let onExit: (event: SshPtyExitEvent) => void = () => {};
  let dataDisposeCalls = 0;
  let exitDisposeCalls = 0;

  const process: SshPtyProcess = {
    write(data) {
      writes.push(data);
    },
    resize(cols, rows) {
      resizeCalls.push({ cols, rows });
    },
    kill() {
      killCalls += 1;
    },
    onData(listener) {
      onData = listener;
      return {
        dispose() {
          dataDisposeCalls += 1;
          onData = () => {};
        }
      };
    },
    onExit(listener) {
      onExit = listener;
      return {
        dispose() {
          exitDisposeCalls += 1;
          onExit = () => {};
        }
      };
    }
  };

  return {
    process,
    writes,
    resizeCalls,
    getKillCalls: () => killCalls,
    getDataDisposeCalls: () => dataDisposeCalls,
    getExitDisposeCalls: () => exitDisposeCalls,
    emitData(data: string) {
      onData(data);
    },
    emitExit(exitCode: number) {
      onExit({ exitCode });
    }
  };
}

describe("buildSshArgs", () => {
  it("builds basic ssh arguments", () => {
    expect(
      buildSshArgs({
        hostname: "web-01.example.com",
        username: "admin",
        port: 22,
        identityFile: "C:/keys/id_ed25519",
        proxyJump: "bastion.example.com",
        keepAliveSeconds: 15
      })
    ).toEqual([
      "-p",
      "22",
      "-i",
      "C:/keys/id_ed25519",
      "-J",
      "bastion.example.com",
      "-o",
      "ServerAliveInterval=15",
      "-o",
      "ServerAliveCountMax=3",
      "-tt",
      "admin@web-01.example.com"
    ]);
  });

  it("wraps command and args for the pty layer", () => {
    const command = buildSshPtyCommand({
      hostname: "router.local"
    });

    expect(command.command).toBeTypeOf("string");
    expect(command.command.length).toBeGreaterThan(0);
    expect(command.args).toEqual(["-tt", "router.local"]);
  });

  it("forwards PTY lifecycle events and io", async () => {
    const fakePty = createFakePty();
    const events: SessionTransportEvent[] = [];
    const transport = createSshPtyTransport(
      {
        sessionId: "s1",
        transport: "ssh",
        profileId: "host-1",
        cols: 100,
        rows: 30
      },
      {
        hostname: "web-01.example.com"
      },
      {
        spawnPty: () => fakePty.process
      }
    );

    transport.onEvent((event) => {
      events.push(event);
    });

    await Promise.resolve();

    transport.write("ls\n");
    transport.resize(140, 45);
    fakePty.emitData("hello");
    transport.close();
    transport.write("pwd\n");
    transport.resize(200, 60);
    fakePty.emitData("late-data");
    fakePty.emitExit(0);
    fakePty.emitData("post-exit-data");

    expect(fakePty.writes).toEqual(["ls\n"]);
    expect(fakePty.resizeCalls).toEqual([{ cols: 140, rows: 45 }]);
    expect(fakePty.getKillCalls()).toBe(1);
    expect(fakePty.getDataDisposeCalls()).toBe(1);
    expect(fakePty.getExitDisposeCalls()).toBe(1);
    expect(events).toEqual([
      {
        type: "status",
        sessionId: "s1",
        state: "connected"
      },
      {
        type: "data",
        sessionId: "s1",
        data: "hello"
      },
      {
        type: "exit",
        sessionId: "s1",
        exitCode: 0
      }
    ]);
  });

  it("emits error and exit when spawn fails", async () => {
    const events: SessionTransportEvent[] = [];
    const transport = createSshPtyTransport(
      {
        sessionId: "s2",
        transport: "ssh",
        profileId: "host-2",
        cols: 80,
        rows: 24
      },
      {
        hostname: "bad-host"
      },
      {
        spawnPty: () => {
          throw new Error("spawn failed");
        }
      }
    );

    transport.onEvent((event) => {
      events.push(event);
    });

    await Promise.resolve();

    expect(events).toEqual([
      {
        type: "error",
        sessionId: "s2",
        message: "spawn failed"
      },
      {
        type: "exit",
        sessionId: "s2",
        exitCode: null
      }
    ]);
  });

  it("auto-sends provided secret when SSH prompts for password", async () => {
    const fakePty = createFakePty();
    const transport = createSshPtyTransport(
      {
        sessionId: "s3",
        transport: "ssh",
        profileId: "host-3",
        cols: 80,
        rows: 24
      },
      {
        hostname: "secure-host",
        password: "super-secret"
      },
      {
        spawnPty: () => fakePty.process
      }
    );

    await Promise.resolve();
    fakePty.emitData("user@secure-host's password: ");
    fakePty.emitData("Password: ");
    transport.close();

    expect(fakePty.writes).toEqual(["super-secret\r"]);
  });
});
