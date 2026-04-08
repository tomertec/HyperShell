CREATE TABLE IF NOT EXISTS session_recordings (
  id TEXT PRIMARY KEY,
  host_id TEXT REFERENCES hosts(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  file_name TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  duration_ms INTEGER,
  file_size_bytes INTEGER,
  event_count INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_session_recordings_host_id ON session_recordings(host_id);
CREATE INDEX IF NOT EXISTS idx_session_recordings_started_at ON session_recordings(started_at DESC);
