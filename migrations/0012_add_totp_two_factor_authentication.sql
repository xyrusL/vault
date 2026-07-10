ALTER TABLE users ADD COLUMN totp_secret_ciphertext TEXT;
ALTER TABLE users ADD COLUMN totp_secret_iv TEXT;
ALTER TABLE users ADD COLUMN two_factor_enabled INTEGER NOT NULL DEFAULT 0
  CHECK (two_factor_enabled IN (0, 1));
ALTER TABLE users ADD COLUMN two_factor_confirmed_at TEXT;

CREATE TABLE IF NOT EXISTS two_factor_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  user_agent_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
    CHECK (attempts >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS two_factor_challenges_token_hash_idx
  ON two_factor_challenges(token_hash);
CREATE INDEX IF NOT EXISTS two_factor_challenges_user_id_idx
  ON two_factor_challenges(user_id);
CREATE INDEX IF NOT EXISTS two_factor_challenges_expires_at_idx
  ON two_factor_challenges(expires_at);
