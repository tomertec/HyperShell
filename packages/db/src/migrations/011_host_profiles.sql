CREATE TABLE IF NOT EXISTS host_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  default_port INTEGER DEFAULT 22,
  default_username TEXT,
  auth_method TEXT DEFAULT 'default',
  identity_file TEXT,
  proxy_jump TEXT,
  keep_alive_interval INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE hosts
ADD COLUMN host_profile_id TEXT REFERENCES host_profiles(id) ON DELETE SET NULL;
