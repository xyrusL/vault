ALTER TABLE generated_email_addresses ADD COLUMN routing_rule_id TEXT;

ALTER TABLE generated_email_addresses ADD COLUMN routing_zone_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS generated_email_addresses_routing_rule_idx
  ON generated_email_addresses(routing_rule_id)
  WHERE routing_rule_id IS NOT NULL;
