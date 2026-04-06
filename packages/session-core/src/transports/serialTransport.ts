import { SerialPort } from "serialport";

import type {
  OpenSessionRequest,
  SessionTransportEvent,
  TransportHandle
} from "./transportEvents";

export type SerialParity = "none" | "even" | "odd" | "mark" | "space";
export type SerialFlowControl = "none" | "hardware" | "software";

export interface SerialConnectionProfile {
  path: string;
  baudRate?: number;
  dataBits?: 5 | 6 | 7 | 8;
  stopBits?: 1 | 2;
  parity?: SerialParity;
  flowControl?: SerialFlowControl;
  localEcho?: boolean;
  dtr?: boolean;
  rts?: boolean;
}

export interface NormalizedSerialConnectionProfile {
  path: string;
  baudRate: number;
  dataBits: 5 | 6 | 7 | 8;
  stopBits: 1 | 2;
  parity: SerialParity;
  flowControl: SerialFlowControl;
  localEcho: boolean;
  dtr: boolean;
  rts: boolean;
}

export function normalizeSerialProfile(
  profile: SerialConnectionProfile
): NormalizedSerialConnectionProfile {
  return {
    path: profile.path,
    baudRate: profile.baudRate ?? 9600,
    dataBits: profile.dataBits ?? 8,
    stopBits: profile.stopBits ?? 1,
    parity: profile.parity ?? "none",
    flowControl: profile.flowControl ?? "none",
    localEcho: profile.localEcho ?? false,
    dtr: profile.dtr ?? true,
    rts: profile.rts ?? true
  };
}

export function buildSerialPortOptions(profile: SerialConnectionProfile) {
  const normalized = normalizeSerialProfile(profile);

  return {
    path: normalized.path,
    baudRate: normalized.baudRate,
    dataBits: normalized.dataBits,
    stopBits: normalized.stopBits,
    parity: normalized.parity,
    autoOpen: false,
    lock: true,
    rtscts: normalized.flowControl === "hardware",
    xon: normalized.flowControl === "software",
    xoff: normalized.flowControl === "software"
  } as const;
}

export interface SerialTransport extends TransportHandle {
  profile: NormalizedSerialConnectionProfile;
  request: OpenSessionRequest;
}

export interface SerialPortLike {
  readonly isOpen: boolean;
  on(event: "open", listener: () => void): this;
  on(event: "data", listener: (chunk: Buffer) => void): this;
  on(event: "error", listener: (error: Error) => void): this;
  on(event: "close", listener: () => void): this;
  open(callback: (error?: Error | null) => void): void;
  close(callback?: (error?: Error | null) => void): void;
  write(data: string, callback?: (error?: Error | null) => void): void;
  removeAllListeners?(event?: string): this;
}

export interface CreateSerialTransportDeps {
  createPort?: (
    options: ReturnType<typeof buildSerialPortOptions>
  ) => SerialPortLike;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.length > 0) {
    return error;
  }

  return "Unknown serial transport error";
}

export function createSerialTransport(
  request: OpenSessionRequest,
  profile: SerialConnectionProfile,
  deps: CreateSerialTransportDeps = {}
): SerialTransport {
  const normalized = normalizeSerialProfile(profile);
  const listeners = new Set<(event: SessionTransportEvent) => void>();
  const createPort =
    deps.createPort ??
    ((options: ReturnType<typeof buildSerialPortOptions>) =>
      new SerialPort(options));
  let port: SerialPortLike | null = null;
  let hasExited = false;

  const emit = (event: SessionTransportEvent) => {
    for (const listener of listeners) {
      listener(event);
    }
  };

  const emitExit = () => {
    if (hasExited) {
      return;
    }

    emit({
      type: "exit",
      sessionId: request.sessionId,
      exitCode: null
    });
    hasExited = true;
    port?.removeAllListeners?.();
  };

  try {
    port = createPort(buildSerialPortOptions(normalized));
  } catch (error) {
    queueMicrotask(() => {
      emit({
        type: "error",
        sessionId: request.sessionId,
        message: toErrorMessage(error)
      });
      emitExit();
    });
  }

  if (port) {
    port.on("open", () => {
      if (hasExited) {
        return;
      }

      emit({
        type: "status",
        sessionId: request.sessionId,
        state: "connected"
      });
    });

    port.on("data", (chunk: Buffer) => {
      if (hasExited) {
        return;
      }

      emit({
        type: "data",
        sessionId: request.sessionId,
        data: chunk.toString("utf8")
      });
    });

    port.on("error", (error: Error) => {
      if (hasExited) {
        return;
      }

      emit({
        type: "error",
        sessionId: request.sessionId,
        message: error.message
      });
    });

    port.on("close", () => {
      emitExit();
    });

    queueMicrotask(() => {
      if (!port || hasExited) {
        return;
      }

      if (!port.isOpen) {
        try {
          port.open((error) => {
            if (!error) {
              return;
            }

            emit({
              type: "error",
              sessionId: request.sessionId,
              message: error.message
            });
            emitExit();
          });
        } catch (error) {
          emit({
            type: "error",
            sessionId: request.sessionId,
            message: toErrorMessage(error)
          });
          emitExit();
        }
        return;
      }

      emit({
        type: "status",
        sessionId: request.sessionId,
        state: "connected"
      });
    });
  }

  return {
    request,
    profile: normalized,
    write(data: string) {
      if (!port || hasExited || !port.isOpen) {
        return;
      }

      try {
        port.write(data, (error) => {
          if (error) {
            emit({
              type: "error",
              sessionId: request.sessionId,
              message: error.message
            });
            return;
          }

          if (!normalized.localEcho) {
            return;
          }

          emit({
            type: "data",
            sessionId: request.sessionId,
            data
          });
        });
      } catch (error) {
        emit({
          type: "error",
          sessionId: request.sessionId,
          message: toErrorMessage(error)
        });
      }
    },
    resize(_cols: number, _rows: number) {},
    close() {
      if (hasExited || !port || !port.isOpen) {
        emitExit();
        return;
      }

      try {
        port.close((error) => {
          if (!error) {
            return;
          }

          emit({
            type: "error",
            sessionId: request.sessionId,
            message: error.message
          });
          emitExit();
        });
      } catch (error) {
        emit({
          type: "error",
          sessionId: request.sessionId,
          message: toErrorMessage(error)
        });
        emitExit();
      }
    },
    onEvent(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
}
