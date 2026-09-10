-- Persistent, admin-armed MQTT receiver.
--
-- A row here means: the backend keeps an MQTT subscription alive for this
-- session even when no browser tab is open, and runs each incoming message
-- through the assistant's LLM turn on the admin's own thread.
--
-- Lifecycle: armed by an admin from the chat's MQTT Receiver modal, stopped
-- when the admin disconnects it or the session is stopped. Rehydrated on
-- backend startup so a Render redeploy doesn't silently kill armed receivers.
--
-- thread_id is text (not uuid) to match chat_messages.thread_id, which the
-- frontend generates client-side and stores in localStorage.

CREATE TABLE IF NOT EXISTS public.mqtt_receiver_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.assistant_sessions(id) ON DELETE CASCADE,
  assistant_id uuid NOT NULL REFERENCES public.assistants(id) ON DELETE CASCADE,
  thread_id text NOT NULL,
  topic text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by text NOT NULL,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- At most one armed receiver per session.
CREATE UNIQUE INDEX IF NOT EXISTS mqtt_receiver_subscriptions_one_active
  ON public.mqtt_receiver_subscriptions (session_id)
  WHERE active;

-- Rehydration on startup reads every armed row.
CREATE INDEX IF NOT EXISTS mqtt_receiver_subscriptions_active_idx
  ON public.mqtt_receiver_subscriptions (active)
  WHERE active;

ALTER TABLE public.mqtt_receiver_subscriptions ENABLE ROW LEVEL SECURITY;

-- No policies by design. This table is read and written only by the backend
-- with the service-role key, which bypasses RLS. Browser clients never touch
-- it directly -- they go through the admin-gated /ai/mqtt/receiver/* endpoints,
-- so arming a receiver stays behind a server-side admin check.
