CREATE TABLE IF NOT EXISTS activity_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  event_type TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'warning', 'error')),
  metadata TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(metadata)),
  client_identifier_hash TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS activity_logs_created_at_idx
  ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS activity_logs_user_id_created_at_idx
  ON activity_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_logs_event_type_created_at_idx
  ON activity_logs(event_type, created_at DESC);
