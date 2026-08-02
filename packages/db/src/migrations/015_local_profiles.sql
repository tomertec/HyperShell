CREATE TABLE IF NOT EXISTS local_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  executable TEXT NOT NULL,
  args_json TEXT NOT NULL DEFAULT '[]',
  starting_directory TEXT,
  icon TEXT NOT NULL DEFAULT 'terminal',
  color TEXT,
  elevated INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'user',
  detect_key TEXT UNIQUE,
  is_available INTEGER NOT NULL DEFAULT 1,
  is_hidden INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS local_profile_env_vars (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES local_profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  is_enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_local_profile_env_vars_profile
  ON local_profile_env_vars(profile_id);
