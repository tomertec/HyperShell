import {
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
  type FsEntry,
  type FsGetDrivesResponse,
  type FsListRequest,
  type FsListResponse,
  type FsPathRequest,
} from "@hypershell/shared";
import { z } from "zod";
import type { PreloadIpcRenderer, PreloadLogger } from "./types";

export interface FsApi {
  fsList(request: FsListRequest): Promise<FsListResponse>;
  fsStat(request: FsPathRequest): Promise<FsEntry>;
  fsGetHome(): Promise<{ path: string }>;
  fsGetDrives(): Promise<FsGetDrivesResponse>;
  fsListSshKeys(): Promise<string[]>;
  fsShowSaveDialog(options?: { defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }): Promise<string | null>;
  fsShowOpenDialog(options?: { title?: string; defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }>; directory?: boolean }): Promise<string | null>;
  fsOpenItem(request: { path: string }): Promise<void>;
  fsShowInFolder(request: { path: string }): Promise<void>;
  fsTrash(request: { path: string }): Promise<void>;
  fsRename(request: { oldPath: string; newPath: string }): Promise<void>;
}

const fsGetHomeResponseSchema = z.object({ path: z.string() });
const fsListSshKeysResponseSchema = z.array(z.string());

export function createFsApi(
  ipcRenderer: PreloadIpcRenderer,
  _logger: PreloadLogger
): FsApi {
  return {
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
  };
}
