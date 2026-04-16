-- Performance indexes for the analysis feature.
-- Run once in the Supabase SQL editor. All statements use IF NOT EXISTS so
-- the file is safe to re-run.
--
-- Indexes were chosen by auditing hot queries in `backend/app/routes/analysis.py`
-- and `backend/app/routes/ai.py`.

-- Highlight-code join table: two foreign-key lookups dominate every
-- quotation query (both directions).
CREATE INDEX IF NOT EXISTS idx_ahc_highlight_id
    ON analysis_highlight_codes(highlight_id);
CREATE INDEX IF NOT EXISTS idx_ahc_code_id
    ON analysis_highlight_codes(code_id);

-- Message highlights: loaded by list and by thread when the thread view opens.
CREATE INDEX IF NOT EXISTS idx_ah_list_thread
    ON analysis_highlights(list_id, thread_id);

-- Instruction highlights: loaded by (assistant, list) in the instruction tab
-- and by code_id in the Codes & Quotations page.
CREATE INDEX IF NOT EXISTS idx_aih_assistant_list
    ON analysis_instruction_highlights(assistant_id, list_id);
CREATE INDEX IF NOT EXISTS idx_aih_code_id
    ON analysis_instruction_highlights(code_id);

-- Chat messages: threads page orders by created_at per thread.
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_created
    ON chat_messages(thread_id, created_at);

-- Admin lookup: every admin-gated page checks membership by email. Primary
-- key may already cover this, but the explicit index is harmless.
CREATE INDEX IF NOT EXISTS idx_admin_emails_email
    ON admin_emails(email);
