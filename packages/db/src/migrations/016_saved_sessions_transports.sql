-- Widens saved_sessions.transport's CHECK constraint to include 'telnet' and
-- 'local', which migration 010 originally omitted. SQLite cannot ALTER a CHECK
-- constraint, so existing rows are preserved by copying them into a
-- recreated table. This file is only executed by index.ts when the stored
-- table DDL does not already allow 'local' — see openDatabase().
CREATE TABLE saved_sessions_new (
  id TEXT PRIMARY KEY,
  host_id TEXT REFERENCES hosts(id) ON DELETE SET NULL,
  transport TEXT NOT NULL CHECK (transport IN ('ssh', 'serial', 'sftp', 'telnet', 'local')),
  profile_id TEXT NOT NULL,
  title TEXT NOT NULL,
  was_graceful INTEGER NOT NULL DEFAULT 0,
  saved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO saved_sessions_new (id, host_id, transport, profile_id, title, was_graceful, saved_at)
SELECT id, host_id, transport, profile_id, title, was_graceful, saved_at FROM saved_sessions;

DROP TABLE saved_sessions;

ALTER TABLE saved_sessions_new RENAME TO saved_sessions;

CREATE INDEX IF NOT EXISTS idx_saved_sessions_recovery
ON saved_sessions(was_graceful, saved_at DESC);
