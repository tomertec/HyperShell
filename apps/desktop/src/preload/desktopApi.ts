import {
  connectionPoolStatsSchema,
  createBackupRequestSchema,
  createBackupResponseSchema,
  restoreBackupRequestSchema,
  restoreBackupResponseSchema,
  listBackupsResponseSchema,
  fsEntrySchema,
  fsGetDrivesResponseSchema,
  fsListRequestSchema,
  fsListResponseSchema,
  fsPathRequestSchema,
  fsRenameRequestSchema,
  fsShowSaveDialogRequestSchema,
  fsShowOpenDialogRequestSchema,
  fsDialogPathResponseSchema,
  ipcChannels,
  getSettingRequestSchema,
  updateSettingRequestSchema,
  hostPortForwardRecordSchema,
  type FsEntry,
  type FsGetDrivesResponse,
  type FsListRequest,
  type FsListResponse,
  type FsPathRequest,
  type GetSettingRequest,
  type UpdateSettingRequest,
  type SettingRecord,
  saveWorkspaceRequestSchema,
  loadWorkspaceRequestSchema,
  removeWorkspaceRequestSchema,
  settingRecordSchema,
  workspaceLayoutSchema,
  workspaceRecordSchema,
  sshKeyInfoSchema,
  generateSshKeyRequestSchema,
  removeSshKeyRequestSchema,
  getFingerprintRequestSchema,
  convertPpkRequestSchema,
  convertPpkResponseSchema,
  listHostPortForwardsRequestSchema,
  upsertHostPortForwardRequestSchema,
  removeHostPortForwardRequestSchema,
  reorderHostPortForwardsRequestSchema,
  opListVaultsResponseSchema,
  opListItemsRequestSchema,
  opListItemsResponseSchema,
  opGetItemFieldsRequestSchema,
  opGetItemFieldsResponseSchema,
  type OpListVaultsResponse,
  type OpListItemsRequest,
  type OpListItemsResponse,
  type OpGetItemFieldsRequest,
  type OpGetItemFieldsResponse,
  editorOpenRequestSchema,
  editorOpenFileSchema,
  editorSessionClosedSchema,
  type EditorOpenRequest,
  type EditorOpenFile,
  type EditorSessionClosed,
  snippetRecordSchema,
  upsertSnippetRequestSchema,
  removeSnippetRequestSchema,
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
  tmuxProbeRequestSchema,
  tmuxProbeResponseSchema,
  type SnippetRecord,
  type UpsertSnippetRequest,
  type RemoveSnippetRequest,
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
  type TmuxProbeRequest,
  type TmuxProbeResponse,
  type SaveWorkspaceRequest,
  type LoadWorkspaceRequest,
  type RemoveWorkspaceRequest,
  type WorkspaceLayout,
  type WorkspaceRecord,
  type SshKeyInfo,
  type GenerateSshKeyRequest,
  type RemoveSshKeyRequest,
  type GetFingerprintRequest,
  type ConvertPpkRequest,
  type ConvertPpkResponse,
  type HostPortForwardRecord,
  type UpsertHostPortForwardRequest,
  type ListHostPortForwardsRequest,
  type RemoveHostPortForwardRequest,
  type ReorderHostPortForwardsRequest,
  type ConnectionPoolStats,
  type CreateBackupRequest,
  type CreateBackupResponse,
  type RestoreBackupRequest,
  type RestoreBackupResponse,
  type ListBackupsResponse,
  updateStateSchema,
  type UpdateState,
} from "@hypershell/shared";
import { z } from "zod";
import type { PreloadIpcRenderer, PreloadLogger } from "./api/types";
import { createSessionApi, type SessionApi } from "./api/sessionApi";
import { createHostsApi, type HostsApi } from "./api/hostsApi";
import { createSftpApi, type SftpApi } from "./api/sftpApi";
import { createGroupsTagsApi, type GroupsTagsApi } from "./api/groupsTagsApi";
import { createHostProfilesApi, type HostProfilesApi } from "./api/hostProfilesApi";
import { createSerialApi, type SerialApi } from "./api/serialApi";

export type { PreloadIpcRenderer, PreloadLogger } from "./api/types";

export interface DesktopApi extends SessionApi, HostsApi, SftpApi, GroupsTagsApi, HostProfilesApi, SerialApi {
  getSetting(request: GetSettingRequest): Promise<SettingRecord | null>;
  updateSetting(request: UpdateSettingRequest): Promise<SettingRecord>;
  fsList(request: FsListRequest): Promise<FsListResponse>;
  fsStat(request: FsPathRequest): Promise<FsEntry>;
  fsGetHome(): Promise<{ path: string }>;
  fsGetDrives(): Promise<FsGetDrivesResponse>;
  fsListSshKeys(): Promise<string[]>;
  fsShowSaveDialog(options?: { defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }): Promise<string | null>;
  fsShowOpenDialog(options?: { title?: string; defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }): Promise<string | null>;
  fsOpenItem(request: { path: string }): Promise<void>;
  fsShowInFolder(request: { path: string }): Promise<void>;
  fsTrash(request: { path: string }): Promise<void>;
  fsRename(request: { oldPath: string; newPath: string }): Promise<void>;
  workspaceSave(request: SaveWorkspaceRequest): Promise<{ success: boolean }>;
  workspaceLoad(request: LoadWorkspaceRequest): Promise<WorkspaceRecord | null>;
  workspaceList(): Promise<WorkspaceRecord[]>;
  workspaceRemove(request: RemoveWorkspaceRequest): Promise<void>;
  workspaceSaveLast(layout: WorkspaceLayout): Promise<void>;
  workspaceLoadLast(): Promise<WorkspaceRecord | null>;
  sshKeysList(): Promise<SshKeyInfo[]>;
  sshKeysGenerate(request: GenerateSshKeyRequest): Promise<{ path: string }>;
  sshKeysGetFingerprint(request: GetFingerprintRequest): Promise<{ fingerprint: string | null }>;
  sshKeysRemove(request: RemoveSshKeyRequest): Promise<void>;
  sshKeysConvertPpk(request: ConvertPpkRequest): Promise<ConvertPpkResponse>;
  // Host port forwards
  hostPortForwardList(request: ListHostPortForwardsRequest): Promise<HostPortForwardRecord[]>;
  hostPortForwardUpsert(request: UpsertHostPortForwardRequest): Promise<HostPortForwardRecord>;
  hostPortForwardRemove(request: RemoveHostPortForwardRequest): Promise<boolean>;
  hostPortForwardReorder(request: ReorderHostPortForwardsRequest): Promise<void>;
  // Connection pool
  connectionPoolStats(): Promise<ConnectionPoolStats[]>;
  // 1Password
  opListVaults(): Promise<OpListVaultsResponse>;
  opListItems(request: OpListItemsRequest): Promise<OpListItemsResponse>;
  opGetItemFields(request: OpGetItemFieldsRequest): Promise<OpGetItemFieldsResponse>;
  // Editor window
  editorOpen(request: EditorOpenRequest): Promise<void>;
  onEditorOpenFile(listener: (event: EditorOpenFile) => void): () => void;
  onEditorSessionClosed(listener: (event: EditorSessionClosed) => void): () => void;
  // Snippets
  snippetsList(): Promise<SnippetRecord[]>;
  snippetsUpsert(request: UpsertSnippetRequest): Promise<SnippetRecord>;
  snippetsRemove(request: RemoveSnippetRequest): Promise<void>;
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
  // Database backup & restore
  backupCreate(request: CreateBackupRequest): Promise<CreateBackupResponse>;
  backupRestore(request: RestoreBackupRequest): Promise<RestoreBackupResponse>;
  backupList(): Promise<ListBackupsResponse>;
  backupShowOpenDialog(): Promise<string | null>;
  // Tmux detection
  tmuxProbe(request: TmuxProbeRequest): Promise<TmuxProbeResponse>;
  // App theme
  setAppTheme(theme: "light" | "dark"): Promise<void>;
  // Auto-update
  checkForUpdates(): Promise<void>;
  downloadUpdate(): Promise<void>;
  installUpdate(): Promise<void>;
  openUpdateRelease(): Promise<void>;
  getUpdateState(): Promise<UpdateState>;
  onUpdateState(listener: (state: UpdateState) => void): () => void;
}

function assertListener(value: unknown, methodName: string): asserts value is Function {
  if (typeof value === "function") {
    return;
  }

  throw new TypeError(`${methodName} listener must be a function`);
}

const fsGetHomeResponseSchema = z.object({ path: z.string() });
const fsListSshKeysResponseSchema = z.array(z.string());
const workspaceSaveResponseSchema = z.object({ success: z.boolean() });
const workspaceRecordNullableSchema = workspaceRecordSchema.nullable();
const workspaceRecordArraySchema = z.array(workspaceRecordSchema);
const sshKeyInfoArraySchema = z.array(sshKeyInfoSchema);
const sshKeysGenerateResponseSchema = z.object({ path: z.string() });
const sshFingerprintResponseSchema = z.object({ fingerprint: z.string().nullable() });
const hostPortForwardRecordArraySchema = z.array(hostPortForwardRecordSchema);
const connectionPoolStatsArraySchema = z.array(connectionPoolStatsSchema);
const connectionHistoryRecordArraySchema = z.array(connectionHistoryRecordSchema);
const booleanResponseSchema = z.boolean();

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
    async getSetting(request: GetSettingRequest): Promise<SettingRecord | null> {
      const parsed = getSettingRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.settings.get, parsed);
      return result === null ? null : settingRecordSchema.parse(result);
    },
    async updateSetting(request: UpdateSettingRequest): Promise<SettingRecord> {
      const parsed = updateSettingRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.settings.update, parsed);
      return settingRecordSchema.parse(result);
    },
    async fsList(request: FsListRequest): Promise<FsListResponse> {
      const parsed = fsListRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.fs.list, parsed);
      return fsListResponseSchema.parse(result);
    },
    async fsStat(request: FsPathRequest): Promise<FsEntry> {
      const parsed = fsPathRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.fs.stat, parsed);
      return fsEntrySchema.parse(result);
    },
    async fsGetHome(): Promise<{ path: string }> {
      const result = await ipcRenderer.invoke(ipcChannels.fs.getHome);
      return fsGetHomeResponseSchema.parse(result);
    },
    async fsGetDrives(): Promise<FsGetDrivesResponse> {
      const result = await ipcRenderer.invoke(ipcChannels.fs.getDrives);
      return fsGetDrivesResponseSchema.parse(result);
    },
    async fsListSshKeys(): Promise<string[]> {
      const result = await ipcRenderer.invoke(ipcChannels.fs.listSshKeys);
      return fsListSshKeysResponseSchema.parse(result);
    },
    async fsShowSaveDialog(options?: { defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }): Promise<string | null> {
      const parsed = fsShowSaveDialogRequestSchema.parse(options);
      const result = await ipcRenderer.invoke(ipcChannels.fs.showSaveDialog, parsed);
      return fsDialogPathResponseSchema.parse(result);
    },
    async fsShowOpenDialog(options?: { title?: string; defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }): Promise<string | null> {
      const parsed = fsShowOpenDialogRequestSchema.parse(options);
      const result = await ipcRenderer.invoke(ipcChannels.fs.showOpenDialog, parsed);
      return fsDialogPathResponseSchema.parse(result);
    },
    async fsOpenItem(request: { path: string }): Promise<void> {
      const parsed = fsPathRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.fs.openItem, parsed);
    },
    async fsShowInFolder(request: { path: string }): Promise<void> {
      const parsed = fsPathRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.fs.showInFolder, parsed);
    },
    async fsTrash(request: { path: string }): Promise<void> {
      const parsed = fsPathRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.fs.trash, parsed);
    },
    async fsRename(request: { oldPath: string; newPath: string }): Promise<void> {
      const parsed = fsRenameRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.fs.rename, parsed);
    },
    async workspaceSave(request: SaveWorkspaceRequest): Promise<{ success: boolean }> {
      const parsed = saveWorkspaceRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.workspace.save, parsed);
      return workspaceSaveResponseSchema.parse(result);
    },
    async workspaceLoad(request: LoadWorkspaceRequest): Promise<WorkspaceRecord | null> {
      const parsed = loadWorkspaceRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.workspace.load, parsed);
      return workspaceRecordNullableSchema.parse(result);
    },
    async workspaceList(): Promise<WorkspaceRecord[]> {
      const result = await ipcRenderer.invoke(ipcChannels.workspace.list);
      return workspaceRecordArraySchema.parse(result);
    },
    async workspaceRemove(request: RemoveWorkspaceRequest): Promise<void> {
      const parsed = removeWorkspaceRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.workspace.remove, parsed);
    },
    async workspaceSaveLast(layout: WorkspaceLayout): Promise<void> {
      const parsed = workspaceLayoutSchema.parse(layout);
      await ipcRenderer.invoke(ipcChannels.workspace.saveLast, parsed);
    },
    async workspaceLoadLast(): Promise<WorkspaceRecord | null> {
      const result = await ipcRenderer.invoke(ipcChannels.workspace.loadLast);
      return workspaceRecordNullableSchema.parse(result);
    },
    async sshKeysList(): Promise<SshKeyInfo[]> {
      const result = await ipcRenderer.invoke(ipcChannels.sshKeys.list);
      return sshKeyInfoArraySchema.parse(result);
    },
    async sshKeysGenerate(request: GenerateSshKeyRequest): Promise<{ path: string }> {
      const parsed = generateSshKeyRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.sshKeys.generate, parsed);
      return sshKeysGenerateResponseSchema.parse(result);
    },
    async sshKeysGetFingerprint(request: GetFingerprintRequest): Promise<{ fingerprint: string | null }> {
      const parsed = getFingerprintRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.sshKeys.getFingerprint, parsed);
      return sshFingerprintResponseSchema.parse(result);
    },
    async sshKeysRemove(request: RemoveSshKeyRequest): Promise<void> {
      const parsed = removeSshKeyRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.sshKeys.remove, parsed);
    },
    async sshKeysConvertPpk(request: ConvertPpkRequest): Promise<ConvertPpkResponse> {
      const parsed = convertPpkRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.sshKeys.convertPpk, parsed);
      return convertPpkResponseSchema.parse(result);
    },
    // Host port forwards
    async hostPortForwardList(request: ListHostPortForwardsRequest): Promise<HostPortForwardRecord[]> {
      const parsed = listHostPortForwardsRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.hostPortForward.list, parsed);
      return hostPortForwardRecordArraySchema.parse(result);
    },
    async hostPortForwardUpsert(request: UpsertHostPortForwardRequest): Promise<HostPortForwardRecord> {
      const parsed = upsertHostPortForwardRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.hostPortForward.upsert, parsed);
      return hostPortForwardRecordSchema.parse(result);
    },
    async hostPortForwardRemove(request: RemoveHostPortForwardRequest): Promise<boolean> {
      const parsed = removeHostPortForwardRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.hostPortForward.remove, parsed);
      return booleanResponseSchema.parse(result);
    },
    async hostPortForwardReorder(request: ReorderHostPortForwardsRequest): Promise<void> {
      const parsed = reorderHostPortForwardsRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.hostPortForward.reorder, parsed);
    },
    // Connection pool stats
    async connectionPoolStats(): Promise<ConnectionPoolStats[]> {
      const result = await ipcRenderer.invoke(ipcChannels.connectionPool.stats);
      return connectionPoolStatsArraySchema.parse(result);
    },
    // 1Password
    async opListVaults(): Promise<OpListVaultsResponse> {
      const result = await ipcRenderer.invoke(ipcChannels.op.listVaults);
      return opListVaultsResponseSchema.parse(result);
    },
    async opListItems(request: OpListItemsRequest): Promise<OpListItemsResponse> {
      const parsed = opListItemsRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.op.listItems, parsed);
      return opListItemsResponseSchema.parse(result);
    },
    async opGetItemFields(request: OpGetItemFieldsRequest): Promise<OpGetItemFieldsResponse> {
      const parsed = opGetItemFieldsRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.op.getItemFields, parsed);
      return opGetItemFieldsResponseSchema.parse(result);
    },
    // Editor window
    async editorOpen(request: EditorOpenRequest): Promise<void> {
      const parsed = editorOpenRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.editor.openEditor, parsed);
    },
    onEditorOpenFile(listener: (event: EditorOpenFile) => void): () => void {
      assertListener(listener, "onEditorOpenFile");
      const wrappedListener = (_event: unknown, payload: unknown) => {
        const parsed = editorOpenFileSchema.safeParse(payload);
        if (!parsed.success) {
          logger.warn?.("Ignored invalid editor open-file payload from IPC", parsed.error);
          return;
        }
        try {
          listener(parsed.data);
        } catch (error) {
          logger.error?.("Editor open-file listener threw", error);
        }
      };
      ipcRenderer.on(ipcChannels.editor.openFile, wrappedListener);
      return () => { ipcRenderer.removeListener(ipcChannels.editor.openFile, wrappedListener); };
    },
    onEditorSessionClosed(listener: (event: EditorSessionClosed) => void): () => void {
      assertListener(listener, "onEditorSessionClosed");
      const wrappedListener = (_event: unknown, payload: unknown) => {
        const parsed = editorSessionClosedSchema.safeParse(payload);
        if (!parsed.success) {
          logger.warn?.("Ignored invalid editor session-closed payload from IPC", parsed.error);
          return;
        }
        try {
          listener(parsed.data);
        } catch (error) {
          logger.error?.("Editor session-closed listener threw", error);
        }
      };
      ipcRenderer.on(ipcChannels.editor.sessionClosed, wrappedListener);
      return () => { ipcRenderer.removeListener(ipcChannels.editor.sessionClosed, wrappedListener); };
    },
    // Snippets
    async snippetsList(): Promise<SnippetRecord[]> {
      const raw = await ipcRenderer.invoke(ipcChannels.snippets.list);
      return z.array(snippetRecordSchema).parse(raw);
    },
    async snippetsUpsert(request: UpsertSnippetRequest): Promise<SnippetRecord> {
      const raw = await ipcRenderer.invoke(ipcChannels.snippets.upsert, upsertSnippetRequestSchema.parse(request));
      return snippetRecordSchema.parse(raw);
    },
    async snippetsRemove(request: RemoveSnippetRequest): Promise<void> {
      await ipcRenderer.invoke(ipcChannels.snippets.remove, removeSnippetRequestSchema.parse(request));
    },
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
    // Database backup & restore
    async backupCreate(request: CreateBackupRequest): Promise<CreateBackupResponse> {
      const parsed = createBackupRequestSchema.parse(request);
      const raw = await ipcRenderer.invoke(ipcChannels.backup.create, parsed);
      return createBackupResponseSchema.parse(raw);
    },
    async backupRestore(request: RestoreBackupRequest): Promise<RestoreBackupResponse> {
      const parsed = restoreBackupRequestSchema.parse(request);
      const raw = await ipcRenderer.invoke(ipcChannels.backup.restore, parsed);
      return restoreBackupResponseSchema.parse(raw);
    },
    async backupList(): Promise<ListBackupsResponse> {
      const raw = await ipcRenderer.invoke(ipcChannels.backup.list);
      return listBackupsResponseSchema.parse(raw);
    },
    async backupShowOpenDialog(): Promise<string | null> {
      const raw = await ipcRenderer.invoke(ipcChannels.backup.showOpenDialog);
      if (raw === null || raw === undefined) return null;
      return z.string().parse(raw);
    },
    // Tmux detection
    async tmuxProbe(request: TmuxProbeRequest): Promise<TmuxProbeResponse> {
      const parsed = tmuxProbeRequestSchema.parse(request);
      const raw = await ipcRenderer.invoke(ipcChannels.tmux.probe, parsed);
      return tmuxProbeResponseSchema.parse(raw);
    },
    // App theme
    async setAppTheme(theme: "light" | "dark"): Promise<void> {
      await ipcRenderer.invoke(ipcChannels.app.setTheme, theme);
    },
    // Auto-update
    async checkForUpdates(): Promise<void> {
      await ipcRenderer.invoke(ipcChannels.update.check);
    },
    async downloadUpdate(): Promise<void> {
      await ipcRenderer.invoke(ipcChannels.update.download);
    },
    async installUpdate(): Promise<void> {
      await ipcRenderer.invoke(ipcChannels.update.install);
    },
    async openUpdateRelease(): Promise<void> {
      await ipcRenderer.invoke(ipcChannels.update.openRelease);
    },
    async getUpdateState(): Promise<UpdateState> {
      const raw = await ipcRenderer.invoke(ipcChannels.update.getState);
      return updateStateSchema.parse(raw);
    },
    onUpdateState(listener: (state: UpdateState) => void): () => void {
      assertListener(listener, "onUpdateState");

      const wrappedListener = (_event: unknown, payload: unknown) => {
        const parsed = updateStateSchema.safeParse(payload);
        if (!parsed.success) {
          logger.warn?.("Ignored invalid update state payload from IPC", parsed.error);
          return;
        }

        try {
          listener(parsed.data);
        } catch (error) {
          logger.error?.("Update state listener threw", error);
        }
      };

      ipcRenderer.on(ipcChannels.update.state, wrappedListener);

      return () => {
        ipcRenderer.removeListener(ipcChannels.update.state, wrappedListener);
      };
    },
  };
}
