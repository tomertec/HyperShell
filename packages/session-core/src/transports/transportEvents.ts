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
  setSignals?(signals: { dtr?: boolean; rts?: boolean }): void;
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
  dataBits?: 5 | 6 | 7 | 8;
  stopBits?: 1 | 2;
  parity?: "none" | "even" | "odd" | "mark" | "space";
  flowControl?: "none" | "hardware" | "software";
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
