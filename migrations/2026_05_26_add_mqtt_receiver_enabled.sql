-- Toggle A: enables session-0 headless MQTT listener for receiver topic.
-- Independent from mqtt_auto_subscribe (toggle B). When B is ON, A must also be ON.
ALTER TABLE assistants
  ADD COLUMN IF NOT EXISTS mqtt_receiver_enabled boolean NOT NULL DEFAULT false;
