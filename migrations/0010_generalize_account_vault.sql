ALTER TABLE accounts
  ADD COLUMN platform TEXT NOT NULL DEFAULT 'Custom';

ALTER TABLE accounts
  ADD COLUMN username TEXT;

ALTER TABLE accounts
  ADD COLUMN login_url TEXT;

ALTER TABLE accounts
  ADD COLUMN account_type TEXT NOT NULL DEFAULT 'custom';

CREATE INDEX IF NOT EXISTS accounts_platform_idx ON accounts(platform);
CREATE INDEX IF NOT EXISTS accounts_account_type_idx ON accounts(account_type);
