import { EventEmitter } from "node:events";
import type { ChildProcess, spawn as nodeSpawn } from "node:child_process";
import type { createServer as nodeCreateServer, Server, Socket } from "node:net";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createGhosttyHostProcess } from "./hostProcess";
import { encodeFrame, FrameType, PROTOCOL_VERSION } from "./protocol";

function helloFrame(version: number = PROTOCOL_VERSION): Buffer {
  return encodeFrame(FrameType.hello, 0, JSON.stringify({ v: version }));
}

class FakeSocket extends EventEmitter {
  written: Buffer[] = [];
  destroyed = false;

  write(chunk: Buffer): boolean {
    this.written.push(chunk);
    return true;
  }

  end(): void {
    // no-op for the fake
  }

  destroy(): void {
    this.destroyed = true;
  }
}

class FakeChild extends EventEmitter {
  killed = false;
  kill = vi.fn(() => {
    this.killed = true;
    return true;
  });
}

class FakeServer extends EventEmitter {
  listening = false;

  constructor(private readonly connectionListener: (socket: Socket) => void) {
    super();
  }

  listen(_pipeName: string, callback?: () => void): this {
    this.listening = true;
    callback?.();
    return this;
  }

  close(callback?: () => void): this {
    this.listening = false;
    callback?.();
    return this;
  }

  simulateConnection(socket: FakeSocket): void {
    this.connectionListener(socket as unknown as Socket);
  }
}

function makeHarness() {
  const servers: FakeServer[] = [];
  const children: FakeChild[] = [];

  const createServer = vi.fn((connectionListener: (socket: Socket) => void) => {
    const server = new FakeServer(connectionListener);
    servers.push(server);
    return server as unknown as Server;
  });

  const spawn = vi.fn(() => {
    const child = new FakeChild();
    children.push(child);
    return child as unknown as ChildProcess;
  });

  return { createServer, spawn, servers, children };
}

/** Casts the harness's tracked mocks to the overloaded node:child_process / node:net
 *  signatures createGhosttyHostProcess expects, without losing their Mock methods. */
function asInjectable(harness: ReturnType<typeof makeHarness>): {
  spawn: typeof nodeSpawn;
  createServer: typeof nodeCreateServer;
} {
  return {
    spawn: harness.spawn as unknown as typeof nodeSpawn,
    createServer: harness.createServer as unknown as typeof nodeCreateServer
  };
}

describe("createGhosttyHostProcess", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("start resolves after the fake client sends a valid hello frame", async () => {
    const harness = makeHarness();
    const onFrame = vi.fn();
    const onRestart = vi.fn();
    const onDead = vi.fn();
    const proc = createGhosttyHostProcess({
      exePath: "ghostty-host.exe",
      ...asInjectable(harness),
      onFrame,
      onRestart,
      onDead
    });

    const startPromise = proc.start();
    const socket = new FakeSocket();
    harness.servers[0]!.simulateConnection(socket);
    socket.emit("data", helloFrame());

    await expect(startPromise).resolves.toBeUndefined();
    expect(proc.isAlive()).toBe(true);
    expect(harness.spawn).toHaveBeenCalledTimes(1);
    expect(onFrame).not.toHaveBeenCalled();
    expect(onRestart).not.toHaveBeenCalled();
    expect(onDead).not.toHaveBeenCalled();
  });

  test("start rejects when the hello frame reports a mismatched protocol version", async () => {
    const harness = makeHarness();
    const proc = createGhosttyHostProcess({
      exePath: "ghostty-host.exe",
      ...asInjectable(harness),
      onFrame: vi.fn(),
      onRestart: vi.fn(),
      onDead: vi.fn()
    });

    const startPromise = proc.start();
    const socket = new FakeSocket();
    harness.servers[0]!.simulateConnection(socket);
    socket.emit("data", helloFrame(PROTOCOL_VERSION + 1));

    await expect(startPromise).rejects.toThrow(/version/i);
    expect(proc.isAlive()).toBe(false);
  });

  test("frames pushed into the socket after hello reach onFrame decoded", async () => {
    const harness = makeHarness();
    const onFrame = vi.fn();
    const proc = createGhosttyHostProcess({
      exePath: "ghostty-host.exe",
      ...asInjectable(harness),
      onFrame,
      onRestart: vi.fn(),
      onDead: vi.fn()
    });

    const startPromise = proc.start();
    const socket = new FakeSocket();
    harness.servers[0]!.simulateConnection(socket);
    socket.emit("data", helloFrame());
    await startPromise;

    socket.emit("data", encodeFrame(FrameType.bell, 3, "{}"));

    expect(onFrame).toHaveBeenCalledTimes(1);
    expect(onFrame).toHaveBeenCalledWith(
      expect.objectContaining({ type: FrameType.bell, surfaceId: 3 })
    );
  });

  test("a child exit triggers a respawn and fires onRestart once the new hello arrives", async () => {
    vi.useFakeTimers();
    const harness = makeHarness();
    const onRestart = vi.fn();
    const proc = createGhosttyHostProcess({
      exePath: "ghostty-host.exe",
      ...asInjectable(harness),
      onFrame: vi.fn(),
      onRestart,
      onDead: vi.fn()
    });

    const startPromise = proc.start();
    const socket1 = new FakeSocket();
    harness.servers[0]!.simulateConnection(socket1);
    socket1.emit("data", helloFrame());
    await startPromise;

    expect(harness.spawn).toHaveBeenCalledTimes(1);

    harness.children[0]!.emit("exit", 1);
    expect(proc.isAlive()).toBe(false);

    await vi.advanceTimersByTimeAsync(500);
    expect(harness.spawn).toHaveBeenCalledTimes(2);

    const socket2 = new FakeSocket();
    harness.servers[1]!.simulateConnection(socket2);
    socket2.emit("data", helloFrame());
    await vi.advanceTimersByTimeAsync(0);

    expect(onRestart).toHaveBeenCalledTimes(1);
    expect(proc.isAlive()).toBe(true);
  });

  test("three consecutive respawn failures within the window call onDead and stop retrying", async () => {
    vi.useFakeTimers();
    const harness = makeHarness();
    const onDead = vi.fn();
    const proc = createGhosttyHostProcess({
      exePath: "ghostty-host.exe",
      ...asInjectable(harness),
      onFrame: vi.fn(),
      onRestart: vi.fn(),
      onDead
    });

    const startPromise = proc.start();
    const socket1 = new FakeSocket();
    harness.servers[0]!.simulateConnection(socket1);
    socket1.emit("data", helloFrame());
    await startPromise;

    // Failure 1: the running child dies.
    harness.children[0]!.emit("exit", 1);
    await vi.advanceTimersByTimeAsync(500);
    expect(harness.spawn).toHaveBeenCalledTimes(2);

    // Failure 2: the respawned child dies again before sending hello.
    harness.children[1]!.emit("exit", 1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(harness.spawn).toHaveBeenCalledTimes(3);

    // Failure 3: same again -> three consecutive failures, onDead fires.
    harness.children[2]!.emit("exit", 1);
    await vi.advanceTimersByTimeAsync(5000);

    expect(onDead).toHaveBeenCalledTimes(1);
    expect(harness.spawn).toHaveBeenCalledTimes(3);
    expect(proc.isAlive()).toBe(false);
  });

  test("a server error after hello triggers teardown and a respawn", async () => {
    vi.useFakeTimers();
    const harness = makeHarness();
    const onRestart = vi.fn();
    const onDead = vi.fn();
    const proc = createGhosttyHostProcess({
      exePath: "ghostty-host.exe",
      ...asInjectable(harness),
      onFrame: vi.fn(),
      onRestart,
      onDead
    });

    const startPromise = proc.start();
    const socket1 = new FakeSocket();
    harness.servers[0]!.simulateConnection(socket1);
    socket1.emit("data", helloFrame());
    await startPromise;

    expect(harness.spawn).toHaveBeenCalledTimes(1);

    // A server-level fault after the handshake must not be swallowed: it
    // has to go through the same settled-aware branching as the socket and
    // child handlers (teardown, then respawn-or-onDead), not get silently
    // dropped while isAlive() stays stuck true.
    harness.servers[0]!.emit("error", new Error("pipe server exploded"));
    expect(proc.isAlive()).toBe(false);
    expect(onDead).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(500);
    expect(harness.spawn).toHaveBeenCalledTimes(2);

    const socket2 = new FakeSocket();
    harness.servers[1]!.simulateConnection(socket2);
    socket2.emit("data", helloFrame());
    await vi.advanceTimersByTimeAsync(0);

    expect(onRestart).toHaveBeenCalledTimes(1);
    expect(proc.isAlive()).toBe(true);
  });

  test("stop() during an in-flight start() rejects the pending promise instead of hanging", async () => {
    const harness = makeHarness();
    const proc = createGhosttyHostProcess({
      exePath: "ghostty-host.exe",
      ...asInjectable(harness),
      onFrame: vi.fn(),
      onRestart: vi.fn(),
      onDead: vi.fn()
    });

    const startPromise = proc.start();
    // Mid-handshake: the pipe is connected and the child has spawned, but no
    // hello has arrived yet.
    const socket = new FakeSocket();
    harness.servers[0]!.simulateConnection(socket);
    expect(harness.spawn).toHaveBeenCalledTimes(1);

    proc.stop();

    await expect(startPromise).rejects.toThrow(/stopped/i);
    expect(proc.isAlive()).toBe(false);
    expect(socket.destroyed).toBe(true);
    expect(harness.children[0]!.killed).toBe(true);
  });
});
