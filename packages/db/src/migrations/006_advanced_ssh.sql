-- 006_advanced_ssh.sql
-- Adds jump host, keep-alive, auto-reconnect fields to hosts table
-- and creates host_port_forwards table for host-linked port forwards

-- Jump host chain
ALTER TABLE hosts ADD COLUMN proxy_jump TEXT;
ALTER TABLE hosts ADD COLUMN proxy_jump_host_ids TEXT;

-- Keep-alive
ALTER TABLE hosts ADD COLUMN keep_alive_interval INTEGER;

-- Auto-reconnect
ALTER TABLE hosts ADD COLUMN auto_reconnect INTEGER DEFAULT 0;
ALTER TABLE hosts ADD COLUMN reconnect_max_attempts INTEGER DEFAULT 5;
ALTER TABLE hosts ADD COLUMN reconnect_base_interval INTEGER DEFAULT 1;

-- Host-linked port forwards
CREATE TABLE IF NOT EXISTS host_port_forwards (
  id TEXT PRIMARY KEY,
  host_id TEXT NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  protocol TEXT NOT NULL CHECK(protocol IN ('local', 'remote', 'dynamic')),
  local_address TEXT DEFAULT '127.0.0.1',
  local_port INTEGER NOT NULL,
  remote_host TEXT DEFAULT '',
  remote_port INTEGER DEFAULT 0,
  auto_start INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_host_port_forwards_host ON host_port_forwards(host_id);
