ALTER TABLE ai_connections
  ADD COLUMN provider_type TEXT NOT NULL DEFAULT 'openai-compatible'
  CHECK (provider_type IN ('openai-compatible', 'openai', 'anthropic', 'groq', 'openrouter', 'custom'));
