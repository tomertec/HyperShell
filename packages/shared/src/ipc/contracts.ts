import { ipcChannels } from "./channels";
import type {
  CloseSessionRequest,
  OpenSessionRequest,
  OpenSessionResponse,
  ResizeSessionRequest,
  SessionEvent,
  WriteSessionRequest
} from "./schemas";

export interface SessionIpcClient {
  openSession(request: OpenSessionRequest): Promise<OpenSessionResponse>;
  resizeSession(request: ResizeSessionRequest): Promise<void>;
  writeSession(request: WriteSessionRequest): Promise<void>;
  closeSession(request: CloseSessionRequest): Promise<void>;
  onSessionEvent(listener: (event: SessionEvent) => void): () => void;
}

export interface SessionIpcHandlers {
  [ipcChannels.session.open]: (
    request: OpenSessionRequest
  ) => Promise<OpenSessionResponse>;
  [ipcChannels.session.resize]: (request: ResizeSessionRequest) => Promise<void>;
  [ipcChannels.session.write]: (request: WriteSessionRequest) => Promise<void>;
  [ipcChannels.session.close]: (request: CloseSessionRequest) => Promise<void>;
}
