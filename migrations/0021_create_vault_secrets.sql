CREATE TABLE IF NOT EXISTS vault_secrets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name_ciphertext TEXT NOT NULL,
  name_iv TEXT NOT NULL,
  value_ciphertext TEXT NOT NULL,
  value_iv TEXT NOT NULL,
  notes_ciphertext TEXT NOT NULL,
  notes_iv TEXT NOT NULL,
  secret_type TEXT NOT NULL DEFAULT 'other'
    CHECK (secret_type IN ('api_key', 'token', 'config', 'credential', 'other')),
  ai_access INTEGER NOT NULL DEFAULT 0 CHECK (ai_access IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS vault_secrets_user_id_updated_at_idx
ON vault_secrets(user_id, updated_at DESC);
