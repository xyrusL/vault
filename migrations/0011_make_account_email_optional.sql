PRAGMA defer_foreign_keys = ON;

CREATE TABLE accounts_new (
  id TEXT PRIMARY KEY,
  email TEXT COLLATE NOCASE,
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
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  platform TEXT NOT NULL DEFAULT 'Custom',
  username TEXT,
  login_url TEXT,
  account_type TEXT NOT NULL DEFAULT 'custom'
);

INSERT INTO accounts_new (
  id, email, password_ciphertext, password_iv, password_version,
  label, category, plan, status, expires_at, last_used_at, notes,
  metadata, created_at, updated_at, platform, username, login_url,
  account_type
)
SELECT
  id, email, password_ciphertext, password_iv, password_version,
  label, category, plan, status, expires_at, last_used_at, notes,
  metadata, created_at, updated_at, platform, username, login_url,
  account_type
FROM accounts;

DROP TABLE accounts;
ALTER TABLE accounts_new RENAME TO accounts;

CREATE UNIQUE INDEX accounts_email_unique_idx
  ON accounts(email COLLATE NOCASE)
  WHERE email IS NOT NULL;
CREATE INDEX accounts_status_idx ON accounts(status);
CREATE INDEX accounts_expires_at_idx ON accounts(expires_at);
CREATE INDEX accounts_category_idx ON accounts(category);
CREATE INDEX accounts_created_at_idx ON accounts(created_at DESC);
CREATE INDEX accounts_platform_idx ON accounts(platform);
CREATE INDEX accounts_account_type_idx ON accounts(account_type);
