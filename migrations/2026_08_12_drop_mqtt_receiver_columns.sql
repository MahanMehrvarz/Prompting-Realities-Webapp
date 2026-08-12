-- Session-0 / MQTT receiver feature removed from the app.
-- Drops the columns that backed the receiver topic, the session-0 toggle,
-- and the force-subscribe toggle.
ALTER TABLE assistants
  DROP COLUMN IF EXISTS mqtt_receiver_topic,
  DROP COLUMN IF EXISTS mqtt_receiver_enabled,
  DROP COLUMN IF EXISTS mqtt_auto_subscribe;
