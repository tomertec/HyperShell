CREATE TABLE IF NOT EXISTS host_fingerprints (
  id TEXT PRIMARY KEY,
  hostname TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 22,
  algorithm TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  is_trusted INTEGER NOT NULL DEFAULT 0,
  first_seen TEXT DEFAULT CURRENT_TIMESTAMP,
  last_seen TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(hostname, port, algorithm)
);
