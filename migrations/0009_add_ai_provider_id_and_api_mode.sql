ALTER TABLE ai_connections
  ADD COLUMN provider_id TEXT NOT NULL DEFAULT 'custom';

ALTER TABLE ai_connections
  ADD COLUMN api_mode TEXT NOT NULL DEFAULT 'openai-compatible'
  CHECK (api_mode IN ('openai-compatible', 'openai-responses', 'anthropic-messages'));

UPDATE ai_connections
SET provider_id = CASE
    WHEN provider_type IN ('openai', 'anthropic', 'groq', 'openrouter') THEN provider_type
    ELSE 'custom'
  END,
  api_mode = CASE
    WHEN provider_type = 'anthropic' THEN 'anthropic-messages'
    ELSE 'openai-compatible'
  END;
