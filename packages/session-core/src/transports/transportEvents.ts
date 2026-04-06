export type SessionTransportKind = "ssh" | "serial";

export type SessionState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "failed";

export type SessionTransportEvent =
  | {
      type: "data";
      sessionId: string;
      data: string;
    }
  | {
      type: "status";
      sessionId: string;
      state: SessionState;
    }
  | {
      type: "exit";
      sessionId: string;
      exitCode: number | null;
    }
  | {
      type: "error";
      sessionId: string;
      message: string;
    };

export interface TransportHandle {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  close(): void;
  onEvent(listener: (event: SessionTransportEvent) => void): () => void;
}

export interface SshConnectionOptions {
  hostname: string;
  username?: string;
  port?: number;
  identityFile?: string;
  proxyJump?: string;
  keepAliveSeconds?: number;
}

export interface SerialConnectionOptions {
  path: string;
  baudRate?: number;
  dataBits?: number;
  stopBits?: number;
  parity?: string;
  flowControl?: string;
  localEcho?: boolean;
  dtr?: boolean;
  rts?: boolean;
}

export type OpenSessionRequest = {
  sessionId: string;
  transport: SessionTransportKind;
  profileId: string;
  cols: number;
  rows: number;
  sshOptions?: SshConnectionOptions;
  serialOptions?: SerialConnectionOptions;
};
