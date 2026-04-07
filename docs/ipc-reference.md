# IPC Reference

All IPC channels are defined in `packages/shared/src/ipc/channels.ts`. Schemas are in `schemas.ts` and `sftpSchemas.ts`. The preload bridge validates both requests and responses with Zod.

## Session Channels

| Channel | Direction | Request | Response | Handler |
|---------|-----------|---------|----------|---------|
| `session:open` | renderer → main | `{ transport, profileId, cols, rows, autoReconnect?, reconnectMaxAttempts?, reconnectBaseInterval? }` | `{ sessionId, state }` | `registerIpc.ts` |
| `session:write` | renderer → main | `{ sessionId, data }` | void | `registerIpc.ts` |
| `session:resize` | renderer → main | `{ sessionId, cols, rows }` | void | `registerIpc.ts` |
| `session:close` | renderer → main | `{ sessionId }` | void | `registerIpc.ts` |
| `session:set-signals` | renderer → main | `{ sessionId, signals }` | void | `registerIpc.ts` |
| `session:host-stats` | renderer → main | `{ sessionId }` | `{ cpuLoad, memUsage, diskUsage, uptime, latencyMs }` | `registerIpc.ts` |
| `session:event` | main → renderer | — | `SessionEvent` (data\|status\|exit\|error) | broadcast |

Session states: `connecting`, `connected`, `reconnecting`, `waiting_for_network`, `disconnected`, `failed`.

## Host Channels

| Channel | Request | Response | Handler |
|---------|---------|----------|---------|
| `hosts:list` | — | `HostRecord[]` | `hostsIpc.ts` |
| `hosts:upsert` | `UpsertHostRequest` | `HostRecord` | `hostsIpc.ts` |
| `hosts:remove` | `{ id }` | void | `hostsIpc.ts` |
| `hosts:import-ssh-config` | `{ entries }` | `{ imported }` | `sshConfigIpc.ts` |
| `hosts:reorder` | `{ hostOrders, groupOrders }` | void | `hostsIpc.ts` |

## Group Channels

| Channel | Request | Response | Handler |
|---------|---------|----------|---------|
| `groups:list` | — | `GroupRecord[]` | `groupsIpc.ts` |
| `groups:upsert` | `{ id?, name }` | `GroupRecord` | `groupsIpc.ts` |
| `groups:remove` | `{ id }` | void | `groupsIpc.ts` |

## Serial Profile Channels

| Channel | Request | Response | Handler |
|---------|---------|----------|---------|
| `serial-profiles:list` | — | `SerialProfileRecord[]` | `serialProfilesIpc.ts` |
| `serial-profiles:upsert` | `UpsertSerialProfileRequest` | `SerialProfileRecord` | `serialProfilesIpc.ts` |
| `serial-profiles:remove` | `{ id }` | void | `serialProfilesIpc.ts` |
| `serial-profiles:list-ports` | — | `SerialPortInfo[]` | `serialProfilesIpc.ts` |

## SFTP Channels

| Channel | Request | Response | Handler |
|---------|---------|----------|---------|
| `sftp:connect` | `{ hostId } \| { sessionId }` + optional `username, password` | `{ sftpSessionId }` | `sftpIpc.ts` |
| `sftp:disconnect` | `{ sftpSessionId }` | void | `sftpIpc.ts` |
| `sftp:list` | `{ sftpSessionId, path }` | `{ entries: SftpEntry[] }` | `sftpIpc.ts` |
| `sftp:stat` | `{ sftpSessionId, path }` | `SftpEntry` | `sftpIpc.ts` |
| `sftp:mkdir` | `{ sftpSessionId, path }` | void | `sftpIpc.ts` |
| `sftp:rename` | `{ sftpSessionId, oldPath, newPath }` | void | `sftpIpc.ts` |
| `sftp:delete` | `{ sftpSessionId, path, recursive? }` | void | `sftpIpc.ts` |
| `sftp:read-file` | `{ sftpSessionId, path }` | `{ content, encoding }` | `sftpIpc.ts` |
| `sftp:write-file` | `{ sftpSessionId, path, content, encoding }` | void | `sftpIpc.ts` |
| `sftp:transfer-start` | `{ sftpSessionId, operations[] }` | `TransferJob[]` | `sftpIpc.ts` |
| `sftp:transfer-cancel` | `{ transferId }` | void | `sftpIpc.ts` |
| `sftp:transfer-list` | — | `{ transfers: TransferJob[] }` | `sftpIpc.ts` |
| `sftp:transfer-resolve-conflict` | `{ transferId, resolution }` | void | `sftpIpc.ts` |
| `sftp:event` | — | `SftpEvent` (transfer-progress\|transfer-complete) | broadcast |
| `sftp:bookmarks-list` | `{ hostId }` | `SftpBookmark[]` | `sftpIpc.ts` |
| `sftp:bookmarks-upsert` | `{ hostId, name, remotePath }` | void | `sftpIpc.ts` |
| `sftp:bookmarks-remove` | `{ id }` | void | `sftpIpc.ts` |
| `sftp:bookmarks-reorder` | `{ bookmarkOrders[] }` | void | `sftpIpc.ts` |
| `sftp:sync-start` | `{ sftpSessionId, localPath, remotePath, direction, ... }` | `{ syncId }` | `sftpIpc.ts` |
| `sftp:sync-stop` | `{ syncId }` | void | `sftpIpc.ts` |
| `sftp:sync-list` | — | `{ syncs[] }` | `sftpIpc.ts` |

## Filesystem Channels

| Channel | Request | Response | Handler |
|---------|---------|----------|---------|
| `fs:list` | `{ path }` | `{ entries: FsEntry[] }` | `fsIpc.ts` |
| `fs:stat` | `{ path }` | `FsEntry` | `fsIpc.ts` |
| `fs:get-home` | — | `{ path }` | `fsIpc.ts` |
| `fs:get-drives` | — | `{ drives: string[] }` | `fsIpc.ts` |
| `fs:list-ssh-keys` | — | `string[]` | `fsIpc.ts` |

## Settings Channels

| Channel | Request | Response | Handler |
|---------|---------|----------|---------|
| `settings:get` | `{ key }` | `{ value }` | `settingsIpc.ts` |
| `settings:update` | `{ key, value }` | void | `settingsIpc.ts` |

## Workspace Channels

| Channel | Request | Response | Handler |
|---------|---------|----------|---------|
| `workspace:save` | `{ name, layout }` | `{ success }` | `workspaceIpc.ts` |
| `workspace:load` | `{ name }` | `WorkspaceRecord \| null` | `workspaceIpc.ts` |
| `workspace:list` | — | `WorkspaceRecord[]` | `workspaceIpc.ts` |
| `workspace:remove` | `{ name }` | void | `workspaceIpc.ts` |
| `workspace:save-last` | `{ layout }` | void | `workspaceIpc.ts` |
| `workspace:load-last` | — | `WorkspaceRecord \| null` | `workspaceIpc.ts` |

## Port Forward Channels

| Channel | Request | Response | Handler |
|---------|---------|----------|---------|
| `port-forward:start` | `{ profileId, ... }` | void | `portForwardIpc.ts` |
| `port-forward:stop` | `{ profileId }` | void | `portForwardIpc.ts` |
| `port-forward:list` | — | `PortForwardProfile[]` | `portForwardIpc.ts` |

## SSH Key Channels

| Channel | Request | Response | Handler |
|---------|---------|----------|---------|
| `ssh-keys:list` | — | `string[]` | `sshKeysIpc.ts` |
| `ssh-keys:generate` | `{ type, path, passphrase? }` | void | `sshKeysIpc.ts` |
| `ssh-keys:get-fingerprint` | `{ path }` | `{ fingerprint }` | `sshKeysIpc.ts` |
| `ssh-keys:remove` | `{ path }` | void | `sshKeysIpc.ts` |

## Host Port Forward Channels

| Channel | Request | Response | Handler |
|---------|---------|----------|---------|
| `host-port-forward:list` | `{ hostId }` | `HostPortForwardRecord[]` | `hostPortForwardIpc.ts` |
| `host-port-forward:upsert` | `UpsertHostPortForwardRequest` | `HostPortForwardRecord` | `hostPortForwardIpc.ts` |
| `host-port-forward:remove` | `{ id }` | boolean | `hostPortForwardIpc.ts` |
| `host-port-forward:reorder` | `{ items: [{ id, sortOrder }] }` | void | `hostPortForwardIpc.ts` |

Host port forwards are linked to a specific host via `hostId`. Forwards with `autoStart: true` activate when the host's SSH session opens and tear down on disconnect.

## Connection Pool Channels

| Channel | Request | Response | Handler |
|---------|---------|----------|---------|
| `connection-pool:stats` | — | `ConnectionPoolStats[]` | `registerIpc.ts` |

## Network Channels

| Channel | Direction | Request | Response | Handler |
|---------|-----------|---------|----------|---------|
| `network:status` | main → renderer | — | `{ online: boolean }` | broadcast |
