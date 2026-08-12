# IPC Reference

All IPC channels are defined in `packages/shared/src/ipc/channels.ts`. Schemas are in `schemas.ts` and `sftpSchemas.ts`. The preload bridge validates both requests and responses with Zod.

> **`channels.ts` is the authoritative list, not this page.** Several groups added since this reference was written are not tabled here yet — `app:`, `backup:`, `connection-history:`, `editor:`, `fs:`, `host-env-vars:`, `host-fingerprint:`, `host-profiles:`, `recording:`, `tags:`, `tray:`, `updates:`, and some newer `hosts:`/`session:`/`sftp:`/`ssh-keys:` channels. Check `channels.ts` before assuming a channel doesn't exist.

## Session Channels

| Channel | Direction | Request | Response | Handler |
|---------|-----------|---------|----------|---------|
| `session:open` | renderer → main | `{ transport, profileId, cols, rows, autoReconnect?, reconnectMaxAttempts?, reconnectBaseInterval? }` | `{ sessionId, state }` | `registerIpc.ts` |
| `session:write` | renderer → main | `{ sessionId, data }` | void | `registerIpc.ts` |
| `session:resize` | renderer → main | `{ sessionId, cols, rows }` | void | `registerIpc.ts` |
| `session:close` | renderer → main | `{ sessionId }` | void | `registerIpc.ts` |
| `session:set-signals` | renderer → main | `{ sessionId, signals }` | void | `registerIpc.ts` |
| `session:host-stats` | renderer → main | `{ sessionId }` | `{ cpuLoad, memUsage, diskUsage, uptime, latencyMs }` | `registerIpc.ts` |
| `session:event` | main → renderer | — | `SessionEvent` (data\|status\|exit\|error\|process-title) | broadcast |

Session states: `connecting`, `connected`, `reconnecting`, `waiting_for_network`, `disconnected`, `failed`.

`process-title` payload: `{ sessionId, name: string \| null }` — the foreground program on a local pty's process tree; `null` means the shell is at its prompt. SSH sessions never emit this event; their titles arrive as ordinary OSC-title `data`.

## Host Channels

| Channel | Request | Response | Handler |
|---------|---------|----------|---------|
| `hosts:list` | — | `HostRecord[]` | `hostsIpc.ts` |
| `hosts:upsert` | `UpsertHostRequest` | `HostRecord` | `hostsIpc.ts` |
| `hosts:remove` | `{ id }` | void | `hostsIpc.ts` |
| `hosts:import-ssh-config` | `{ entries }` | `{ imported }` | `sshConfigIpc.ts` |
| `hosts:reorder` | `{ hostOrders, groupOrders }` | void | `hostsIpc.ts` |
| `hosts:export` | `{ format: "json"\|"csv", filePath }` | `{ exported: number }` | `hostsIpc.ts` / `registerIpc.ts` |

## Host Import Channels

Two-step migration from another client: a `scan` reads the foreign store and returns candidates, then an `import` writes the subset the user picked.

| Channel | Request | Response | Handler |
|---------|---------|----------|---------|
| `hosts:scan-putty` | — | `{ sessions: PuttySession[] }` | `puttyImportIpc.ts` |
| `hosts:scan-ssh-manager` | — | `{ dbPath, hosts, groups, snippets }` | `sshManagerImportIpc.ts` |
| `hosts:import-ssh-manager` | `{ hostIds, groupIds, snippetIds }` | `{ importedHosts, importedGroups, importedSnippets, skippedDuplicates }` | `sshManagerImportIpc.ts` |

Both sshmanager handlers open its SQLite file read-only and always close the handle via `try/finally` — a leaked handle keeps a Windows file lock on the user's sshmanager DB. A missing DB is not an error: `scan` returns empty arrays and `import` returns all-zero counts. Per-table and per-row failures are logged and skipped rather than failing the whole import, so a partial result is normal. `scan` excludes hosts with `ConnectionType: 1` (serial) and those with a blank hostname; `import` skips duplicates, matched on `hostname + port + username`, and prefixes imported ids with `sm-`.

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

## Local Profile Channels

| Channel | Request | Response | Handler |
|---------|---------|----------|---------|
| `local-profiles:list` | — | `LocalProfileRecord[]` | `localProfilesIpc.ts` |
| `local-profiles:upsert` | `UpsertLocalProfileRequest` | `LocalProfileRecord` | `localProfilesIpc.ts` |
| `local-profiles:remove` | `{ id }` | void | `localProfilesIpc.ts` |
| `local-profiles:set-hidden` | `{ id, hidden }` | void | `localProfilesIpc.ts` |
| `local-profiles:reorder` | `{ items: { id, sortOrder }[] }` | void | `localProfilesIpc.ts` |
| `local-profiles:rescan` | — | `LocalProfileRecord[]` | `localProfilesIpc.ts` |
| `local-profiles:get-env-vars` | `{ id }` | `LocalProfileEnvVar[]` | `localProfilesIpc.ts` |

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
| `fs:show-save-dialog` | `{ defaultPath?, filters? }` | `string \| null` | `fsIpc.ts` |

## Snippet Channels

| Channel | Request | Response | Handler |
|---------|---------|----------|---------|
| `snippets:list` | — | `SnippetRecord[]` | `snippetsIpc.ts` |
| `snippets:upsert` | `{ id, name, body }` | `SnippetRecord` | `snippetsIpc.ts` |
| `snippets:remove` | `{ id }` | void | `snippetsIpc.ts` |

## Session Logging Channels

| Channel | Request | Response | Handler |
|---------|---------|----------|---------|
| `logging:start` | `{ sessionId, filePath }` | void | `loggingIpc.ts` |
| `logging:stop` | `{ sessionId }` | void | `loggingIpc.ts` |
| `logging:get-state` | `{ sessionId }` | `{ active, filePath, bytesWritten }` | `loggingIpc.ts` |

Session logging intercepts terminal `data` events in `registerIpc.ts` and writes to file with ANSI escape sequences stripped. The logger hooks into `manager.onEvent()` and only processes sessions with active logging.

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

## 1Password Channels

Back the `op://` reference picker in the host editor. Each handler shells out to the 1Password CLI (`op`) with `--format=json`.

| Channel | Request | Response | Handler |
|---------|---------|----------|---------|
| `op:list-vaults` | — | `{ id, name }[]` | `opIpc.ts` |
| `op:list-items` | `{ vaultId }` | `{ id, title, category? }[]` | `opIpc.ts` |
| `op:get-item-fields` | `{ itemId }` | `{ id, label, type? }[]` | `opIpc.ts` |

`op:get-item-fields` returns only labelled fields — unlabelled ones are section internals, not user-facing. Values are never returned over IPC; the renderer picks a field and stores the `op://` reference, and resolution happens in the main process at connect time (`security/opResolver.ts`).

Two failure modes reach the renderer as errors with actionable messages rather than raw exceptions: `op` not being installed (`ENOENT`), and `op` writing non-JSON to stdout — which it does when the session is signed out, so the message says so.

## Host Port Forward Channels

| Channel | Request | Response | Handler |
|---------|---------|----------|---------|
| `host-port-forward:list` | `{ hostId }` | `HostPortForwardRecord[]` | `hostPortForwardIpc.ts` |
| `host-port-forward:upsert` | `UpsertHostPortForwardRequest` | `HostPortForwardRecord` | `hostPortForwardIpc.ts` |
| `host-port-forward:remove` | `{ id }` | boolean | `hostPortForwardIpc.ts` |
| `host-port-forward:reorder` | `{ items: [{ id, sortOrder }] }` | void | `hostPortForwardIpc.ts` |

Host port forwards are linked to a specific host via `hostId`. Forwards with `autoStart: true` activate when the host's SSH session opens and tear down on disconnect.

## Tmux Channels

| Channel | Request | Response | Handler |
|---------|---------|----------|---------|
| `tmux:probe` | `{ hostId }` | `{ sessions: TmuxSessionIpc[] }` | `tmuxIpc.ts` |

Each `TmuxSessionIpc` contains `{ name, windowCount, createdAt (ISO string), attached (boolean) }`.

The probe spawns a one-shot `ssh host 'tmux ls -F ...'` command via `child_process.execFile`, reusing the same `buildSshArgs()` as the SSH terminal for identical auth resolution. Timeout is 10 seconds. Any failure (auth, timeout, tmux not installed) silently returns an empty array — the probe never blocks or errors. Password-only hosts are skipped on the renderer side before the IPC call is made.

## Connection Pool Channels

| Channel | Request | Response | Handler |
|---------|---------|----------|---------|
| `connection-pool:stats` | — | `ConnectionPoolStats[]` | `registerIpc.ts` |

## Network Channels

| Channel | Direction | Request | Response | Handler |
|---------|-----------|---------|----------|---------|
| `network:status` | main → renderer | — | `{ online: boolean }` | broadcast |
