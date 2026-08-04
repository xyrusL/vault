CREATE TABLE IF NOT EXISTS plugins (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  platform TEXT NOT NULL
    CHECK (platform IN ('spotify', 'facebook', 'discord', 'google_workspace')),
  config_ciphertext TEXT NOT NULL,
  config_iv TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (user_id, platform)
);

CREATE INDEX IF NOT EXISTS plugins_user_id_updated_at_idx
ON plugins(user_id, updated_at DESC);
