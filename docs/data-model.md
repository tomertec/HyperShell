# Data Model

## Database

SQLite via `better-sqlite3`. Database file location: `{app.getPath('userData')}/hypershell.db` (typically `%APPDATA%/HyperShell/hypershell.db` on Windows).

Foreign keys are enabled globally. Schema is managed through numbered migrations in `packages/db/src/migrations/`.

## Entity Relationship

```
host_groups 1──* hosts *──* host_tags *──1 tags
                  │
                  ├── 1──* sftp_bookmarks
                  │
                  └── 1──* host_port_forwards

serial_profiles (standalone)
workspace_layouts (standalone)
app_settings (key-value)
auth_profiles 1──* hosts (optional FK)
```

## Tables

### hosts
Primary host records for SSH connections.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| name | TEXT NOT NULL | Display name (e.g. "hermes") |
| hostname | TEXT NOT NULL | IP or hostname |
| port | INTEGER | Default 22 |
| username | TEXT | SSH username (nullable) |
| identity_file | TEXT | Path to private key (nullable) |
| auth_profile_id | TEXT FK | → auth_profiles.id (nullable) |
| group_id | TEXT FK | → host_groups.id (nullable) |
| auth_method | TEXT | default\|password\|keyfile\|agent\|op-reference |
| op_reference | TEXT | 1Password op:// URI (nullable) |
| is_favorite | INTEGER | 0 or 1 |
| sort_order | INTEGER | Drag-and-drop position |
| color | TEXT | Color tag (red\|orange\|yellow\|green\|blue\|cyan\|purple\|pink) |
| proxy_jump | TEXT | ProxyJump value for `-J` (e.g. `user@bastion:22`) |
| proxy_jump_host_ids | TEXT | JSON array of host IDs for jump host picker UI state |
| keep_alive_interval | INTEGER | ServerAliveInterval in seconds (NULL = default 30s, 0 = disabled) |
| auto_reconnect | INTEGER | 0 or 1 — enable network-aware auto-reconnect |
| reconnect_max_attempts | INTEGER | Max reconnection attempts (default 5) |
| reconnect_base_interval | INTEGER | Base reconnect delay in seconds (default 1, exponential backoff) |
| notes | TEXT | Freeform notes |
| created_at | TEXT | ISO timestamp |
| updated_at | TEXT | ISO timestamp |

### host_groups

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| name | TEXT NOT NULL | Group display name |
| sort_order | INTEGER | Drag-and-drop position |
| created_at | TEXT | ISO timestamp |
| updated_at | TEXT | ISO timestamp |

### serial_profiles

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| name | TEXT NOT NULL | Display name |
| path | TEXT NOT NULL | COM port path (e.g. COM3) |
| baud_rate | INTEGER | Default 9600 |
| data_bits | INTEGER | 5\|6\|7\|8 |
| stop_bits | INTEGER | 1\|2 |
| parity | TEXT | none\|even\|odd\|mark\|space |
| flow_control | TEXT | none\|hardware\|software |
| local_echo | INTEGER | 0 or 1 |
| dtr | INTEGER | 0 or 1 |
| rts | INTEGER | 0 or 1 |
| notes | TEXT | |
| created_at | TEXT | ISO timestamp |
| updated_at | TEXT | ISO timestamp |

### sftp_bookmarks

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| host_id | TEXT FK NOT NULL | → hosts.id |
| name | TEXT NOT NULL | Bookmark display name |
| remote_path | TEXT NOT NULL | Absolute remote path |
| sort_order | INTEGER | Position in list |
| created_at | TEXT | ISO timestamp |
| updated_at | TEXT | ISO timestamp |

### snippets
User-defined command snippets that can be sent to active terminal sessions.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| name | TEXT NOT NULL | Snippet display name (unique) |
| body | TEXT NOT NULL | Snippet content (sent to terminal) |
| created_at | TEXT | ISO timestamp |
| updated_at | TEXT | ISO timestamp |

### app_settings
Key-value store for user preferences.

| Column | Type | Notes |
|--------|------|-------|
| key | TEXT PK | Setting name |
| value | TEXT | JSON-serialized value |
| updated_at | TEXT | ISO timestamp |

### workspace_layouts

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| name | TEXT NOT NULL | Workspace name |
| layout_json | TEXT NOT NULL | Serialized tab/pane state |
| created_at | TEXT | ISO timestamp |
| updated_at | TEXT | ISO timestamp |

### host_port_forwards
Port forwarding rules linked to a specific host. Auto-start on connect is optional.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| host_id | TEXT FK NOT NULL | → hosts.id (ON DELETE CASCADE) |
| name | TEXT NOT NULL | Display name (e.g. "DB tunnel") |
| protocol | TEXT NOT NULL | local\|remote\|dynamic |
| local_address | TEXT | Default 127.0.0.1 |
| local_port | INTEGER NOT NULL | Local listening port |
| remote_host | TEXT | Remote target host (empty for dynamic) |
| remote_port | INTEGER | Remote target port (0 for dynamic) |
| auto_start | INTEGER | 0 or 1 — start automatically on host connect |
| sort_order | INTEGER | Display order |
| created_at | TEXT | ISO timestamp |
| updated_at | TEXT | ISO timestamp |

## Migrations

| Migration | Description |
|-----------|-------------|
| 001_init.sql | Base schema: hosts, groups, tags, auth_profiles, serial_profiles, sessions, snippets, port_forward_profiles, bookmarks, app_settings |
| 002_sftp_bookmarks.sql | sftp_bookmarks table with host_id FK |
| 003_host_auth.ts | Adds identity_file, auth_method, op_reference, agent_kind to hosts |
| 004_favorites.ts | Adds is_favorite to hosts |
| 005_host_enhancements.ts | Adds sort_order + color to hosts and host_groups |
| 006_advanced_ssh.sql | Adds proxy_jump, keep_alive_interval, auto_reconnect fields to hosts; creates host_port_forwards table |

Migrations are idempotent — they use `column already exists` guards. They run automatically on `openDatabase()`.

## Repositories

All repositories are in `packages/db/src/repositories/`. They follow a consistent pattern: create/get/list/update/remove methods that operate on the SQLite database.

| Repository | Table | Key Methods |
|------------|-------|-------------|
| `hostsRepository` | hosts | `create`, `get`, `list`, `update`, `remove`, `updateSortOrders` |
| `groupsRepository` | host_groups | `create`, `get`, `list`, `update`, `remove` |
| `serialProfilesRepository` | serial_profiles | `create`, `get`, `list`, `update`, `remove` |
| `sftpBookmarksRepository` | sftp_bookmarks | `create`, `list` (by host), `update`, `remove`, `reorder` |
| `workspaceRepository` | workspace_layouts | `save`, `load`, `list`, `remove` |
| `hostPortForwardsRepository` | host_port_forwards | `create`, `update`, `listForHost`, `remove`, `updateSortOrders` |
| `snippetsRepository` | snippets | `create`, `list`, `get`, `remove` |
