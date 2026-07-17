ALTER TABLE generated_email_addresses ADD COLUMN delivery_mode TEXT NOT NULL DEFAULT 'vault'
  CHECK (delivery_mode IN ('vault', 'forward'));

ALTER TABLE generated_email_addresses ADD COLUMN forward_to TEXT;

ALTER TABLE generated_email_addresses ADD COLUMN forward_destination_id TEXT;

ALTER TABLE received_emails ADD COLUMN raw_size_bytes INTEGER NOT NULL DEFAULT 0
  CHECK (raw_size_bytes >= 0);
