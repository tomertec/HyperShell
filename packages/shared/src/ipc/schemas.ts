import { z } from "zod";

export const transportSchema = z.enum(["ssh", "serial", "sftp"]);

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

export const importSshConfigResponseSchema = z.object({
  imported: z.number().int().min(0),
  hosts: z.array(hostRecordSchema)
});

export type HostRecord = z.infer<typeof hostRecordSchema>;
export type UpsertHostRequest = z.infer<typeof upsertHostRequestSchema>;
export type RemoveHostRequest = z.infer<typeof removeHostRequestSchema>;
export type ImportSshConfigResponse = z.infer<typeof importSshConfigResponseSchema>;

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

// --- Port forward schemas ---

export const startPortForwardRequestSchema = z.object({
  hostname: z.string().min(1),
  username: z.string().optional(),
  port: z.number().int().positive().optional(),
  protocol: z.enum(["local", "remote", "dynamic"]),
  localAddress: z.string().default("127.0.0.1"),
  localPort: z.number().int().positive(),
  remoteHost: z.string().default(""),
  remotePort: z.number().int().min(0).default(0)
});

export const stopPortForwardRequestSchema = z.object({
  id: z.string().min(1)
});

export type StartPortForwardRequest = z.infer<typeof startPortForwardRequestSchema>;
export type StopPortForwardRequest = z.infer<typeof stopPortForwardRequestSchema>;

// --- Group schemas ---

export const groupRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable()
});

export const upsertGroupRequestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable().optional()
});

export const removeGroupRequestSchema = z.object({
  id: z.string().min(1)
});

export type GroupRecord = z.infer<typeof groupRecordSchema>;
export type UpsertGroupRequest = z.infer<typeof upsertGroupRequestSchema>;
export type RemoveGroupRequest = z.infer<typeof removeGroupRequestSchema>;

// --- Serial profile schemas ---

export const serialProfileRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  path: z.string().min(1),
  baudRate: z.number().int().positive(),
  dataBits: z.number().int().min(5).max(8),
  stopBits: z.number().int().min(1).max(2),
  parity: z.enum(["none", "even", "odd", "mark", "space"]),
  flowControl: z.enum(["none", "hardware", "software"]),
  localEcho: z.boolean(),
  dtr: z.boolean(),
  rts: z.boolean(),
  notes: z.string().nullable()
});

export const upsertSerialProfileRequestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  path: z.string().min(1),
  baudRate: z.number().int().positive().optional(),
  dataBits: z.number().int().min(5).max(8).optional(),
  stopBits: z.number().int().min(1).max(2).optional(),
  parity: z.enum(["none", "even", "odd", "mark", "space"]).optional(),
  flowControl: z.enum(["none", "hardware", "software"]).optional(),
  localEcho: z.boolean().optional(),
  dtr: z.boolean().optional(),
  rts: z.boolean().optional(),
  notes: z.string().nullable().optional()
});

export const removeSerialProfileRequestSchema = z.object({
  id: z.string().min(1)
});

export const serialPortInfoSchema = z.object({
  path: z.string(),
  manufacturer: z.string().optional(),
  pnpId: z.string().optional(),
  vendorId: z.string().optional(),
  productId: z.string().optional()
});

export const setSignalsRequestSchema = z.object({
  sessionId: z.string().min(1),
  signals: z.object({
    dtr: z.boolean().optional(),
    rts: z.boolean().optional()
  })
});

export type SerialProfileRecord = z.infer<typeof serialProfileRecordSchema>;
export type UpsertSerialProfileRequest = z.infer<typeof upsertSerialProfileRequestSchema>;
export type RemoveSerialProfileRequest = z.infer<typeof removeSerialProfileRequestSchema>;
export type SerialPortInfo = z.infer<typeof serialPortInfoSchema>;
export type SetSignalsRequest = z.infer<typeof setSignalsRequestSchema>;
