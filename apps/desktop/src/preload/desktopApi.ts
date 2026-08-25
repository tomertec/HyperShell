import {
  ipcChannels,
  ghosttySurfaceCreateRequestSchema,
  ghosttySurfaceDestroyRequestSchema,
  ghosttySurfaceBoundsRequestSchema,
  ghosttySurfaceVisibleRequestSchema,
  ghosttySurfaceFocusRequestSchema,
  ghosttySurfaceCommandRequestSchema,
  ghosttyOverlayGuardRequestSchema,
  ghosttyUpdateConfigRequestSchema,
  setBroadcastTargetsRequestSchema,
  ghosttyEventSchema,
  type GhosttySurfaceCreateRequest,
  type GhosttySurfaceDestroyRequest,
  type GhosttySurfaceBoundsRequest,
  type GhosttySurfaceVisibleRequest,
  type GhosttySurfaceFocusRequest,
  type GhosttySurfaceCommandRequest,
  type GhosttyOverlayGuardRequest,
  type GhosttyUpdateConfigRequest,
  type SetBroadcastTargetsRequest,
  type GhosttyEvent,
} from "@hypershell/shared";
import type { PreloadIpcRenderer, PreloadLogger } from "./api/types";
import { createSubscription } from "./api/subscription";
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
import { createFilesApi, type FilesApi, type FilePathResolver } from "./api/filesApi";

export type { PreloadIpcRenderer, PreloadLogger } from "./api/types";
export type { FilePathResolver } from "./api/filesApi";

// Ghostty's preload methods live inline here rather than in their own
// apps/desktop/src/preload/api/ghosttyApi.ts module (the convention every
// other feature above follows) because this task's shared checkout only
// grants edits to this file, not new files under api/ — another agent is
// working elsewhere in ghosttyHost/ concurrently. Same createXApi(ipcRenderer,
// logger) shape as the rest, just not split out.
export interface GhosttyApi {
  ghosttySurfaceCreate(request: GhosttySurfaceCreateRequest): Promise<void>;
  ghosttySurfaceDestroy(request: GhosttySurfaceDestroyRequest): Promise<void>;
  ghosttySurfaceBounds(request: GhosttySurfaceBoundsRequest): Promise<void>;
  ghosttySurfaceVisible(request: GhosttySurfaceVisibleRequest): Promise<void>;
  ghosttySurfaceFocus(request: GhosttySurfaceFocusRequest): Promise<void>;
  ghosttySurfaceCommand(request: GhosttySurfaceCommandRequest): Promise<void>;
  ghosttyOverlayGuard(request: GhosttyOverlayGuardRequest): Promise<void>;
  ghosttyUpdateConfig(request: GhosttyUpdateConfigRequest): Promise<void>;
  onGhosttyEvent(listener: (event: GhosttyEvent) => void): () => void;
  setBroadcastTargets(request: SetBroadcastTargetsRequest): Promise<void>;
}

function createGhosttyApi(
  ipcRenderer: PreloadIpcRenderer,
  logger: PreloadLogger
): GhosttyApi {
  return {
    async ghosttySurfaceCreate(request) {
      const parsed = ghosttySurfaceCreateRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.ghostty.surfaceCreate, parsed);
    },
    async ghosttySurfaceDestroy(request) {
      const parsed = ghosttySurfaceDestroyRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.ghostty.surfaceDestroy, parsed);
    },
    async ghosttySurfaceBounds(request) {
      const parsed = ghosttySurfaceBoundsRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.ghostty.surfaceBounds, parsed);
    },
    async ghosttySurfaceVisible(request) {
      const parsed = ghosttySurfaceVisibleRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.ghostty.surfaceVisible, parsed);
    },
    async ghosttySurfaceFocus(request) {
      const parsed = ghosttySurfaceFocusRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.ghostty.surfaceFocus, parsed);
    },
    async ghosttySurfaceCommand(request) {
      const parsed = ghosttySurfaceCommandRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.ghostty.surfaceCommand, parsed);
    },
    async ghosttyOverlayGuard(request) {
      const parsed = ghosttyOverlayGuardRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.ghostty.overlayGuard, parsed);
    },
    async ghosttyUpdateConfig(request) {
      const parsed = ghosttyUpdateConfigRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.ghostty.updateConfig, parsed);
    },
    onGhosttyEvent: createSubscription(
      ipcRenderer,
      logger,
      ipcChannels.ghostty.event,
      "onGhosttyEvent",
      "ghostty event",
      ghosttyEventSchema
    ),
    async setBroadcastTargets(request) {
      const parsed = setBroadcastTargetsRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.session.broadcastTargets, parsed);
    },
  };
}

export interface DesktopApi extends SessionApi, HostsApi, SftpApi, GroupsTagsApi, HostProfilesApi, SerialApi, FsApi, WorkspaceApi, SshKeysApi, PortForwardApi, RecordingApi, SettingsApi, UpdateApi, SystemApi, LocalApi, FilesApi, GhosttyApi {}

export function createDesktopApi(
  ipcRenderer: PreloadIpcRenderer,
  logger: PreloadLogger = console,
  filePathResolver: FilePathResolver | null = null
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
    ...createFilesApi(filePathResolver),
    ...createGhosttyApi(ipcRenderer, logger),
  };
}
