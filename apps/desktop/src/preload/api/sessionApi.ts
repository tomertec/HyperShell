import {
  closeSessionRequestSchema,
  hostStatsRequestSchema,
  hostStatsResponseSchema,
  ipcChannels,
  openSessionRequestSchema,
  openSessionResponseSchema,
  resizeSessionRequestSchema,
  savedSessionRecordSchema,
  sessionClearSavedStateResponseSchema,
  sessionEventSchema,
  sessionLoadSavedStateResponseSchema,
  sessionSaveStateRequestSchema,
  sessionSaveStateResponseSchema,
  setSignalsRequestSchema,
  writeSessionRequestSchema,
  type CloseSessionRequest,
  type HostStatsRequest,
  type HostStatsResponse,
  type OpenSessionRequest,
  type OpenSessionResponse,
  type ResizeSessionRequest,
  type SavedSessionRecord,
  type SessionClearSavedStateResponse,
  type SessionEvent,
  type SessionSaveStateRequest,
  type SessionSaveStateResponse,
  type SetSignalsRequest,
  type WriteSessionRequest,
} from "@hypershell/shared";
import { z } from "zod";
import { createSubscription } from "./subscription";
import type { PreloadIpcRenderer, PreloadLogger } from "./types";

export interface SessionApi {
  openSession(request: OpenSessionRequest): Promise<OpenSessionResponse>;
  resizeSession(request: ResizeSessionRequest): Promise<void>;
  writeSession(request: WriteSessionRequest): Promise<void>;
  closeSession(request: CloseSessionRequest): Promise<void>;
  sessionSaveState(
    request: SessionSaveStateRequest
  ): Promise<SessionSaveStateResponse>;
  sessionLoadSavedState(): Promise<SavedSessionRecord[]>;
  sessionClearSavedState(): Promise<SessionClearSavedStateResponse>;
  onSessionEvent(listener: (event: SessionEvent) => void): () => void;
  onQuickConnect(listener: () => void): () => void;
  setSessionSignals(request: SetSignalsRequest): Promise<void>;
  getHostStats(request: HostStatsRequest): Promise<HostStatsResponse>;
}

const savedSessionRecordArraySchema = z.array(savedSessionRecordSchema);

export function createSessionApi(
  ipcRenderer: PreloadIpcRenderer,
  logger: PreloadLogger
): SessionApi {
  return {
    async openSession(request: OpenSessionRequest): Promise<OpenSessionResponse> {
      const parsedRequest = openSessionRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(
        ipcChannels.session.open,
        parsedRequest
      );
      return openSessionResponseSchema.parse(result);
    },
    async resizeSession(request: ResizeSessionRequest): Promise<void> {
      const parsedRequest = resizeSessionRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.session.resize, parsedRequest);
    },
    async writeSession(request: WriteSessionRequest): Promise<void> {
      const parsedRequest = writeSessionRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.session.write, parsedRequest);
    },
    async closeSession(request: CloseSessionRequest): Promise<void> {
      const parsedRequest = closeSessionRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.session.close, parsedRequest);
    },
    async sessionSaveState(
      request: SessionSaveStateRequest
    ): Promise<SessionSaveStateResponse> {
      const parsedRequest = sessionSaveStateRequestSchema.parse(request);
      const raw = await ipcRenderer.invoke(
        ipcChannels.session.saveState,
        parsedRequest
      );
      return sessionSaveStateResponseSchema.parse(raw);
    },
    async sessionLoadSavedState(): Promise<SavedSessionRecord[]> {
      const raw = await ipcRenderer.invoke(ipcChannels.session.loadSavedState);
      const parsed = sessionLoadSavedStateResponseSchema.parse(raw);
      return savedSessionRecordArraySchema.parse(parsed.sessions);
    },
    async sessionClearSavedState(): Promise<SessionClearSavedStateResponse> {
      const raw = await ipcRenderer.invoke(ipcChannels.session.clearSavedState);
      return sessionClearSavedStateResponseSchema.parse(raw);
    },
    onSessionEvent: createSubscription(
      ipcRenderer,
      logger,
      ipcChannels.session.event,
      "onSessionEvent",
      "session event",
      sessionEventSchema
    ),
    onQuickConnect: createSubscription(
      ipcRenderer,
      logger,
      ipcChannels.tray.quickConnect,
      "onQuickConnect",
      "Quick Connect"
    ),
    async setSessionSignals(request: SetSignalsRequest): Promise<void> {
      const parsed = setSignalsRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.session.setSignals, parsed);
    },
    async getHostStats(request: HostStatsRequest): Promise<HostStatsResponse> {
      const parsedRequest = hostStatsRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(
        ipcChannels.session.hostStats,
        parsedRequest
      );
      return hostStatsResponseSchema.parse(result);
    },
  };
}
