-- Image input in chat sessions.
--
-- A chat user can attach one image to a message. The backend forwards it to the
-- model and stores the JPEG in a private Storage bucket; the message row keeps
-- only the object path. Run in the Supabase SQL editor.

-- Object path inside the chat-images bucket, e.g.
-- "<session_id>/<thread_id>/<uuid>.jpg". NULL for turns without an image.
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS image_path text;

-- Owner opt-in: images are billed on the assistant owner's OpenAI key and can be
-- uploaded by anyone with the share link, so existing assistants stay text-only.
ALTER TABLE assistants
  ADD COLUMN IF NOT EXISTS allow_images boolean NOT NULL DEFAULT false;

-- Private bucket. No storage.objects policies are added on purpose: only the
-- backend (service role) reads and writes, and the chat shows images through
-- short-lived signed URLs from GET /ai/chat-image-urls.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('chat-images', 'chat-images', false, 4194304, ARRAY['image/jpeg'])
ON CONFLICT (id) DO NOTHING;
