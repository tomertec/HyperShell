// The slice of the preload bridge these Electron E2E specs drive from the
// renderer. Kept narrow on purpose: the tests assert the real IPC contract, so
// widening this to the full DesktopApi would only hide drift behind `any`.
import type {
  CreateBackupResponse,
  HostRecord,
  ListBackupsResponse,
  OpenSessionResponse,
  RestoreBackupResponse,
  SessionEvent,
  SettingRecord,
  UpsertHostRequest
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

  openSession(request: {
    transport: "ssh" | "serial" | "sftp" | "telnet";
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
  onSessionEvent(listener: (event: SessionEvent) => void): () => void;
}

declare global {
  interface Window {
    hypershell: HypershellTestApi;
  }
}

export {};
