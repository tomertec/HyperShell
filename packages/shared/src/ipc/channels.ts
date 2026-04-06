export const sessionChannels = {
  open: "session:open",
  resize: "session:resize",
  write: "session:write",
  close: "session:close",
  list: "session:list",
  event: "session:event"
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

export const ipcChannels = {
  session: sessionChannels,
  hosts: hostChannels,
  settings: settingsChannels,
  tray: trayChannels,
  portForward: portForwardChannels,
  groups: groupChannels
} as const;
