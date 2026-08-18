ALTER TABLE notes ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS notes_user_id_pinned_updated_idx
ON notes(user_id, is_pinned DESC, updated_at DESC, id DESC);
