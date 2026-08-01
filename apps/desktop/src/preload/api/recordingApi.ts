import {
  ipcChannels,
  startLoggingRequestSchema,
  stopLoggingRequestSchema,
  getLoggingStateRequestSchema,
  loggingStateResponseSchema,
  startRecordingRequestSchema,
  stopRecordingRequestSchema,
  getRecordingStateRequestSchema,
  recordingStateResponseSchema,
  deleteRecordingRequestSchema,
  deleteRecordingResponseSchema,
  getRecordingFramesRequestSchema,
  recordingFramesResponseSchema,
  exportRecordingRequestSchema,
  exportRecordingResponseSchema,
  sessionRecordingRecordSchema,
  connectionHistoryRecordSchema,
  connectionHistoryListByHostRequestSchema,
  connectionHistoryListRecentRequestSchema,
  type StartLoggingRequest,
  type StopLoggingRequest,
  type GetLoggingStateRequest,
  type LoggingStateResponse,
  type StartRecordingRequest,
  type StopRecordingRequest,
  type GetRecordingStateRequest,
  type RecordingStateResponse,
  type SessionRecordingRecord,
  type DeleteRecordingRequest,
  type DeleteRecordingResponse,
  type GetRecordingFramesRequest,
  type RecordingFramesResponse,
  type ExportRecordingRequest,
  type ExportRecordingResponse,
  type ConnectionHistoryRecord,
  type ConnectionHistoryListByHostRequest,
  type ConnectionHistoryListRecentRequest,
} from "@hypershell/shared";
import { z } from "zod";
import type { PreloadIpcRenderer, PreloadLogger } from "./types";

export interface RecordingApi {
  // Session logging
  loggingStart(request: StartLoggingRequest): Promise<void>;
  loggingStop(request: StopLoggingRequest): Promise<void>;
  loggingGetState(request: GetLoggingStateRequest): Promise<LoggingStateResponse>;
  recordingStart(request: StartRecordingRequest): Promise<SessionRecordingRecord>;
  recordingStop(request: StopRecordingRequest): Promise<SessionRecordingRecord | null>;
  recordingGetState(request: GetRecordingStateRequest): Promise<RecordingStateResponse>;
  recordingList(): Promise<SessionRecordingRecord[]>;
  recordingDelete(request: DeleteRecordingRequest): Promise<DeleteRecordingResponse>;
  recordingGetFrames(request: GetRecordingFramesRequest): Promise<RecordingFramesResponse>;
  recordingExport(request: ExportRecordingRequest): Promise<ExportRecordingResponse>;
  connectionHistoryListByHost(
    request: ConnectionHistoryListByHostRequest
  ): Promise<ConnectionHistoryRecord[]>;
  connectionHistoryListRecent(
    request?: ConnectionHistoryListRecentRequest
  ): Promise<ConnectionHistoryRecord[]>;
}

const connectionHistoryRecordArraySchema = z.array(connectionHistoryRecordSchema);

export function createRecordingApi(
  ipcRenderer: PreloadIpcRenderer,
  _logger: PreloadLogger
): RecordingApi {
  return {
    // Session logging
    async loggingStart(request: StartLoggingRequest): Promise<void> {
      await ipcRenderer.invoke(ipcChannels.logging.start, startLoggingRequestSchema.parse(request));
    },
    async loggingStop(request: StopLoggingRequest): Promise<void> {
      await ipcRenderer.invoke(ipcChannels.logging.stop, stopLoggingRequestSchema.parse(request));
    },
    async loggingGetState(request: GetLoggingStateRequest): Promise<LoggingStateResponse> {
      const raw = await ipcRenderer.invoke(ipcChannels.logging.getState, getLoggingStateRequestSchema.parse(request));
      return loggingStateResponseSchema.parse(raw);
    },
    // Session recording
    async recordingStart(request: StartRecordingRequest): Promise<SessionRecordingRecord> {
      const raw = await ipcRenderer.invoke(ipcChannels.recording.start, startRecordingRequestSchema.parse(request));
      return sessionRecordingRecordSchema.parse(raw);
    },
    async recordingStop(request: StopRecordingRequest): Promise<SessionRecordingRecord | null> {
      const raw = await ipcRenderer.invoke(ipcChannels.recording.stop, stopRecordingRequestSchema.parse(request));
      if (raw === null || raw === undefined) {
        return null;
      }
      return sessionRecordingRecordSchema.parse(raw);
    },
    async recordingGetState(request: GetRecordingStateRequest): Promise<RecordingStateResponse> {
      const raw = await ipcRenderer.invoke(ipcChannels.recording.getState, getRecordingStateRequestSchema.parse(request));
      return recordingStateResponseSchema.parse(raw);
    },
    async recordingList(): Promise<SessionRecordingRecord[]> {
      const raw = await ipcRenderer.invoke(ipcChannels.recording.list);
      return z.array(sessionRecordingRecordSchema).parse(raw);
    },
    async recordingDelete(request: DeleteRecordingRequest): Promise<DeleteRecordingResponse> {
      const raw = await ipcRenderer.invoke(ipcChannels.recording.delete, deleteRecordingRequestSchema.parse(request));
      return deleteRecordingResponseSchema.parse(raw);
    },
    async recordingGetFrames(request: GetRecordingFramesRequest): Promise<RecordingFramesResponse> {
      const raw = await ipcRenderer.invoke(ipcChannels.recording.getFrames, getRecordingFramesRequestSchema.parse(request));
      return recordingFramesResponseSchema.parse(raw);
    },
    async recordingExport(request: ExportRecordingRequest): Promise<ExportRecordingResponse> {
      const raw = await ipcRenderer.invoke(ipcChannels.recording.export, exportRecordingRequestSchema.parse(request));
      return exportRecordingResponseSchema.parse(raw);
    },
    async connectionHistoryListByHost(
      request: ConnectionHistoryListByHostRequest
    ): Promise<ConnectionHistoryRecord[]> {
      const raw = await ipcRenderer.invoke(
        ipcChannels.connectionHistory.listByHost,
        connectionHistoryListByHostRequestSchema.parse(request)
      );
      return connectionHistoryRecordArraySchema.parse(raw);
    },
    async connectionHistoryListRecent(
      request?: ConnectionHistoryListRecentRequest
    ): Promise<ConnectionHistoryRecord[]> {
      const raw = await ipcRenderer.invoke(
        ipcChannels.connectionHistory.listRecent,
        connectionHistoryListRecentRequestSchema.parse(request ?? {})
      );
      return connectionHistoryRecordArraySchema.parse(raw);
    },
  };
}
