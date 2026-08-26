// The slice of the preload bridge these Electron E2E specs drive from the
// renderer. Kept narrow on purpose: the tests assert the real IPC contract, so
// widening this to the full DesktopApi would only hide drift behind `any`.
import type {
  CreateBackupResponse,
  GhosttyEvent,
  HostRecord,
  ListBackupsResponse,
  LocalProfileRecord,
  LoggingStateResponse,
  OpenSessionResponse,
  RestoreBackupResponse,
  SessionEvent,
  SettingRecord,
  UpsertHostRequest,
  UpsertLocalProfileRequest
} from "@hypershell/shared";

interface HypershellTestApi {
  listHosts(): Promise<HostRecord[]>;
  upsertHost(request: UpsertHostRequest): Promise<HostRecord>;
  removeHost(request: { id: string }): Promise<void>;

  getSetting(request: { key: string }): Promise<SettingRecord | null>;
  updateSetting(request: { key: string; value: string }): Promise<SettingRecord>;

  backupCreate(request: { filePath: string }): Promise<CreateBackupResponse>;
  backupRestore(request: { filePath: string }): Promise<RestoreBackupResponse>;
  backupList(): Promise<ListBackupsResponse>;

  editorOpen(request: { sftpSessionId: string; remotePath: string }): Promise<void>;

  listLocalProfiles(): Promise<LocalProfileRecord[]>;
  upsertLocalProfile(request: UpsertLocalProfileRequest): Promise<LocalProfileRecord>;
  setLocalProfileHidden(request: { id: string; hidden: boolean }): Promise<void>;

  openSession(request: {
    transport: "ssh" | "serial" | "sftp" | "telnet" | "local";
    profileId: string;
    cols: number;
    rows: number;
    telnetOptions?: {
      hostname: string;
      port: number;
      mode: "telnet" | "raw";
      terminalType?: string;
    };
  }): Promise<OpenSessionResponse>;
  writeSession(request: { sessionId: string; data: string }): Promise<void>;
  closeSession(request: { sessionId: string }): Promise<void>;

  // The session logger is how these specs observe terminal output now that
  // `data` events go to the ghostty host rather than the renderer — see
  // electronHarness.ts's readSessionLog.
  loggingStart(request: { sessionId: string; filePath: string }): Promise<void>;
  loggingStop(request: { sessionId: string }): Promise<void>;
  loggingGetState(request: { sessionId: string }): Promise<LoggingStateResponse>;

  onSessionEvent(listener: (event: SessionEvent) => void): () => void;
  onGhosttyEvent(listener: (event: GhosttyEvent) => void): () => void;
}

declare global {
  interface Window {
    hypershell: HypershellTestApi;
  }
}

export {};
