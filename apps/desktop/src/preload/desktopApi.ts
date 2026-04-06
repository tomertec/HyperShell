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
  upsertGroupRequestSchema,
  removeGroupRequestSchema,
  upsertSerialProfileRequestSchema,
  removeSerialProfileRequestSchema,
  setSignalsRequestSchema,
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
  type SettingRecord,
  type UpsertGroupRequest,
  type RemoveGroupRequest,
  type SerialProfileRecord,
  type UpsertSerialProfileRequest,
  type RemoveSerialProfileRequest,
  type SerialPortInfo,
  type SetSignalsRequest
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
  importSshConfig(): Promise<{ imported: number; hosts: HostRecord[] }>;
  listGroups(): Promise<Array<{ id: string; name: string; description: string | null }>>;
  upsertGroup(request: UpsertGroupRequest): Promise<{ id: string; name: string; description: string | null }>;
  removeGroup(request: RemoveGroupRequest): Promise<void>;
  listSerialProfiles(): Promise<SerialProfileRecord[]>;
  upsertSerialProfile(request: UpsertSerialProfileRequest): Promise<SerialProfileRecord>;
  removeSerialProfile(request: RemoveSerialProfileRequest): Promise<void>;
  listSerialPorts(): Promise<SerialPortInfo[]>;
  setSessionSignals(request: SetSignalsRequest): Promise<void>;
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
    },
    async importSshConfig(): Promise<{ imported: number; hosts: HostRecord[] }> {
      const result = await ipcRenderer.invoke(ipcChannels.hosts.importSshConfig);
      return result as { imported: number; hosts: HostRecord[] };
    },
    async listGroups(): Promise<Array<{ id: string; name: string; description: string | null }>> {
      const result = await ipcRenderer.invoke(ipcChannels.groups.list);
      return result as Array<{ id: string; name: string; description: string | null }>;
    },
    async upsertGroup(request: UpsertGroupRequest): Promise<{ id: string; name: string; description: string | null }> {
      const parsed = upsertGroupRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.groups.upsert, parsed);
      return result as { id: string; name: string; description: string | null };
    },
    async removeGroup(request: RemoveGroupRequest): Promise<void> {
      const parsed = removeGroupRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.groups.remove, parsed);
    },
    async listSerialProfiles(): Promise<SerialProfileRecord[]> {
      const result = await ipcRenderer.invoke(ipcChannels.serialProfiles.list);
      return result as SerialProfileRecord[];
    },
    async upsertSerialProfile(request: UpsertSerialProfileRequest): Promise<SerialProfileRecord> {
      const parsed = upsertSerialProfileRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.serialProfiles.upsert, parsed);
      return result as SerialProfileRecord;
    },
    async removeSerialProfile(request: RemoveSerialProfileRequest): Promise<void> {
      const parsed = removeSerialProfileRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.serialProfiles.remove, parsed);
    },
    async listSerialPorts(): Promise<SerialPortInfo[]> {
      const result = await ipcRenderer.invoke(ipcChannels.serialProfiles.listPorts);
      return result as SerialPortInfo[];
    },
    async setSessionSignals(request: SetSignalsRequest): Promise<void> {
      const parsed = setSignalsRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.session.setSignals, parsed);
    }
  };
}
