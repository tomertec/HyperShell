CREATE TABLE IF NOT EXISTS connection_history (
  id TEXT PRIMARY KEY,
  host_id TEXT REFERENCES hosts(id) ON DELETE CASCADE,
  connected_at TEXT DEFAULT CURRENT_TIMESTAMP,
  disconnected_at TEXT,
  was_successful INTEGER NOT NULL DEFAULT 1,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_conn_history_host ON connection_history(host_id);
CREATE INDEX IF NOT EXISTS idx_conn_history_connected_at ON connection_history(connected_at DESC);
