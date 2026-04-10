import { z } from "zod";

export const transportSchema = z.enum(["ssh", "serial", "sftp", "telnet"]);

export const sessionStateSchema = z.enum([
  "connecting",
  "connected",
  "reconnecting",
  "waiting_for_network",
  "disconnected",
  "failed"
]);

export const telnetConnectionOptionsSchema = z.object({
  hostname: z.string().min(1),
  port: z.number().int().positive().default(23),
  mode: z.enum(["telnet", "raw"]),
  terminalType: z.string().optional(),
});

export const openSessionRequestSchema = z.object({
  transport: transportSchema,
  profileId: z.string().min(1),
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
  autoReconnect: z.boolean().optional(),
  reconnectMaxAttempts: z.number().int().min(1).max(50).optional(),
  reconnectBaseInterval: z.number().int().min(1).max(60).optional(),
  telnetOptions: telnetConnectionOptionsSchema.optional(),
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

export const savedSessionRecordSchema = z.object({
  id: z.string().min(1),
  hostId: z.string().nullable(),
  hostName: z.string().nullable(),
  transport: transportSchema,
  profileId: z.string().min(1),
  title: z.string().min(1),
  wasGraceful: z.boolean(),
  savedAt: z.string(),
});

export const sessionSaveStateEntrySchema = z.object({
  id: z.string().min(1),
  hostId: z.string().nullable().optional(),
  transport: transportSchema,
  profileId: z.string().min(1),
  title: z.string().min(1),
});

export const sessionSaveStateRequestSchema = z.object({
  sessions: z.array(sessionSaveStateEntrySchema),
});

export const sessionSaveStateResponseSchema = z.object({
  saved: z.number().int().min(0),
});

export const sessionLoadSavedStateResponseSchema = z.object({
  sessions: z.array(savedSessionRecordSchema),
});

export const sessionClearSavedStateResponseSchema = z.object({
  cleared: z.number().int().min(0),
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
export type SavedSessionRecord = z.infer<typeof savedSessionRecordSchema>;
export type SessionSaveStateEntry = z.infer<typeof sessionSaveStateEntrySchema>;
export type SessionSaveStateRequest = z.infer<typeof sessionSaveStateRequestSchema>;
export type SessionSaveStateResponse = z.infer<typeof sessionSaveStateResponseSchema>;
export type SessionLoadSavedStateResponse = z.infer<
  typeof sessionLoadSavedStateResponseSchema
>;
export type SessionClearSavedStateResponse = z.infer<
  typeof sessionClearSavedStateResponseSchema
>;
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
  hostProfileId: z.string().nullable().optional(),
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
  reconnectMaxAttempts: z.number().int().min(1).max(50).optional(),
  reconnectBaseInterval: z.number().int().min(1).max(60).optional(),
  passwordSavedAt: z.string().nullable().optional(),
});

export const upsertHostRequestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  hostname: z.string().min(1),
  port: z.number().int().positive().optional(),
  username: z.string().nullable().optional(),
  identityFile: z.string().nullable().optional(),
  hostProfileId: z.string().nullable().optional(),
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
  format: z.enum(["json", "csv", "ssh-config"]),
  filePath: z.string().min(1),
});

export const hostStatusTargetsRequestSchema = z.object({
  hostIds: z.array(z.string().min(1)).max(500),
});

export const hostStatusEventSchema = z.object({
  hostId: z.string().min(1),
  online: z.boolean(),
  latencyMs: z.number().int().nonnegative().nullable(),
  checkedAt: z.string(),
});

export type HostRecord = z.infer<typeof hostRecordSchema>;
export type UpsertHostRequest = z.infer<typeof upsertHostRequestSchema>;
export type RemoveHostRequest = z.infer<typeof removeHostRequestSchema>;
export type ImportSshConfigResponse = z.infer<typeof importSshConfigResponseSchema>;
export type ExportHostsRequest = z.infer<typeof exportHostsRequestSchema>;
export type HostStatusTargetsRequest = z.infer<typeof hostStatusTargetsRequestSchema>;
export type HostStatusEvent = z.infer<typeof hostStatusEventSchema>;

// --- PuTTY import schemas ---

export const puttySessionSchema = z.object({
  name: z.string().min(1),
  hostname: z.string().min(1),
  port: z.number().int().positive(),
  username: z.string(),
  keyFile: z.string(),
});

export const scanPuttyResponseSchema = z.object({
  sessions: z.array(puttySessionSchema),
});

export type PuttySession = z.infer<typeof puttySessionSchema>;
export type ScanPuttyResponse = z.infer<typeof scanPuttyResponseSchema>;

// --- SshManager import schemas ---

export const sshManagerHostSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  hostname: z.string(),
  port: z.number().int(),
  username: z.string().nullable(),
  authType: z.number().int(),
  privateKeyPath: z.string().nullable(),
  opReference: z.string().nullable(),
  groupId: z.string().nullable(),
  notes: z.string().nullable(),
  isFavorite: z.boolean(),
  sortOrder: z.number().int(),
  keepAliveIntervalSeconds: z.number().int().nullable(),
});

export const sshManagerGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
});

export const sshManagerSnippetSchema = z.object({
  id: z.string(),
  name: z.string(),
  command: z.string(),
  category: z.string().nullable(),
  sortOrder: z.number().int(),
});

export const scanSshManagerResponseSchema = z.object({
  dbPath: z.string(),
  hosts: z.array(sshManagerHostSchema),
  groups: z.array(sshManagerGroupSchema),
  snippets: z.array(sshManagerSnippetSchema),
});

export const importSshManagerRequestSchema = z.object({
  hostIds: z.array(z.string()),
  groupIds: z.array(z.string()),
  snippetIds: z.array(z.string()),
});

export const importSshManagerResponseSchema = z.object({
  importedHosts: z.number().int().min(0),
  importedGroups: z.number().int().min(0),
  importedSnippets: z.number().int().min(0),
  skippedDuplicates: z.number().int().min(0),
});

export type SshManagerHost = z.infer<typeof sshManagerHostSchema>;
export type SshManagerGroup = z.infer<typeof sshManagerGroupSchema>;
export type SshManagerSnippet = z.infer<typeof sshManagerSnippetSchema>;
export type ScanSshManagerResponse = z.infer<typeof scanSshManagerResponseSchema>;
export type ImportSshManagerRequest = z.infer<typeof importSshManagerRequestSchema>;
export type ImportSshManagerResponse = z.infer<typeof importSshManagerResponseSchema>;

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

// --- Tag schemas ---

export const tagColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .nullable();

export const tagRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: tagColorSchema,
});

export const upsertTagRequestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: tagColorSchema.optional(),
});

export const removeTagRequestSchema = z.object({
  id: z.string().min(1),
});

export const getHostTagsRequestSchema = z.object({
  hostId: z.string().min(1),
});

export const setHostTagsRequestSchema = z.object({
  hostId: z.string().min(1),
  tagIds: z.array(z.string().min(1)),
});

export type TagRecord = z.infer<typeof tagRecordSchema>;
export type UpsertTagRequest = z.infer<typeof upsertTagRequestSchema>;
export type RemoveTagRequest = z.infer<typeof removeTagRequestSchema>;
export type GetHostTagsRequest = z.infer<typeof getHostTagsRequestSchema>;
export type SetHostTagsRequest = z.infer<typeof setHostTagsRequestSchema>;

// --- Host profile schemas ---

export const hostProfileRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  defaultPort: z.number().int().positive(),
  defaultUsername: z.string().nullable(),
  authMethod: z.enum(["default", "password", "keyfile", "agent", "op-reference"]),
  identityFile: z.string().nullable(),
  proxyJump: z.string().nullable(),
  keepAliveInterval: z.number().int().min(0).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const upsertHostProfileRequestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  defaultPort: z.number().int().positive().optional(),
  defaultUsername: z.string().nullable().optional(),
  authMethod: z.enum(["default", "password", "keyfile", "agent", "op-reference"]).optional(),
  identityFile: z.string().nullable().optional(),
  proxyJump: z.string().nullable().optional(),
  keepAliveInterval: z.number().int().min(0).nullable().optional(),
});

export const removeHostProfileRequestSchema = z.object({
  id: z.string().min(1),
});

export type HostProfileRecord = z.infer<typeof hostProfileRecordSchema>;
export type UpsertHostProfileRequest = z.infer<typeof upsertHostProfileRequestSchema>;
export type RemoveHostProfileRequest = z.infer<typeof removeHostProfileRequestSchema>;

// --- Host environment variable schemas ---

export const envVarNameSchema = z
  .string()
  .min(1)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/);

export const hostEnvVarRecordSchema = z.object({
  id: z.string().min(1),
  hostId: z.string().min(1),
  name: envVarNameSchema,
  value: z.string(),
  isEnabled: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: z.string(),
});

export const hostEnvVarInputSchema = z.object({
  id: z.string().min(1).optional(),
  name: envVarNameSchema,
  value: z.string(),
  isEnabled: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const listHostEnvVarsRequestSchema = z.object({
  hostId: z.string().min(1),
});

export const replaceHostEnvVarsRequestSchema = z.object({
  hostId: z.string().min(1),
  envVars: z.array(hostEnvVarInputSchema),
});

export type HostEnvVarRecord = z.infer<typeof hostEnvVarRecordSchema>;
export type HostEnvVarInput = z.infer<typeof hostEnvVarInputSchema>;
export type ListHostEnvVarsRequest = z.infer<typeof listHostEnvVarsRequestSchema>;
export type ReplaceHostEnvVarsRequest = z.infer<typeof replaceHostEnvVarsRequestSchema>;

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

export const convertPpkRequestSchema = z.object({
  ppkPath: z.string().min(1),
});

export const convertPpkResponseSchema = z.object({
  success: z.boolean(),
  outputPath: z.string().optional(),
  error: z.string().optional(),
  tool: z.enum(["ssh-keygen", "puttygen", "none"]).optional(),
});

export type SshKeyInfo = z.infer<typeof sshKeyInfoSchema>;
export type GenerateSshKeyRequest = z.infer<typeof generateSshKeyRequestSchema>;
export type RemoveSshKeyRequest = z.infer<typeof removeSshKeyRequestSchema>;
export type GetFingerprintRequest = z.infer<typeof getFingerprintRequestSchema>;
export type ConvertPpkRequest = z.infer<typeof convertPpkRequestSchema>;
export type ConvertPpkResponse = z.infer<typeof convertPpkResponseSchema>;

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

// --- Session recording schemas ---

export const recordingHeaderSchema = z.object({
  version: z.literal(2),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  timestamp: z.number().int().nonnegative(),
  title: z.string().optional(),
});

export const recordingFrameSchema = z.tuple([
  z.number().nonnegative(),
  z.literal("o"),
  z.string(),
]);

export const sessionRecordingRecordSchema = z.object({
  id: z.string().min(1),
  hostId: z.string().nullable(),
  title: z.string().min(1),
  fileName: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  durationMs: z.number().int().nullable(),
  fileSizeBytes: z.number().int().nullable(),
  eventCount: z.number().int().nullable(),
  createdAt: z.string(),
});

export const startRecordingRequestSchema = z.object({
  sessionId: z.string().min(1),
  hostId: z.string().nullable().optional(),
  title: z.string().min(1).optional(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export const stopRecordingRequestSchema = z.object({
  sessionId: z.string().min(1),
});

export const getRecordingStateRequestSchema = z.object({
  sessionId: z.string().min(1),
});

export const recordingStateResponseSchema = z.object({
  active: z.boolean(),
  recording: sessionRecordingRecordSchema.nullable(),
});

export const deleteRecordingRequestSchema = z.object({
  id: z.string().min(1),
});

export const getRecordingFramesRequestSchema = z.object({
  id: z.string().min(1),
});

export const exportRecordingRequestSchema = z.object({
  id: z.string().min(1),
  filePath: z.string().min(1),
});

export const deleteRecordingResponseSchema = z.object({
  deleted: z.boolean(),
});

export const exportRecordingResponseSchema = z.object({
  filePath: z.string().min(1),
});

export const recordingFramesResponseSchema = z.object({
  recording: sessionRecordingRecordSchema,
  header: recordingHeaderSchema,
  frames: z.array(recordingFrameSchema),
});

export type RecordingHeader = z.infer<typeof recordingHeaderSchema>;
export type RecordingFrame = z.infer<typeof recordingFrameSchema>;
export type SessionRecordingRecord = z.infer<typeof sessionRecordingRecordSchema>;
export type StartRecordingRequest = z.infer<typeof startRecordingRequestSchema>;
export type StopRecordingRequest = z.infer<typeof stopRecordingRequestSchema>;
export type GetRecordingStateRequest = z.infer<typeof getRecordingStateRequestSchema>;
export type RecordingStateResponse = z.infer<typeof recordingStateResponseSchema>;
export type DeleteRecordingRequest = z.infer<typeof deleteRecordingRequestSchema>;
export type GetRecordingFramesRequest = z.infer<typeof getRecordingFramesRequestSchema>;
export type ExportRecordingRequest = z.infer<typeof exportRecordingRequestSchema>;
export type DeleteRecordingResponse = z.infer<typeof deleteRecordingResponseSchema>;
export type ExportRecordingResponse = z.infer<typeof exportRecordingResponseSchema>;
export type RecordingFramesResponse = z.infer<typeof recordingFramesResponseSchema>;

// --- Connection history schemas ---

export const connectionHistoryRecordSchema = z.object({
  id: z.string().min(1),
  hostId: z.string().nullable(),
  hostName: z.string().nullable(),
  connectedAt: z.string(),
  disconnectedAt: z.string().nullable(),
  wasSuccessful: z.boolean(),
  errorMessage: z.string().nullable(),
});

export const connectionHistoryListByHostRequestSchema = z.object({
  hostId: z.string().min(1),
  limit: z.number().int().min(1).max(1000).optional(),
});

export const connectionHistoryListRecentRequestSchema = z
  .object({
    limit: z.number().int().min(1).max(1000).optional(),
  })
  .default({});

export type ConnectionHistoryRecord = z.infer<typeof connectionHistoryRecordSchema>;
export type ConnectionHistoryListByHostRequest = z.infer<
  typeof connectionHistoryListByHostRequestSchema
>;
export type ConnectionHistoryListRecentRequest = z.infer<
  typeof connectionHistoryListRecentRequestSchema
>;

// --- Host fingerprint schemas ---

export const hostFingerprintRecordSchema = z.object({
  id: z.string().min(1),
  hostname: z.string().min(1),
  port: z.number().int().positive(),
  algorithm: z.string().min(1),
  fingerprint: z.string().min(1),
  isTrusted: z.boolean(),
  firstSeen: z.string(),
  lastSeen: z.string(),
});

export const hostFingerprintLookupRequestSchema = z.object({
  hostname: z.string().min(1),
  port: z.number().int().positive(),
  algorithm: z.string().min(1),
});

export const hostFingerprintTrustRequestSchema = z.object({
  id: z.string().min(1),
  hostname: z.string().min(1),
  port: z.number().int().positive(),
  algorithm: z.string().min(1),
  fingerprint: z.string().min(1),
});

export const hostFingerprintRemoveRequestSchema = z.object({
  hostname: z.string().min(1),
  port: z.number().int().positive(),
});

export type HostFingerprintRecord = z.infer<typeof hostFingerprintRecordSchema>;
export type HostFingerprintLookupRequest = z.infer<typeof hostFingerprintLookupRequestSchema>;
export type HostFingerprintTrustRequest = z.infer<typeof hostFingerprintTrustRequestSchema>;
export type HostFingerprintRemoveRequest = z.infer<typeof hostFingerprintRemoveRequestSchema>;

// --- Backup schemas ---

export const createBackupRequestSchema = z.object({
  filePath: z.string().min(1),
});

export const createBackupResponseSchema = z.object({
  filePath: z.string(),
  size: z.number().int(),
  createdAt: z.string(),
});

export const restoreBackupRequestSchema = z.object({
  filePath: z.string().min(1),
});

export const restoreBackupResponseSchema = z.object({
  requiresRestart: z.boolean(),
});

export const backupInfoSchema = z.object({
  filePath: z.string(),
  fileName: z.string(),
  size: z.number().int(),
  createdAt: z.string(),
});

export const listBackupsResponseSchema = z.object({
  backups: z.array(backupInfoSchema),
});

export type CreateBackupRequest = z.infer<typeof createBackupRequestSchema>;
export type CreateBackupResponse = z.infer<typeof createBackupResponseSchema>;
export type RestoreBackupRequest = z.infer<typeof restoreBackupRequestSchema>;
export type RestoreBackupResponse = z.infer<typeof restoreBackupResponseSchema>;
export type BackupInfo = z.infer<typeof backupInfoSchema>;
export type ListBackupsResponse = z.infer<typeof listBackupsResponseSchema>;
