import { z } from "zod";

export const transportSchema = z.enum(["ssh", "serial", "sftp"]);

export const sessionStateSchema = z.enum([
  "connecting",
  "connected",
  "reconnecting",
  "waiting_for_network",
  "disconnected",
  "failed"
]);

export const openSessionRequestSchema = z.object({
  transport: transportSchema,
  profileId: z.string().min(1),
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
  autoReconnect: z.boolean().optional(),
  reconnectMaxAttempts: z.number().int().min(1).optional(),
  reconnectBaseInterval: z.number().int().min(1).optional(),
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
  identityFile: z.string().nullable(),
  authProfileId: z.string().nullable(),
  groupId: z.string().nullable(),
  notes: z.string().nullable(),
  authMethod: z.enum(["default", "password", "keyfile", "agent", "op-reference"]).optional(),
  agentKind: z.enum(["system", "pageant", "1password"]).optional(),
  opReference: z.string().nullable().optional(),
  sortOrder: z.number().int().nullable().optional(),
  color: z.string().nullable().optional(),
  proxyJump: z.string().nullable().optional(),
  proxyJumpHostIds: z.string().nullable().optional(),
  keepAliveInterval: z.number().int().nullable().optional(),
  autoReconnect: z.boolean().optional(),
  reconnectMaxAttempts: z.number().int().optional(),
  reconnectBaseInterval: z.number().int().optional(),
  passwordSavedAt: z.string().nullable().optional(),
});

export const upsertHostRequestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  hostname: z.string().min(1),
  port: z.number().int().positive().optional(),
  username: z.string().nullable().optional(),
  identityFile: z.string().nullable().optional(),
  group: z.string().optional(),
  tags: z.string().optional(),
  notes: z.string().nullable().optional(),
  authMethod: z.enum(["default", "password", "keyfile", "agent", "op-reference"]).optional(),
  agentKind: z.enum(["system", "pageant", "1password"]).optional(),
  opReference: z.string().nullable().optional(),
  isFavorite: z.boolean().optional(),
  sortOrder: z.number().int().nullable().optional(),
  color: z.string().nullable().optional(),
  proxyJump: z.string().nullable().optional(),
  proxyJumpHostIds: z.string().nullable().optional(),
  keepAliveInterval: z.number().int().min(0).nullable().optional(),
  autoReconnect: z.boolean().optional(),
  reconnectMaxAttempts: z.number().int().min(1).max(50).optional(),
  reconnectBaseInterval: z.number().int().min(1).max(60).optional(),
  password: z.string().optional(),
  savePassword: z.boolean().optional(),
  clearSavedPassword: z.boolean().optional(),
});

export const removeHostRequestSchema = z.object({
  id: z.string().min(1)
});

export const reorderHostsRequestSchema = z.object({
  items: z.array(z.object({
    id: z.string().min(1),
    sortOrder: z.number().int(),
    groupId: z.string().nullable()
  }))
});
export type ReorderHostsRequest = z.infer<typeof reorderHostsRequestSchema>;

export const importSshConfigResponseSchema = z.object({
  imported: z.number().int().min(0),
  hosts: z.array(hostRecordSchema)
});

export const exportHostsRequestSchema = z.object({
  format: z.enum(["json", "csv"]),
  filePath: z.string().min(1),
});

export type HostRecord = z.infer<typeof hostRecordSchema>;
export type UpsertHostRequest = z.infer<typeof upsertHostRequestSchema>;
export type RemoveHostRequest = z.infer<typeof removeHostRequestSchema>;
export type ImportSshConfigResponse = z.infer<typeof importSshConfigResponseSchema>;
export type ExportHostsRequest = z.infer<typeof exportHostsRequestSchema>;

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
  port: z.number().int().min(1).max(65535).optional(),
  protocol: z.enum(["local", "remote", "dynamic"]),
  localAddress: z.string().default("127.0.0.1"),
  localPort: z.number().int().min(1).max(65535),
  remoteHost: z.string().default(""),
  remotePort: z.number().int().min(0).max(65535).default(0)
});

export const stopPortForwardRequestSchema = z.object({
  id: z.string().min(1)
});

export type StartPortForwardRequest = z.infer<typeof startPortForwardRequestSchema>;
export type StopPortForwardRequest = z.infer<typeof stopPortForwardRequestSchema>;

// --- Host port forward schemas ---

export const hostPortForwardRecordSchema = z.object({
  id: z.string().min(1),
  hostId: z.string().min(1),
  name: z.string().min(1),
  protocol: z.enum(["local", "remote", "dynamic"]),
  localAddress: z.string(),
  localPort: z.number().int().min(1).max(65535),
  remoteHost: z.string(),
  remotePort: z.number().int().min(0).max(65535),
  autoStart: z.boolean(),
  sortOrder: z.number().int(),
});

export const upsertHostPortForwardRequestSchema = z.object({
  id: z.string().min(1),
  hostId: z.string().min(1),
  name: z.string().min(1),
  protocol: z.enum(["local", "remote", "dynamic"]),
  localAddress: z.string().default("127.0.0.1"),
  localPort: z.number().int().min(1).max(65535),
  remoteHost: z.string().default(""),
  remotePort: z.number().int().min(0).max(65535).default(0),
  autoStart: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

export const listHostPortForwardsRequestSchema = z.object({
  hostId: z.string().min(1),
});

export const removeHostPortForwardRequestSchema = z.object({
  id: z.string().min(1),
});

export const reorderHostPortForwardsRequestSchema = z.object({
  items: z.array(z.object({
    id: z.string().min(1),
    sortOrder: z.number().int(),
  })),
});

export type HostPortForwardRecord = z.infer<typeof hostPortForwardRecordSchema>;
export type UpsertHostPortForwardRequest = z.infer<typeof upsertHostPortForwardRequestSchema>;
export type ListHostPortForwardsRequest = z.infer<typeof listHostPortForwardsRequestSchema>;
export type RemoveHostPortForwardRequest = z.infer<typeof removeHostPortForwardRequestSchema>;
export type ReorderHostPortForwardsRequest = z.infer<typeof reorderHostPortForwardsRequestSchema>;

// --- Connection pool schemas ---

export const connectionPoolStatsSchema = z.object({
  connectionId: z.string(),
  hostname: z.string(),
  port: z.number(),
  username: z.string(),
  consumerCount: z.number().int(),
  createdAt: z.string(),
});

export type ConnectionPoolStats = z.infer<typeof connectionPoolStatsSchema>;

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

// --- Host stats schemas ---

export const hostStatsRequestSchema = z.object({
  sessionId: z.string().min(1)
});

export const hostStatsResponseSchema = z.object({
  cpuLoad: z.string().nullable(),
  memUsage: z.string().nullable(),
  diskUsage: z.string().nullable(),
  uptime: z.string().nullable(),
  latencyMs: z.number().nullable()
});

export type HostStatsRequest = z.infer<typeof hostStatsRequestSchema>;
export type HostStatsResponse = z.infer<typeof hostStatsResponseSchema>;

export type SerialProfileRecord = z.infer<typeof serialProfileRecordSchema>;
export type UpsertSerialProfileRequest = z.infer<typeof upsertSerialProfileRequestSchema>;
export type RemoveSerialProfileRequest = z.infer<typeof removeSerialProfileRequestSchema>;
export type SerialPortInfo = z.infer<typeof serialPortInfoSchema>;
export type SetSignalsRequest = z.infer<typeof setSignalsRequestSchema>;

// --- Workspace schemas ---

export const workspaceTabSchema = z.object({
  transport: transportSchema,
  profileId: z.string().min(1),
  title: z.string(),
  type: z.enum(["terminal", "sftp"]).optional(),
  hostId: z.string().optional(),
});

export const workspaceLayoutSchema = z.object({
  tabs: z.array(workspaceTabSchema),
  splitDirection: z.enum(["horizontal", "vertical"]),
  paneSizes: z.array(z.number()),
  paneCount: z.number().int().min(1),
});

export const saveWorkspaceRequestSchema = z.object({
  name: z.string().min(1),
  layout: workspaceLayoutSchema,
});

export const loadWorkspaceRequestSchema = z.object({
  name: z.string().min(1),
});

export const removeWorkspaceRequestSchema = z.object({
  name: z.string().min(1),
});

export const workspaceRecordSchema = z.object({
  name: z.string().min(1),
  layout: workspaceLayoutSchema,
  updatedAt: z.string(),
});

export type WorkspaceTab = z.infer<typeof workspaceTabSchema>;
export type WorkspaceLayout = z.infer<typeof workspaceLayoutSchema>;
export type SaveWorkspaceRequest = z.infer<typeof saveWorkspaceRequestSchema>;
export type LoadWorkspaceRequest = z.infer<typeof loadWorkspaceRequestSchema>;
export type RemoveWorkspaceRequest = z.infer<typeof removeWorkspaceRequestSchema>;
export type WorkspaceRecord = z.infer<typeof workspaceRecordSchema>;

// --- SSH Key schemas ---

export const sshKeyInfoSchema = z.object({
  path: z.string(),
  name: z.string(),
  type: z.enum(["rsa", "ed25519", "ecdsa", "dsa", "unknown"]),
  bits: z.number().nullable(),
  fingerprint: z.string().nullable(),
  hasPublicKey: z.boolean(),
  createdAt: z.string().nullable(),
});

export const generateSshKeyRequestSchema = z.object({
  type: z.enum(["rsa", "ed25519", "ecdsa"]),
  bits: z.number().int().optional(),
  name: z.string().min(1),
  passphrase: z.string().optional(),
  comment: z.string().optional(),
});

export const removeSshKeyRequestSchema = z.object({
  path: z.string().min(1),
});

export const getFingerprintRequestSchema = z.object({
  path: z.string().min(1),
});

export type SshKeyInfo = z.infer<typeof sshKeyInfoSchema>;
export type GenerateSshKeyRequest = z.infer<typeof generateSshKeyRequestSchema>;
export type RemoveSshKeyRequest = z.infer<typeof removeSshKeyRequestSchema>;
export type GetFingerprintRequest = z.infer<typeof getFingerprintRequestSchema>;

// 1Password vault picker
export const opVaultSchema = z.object({
  id: z.string(),
  name: z.string(),
});
export type OpVault = z.infer<typeof opVaultSchema>;

export const opListVaultsResponseSchema = z.array(opVaultSchema);
export type OpListVaultsResponse = z.infer<typeof opListVaultsResponseSchema>;

export const opItemSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.string().optional(),
});
export type OpItemSummary = z.infer<typeof opItemSummarySchema>;

export const opListItemsRequestSchema = z.object({
  vaultId: z.string().min(1),
});
export type OpListItemsRequest = z.infer<typeof opListItemsRequestSchema>;

export const opListItemsResponseSchema = z.array(opItemSummarySchema);
export type OpListItemsResponse = z.infer<typeof opListItemsResponseSchema>;

export const opFieldSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.string().optional(),
});
export type OpField = z.infer<typeof opFieldSchema>;

export const opGetItemFieldsRequestSchema = z.object({
  itemId: z.string().min(1),
});
export type OpGetItemFieldsRequest = z.infer<typeof opGetItemFieldsRequestSchema>;

export const opGetItemFieldsResponseSchema = z.array(opFieldSchema);
export type OpGetItemFieldsResponse = z.infer<typeof opGetItemFieldsResponseSchema>;

// --- Snippet schemas ---

export const snippetRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  body: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const upsertSnippetRequestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  body: z.string(),
});

export const removeSnippetRequestSchema = z.object({
  id: z.string().min(1),
});

export type SnippetRecord = z.infer<typeof snippetRecordSchema>;
export type UpsertSnippetRequest = z.infer<typeof upsertSnippetRequestSchema>;
export type RemoveSnippetRequest = z.infer<typeof removeSnippetRequestSchema>;

// --- Session logging schemas ---

export const startLoggingRequestSchema = z.object({
  sessionId: z.string().min(1),
  filePath: z.string().min(1),
});

export const stopLoggingRequestSchema = z.object({
  sessionId: z.string().min(1),
});

export const getLoggingStateRequestSchema = z.object({
  sessionId: z.string().min(1),
});

export const loggingStateResponseSchema = z.object({
  active: z.boolean(),
  filePath: z.string().nullable(),
  bytesWritten: z.number().int(),
});

export type StartLoggingRequest = z.infer<typeof startLoggingRequestSchema>;
export type StopLoggingRequest = z.infer<typeof stopLoggingRequestSchema>;
export type GetLoggingStateRequest = z.infer<typeof getLoggingStateRequestSchema>;
export type LoggingStateResponse = z.infer<typeof loggingStateResponseSchema>;
