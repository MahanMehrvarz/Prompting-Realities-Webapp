-- Engagement lease for the persistent MQTT receiver.
--
-- A live row means "a visitor is actively using this chat right now", which
-- makes the headless receiver drop incoming MQTT messages instead of running
-- an LLM turn -- so sensor-driven output doesn't fight a person at the screen
-- for the same physical installation.
--
-- Written by the chat page on a non-admin's FIRST successful send, then
-- heartbeated every 15s while the tab lives, and deleted on unmount.
-- The backend treats last_seen > now() - 45s as engaged, so a closed tab,
-- a crash or dead wifi resumes the receiver on its own within the TTL.
-- The lease expiring is the resume signal; there is no resume event to miss.

CREATE TABLE IF NOT EXISTS public.session_activity (
  session_id uuid NOT NULL REFERENCES public.assistant_sessions(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  last_seen timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, device_id)
);

-- The receiver's per-message check is "any live lease for this session".
CREATE INDEX IF NOT EXISTS session_activity_session_last_seen_idx
  ON public.session_activity (session_id, last_seen DESC);

ALTER TABLE public.session_activity ENABLE ROW LEVEL SECURITY;

-- Heartbeats come straight from the browser, including anonymous visitors
-- arriving via a share link, so these policies mirror the permissiveness of
-- chat_messages_insert_authenticated (anon + authenticated, WITH CHECK true).
-- The table holds no user content -- only "a device was here at time T" -- so
-- the exposure is a device_id and a timestamp.
CREATE POLICY session_activity_select_all
  ON public.session_activity FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY session_activity_insert_all
  ON public.session_activity FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY session_activity_update_all
  ON public.session_activity FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY session_activity_delete_all
  ON public.session_activity FOR DELETE
  TO anon, authenticated
  USING (true);
