import type { PreloadIpcRenderer, PreloadLogger } from "./api/types";
import { createSessionApi, type SessionApi } from "./api/sessionApi";
import { createHostsApi, type HostsApi } from "./api/hostsApi";
import { createSftpApi, type SftpApi } from "./api/sftpApi";
import { createGroupsTagsApi, type GroupsTagsApi } from "./api/groupsTagsApi";
import { createHostProfilesApi, type HostProfilesApi } from "./api/hostProfilesApi";
import { createSerialApi, type SerialApi } from "./api/serialApi";
import { createFsApi, type FsApi } from "./api/fsApi";
import { createWorkspaceApi, type WorkspaceApi } from "./api/workspaceApi";
import { createSshKeysApi, type SshKeysApi } from "./api/sshKeysApi";
import { createPortForwardApi, type PortForwardApi } from "./api/portForwardApi";
import { createRecordingApi, type RecordingApi } from "./api/recordingApi";
import { createSettingsApi, type SettingsApi } from "./api/settingsApi";
import { createUpdateApi, type UpdateApi } from "./api/updateApi";
import { createSystemApi, type SystemApi } from "./api/systemApi";
import { createLocalApi, type LocalApi } from "./api/localApi";

export type { PreloadIpcRenderer, PreloadLogger } from "./api/types";

export interface DesktopApi extends SessionApi, HostsApi, SftpApi, GroupsTagsApi, HostProfilesApi, SerialApi, FsApi, WorkspaceApi, SshKeysApi, PortForwardApi, RecordingApi, SettingsApi, UpdateApi, SystemApi, LocalApi {}

export function createDesktopApi(
  ipcRenderer: PreloadIpcRenderer,
  logger: PreloadLogger = console
): DesktopApi {
  return {
    ...createSessionApi(ipcRenderer, logger),
    ...createHostsApi(ipcRenderer, logger),
    ...createSftpApi(ipcRenderer, logger),
    ...createGroupsTagsApi(ipcRenderer, logger),
    ...createHostProfilesApi(ipcRenderer, logger),
    ...createSerialApi(ipcRenderer, logger),
    ...createFsApi(ipcRenderer, logger),
    ...createWorkspaceApi(ipcRenderer, logger),
    ...createSshKeysApi(ipcRenderer, logger),
    ...createPortForwardApi(ipcRenderer, logger),
    ...createRecordingApi(ipcRenderer, logger),
    ...createSettingsApi(ipcRenderer, logger),
    ...createUpdateApi(ipcRenderer, logger),
    ...createSystemApi(ipcRenderer, logger),
    ...createLocalApi(ipcRenderer, logger),
  };
}
