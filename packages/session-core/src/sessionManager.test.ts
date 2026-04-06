import { describe, expect, it } from "vitest";

import { createSessionManager } from "./sessionManager";
import type {
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
});
