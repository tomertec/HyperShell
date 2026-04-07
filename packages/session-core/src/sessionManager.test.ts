import { describe, expect, it, vi, afterEach } from "vitest";

import { createSessionManager } from "./sessionManager";
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
      createTransport(request) {
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
    let capturedSessionId = "";

    const manager = createSessionManager({
      createTransport(request) {
        transportCount++;
        capturedSessionId = request.sessionId;
        return {
          write() {},
          resize() {},
          close() {},
          onEvent(listener) {
            listeners.add(listener);
            // Emit exit immediately on first transport creation
            if (transportCount === 1) {
              Promise.resolve().then(() => {
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
