export const sessionChannels = {
  open: "session:open",
  resize: "session:resize",
  write: "session:write",
  close: "session:close",
  list: "session:list",
  event: "session:event",
  setSignals: "session:set-signals",
  hostStats: "session:host-stats"
} as const;

export const hostChannels = {
  list: "hosts:list",
  upsert: "hosts:upsert",
  remove: "hosts:remove",
  importSshConfig: "hosts:import-ssh-config"
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

export const serialProfileChannels = {
  list: "serial-profiles:list",
  upsert: "serial-profiles:upsert",
  remove: "serial-profiles:remove",
  listPorts: "serial-profiles:list-ports"
} as const;

export const sftpChannels = {
  connect: "sftp:connect",
  disconnect: "sftp:disconnect",
  list: "sftp:list",
  stat: "sftp:stat",
  mkdir: "sftp:mkdir",
  rename: "sftp:rename",
  delete: "sftp:delete",
  readFile: "sftp:read-file",
  writeFile: "sftp:write-file",
  transferStart: "sftp:transfer:start",
  transferCancel: "sftp:transfer:cancel",
  transferList: "sftp:transfer:list",
  transferResolveConflict: "sftp:transfer:resolve-conflict",
  event: "sftp:event",
  bookmarksList: "sftp:bookmarks:list",
  bookmarksUpsert: "sftp:bookmarks:upsert",
  bookmarksRemove: "sftp:bookmarks:remove",
  bookmarksReorder: "sftp:bookmarks:reorder",
  syncStart: "sftp:sync:start",
  syncStop: "sftp:sync:stop",
  syncList: "sftp:sync:list",
  syncEvent: "sftp:sync:event"
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
} as const;

export const fsChannels = {
  list: "fs:list",
  stat: "fs:stat",
  getHome: "fs:get-home",
  getDrives: "fs:get-drives",
  listSshKeys: "fs:list-ssh-keys"
} as const;

export const ipcChannels = {
  session: sessionChannels,
  hosts: hostChannels,
  settings: settingsChannels,
  tray: trayChannels,
  portForward: portForwardChannels,
  groups: groupChannels,
  serialProfiles: serialProfileChannels,
  sftp: sftpChannels,
  workspace: workspaceChannels,
  fs: fsChannels,
  sshKeys: sshKeyChannels
} as const;
