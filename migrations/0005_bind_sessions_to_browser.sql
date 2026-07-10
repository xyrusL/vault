ALTER TABLE sessions ADD COLUMN user_agent_hash TEXT;

DELETE FROM sessions;
