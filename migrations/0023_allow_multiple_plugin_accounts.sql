CREATE TABLE plugins_multiple_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  platform TEXT NOT NULL
    CHECK (platform IN ('spotify', 'facebook', 'discord', 'google_workspace')),
  config_ciphertext TEXT NOT NULL,
  config_iv TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO plugins_multiple_accounts (
  id, user_id, platform, config_ciphertext, config_iv, enabled, created_at, updated_at
)
SELECT id, user_id, platform, config_ciphertext, config_iv, enabled, created_at, updated_at
FROM plugins;

DROP TABLE plugins;
ALTER TABLE plugins_multiple_accounts RENAME TO plugins;

CREATE INDEX plugins_user_id_updated_at_idx
ON plugins(user_id, updated_at DESC);

CREATE INDEX plugins_user_id_platform_idx
ON plugins(user_id, platform);
