ALTER TABLE ai_connections RENAME TO ai_connections_legacy;

CREATE TABLE ai_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  api_key_ciphertext TEXT NOT NULL,
  api_key_iv TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'verified'
    CHECK (status IN ('verified', 'unavailable')),
  last_verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  provider_type TEXT NOT NULL DEFAULT 'openai-compatible',
  provider_id TEXT NOT NULL DEFAULT 'custom',
  api_mode TEXT NOT NULL DEFAULT 'openai-compatible'
    CHECK (api_mode IN ('openai-compatible', 'openai-responses', 'anthropic-messages')),
  is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO ai_connections (
  id, user_id, provider_name, base_url, api_key_ciphertext, api_key_iv, model,
  status, last_verified_at, created_at, updated_at, provider_type, provider_id,
  api_mode, is_active
)
SELECT
  lower(hex(randomblob(16))), user_id, provider_name, base_url, api_key_ciphertext,
  api_key_iv, model, status, last_verified_at, created_at, updated_at,
  provider_type, provider_id, api_mode, 1
FROM ai_connections_legacy;

DROP TABLE ai_connections_legacy;

CREATE INDEX ai_connections_user_id_idx ON ai_connections(user_id, updated_at DESC);
CREATE INDEX ai_connections_status_idx ON ai_connections(status);
CREATE UNIQUE INDEX ai_connections_one_active_per_user_idx
  ON ai_connections(user_id) WHERE is_active = 1;
