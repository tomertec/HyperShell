import { Socket } from "node:net";

import type {
  OpenSessionRequest,
  SessionTransportEvent,
  TransportHandle,
} from "./transportEvents";
import { TelnetParser } from "./telnetParser";

export interface TelnetConnectionProfile {
  hostname: string;
  port: number;
  mode: "telnet" | "raw";
  terminalType?: string;
}

export interface SocketLike {
  connect(port: number, host: string, callback: () => void): this;
  write(data: Buffer): boolean;
  destroy(): void;
  on(event: string, listener: (...args: unknown[]) => void): this;
  removeAllListeners(): this;
}

export interface CreateTelnetTransportDeps {
  createSocket?: () => SocketLike;
}

export function escapeIac(data: string): Buffer {
  const input = Buffer.from(data, "latin1");
  const parts: Buffer[] = [];
  let start = 0;
  for (let i = 0; i < input.length; i++) {
    if (input[i] === 0xff) {
      if (start < i) parts.push(input.subarray(start, i));
      parts.push(Buffer.from([0xff, 0xff]));
      start = i + 1;
    }
  }
  if (start < input.length) parts.push(input.subarray(start));
  return parts.length === 1 ? parts[0] : Buffer.concat(parts);
}

export function createTelnetTransport(
  request: OpenSessionRequest,
  profile: TelnetConnectionProfile,
  deps?: CreateTelnetTransportDeps,
): TransportHandle {
  const listeners = new Set<(event: SessionTransportEvent) => void>();
  let hasExited = false;

  const emit = (event: SessionTransportEvent) => {
    for (const listener of listeners) {
      listener(event);
    }
  };

  const emitExit = () => {
    if (hasExited) return;
    hasExited = true;
    emit({
      type: "exit",
      sessionId: request.sessionId,
      exitCode: null,
    });
    socket.removeAllListeners();
  };

  const createSocket = deps?.createSocket ?? (() => new Socket() as unknown as SocketLike);
  const socket = createSocket();

  const parser =
    profile.mode === "telnet"
      ? new TelnetParser({
          cols: request.cols,
          rows: request.rows,
          terminalType: profile.terminalType,
        })
      : null;

  if (parser) {
    parser.on("data", (buf: Buffer) => {
      if (hasExited) return;
      emit({
        type: "data",
        sessionId: request.sessionId,
        data: buf.toString("utf8"),
      });
    });

    parser.on("send", (buf: Buffer) => {
      if (hasExited) return;
      socket.write(buf);
    });
  }

  socket.on("data", (chunk: unknown) => {
    if (hasExited) return;
    const buf = chunk as Buffer;
    if (parser) {
      parser.feed(buf);
    } else {
      emit({
        type: "data",
        sessionId: request.sessionId,
        data: buf.toString("utf8"),
      });
    }
  });

  socket.on("error", (err: unknown) => {
    if (hasExited) return;
    const error = err as Error;
    emit({
      type: "error",
      sessionId: request.sessionId,
      message: error.message,
    });
  });

  socket.on("close", () => {
    emitExit();
  });

  socket.connect(profile.port, profile.hostname, () => {
    if (hasExited) return;
    emit({
      type: "status",
      sessionId: request.sessionId,
      state: "connected",
    });
  });

  return {
    write(data: string) {
      if (hasExited) return;
      if (parser) {
        socket.write(escapeIac(data));
      } else {
        socket.write(Buffer.from(data));
      }
    },
    resize(cols: number, rows: number) {
      if (parser) {
        parser.sendNaws(cols, rows);
      }
    },
    close() {
      if (hasExited) {
        emitExit();
        return;
      }
      socket.destroy();
    },
    onEvent(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
