export const sessionChannels = {
  open: "session:open",
  resize: "session:resize",
  write: "session:write",
  close: "session:close",
  list: "session:list",
  event: "session:event",
  setSignals: "session:set-signals",
  hostStats: "session:host-stats",
  saveState: "session:save-state",
  loadSavedState: "session:load-saved-state",
  clearSavedState: "session:clear-saved-state"
} as const;

export const hostChannels = {
  list: "hosts:list",
  upsert: "hosts:upsert",
  remove: "hosts:remove",
  importSshConfig: "hosts:import-ssh-config",
  reorder: "hosts:reorder",
  exportHosts: "hosts:export",
  scanPutty: "hosts:scan-putty",
  scanSshManager: "hosts:scan-ssh-manager",
  importSshManager: "hosts:import-ssh-manager",
  setStatusTargets: "hosts:set-status-targets",
  status: "hosts:status",
} as const;

export const settingsChannels = {
  get: "settings:get",
  update: "settings:update"
} as const;

export const trayChannels = {
  show: "tray:show",
  hide: "tray:hide",
  quickConnect: "tray:quick-connect"
} as const;

export const portForwardChannels = {
  start: "port-forward:start",
  stop: "port-forward:stop",
  list: "port-forward:list"
} as const;

export const groupChannels = {
  list: "groups:list",
  upsert: "groups:upsert",
  remove: "groups:remove"
} as const;

export const tagChannels = {
  list: "tags:list",
  upsert: "tags:upsert",
  remove: "tags:remove",
  getHostTags: "tags:get-host-tags",
  setHostTags: "tags:set-host-tags",
} as const;

export const serialProfileChannels = {
  list: "serial-profiles:list",
  upsert: "serial-profiles:upsert",
  remove: "serial-profiles:remove",
  listPorts: "serial-profiles:list-ports"
} as const;

export const hostProfileChannels = {
  list: "host-profiles:list",
  upsert: "host-profiles:upsert",
  remove: "host-profiles:remove",
} as const;

export const hostEnvVarChannels = {
  list: "host-env-vars:list",
  replace: "host-env-vars:replace",
} as const;

export const sftpChannels = {
  connect: "sftp:connect",
  disconnect: "sftp:disconnect",
  list: "sftp:list",
  stat: "sftp:stat",
  chmod: "sftp:chmod",
  mkdir: "sftp:mkdir",
  rename: "sftp:rename",
  delete: "sftp:delete",
  readFile: "sftp:read-file",
  writeFile: "sftp:write-file",
  transferStart: "sftp:transfer:start",
  transferCancel: "sftp:transfer:cancel",
  transferPause: "sftp:transfer:pause",
  transferResume: "sftp:transfer:resume",
  transferRetry: "sftp:transfer:retry",
  transferList: "sftp:transfer:list",
  transferResolveConflict: "sftp:transfer:resolve-conflict",
  event: "sftp:event",
  keyboardInteractive: "sftp:keyboard-interactive",
  keyboardInteractiveResponse: "sftp:keyboard-interactive-response",
  bookmarksList: "sftp:bookmarks:list",
  bookmarksUpsert: "sftp:bookmarks:upsert",
  bookmarksRemove: "sftp:bookmarks:remove",
  bookmarksReorder: "sftp:bookmarks:reorder",
  syncStart: "sftp:sync:start",
  syncStop: "sftp:sync:stop",
  syncList: "sftp:sync:list",
  syncEvent: "sftp:sync:event",
  dragOut: "sftp:drag-out",
} as const;

export const workspaceChannels = {
  save: "workspace:save",
  load: "workspace:load",
  list: "workspace:list",
  remove: "workspace:remove",
  saveLast: "workspace:save-last",
  loadLast: "workspace:load-last",
} as const;

export const sshKeyChannels = {
  list: "ssh-keys:list",
  generate: "ssh-keys:generate",
  getFingerprint: "ssh-keys:get-fingerprint",
  remove: "ssh-keys:remove",
  convertPpk: "ssh-keys:convert-ppk",
} as const;

export const fsChannels = {
  list: "fs:list",
  stat: "fs:stat",
  getHome: "fs:get-home",
  getDrives: "fs:get-drives",
  listSshKeys: "fs:list-ssh-keys",
  showSaveDialog: "fs:show-save-dialog",
  showOpenDialog: "fs:show-open-dialog",
} as const;

export const hostPortForwardChannels = {
  list: "host-port-forward:list",
  upsert: "host-port-forward:upsert",
  remove: "host-port-forward:remove",
  reorder: "host-port-forward:reorder",
} as const;

export const connectionPoolChannels = {
  stats: "connection-pool:stats",
} as const;

export const networkChannels = {
  status: "network:status",
} as const;

export const opChannels = {
  listVaults: "op:list-vaults",
  listItems: "op:list-items",
  getItemFields: "op:get-item-fields",
} as const;

export const editorChannels = {
  openEditor: "editor:open",
  openFile: "editor:open-file",
  sessionClosed: "editor:session-closed",
} as const;

export const snippetChannels = {
  list: "snippets:list",
  upsert: "snippets:upsert",
  remove: "snippets:remove",
} as const;

export const loggingChannels = {
  start: "logging:start",
  stop: "logging:stop",
  getState: "logging:get-state",
} as const;

export const recordingChannels = {
  start: "recording:start",
  stop: "recording:stop",
  getState: "recording:get-state",
  list: "recording:list",
  delete: "recording:delete",
  getFrames: "recording:get-frames",
  export: "recording:export",
} as const;

export const connectionHistoryChannels = {
  listByHost: "connection-history:list-by-host",
  listRecent: "connection-history:list-recent",
} as const;

export const hostFingerprintChannels = {
  lookup: "host-fingerprint:lookup",
  trust: "host-fingerprint:trust",
  remove: "host-fingerprint:remove",
} as const;

export const backupChannels = {
  create: "backup:create",
  restore: "backup:restore",
  list: "backup:list",
  showOpenDialog: "backup:show-open-dialog",
} as const;

export const tmuxChannels = {
  probe: "tmux:probe",
} as const;

export const ipcChannels = {
  session: sessionChannels,
  hosts: hostChannels,
  settings: settingsChannels,
  tray: trayChannels,
  portForward: portForwardChannels,
  groups: groupChannels,
  tags: tagChannels,
  serialProfiles: serialProfileChannels,
  hostProfiles: hostProfileChannels,
  hostEnvVars: hostEnvVarChannels,
  sftp: sftpChannels,
  workspace: workspaceChannels,
  fs: fsChannels,
  sshKeys: sshKeyChannels,
  hostPortForward: hostPortForwardChannels,
  connectionPool: connectionPoolChannels,
  network: networkChannels,
  op: opChannels,
  editor: editorChannels,
  snippets: snippetChannels,
  logging: loggingChannels,
  recording: recordingChannels,
  connectionHistory: connectionHistoryChannels,
  hostFingerprint: hostFingerprintChannels,
  backup: backupChannels,
  tmux: tmuxChannels,
} as const;
