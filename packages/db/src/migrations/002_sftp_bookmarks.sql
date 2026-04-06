CREATE TABLE IF NOT EXISTS sftp_bookmarks (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  host_id     TEXT NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  remote_path TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sftp_bookmarks_host ON sftp_bookmarks(host_id);
