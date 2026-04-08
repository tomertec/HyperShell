CREATE TABLE IF NOT EXISTS saved_sessions (
  id TEXT PRIMARY KEY,
  host_id TEXT REFERENCES hosts(id) ON DELETE SET NULL,
  transport TEXT NOT NULL CHECK (transport IN ('ssh', 'serial', 'sftp')),
  profile_id TEXT NOT NULL,
  title TEXT NOT NULL,
  was_graceful INTEGER NOT NULL DEFAULT 0,
  saved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_saved_sessions_recovery
ON saved_sessions(was_graceful, saved_at DESC);
