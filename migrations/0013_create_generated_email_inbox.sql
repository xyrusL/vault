CREATE TABLE IF NOT EXISTS email_domains (
  id TEXT PRIMARY KEY,
  hostname TEXT NOT NULL UNIQUE COLLATE NOCASE,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  health_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (health_status IN ('available', 'unavailable', 'unknown')),
  last_checked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO email_domains (id, hostname, enabled, health_status, last_checked_at)
VALUES
  ('domain-tpmail-deze-me', 'tpmail.deze.me', 1, 'available', CURRENT_TIMESTAMP),
  ('domain-octagram-qzz-io', 'octagram.qzz.io', 1, 'available', CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS generated_email_addresses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  domain_id TEXT NOT NULL,
  local_part TEXT NOT NULL,
  full_address TEXT NOT NULL UNIQUE COLLATE NOCASE,
  generation_mode TEXT NOT NULL
    CHECK (generation_mode IN ('random_words', 'custom')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled')),
  last_message_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (domain_id) REFERENCES email_domains(id)
);

CREATE INDEX IF NOT EXISTS generated_email_addresses_user_created_idx
  ON generated_email_addresses(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS generated_email_addresses_domain_status_idx
  ON generated_email_addresses(domain_id, status);

CREATE TABLE IF NOT EXISTS received_emails (
  id TEXT PRIMARY KEY,
  generated_email_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  deduplication_key TEXT NOT NULL UNIQUE,
  provider_message_id TEXT,
  sender TEXT NOT NULL,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  text_body TEXT NOT NULL DEFAULT '',
  headers_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(headers_json)),
  received_at TEXT NOT NULL,
  delivery_status TEXT NOT NULL DEFAULT 'received'
    CHECK (delivery_status IN ('received', 'rejected')),
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (generated_email_id) REFERENCES generated_email_addresses(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS received_emails_provider_message_id_idx
  ON received_emails(provider_message_id)
  WHERE provider_message_id IS NOT NULL AND provider_message_id <> '';
CREATE INDEX IF NOT EXISTS received_emails_user_received_idx
  ON received_emails(user_id, received_at DESC);
CREATE INDEX IF NOT EXISTS received_emails_address_received_idx
  ON received_emails(generated_email_id, received_at DESC);
CREATE INDEX IF NOT EXISTS received_emails_user_unread_idx
  ON received_emails(user_id, read_at, received_at DESC);
