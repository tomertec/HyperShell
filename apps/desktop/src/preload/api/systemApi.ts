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
  claudeSessionInfoRequestSchema,
  claudeSessionInfoResponseSchema,
  type ClaudeSessionInfoRequest,
  type ClaudeSessionInfoResponse,
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
import { createSubscription } from "./subscription";
import type { PreloadIpcRenderer, PreloadLogger } from "./types";

export interface SystemApi {
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
  // Claude Code session lookup
  claudeSessionInfo(request: ClaudeSessionInfoRequest): Promise<ClaudeSessionInfoResponse>;
  // App theme
  setAppTheme(theme: "light" | "dark"): Promise<void>;
}

export function createSystemApi(
  ipcRenderer: PreloadIpcRenderer,
  logger: PreloadLogger
): SystemApi {
  return {
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
    onEditorOpenFile: createSubscription(
      ipcRenderer,
      logger,
      ipcChannels.editor.openFile,
      "onEditorOpenFile",
      "editor open-file",
      editorOpenFileSchema
    ),
    onEditorSessionClosed: createSubscription(
      ipcRenderer,
      logger,
      ipcChannels.editor.sessionClosed,
      "onEditorSessionClosed",
      "editor session-closed",
      editorSessionClosedSchema
    ),
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
    // Claude Code session lookup
    async claudeSessionInfo(
      request: ClaudeSessionInfoRequest
    ): Promise<ClaudeSessionInfoResponse> {
      const parsed = claudeSessionInfoRequestSchema.parse(request);
      const raw = await ipcRenderer.invoke(ipcChannels.claude.sessionInfo, parsed);
      return claudeSessionInfoResponseSchema.parse(raw);
    },
    // App theme
    async setAppTheme(theme: "light" | "dark"): Promise<void> {
      await ipcRenderer.invoke(ipcChannels.app.setTheme, theme);
    },
  };
}
