-- Per-assistant OpenAI model. NULL means "use the backend default" (gpt-4o-mini),
-- so existing rows keep behaving exactly as before.
ALTER TABLE assistants
  ADD COLUMN IF NOT EXISTS model text;
