CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_ciphertext TEXT NOT NULL,
  password_iv TEXT NOT NULL,
  password_version INTEGER NOT NULL DEFAULT 1,
  label TEXT NOT NULL DEFAULT 'ChatGPT Account',
  category TEXT NOT NULL DEFAULT 'Personal',
  plan TEXT NOT NULL DEFAULT 'Free',
  status TEXT NOT NULL DEFAULT 'Active'
    CHECK (status IN ('Active', 'Inactive', 'Expiring Soon', 'Expired')),
  expires_at TEXT,
  last_used_at TEXT,
  notes TEXT,
  metadata TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(metadata)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS accounts_status_idx ON accounts(status);
CREATE INDEX IF NOT EXISTS accounts_expires_at_idx ON accounts(expires_at);
CREATE INDEX IF NOT EXISTS accounts_category_idx ON accounts(category);
CREATE INDEX IF NOT EXISTS accounts_created_at_idx ON accounts(created_at DESC);
