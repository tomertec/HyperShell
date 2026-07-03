import {
  createBackupRequestSchema,
  createBackupResponseSchema,
  restoreBackupRequestSchema,
  restoreBackupResponseSchema,
  listBackupsResponseSchema,
  ipcChannels,
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
  tmuxProbeRequestSchema,
  tmuxProbeResponseSchema,
  type SnippetRecord,
  type UpsertSnippetRequest,
  type RemoveSnippetRequest,
  type TmuxProbeRequest,
  type TmuxProbeResponse,
  type CreateBackupRequest,
  type CreateBackupResponse,
  type RestoreBackupRequest,
  type RestoreBackupResponse,
  type ListBackupsResponse,
} from "@hypershell/shared";
import { z } from "zod";
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

export type { PreloadIpcRenderer, PreloadLogger } from "./api/types";

export interface DesktopApi extends SessionApi, HostsApi, SftpApi, GroupsTagsApi, HostProfilesApi, SerialApi, FsApi, WorkspaceApi, SshKeysApi, PortForwardApi, RecordingApi, SettingsApi, UpdateApi {
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
  // Database backup & restore
  backupCreate(request: CreateBackupRequest): Promise<CreateBackupResponse>;
  backupRestore(request: RestoreBackupRequest): Promise<RestoreBackupResponse>;
  backupList(): Promise<ListBackupsResponse>;
  backupShowOpenDialog(): Promise<string | null>;
  // Tmux detection
  tmuxProbe(request: TmuxProbeRequest): Promise<TmuxProbeResponse>;
  // App theme
  setAppTheme(theme: "light" | "dark"): Promise<void>;
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
  };
}
