import { describe, expect, it, vi } from "vitest";

import { createSessionManager } from "./sessionManager";
import { createNetworkMonitor } from "./networkMonitor";
import {
  buildShellIntegrationBootstrap,
  buildShellIntegrationProbe,
  SHELL_INTEGRATION_PROBE_MARKER
} from "./shellIntegration/bootstrap";
import type {
  OpenSessionRequest,
  SessionTransportEvent,
  TransportHandle
} from "./transports/transportEvents";

function createStubTransport(calls?: string[]): TransportHandle {
  return {
    write(data) {
      calls?.push(`write:${data}`);
    },
    resize(cols, rows) {
      calls?.push(`resize:${cols}x${rows}`);
    },
    close() {
      calls?.push("close");
    },
    onEvent() {
      return () => {};
    }
  };
}

function createControllableTransport(calls?: string[]) {
  let listener: ((event: SessionTransportEvent) => void) | null = null;

  const transport: TransportHandle = {
    write(data) {
      calls?.push(`write:${data}`);
    },
    resize(cols, rows) {
      calls?.push(`resize:${cols}x${rows}`);
    },
    close() {
      calls?.push("close");
      listener?.({
        type: "exit",
        sessionId: "s-exit",
        exitCode: null
      });
    },
    onEvent(nextListener) {
      listener = nextListener;
      return () => {
        listener = null;
      };
    }
  };

  return {
    transport,
    emit(event: SessionTransportEvent) {
      listener?.(event);
    }
  };
}

describe("sessionManager", () => {
  it("tracks a connecting ssh session", () => {
    const manager = createSessionManager({
      sessionIdFactory: () => "s1",
      createTransport: () => createStubTransport()
    });

    const result = manager.open({
      transport: "ssh",
      profileId: "host-1",
      cols: 120,
      rows: 40
    });

    expect(result.sessionId).toBe("s1");
    expect(result.state).toBe("connecting");
    expect(manager.getSession("s1")?.state).toBe("connecting");
  });

  it("updates size and forwards transport actions", () => {
    const calls: string[] = [];
    const manager = createSessionManager({
      sessionIdFactory: () => "s2",
      createTransport: () => createStubTransport(calls)
    });

    const { sessionId } = manager.open({
      transport: "ssh",
      profileId: "host-2",
      cols: 80,
      rows: 24
    });

    manager.write(sessionId, "ls\n");
    manager.resize(sessionId, 100, 50);
    manager.close(sessionId);

    expect(calls).toEqual(["write:ls\n", "resize:100x50", "close"]);
    expect(manager.getSession(sessionId)).toBeUndefined();
  });

  it("uses unique default session IDs after sessions are closed", () => {
    const manager = createSessionManager({
      createTransport: () => createStubTransport()
    });

    const first = manager.open({
      transport: "ssh",
      profileId: "host-1",
      cols: 80,
      rows: 24
    });
    const second = manager.open({
      transport: "ssh",
      profileId: "host-2",
      cols: 80,
      rows: 24
    });

    manager.close(first.sessionId);

    const third = manager.open({
      transport: "ssh",
      profileId: "host-3",
      cols: 80,
      rows: 24
    });

    expect(first.sessionId).toBe("session-1");
    expect(second.sessionId).toBe("session-2");
    expect(third.sessionId).toBe("session-3");
    expect(manager.getSession(second.sessionId)).toBeDefined();
    expect(manager.getSession(third.sessionId)).toBeDefined();
  });

  it("removes sessions when the transport exits", () => {
    const { transport, emit } = createControllableTransport();
    const manager = createSessionManager({
      sessionIdFactory: () => "s-exit",
      createTransport: () => transport
    });
    const receivedEvents: SessionTransportEvent[] = [];

    manager.onEvent((event) => {
      receivedEvents.push(event);
    });
    manager.open({
      transport: "ssh",
      profileId: "host-exit",
      cols: 80,
      rows: 24
    });

    emit({
      type: "status",
      sessionId: "s-exit",
      state: "connected"
    });
    expect(manager.getSession("s-exit")?.state).toBe("connected");

    emit({
      type: "exit",
      sessionId: "s-exit",
      exitCode: 0
    });

    expect(receivedEvents.at(-1)).toEqual({
      type: "exit",
      sessionId: "s-exit",
      exitCode: 0
    });
    expect(manager.getSession("s-exit")).toBeUndefined();
  });

  it("reconnects automatically when autoReconnect is true", async () => {
    let transportCount = 0;

    const manager = createSessionManager({
      createTransport(request) {
        transportCount++;
        const listeners = new Set<(event: SessionTransportEvent) => void>();
        return {
          write() {},
          resize() {},
          close() {},
          onEvent(listener) {
            listeners.add(listener);
            // Simulate immediate exit on first transport
            if (transportCount === 1) {
              queueMicrotask(() => {
                for (const l of listeners) l({ type: "exit", sessionId: request.sessionId, exitCode: 1 });
              });
            }
            return () => { listeners.delete(listener); };
          }
        };
      }
    });

    const events: SessionTransportEvent[] = [];
    manager.onEvent((e) => events.push(e));

    manager.open({
      transport: "ssh",
      profileId: "host-1",
      cols: 80,
      rows: 24,
      autoReconnect: true,
      maxReconnectAttempts: 3
    });

    // Wait for exit + reconnect timer (1s for first attempt)
    await new Promise((resolve) => setTimeout(resolve, 1500));

    expect(transportCount).toBeGreaterThanOrEqual(2);
    expect(events.some((e) => e.type === "status" && e.state === "reconnecting")).toBe(true);
  });

  it("does not reconnect when user closes session", () => {
    let transportCount = 0;

    const manager = createSessionManager({
      createTransport() {
        transportCount++;
        return {
          write() {},
          resize() {},
          close() {},
          onEvent() { return () => {}; }
        };
      }
    });

    const result = manager.open({
      transport: "ssh",
      profileId: "host-1",
      cols: 80,
      rows: 24,
      autoReconnect: true
    });

    manager.close(result.sessionId);
    expect(transportCount).toBe(1);
  });

  it("uses configurable reconnect base interval", () => {
    vi.useFakeTimers();

    let transportCount = 0;
    const listeners = new Set<(event: SessionTransportEvent) => void>();
    const manager = createSessionManager({
      createTransport(request) {
        transportCount++;
        return {
          write() {},
          resize() {},
          close() {},
          onEvent(listener) {
            listeners.add(listener);
            // Emit exit immediately on first transport creation
            if (transportCount === 1) {
              void Promise.resolve().then(() => {
                for (const l of listeners) {
                  l({ type: "exit", sessionId: request.sessionId, exitCode: 1 });
                }
              });
            }
            return () => { listeners.delete(listener); };
          }
        };
      }
    });

    const events: SessionTransportEvent[] = [];
    manager.onEvent((e) => events.push(e));

    manager.open({
      transport: "ssh",
      profileId: "host-1",
      cols: 80,
      rows: 24,
      autoReconnect: true,
      maxReconnectAttempts: 3,
      reconnectBaseInterval: 3
    });

    // Flush the microtask that emits the exit event
    return Promise.resolve().then(() => {
      // After exit, should be in reconnecting state
      expect(events.some((e) => e.type === "status" && e.state === "reconnecting")).toBe(true);
      // Only 1 transport created so far — delay hasn't elapsed
      expect(transportCount).toBe(1);

      // Advance by 2999ms — not enough for 3s base interval
      vi.advanceTimersByTime(2999);
      expect(transportCount).toBe(1);

      // Advance 1 more ms — now at 3000ms, timer should fire
      vi.advanceTimersByTime(1);
      expect(transportCount).toBe(2);

      vi.useRealTimers();
    });
  });

  it("resets reconnect attempts only after a stable reconnect window", () => {
    vi.useFakeTimers();

    const listeners: Array<((event: SessionTransportEvent) => void) | null> = [];
    let transportCount = 0;

    const manager = createSessionManager({
      sessionIdFactory: () => "s-reset-1",
      createTransport() {
        const transportIndex = transportCount;
        transportCount += 1;
        return {
          write() {},
          resize() {},
          close() {},
          onEvent(listener) {
            listeners[transportIndex] = listener;
            return () => {
              listeners[transportIndex] = null;
            };
          }
        };
      }
    });

    manager.open({
      transport: "ssh",
      profileId: "host-1",
      cols: 80,
      rows: 24,
      autoReconnect: true,
      maxReconnectAttempts: 3,
      reconnectBaseInterval: 1
    });

    listeners[0]?.({ type: "exit", sessionId: "s-reset-1", exitCode: 1 });
    expect(manager.getSession("s-reset-1")?.reconnectAttempts).toBe(1);

    vi.advanceTimersByTime(1000);
    expect(transportCount).toBe(2);

    listeners[1]?.({ type: "status", sessionId: "s-reset-1", state: "connected" });
    expect(manager.getSession("s-reset-1")?.reconnectAttempts).toBe(1);

    vi.advanceTimersByTime(4_999);
    expect(manager.getSession("s-reset-1")?.reconnectAttempts).toBe(1);

    vi.advanceTimersByTime(1);
    expect(manager.getSession("s-reset-1")?.reconnectAttempts).toBe(0);

    vi.useRealTimers();
  });

  it("keeps reconnect attempts when session exits before stability window", () => {
    vi.useFakeTimers();

    const listeners: Array<((event: SessionTransportEvent) => void) | null> = [];
    let transportCount = 0;

    const manager = createSessionManager({
      sessionIdFactory: () => "s-reset-2",
      createTransport() {
        const transportIndex = transportCount;
        transportCount += 1;
        return {
          write() {},
          resize() {},
          close() {},
          onEvent(listener) {
            listeners[transportIndex] = listener;
            return () => {
              listeners[transportIndex] = null;
            };
          }
        };
      }
    });

    manager.open({
      transport: "ssh",
      profileId: "host-1",
      cols: 80,
      rows: 24,
      autoReconnect: true,
      maxReconnectAttempts: 3,
      reconnectBaseInterval: 1
    });

    listeners[0]?.({ type: "exit", sessionId: "s-reset-2", exitCode: 1 });
    expect(manager.getSession("s-reset-2")?.reconnectAttempts).toBe(1);

    vi.advanceTimersByTime(1_000);
    expect(transportCount).toBe(2);

    listeners[1]?.({ type: "status", sessionId: "s-reset-2", state: "connected" });
    listeners[1]?.({ type: "exit", sessionId: "s-reset-2", exitCode: 1 });
    expect(manager.getSession("s-reset-2")?.reconnectAttempts).toBe(2);

    vi.advanceTimersByTime(5_000);
    expect(manager.getSession("s-reset-2")?.reconnectAttempts).toBe(2);

    vi.useRealTimers();
  });

  it("passes sshOptions to transport when provided", () => {
    let capturedRequest: OpenSessionRequest | null = null;

    const manager = createSessionManager({
      createTransport(request) {
        capturedRequest = request;
        const listeners = new Set<(event: SessionTransportEvent) => void>();
        return {
          write() {},
          resize() {},
          close() { for (const l of listeners) l({ type: "exit", sessionId: request.sessionId, exitCode: null }); },
          onEvent(l) { listeners.add(l); return () => { listeners.delete(l); }; }
        };
      }
    });

    manager.open({
      transport: "ssh",
      profileId: "host-1",
      cols: 80,
      rows: 24,
      sshOptions: { hostname: "10.0.0.1", username: "admin", port: 2222 }
    });

    expect((capturedRequest as OpenSessionRequest | null)?.sshOptions).toEqual({
      hostname: "10.0.0.1",
      username: "admin",
      port: 2222
    });
  });
});

describe("network-aware reconnect", () => {
  function createControllableTransportFactory() {
    const emitters: Array<(event: SessionTransportEvent) => void> = [];
    let callCount = 0;

    function factory(_request: OpenSessionRequest): TransportHandle {
      callCount++;
      const listeners = new Set<(event: SessionTransportEvent) => void>();
      const transport: TransportHandle = {
        write() {},
        resize() {},
        close() {},
        onEvent(listener) {
          listeners.add(listener);
          emitters.push((e) => {
            for (const l of listeners) l(e);
          });
          return () => { listeners.delete(listener); };
        }
      };
      return transport;
    }

    return {
      factory,
      get callCount() { return callCount; },
      emitOnLatest(event: SessionTransportEvent) {
        emitters[emitters.length - 1]?.(event);
      }
    };
  }

  it("enters waiting_for_network when offline at disconnect", () => {
    const monitor = createNetworkMonitor({ probeIntervalMs: 0 });
    monitor._setOnline(false);

    const { factory, emitOnLatest } = createControllableTransportFactory();
    const manager = createSessionManager({
      sessionIdFactory: () => "s-net-1",
      createTransport: factory,
      networkMonitor: monitor
    });

    const events: SessionTransportEvent[] = [];
    manager.onEvent((e) => events.push(e));

    manager.open({
      transport: "ssh",
      profileId: "host-1",
      cols: 80,
      rows: 24,
      autoReconnect: true,
      maxReconnectAttempts: 3
    });

    emitOnLatest({ type: "exit", sessionId: "s-net-1", exitCode: 1 });

    expect(manager.getSession("s-net-1")?.state).toBe("waiting_for_network");
    expect(events.some((e) => e.type === "status" && e.state === "waiting_for_network")).toBe(true);

    monitor.dispose();
  });

  it("reconnects when network comes back online", () => {
    const monitor = createNetworkMonitor({ probeIntervalMs: 0 });
    monitor._setOnline(false);

    const { factory, callCount: _ignore, emitOnLatest } = createControllableTransportFactory();
    let transportCallCount = 0;

    const manager = createSessionManager({
      sessionIdFactory: () => "s-net-2",
      createTransport(req) {
        transportCallCount++;
        return factory(req);
      },
      networkMonitor: monitor
    });

    const events: SessionTransportEvent[] = [];
    manager.onEvent((e) => events.push(e));

    manager.open({
      transport: "ssh",
      profileId: "host-1",
      cols: 80,
      rows: 24,
      autoReconnect: true,
      maxReconnectAttempts: 3
    });

    emitOnLatest({ type: "exit", sessionId: "s-net-2", exitCode: 1 });

    expect(manager.getSession("s-net-2")?.state).toBe("waiting_for_network");

    // Network comes back
    monitor._setOnline(true);

    // Should have reset attempts to 0 and created a new transport
    expect(manager.getSession("s-net-2")?.reconnectAttempts).toBe(0);
    expect(manager.getSession("s-net-2")?.state).toBe("connecting");
    expect(transportCallCount).toBe(2);
    expect(events.some((e) => e.type === "status" && e.state === "reconnecting")).toBe(true);

    monitor.dispose();
  });

  it("uses normal backoff when network is online at disconnect", () => {
    vi.useFakeTimers();

    const monitor = createNetworkMonitor({ probeIntervalMs: 0 });
    // monitor starts online by default

    const { factory, emitOnLatest } = createControllableTransportFactory();
    const manager = createSessionManager({
      sessionIdFactory: () => "s-net-3",
      createTransport: factory,
      networkMonitor: monitor
    });

    const events: SessionTransportEvent[] = [];
    manager.onEvent((e) => events.push(e));

    manager.open({
      transport: "ssh",
      profileId: "host-1",
      cols: 80,
      rows: 24,
      autoReconnect: true,
      maxReconnectAttempts: 3
    });

    emitOnLatest({ type: "exit", sessionId: "s-net-3", exitCode: 1 });

    // Should be in reconnecting state (not waiting_for_network) because network is online
    expect(manager.getSession("s-net-3")?.state).toBe("reconnecting");
    expect(events.some((e) => e.type === "status" && e.state === "waiting_for_network")).toBe(false);
    expect(events.some((e) => e.type === "status" && e.state === "reconnecting")).toBe(true);

    monitor.dispose();
    vi.useRealTimers();
  });
});

describe("local sessions", () => {
  it("refuses to build a local transport without resolved localOptions", () => {
    // The default transport factory is the real one — no stub — because the
    // point of this test is that it has no profileId-as-executable fallback.
    // Only the main process may decide what a local session spawns.
    const manager = createSessionManager();

    expect(() =>
      manager.open({
        transport: "local",
        profileId: "C:\\Windows\\System32\\calc.exe",
        cols: 80,
        rows: 24
      })
    ).toThrow(/local transport requires resolved localOptions/);
  });

  it("forces autoReconnect off for local sessions even when asked for it", () => {
    // `attemptReconnect` never forwards localOptions, so a reconnecting local
    // session would land in the branch the test above guards. The guard that
    // keeps it unreachable is this flag, so pin it down.
    const manager = createSessionManager({
      createTransport: () => createStubTransport(),
      sessionIdFactory: () => "s-local-1"
    });

    manager.open({
      transport: "local",
      profileId: "profile-1",
      cols: 80,
      rows: 24,
      autoReconnect: true,
      localOptions: { executable: "cmd.exe" }
    });

    expect(manager.getSession("s-local-1")?.autoReconnect).toBe(false);
  });
});

describe("process titles", () => {
  function fakePoller() {
    const registered = new Map<string, number>();
    let emit: ((sessionId: string, name: string | null) => void) | null = null;

    return {
      registered,
      fire(sessionId: string, name: string | null) {
        emit?.(sessionId, name);
      },
      poller: {
        register(sessionId: string, pid: number) {
          registered.set(sessionId, pid);
        },
        unregister(sessionId: string) {
          registered.delete(sessionId);
        },
        onChange(listener: (sessionId: string, name: string | null) => void) {
          emit = listener;
          return () => {
            emit = null;
          };
        },
        stop() {}
      }
    };
  }

  function transportWithPid(pid: number | undefined) {
    const listeners = new Set<(event: SessionTransportEvent) => void>();
    return {
      pid,
      write() {},
      resize() {},
      close() {},
      onEvent(listener: (event: SessionTransportEvent) => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }
    };
  }

  it("registers local sessions that report a pid", () => {
    const fake = fakePoller();
    const manager = createSessionManager({
      processTitlePoller: fake.poller,
      createTransport: () => transportWithPid(4242)
    });

    const { sessionId } = manager.open({ transport: "local", profileId: "p1", cols: 80, rows: 24 });

    expect(fake.registered.get(sessionId)).toBe(4242);
  });

  it("does not register non-local transports", () => {
    const fake = fakePoller();
    const manager = createSessionManager({
      processTitlePoller: fake.poller,
      createTransport: () => transportWithPid(4242)
    });

    manager.open({ transport: "ssh", profileId: "host", cols: 80, rows: 24 });

    expect(fake.registered.size).toBe(0);
  });

  it("forwards poller changes as process-title events", () => {
    const fake = fakePoller();
    const manager = createSessionManager({
      processTitlePoller: fake.poller,
      createTransport: () => transportWithPid(4242)
    });
    const events: SessionTransportEvent[] = [];
    manager.onEvent((event) => events.push(event));

    const { sessionId } = manager.open({ transport: "local", profileId: "p1", cols: 80, rows: 24 });
    fake.fire(sessionId, "llmtop");

    expect(events).toContainEqual({ type: "process-title", sessionId, name: "llmtop" });
  });

  it("drops events for sessions that already closed", () => {
    const fake = fakePoller();
    const manager = createSessionManager({
      processTitlePoller: fake.poller,
      createTransport: () => transportWithPid(4242)
    });
    const events: SessionTransportEvent[] = [];

    const { sessionId } = manager.open({ transport: "local", profileId: "p1", cols: 80, rows: 24 });
    manager.close(sessionId);
    manager.onEvent((event) => events.push(event));
    fake.fire(sessionId, "llmtop");

    expect(events).toHaveLength(0);
    expect(fake.registered.has(sessionId)).toBe(false);
  });
});

describe("shell integration injection", () => {
  function recordingTransport() {
    const listeners = new Set<(event: SessionTransportEvent) => void>();
    const writes: string[] = [];
    return {
      writes,
      emit(event: SessionTransportEvent) {
        for (const listener of listeners) listener(event);
      },
      handle: {
        write(data: string) {
          writes.push(data);
        },
        resize() {},
        close() {},
        onEvent(listener: (event: SessionTransportEvent) => void) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        }
      }
    };
  }

  const PROMPT = "user@host:~$ ";
  const MARKER = SHELL_INTEGRATION_PROBE_MARKER;

  it("probes only after the session goes quiet at a prompt", () => {
    vi.useFakeTimers();
    const transport = recordingTransport();
    const manager = createSessionManager({ createTransport: () => transport.handle });
    const { sessionId } = manager.open({
      transport: "ssh",
      profileId: "hermes",
      cols: 80,
      rows: 24,
      sshOptions: { hostname: "hermes" }
    });

    transport.emit({ type: "status", sessionId, state: "connected" });
    transport.emit({ type: "data", sessionId, data: PROMPT });
    expect(transport.writes).toHaveLength(0);

    vi.advanceTimersByTime(499);
    expect(transport.writes).toHaveLength(0);

    vi.advanceTimersByTime(1);
    expect(transport.writes).toHaveLength(1);
    expect(transport.writes[0]).toBe(buildShellIntegrationProbe());

    vi.useRealTimers();
  });

  it("writes the bootstrap once the probe's marker bytes come back", () => {
    vi.useFakeTimers();
    const transport = recordingTransport();
    const manager = createSessionManager({ createTransport: () => transport.handle });
    const { sessionId } = manager.open({
      transport: "ssh",
      profileId: "hermes",
      cols: 80,
      rows: 24,
      sshOptions: { hostname: "hermes" }
    });

    transport.emit({ type: "status", sessionId, state: "connected" });
    transport.emit({ type: "data", sessionId, data: PROMPT });
    vi.advanceTimersByTime(500);
    expect(transport.writes).toHaveLength(1); // the probe

    // The shell executes the probe: marker bytes, then a fresh prompt.
    transport.emit({ type: "data", sessionId, data: `${MARKER}${PROMPT}` });
    vi.advanceTimersByTime(500);

    expect(transport.writes).toHaveLength(2);
    expect(transport.writes[1]).toContain("__HS_SI");

    vi.useRealTimers();
  });

  it("does not mistake the probe's echoed text for the marker", () => {
    vi.useFakeTimers();
    const transport = recordingTransport();
    const manager = createSessionManager({ createTransport: () => transport.handle });
    const { sessionId } = manager.open({
      transport: "ssh",
      profileId: "hermes",
      cols: 80,
      rows: 24,
      sshOptions: { hostname: "hermes" }
    });

    transport.emit({ type: "status", sessionId, state: "connected" });
    transport.emit({ type: "data", sessionId, data: PROMPT });
    vi.advanceTimersByTime(500);
    expect(transport.writes).toHaveLength(1);

    // Echo shows literal backslash escapes, not control bytes: no handshake.
    transport.emit({ type: "data", sessionId, data: " printf '\\033]777;hs-probe\\007...'" });
    vi.advanceTimersByTime(500);

    expect(transport.writes).toHaveLength(1);

    vi.useRealTimers();
  });

  it("retries an unanswered probe, then gives up for good", () => {
    vi.useFakeTimers();
    const transport = recordingTransport();
    const manager = createSessionManager({ createTransport: () => transport.handle });
    const { sessionId } = manager.open({
      transport: "ssh",
      profileId: "hermes",
      cols: 80,
      rows: 24,
      sshOptions: { hostname: "hermes" }
    });

    transport.emit({ type: "status", sessionId, state: "connected" });
    transport.emit({ type: "data", sessionId, data: PROMPT });

    // Each cycle: 500ms quiet fires the probe, 2000ms of silence abandons it.
    for (let attempt = 1; attempt <= 3; attempt++) {
      vi.advanceTimersByTime(500);
      expect(transport.writes).toHaveLength(attempt);
      expect(transport.writes[attempt - 1]).toBe(buildShellIntegrationProbe());
      vi.advanceTimersByTime(2000);
    }

    // Attempts exhausted: even a real marker now must not trigger anything.
    vi.advanceTimersByTime(5000);
    transport.emit({ type: "data", sessionId, data: `${MARKER}${PROMPT}` });
    vi.advanceTimersByTime(5000);
    expect(transport.writes).toHaveLength(3);

    vi.useRealTimers();
  });

  it("builds the bootstrap for the session's current width", () => {
    vi.useFakeTimers();
    const transport = recordingTransport();
    const manager = createSessionManager({ createTransport: () => transport.handle });
    const { sessionId } = manager.open({
      transport: "ssh",
      profileId: "hermes",
      cols: 80,
      rows: 24,
      sshOptions: { hostname: "hermes" }
    });

    // A resize before the write must be reflected in the erase row count —
    // the echo wraps at the width the terminal has at write time.
    manager.resize(sessionId, 200, 50);
    transport.emit({ type: "status", sessionId, state: "connected" });
    transport.emit({ type: "data", sessionId, data: PROMPT });
    vi.advanceTimersByTime(500);
    transport.emit({ type: "data", sessionId, data: `${MARKER}${PROMPT}` });
    vi.advanceTimersByTime(500);

    expect(transport.writes).toHaveLength(2);
    expect(transport.writes[1]).toBe(buildShellIntegrationBootstrap(200));
    expect(transport.writes[1]).not.toBe(buildShellIntegrationBootstrap(80));

    vi.useRealTimers();
  });

  it("resets the quiet wait on a data event", () => {
    vi.useFakeTimers();
    const transport = recordingTransport();
    const manager = createSessionManager({ createTransport: () => transport.handle });
    const { sessionId } = manager.open({
      transport: "ssh",
      profileId: "hermes",
      cols: 80,
      rows: 24,
      sshOptions: { hostname: "hermes" }
    });

    transport.emit({ type: "status", sessionId, state: "connected" });
    vi.advanceTimersByTime(400);
    transport.emit({ type: "data", sessionId, data: "MOTD line\r\nuser@host:~$ " });
    vi.advanceTimersByTime(400);
    // 800ms since connected, but only 400ms since the last data event.
    expect(transport.writes).toHaveLength(0);

    vi.advanceTimersByTime(100);
    expect(transport.writes).toHaveLength(1);

    vi.useRealTimers();
  });

  it("holds past quiet windows until the output tail looks like a prompt", () => {
    vi.useFakeTimers();
    const transport = recordingTransport();
    const manager = createSessionManager({ createTransport: () => transport.handle });
    const { sessionId } = manager.open({
      transport: "ssh",
      profileId: "hermes",
      cols: 80,
      rows: 24,
      sshOptions: { hostname: "hermes" }
    });

    transport.emit({ type: "status", sessionId, state: "connected" });
    transport.emit({ type: "data", sessionId, data: "Last login: yesterday\r\n" });
    // A slow shell init (oh-my-zsh update check) gives long silence with no
    // prompt — writing here is what got the line echoed twice on screen.
    vi.advanceTimersByTime(2000);
    expect(transport.writes).toHaveLength(0);

    transport.emit({ type: "data", sessionId, data: "➜  ~ " });
    vi.advanceTimersByTime(500);
    expect(transport.writes).toHaveLength(1);

    vi.useRealTimers();
  });

  it("gives up waiting for a prompt after enough quiet rounds", () => {
    vi.useFakeTimers();
    const transport = recordingTransport();
    const manager = createSessionManager({ createTransport: () => transport.handle });
    const { sessionId } = manager.open({
      transport: "ssh",
      profileId: "hermes",
      cols: 80,
      rows: 24,
      sshOptions: { hostname: "hermes" }
    });

    transport.emit({ type: "status", sessionId, state: "connected" });
    transport.emit({ type: "data", sessionId, data: "banner only, no prompt\r\n" });
    vi.advanceTimersByTime(10 * 500);
    expect(transport.writes).toHaveLength(0);

    vi.advanceTimersByTime(500);
    expect(transport.writes).toHaveLength(1);

    vi.useRealTimers();
  });

  it("collapses a burst of data events into exactly one write", () => {
    vi.useFakeTimers();
    const transport = recordingTransport();
    const manager = createSessionManager({ createTransport: () => transport.handle });
    const { sessionId } = manager.open({
      transport: "ssh",
      profileId: "hermes",
      cols: 80,
      rows: 24,
      sshOptions: { hostname: "hermes" }
    });

    transport.emit({ type: "status", sessionId, state: "connected" });
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(100);
      transport.emit({ type: "data", sessionId, data: "chunk\r\n" });
    }
    transport.emit({ type: "data", sessionId, data: "user@host:~$ " });

    vi.advanceTimersByTime(500);
    expect(transport.writes).toHaveLength(1);

    vi.useRealTimers();
  });

  it("does not write if the session closes before the quiet timer fires", () => {
    vi.useFakeTimers();
    const transport = recordingTransport();
    const manager = createSessionManager({ createTransport: () => transport.handle });
    const { sessionId } = manager.open({
      transport: "ssh",
      profileId: "hermes",
      cols: 80,
      rows: 24,
      sshOptions: { hostname: "hermes" }
    });

    transport.emit({ type: "status", sessionId, state: "connected" });
    vi.advanceTimersByTime(100);
    manager.close(sessionId);

    vi.advanceTimersByTime(1000);
    expect(transport.writes).toHaveLength(0);

    vi.useRealTimers();
  });

  it("writes it again after a reconnect", () => {
    vi.useFakeTimers();
    const transport = recordingTransport();
    const manager = createSessionManager({ createTransport: () => transport.handle });
    const { sessionId } = manager.open({
      transport: "ssh",
      profileId: "hermes",
      cols: 80,
      rows: 24,
      sshOptions: { hostname: "hermes" }
    });

    transport.emit({ type: "status", sessionId, state: "connected" });
    transport.emit({ type: "data", sessionId, data: "user@host:~$ " });
    vi.advanceTimersByTime(500);
    transport.emit({ type: "status", sessionId, state: "reconnecting" });
    transport.emit({ type: "status", sessionId, state: "connected" });
    transport.emit({ type: "data", sessionId, data: "user@host:~$ " });
    vi.advanceTimersByTime(500);

    expect(transport.writes).toHaveLength(2);

    vi.useRealTimers();
  });

  it("skips hosts with a configured password", () => {
    // Password auth races the bootstrap write against sshPtyTransport's
    // password-prompt watcher on the same pty — see task-10-report.md.
    vi.useFakeTimers();
    const transport = recordingTransport();
    const manager = createSessionManager({ createTransport: () => transport.handle });
    const { sessionId } = manager.open({
      transport: "ssh",
      profileId: "hermes",
      cols: 80,
      rows: 24,
      sshOptions: { hostname: "hermes", password: "hunter2" }
    });

    transport.emit({ type: "status", sessionId, state: "connected" });
    transport.emit({ type: "data", sessionId, data: "user@host:~$ " });
    vi.advanceTimersByTime(500);

    expect(transport.writes).toHaveLength(0);

    vi.useRealTimers();
  });

  it("skips hosts that opted out", () => {
    vi.useFakeTimers();
    const transport = recordingTransport();
    const manager = createSessionManager({ createTransport: () => transport.handle });
    const { sessionId } = manager.open({
      transport: "ssh",
      profileId: "hermes",
      cols: 80,
      rows: 24,
      sshOptions: { hostname: "hermes", shellIntegration: false }
    });

    transport.emit({ type: "status", sessionId, state: "connected" });
    transport.emit({ type: "data", sessionId, data: "user@host:~$ " });
    vi.advanceTimersByTime(500);

    expect(transport.writes).toHaveLength(0);

    vi.useRealTimers();
  });

  it("skips tmux attach tabs", () => {
    vi.useFakeTimers();
    const transport = recordingTransport();
    const manager = createSessionManager({ createTransport: () => transport.handle });
    const { sessionId } = manager.open({
      transport: "ssh",
      profileId: "hermes",
      cols: 80,
      rows: 24,
      tmuxAttach: true,
      sshOptions: { hostname: "hermes" }
    });

    transport.emit({ type: "status", sessionId, state: "connected" });
    transport.emit({ type: "data", sessionId, data: "user@host:~$ " });
    vi.advanceTimersByTime(500);

    expect(transport.writes).toHaveLength(0);

    vi.useRealTimers();
  });

  it("never injects into local or serial sessions", () => {
    vi.useFakeTimers();
    const transport = recordingTransport();
    const manager = createSessionManager({ createTransport: () => transport.handle });
    const { sessionId } = manager.open({
      transport: "local",
      profileId: "p1",
      cols: 80,
      rows: 24,
      localOptions: { executable: "pwsh.exe" }
    });

    transport.emit({ type: "status", sessionId, state: "connected" });
    vi.advanceTimersByTime(500);

    expect(transport.writes).toHaveLength(0);

    vi.useRealTimers();
  });
});
