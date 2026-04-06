import { z } from "zod";

export const transportSchema = z.enum(["ssh", "serial"]);

export const sessionStateSchema = z.enum([
  "connecting",
  "connected",
  "reconnecting",
  "disconnected",
  "failed"
]);

export const openSessionRequestSchema = z.object({
  transport: transportSchema,
  profileId: z.string().min(1),
  cols: z.number().int().positive(),
  rows: z.number().int().positive()
});

export const openSessionResponseSchema = z.object({
  sessionId: z.string().min(1),
  state: sessionStateSchema
});

export const resizeSessionRequestSchema = z.object({
  sessionId: z.string().min(1),
  cols: z.number().int().positive(),
  rows: z.number().int().positive()
});

export const writeSessionRequestSchema = z.object({
  sessionId: z.string().min(1),
  data: z.string()
});

export const closeSessionRequestSchema = z.object({
  sessionId: z.string().min(1)
});

export const sessionEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("data"),
    sessionId: z.string().min(1),
    data: z.string()
  }),
  z.object({
    type: z.literal("status"),
    sessionId: z.string().min(1),
    state: sessionStateSchema
  }),
  z.object({
    type: z.literal("exit"),
    sessionId: z.string().min(1),
    exitCode: z.number().int().nullable()
  }),
  z.object({
    type: z.literal("error"),
    sessionId: z.string().min(1),
    message: z.string().min(1)
  })
]);

export type OpenSessionRequest = z.infer<typeof openSessionRequestSchema>;
export type OpenSessionResponse = z.infer<typeof openSessionResponseSchema>;
export type ResizeSessionRequest = z.infer<typeof resizeSessionRequestSchema>;
export type WriteSessionRequest = z.infer<typeof writeSessionRequestSchema>;
export type CloseSessionRequest = z.infer<typeof closeSessionRequestSchema>;
export type SessionEvent = z.infer<typeof sessionEventSchema>;
export type SessionState = z.infer<typeof sessionStateSchema>;

// --- Host schemas ---

export const hostRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  hostname: z.string().min(1),
  port: z.number().int().positive(),
  username: z.string().nullable(),
  authProfileId: z.string().nullable(),
  groupId: z.string().nullable(),
  notes: z.string().nullable()
});

export const upsertHostRequestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  hostname: z.string().min(1),
  port: z.number().int().positive().optional(),
  username: z.string().nullable().optional(),
  group: z.string().optional(),
  tags: z.string().optional(),
  notes: z.string().nullable().optional()
});

export const removeHostRequestSchema = z.object({
  id: z.string().min(1)
});

export type HostRecord = z.infer<typeof hostRecordSchema>;
export type UpsertHostRequest = z.infer<typeof upsertHostRequestSchema>;
export type RemoveHostRequest = z.infer<typeof removeHostRequestSchema>;

// --- Settings schemas ---

export const getSettingRequestSchema = z.object({
  key: z.string().min(1)
});

export const updateSettingRequestSchema = z.object({
  key: z.string().min(1),
  value: z.string()
});

export const settingRecordSchema = z.object({
  key: z.string().min(1),
  value: z.string()
});

export type GetSettingRequest = z.infer<typeof getSettingRequestSchema>;
export type UpdateSettingRequest = z.infer<typeof updateSettingRequestSchema>;
export type SettingRecord = z.infer<typeof settingRecordSchema>;
