import {
  closeSessionRequestSchema,
  ipcChannels,
  openSessionRequestSchema,
  openSessionResponseSchema,
  resizeSessionRequestSchema,
  sessionEventSchema,
  upsertHostRequestSchema,
  removeHostRequestSchema,
  writeSessionRequestSchema,
  getSettingRequestSchema,
  updateSettingRequestSchema,
  type CloseSessionRequest,
  type HostRecord,
  type OpenSessionRequest,
  type OpenSessionResponse,
  type RemoveHostRequest,
  type ResizeSessionRequest,
  type SessionEvent,
  type UpsertHostRequest,
  type WriteSessionRequest,
  type GetSettingRequest,
  type UpdateSettingRequest,
  type SettingRecord
} from "@sshterm/shared";

export interface PreloadIpcRenderer {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  on(
    channel: string,
    listener: (event: unknown, ...args: unknown[]) => void
  ): void;
  removeListener(
    channel: string,
    listener: (event: unknown, ...args: unknown[]) => void
  ): void;
}

export interface PreloadLogger {
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
}

export interface DesktopApi {
  openSession(request: OpenSessionRequest): Promise<OpenSessionResponse>;
  resizeSession(request: ResizeSessionRequest): Promise<void>;
  writeSession(request: WriteSessionRequest): Promise<void>;
  closeSession(request: CloseSessionRequest): Promise<void>;
  onSessionEvent(listener: (event: SessionEvent) => void): () => void;
  onQuickConnect(listener: () => void): () => void;
  listHosts(): Promise<HostRecord[]>;
  upsertHost(request: UpsertHostRequest): Promise<HostRecord>;
  removeHost(request: RemoveHostRequest): Promise<void>;
  getSetting(request: GetSettingRequest): Promise<SettingRecord | null>;
  updateSetting(request: UpdateSettingRequest): Promise<SettingRecord>;
}

function assertListener(value: unknown, methodName: string): asserts value is Function {
  if (typeof value === "function") {
    return;
  }

  throw new TypeError(`${methodName} listener must be a function`);
}

export function createDesktopApi(
  ipcRenderer: PreloadIpcRenderer,
  logger: PreloadLogger = console
): DesktopApi {
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
    onSessionEvent(listener: (event: SessionEvent) => void): () => void {
      assertListener(listener, "onSessionEvent");

      const wrappedListener = (_event: unknown, payload: unknown) => {
        const parsed = sessionEventSchema.safeParse(payload);
        if (!parsed.success) {
          logger.warn?.(
            "Ignored invalid session event payload from IPC",
            parsed.error
          );
          return;
        }

        try {
          listener(parsed.data);
        } catch (error) {
          logger.error?.("Session event listener threw", error);
        }
      };

      ipcRenderer.on(ipcChannels.session.event, wrappedListener);

      return () => {
        ipcRenderer.removeListener(ipcChannels.session.event, wrappedListener);
      };
    },
    onQuickConnect(listener: () => void): () => void {
      assertListener(listener, "onQuickConnect");

      const wrappedListener = () => {
        try {
          listener();
        } catch (error) {
          logger.error?.("Quick Connect listener threw", error);
        }
      };

      ipcRenderer.on(ipcChannels.tray.quickConnect, wrappedListener);

      return () => {
        ipcRenderer.removeListener(ipcChannels.tray.quickConnect, wrappedListener);
      };
    },
    async listHosts(): Promise<HostRecord[]> {
      const result = await ipcRenderer.invoke(ipcChannels.hosts.list);
      return result as HostRecord[];
    },
    async upsertHost(request: UpsertHostRequest): Promise<HostRecord> {
      const parsed = upsertHostRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.hosts.upsert, parsed);
      return result as HostRecord;
    },
    async removeHost(request: RemoveHostRequest): Promise<void> {
      const parsed = removeHostRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.hosts.remove, parsed);
    },
    async getSetting(request: GetSettingRequest): Promise<SettingRecord | null> {
      const parsed = getSettingRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.settings.get, parsed);
      return result as SettingRecord | null;
    },
    async updateSetting(request: UpdateSettingRequest): Promise<SettingRecord> {
      const parsed = updateSettingRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.settings.update, parsed);
      return result as SettingRecord;
    }
  };
}
