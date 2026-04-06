import type {
  CloseSessionRequest,
  HostRecord,
  OpenSessionRequest,
  OpenSessionResponse,
  RemoveHostRequest,
  ResizeSessionRequest,
  SessionEvent,
  UpsertHostRequest,
  WriteSessionRequest
} from "@sshterm/shared";

declare global {
  interface Window {
    sshterm?: {
      openSession?: (request: OpenSessionRequest) => Promise<OpenSessionResponse>;
      resizeSession?: (request: ResizeSessionRequest) => Promise<void>;
      writeSession?: (request: WriteSessionRequest) => Promise<void>;
      closeSession?: (request: CloseSessionRequest) => Promise<void>;
      onSessionEvent?: (listener: (event: SessionEvent) => void) => () => void;
      onQuickConnect?: (listener: () => void) => () => void;
      listHosts?: () => Promise<HostRecord[]>;
      upsertHost?: (request: UpsertHostRequest) => Promise<HostRecord>;
      removeHost?: (request: RemoveHostRequest) => Promise<void>;
    };
  }
}

export {};
