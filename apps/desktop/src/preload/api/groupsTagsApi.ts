import {
  ipcChannels,
  upsertGroupRequestSchema,
  removeGroupRequestSchema,
  upsertTagRequestSchema,
  removeTagRequestSchema,
  getHostTagsRequestSchema,
  setHostTagsRequestSchema,
  groupRecordSchema,
  tagRecordSchema,
  type UpsertGroupRequest,
  type RemoveGroupRequest,
  type TagRecord,
  type UpsertTagRequest,
  type RemoveTagRequest,
  type GetHostTagsRequest,
  type SetHostTagsRequest,
} from "@hypershell/shared";
import { z } from "zod";
import type { PreloadIpcRenderer, PreloadLogger } from "./types";

export interface GroupsTagsApi {
  listGroups(): Promise<Array<{ id: string; name: string; description: string | null }>>;
  upsertGroup(request: UpsertGroupRequest): Promise<{ id: string; name: string; description: string | null }>;
  removeGroup(request: RemoveGroupRequest): Promise<void>;
  listTags(): Promise<TagRecord[]>;
  upsertTag(request: UpsertTagRequest): Promise<TagRecord>;
  removeTag(request: RemoveTagRequest): Promise<void>;
  tagsGetHostTags(request: GetHostTagsRequest): Promise<TagRecord[]>;
  tagsSetHostTags(request: SetHostTagsRequest): Promise<TagRecord[]>;
}

const groupRecordArraySchema = z.array(groupRecordSchema);
const tagRecordArraySchema = z.array(tagRecordSchema);

export function createGroupsTagsApi(
  ipcRenderer: PreloadIpcRenderer,
  _logger: PreloadLogger
): GroupsTagsApi {
  return {
    async listGroups(): Promise<Array<{ id: string; name: string; description: string | null }>> {
      const result = await ipcRenderer.invoke(ipcChannels.groups.list);
      return groupRecordArraySchema.parse(result);
    },
    async upsertGroup(request: UpsertGroupRequest): Promise<{ id: string; name: string; description: string | null }> {
      const parsed = upsertGroupRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.groups.upsert, parsed);
      return groupRecordSchema.parse(result);
    },
    async removeGroup(request: RemoveGroupRequest): Promise<void> {
      const parsed = removeGroupRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.groups.remove, parsed);
    },
    async listTags(): Promise<TagRecord[]> {
      const result = await ipcRenderer.invoke(ipcChannels.tags.list);
      return tagRecordArraySchema.parse(result);
    },
    async upsertTag(request: UpsertTagRequest): Promise<TagRecord> {
      const parsed = upsertTagRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.tags.upsert, parsed);
      return tagRecordSchema.parse(result);
    },
    async removeTag(request: RemoveTagRequest): Promise<void> {
      const parsed = removeTagRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.tags.remove, parsed);
    },
    async tagsGetHostTags(request: GetHostTagsRequest): Promise<TagRecord[]> {
      const parsed = getHostTagsRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.tags.getHostTags, parsed);
      return tagRecordArraySchema.parse(result);
    },
    async tagsSetHostTags(request: SetHostTagsRequest): Promise<TagRecord[]> {
      const parsed = setHostTagsRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.tags.setHostTags, parsed);
      return tagRecordArraySchema.parse(result);
    },
  };
}
