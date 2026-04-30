"""Persistent MQTT connection manager for maintaining connections across requests."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Dict, Optional

import paho.mqtt.client as mqtt

logger = logging.getLogger(__name__)


SESSION_ZERO_ID = "__session0__"


class MqttConnectionManager:
    """Manages persistent MQTT connections per broker configuration."""

    def __init__(self):
        self._connections: Dict[str, mqtt.Client] = {}
        self._lock = asyncio.Lock()
        # Track active session-0 subscriptions: assistant_id -> connection_key
        self._session_zero: Dict[str, str] = {}

    def _get_connection_key(
        self,
        host: str,
        port: int,
        username: Optional[str] = None,
        assistant_name: Optional[str] = None,
        session_id: Optional[str] = None,
    ) -> str:
        """Generate a unique key for a broker configuration including assistant session."""
        base_key = f"{host}:{port}:{username or 'anonymous'}"
        if assistant_name and session_id:
            return f"{base_key}:{assistant_name}:{session_id}"
        elif assistant_name:
            return f"{base_key}:{assistant_name}"
        return base_key

    async def get_or_create_connection(
        self,
        host: str,
        port: int,
        username: Optional[str] = None,
        password: Optional[str] = None,
        assistant_name: Optional[str] = None,
        session_id: Optional[str] = None,
    ) -> Optional[mqtt.Client]:
        """Get existing connection or create a new persistent one."""
        connection_key = self._get_connection_key(host, port, username, assistant_name, session_id)

        async with self._lock:
            # Check if we already have a connected client
            if connection_key in self._connections:
                client = self._connections[connection_key]
                if client.is_connected():
                    logger.info(f"♻️ Reusing existing MQTT connection to {host}:{port}")
                    return client
                else:
                    # Connection lost, remove it
                    logger.warning(f"⚠️ Existing connection to {host}:{port} is disconnected, removing")
                    del self._connections[connection_key]

            # Create new persistent connection with assistant name as client ID
            if assistant_name:
                client_id = assistant_name
            else:
                client_id = f"backend_{connection_key}"
            
            logger.info(f"🔌 Creating new persistent MQTT connection to {host}:{port} with client_id: {client_id}")
            client = mqtt.Client(client_id=client_id, clean_session=False)

            if username:
                client.username_pw_set(username=username, password=password)

            # Set up callbacks for connection monitoring
            def on_connect(client, userdata, flags, rc):
                if rc == 0:
                    logger.info(f"✅ Successfully connected to MQTT broker {host}:{port}")
                else:
                    logger.error(f"❌ Failed to connect to MQTT broker {host}:{port}, rc={rc}")

            def on_disconnect(client, userdata, rc):
                if rc != 0:
                    logger.warning(f"⚠️ Unexpected disconnection from {host}:{port}, rc={rc}")

            client.on_connect = on_connect
            client.on_disconnect = on_disconnect

            # Connect to broker
            loop = asyncio.get_event_loop()

            def _connect():
                import time
                import socket
                try:
                    # Set socket timeout to prevent hanging on connect
                    client._client_id = client._client_id  # Ensure client is initialized
                    client.connect(host, port, keepalive=60)
                    client.loop_start()  # Start background network loop
                    # Wait for connection to establish with timeout
                    timeout = 2.0
                    start_time = time.time()
                    while not client.is_connected():
                        if time.time() - start_time > timeout:
                            logger.error(f"Connection timeout to {host}:{port}")
                            client.loop_stop()
                            return False
                        time.sleep(0.1)
                    return True
                except socket.timeout:
                    logger.error(f"Socket timeout connecting to {host}:{port}")
                    try:
                        client.loop_stop()
                    except:
                        pass
                    return False
                except socket.error as exc:
                    logger.error(f"Socket error connecting to {host}:{port} - {exc}")
                    try:
                        client.loop_stop()
                    except:
                        pass
                    return False
                except Exception as exc:
                    logger.error(f"Failed to connect to {host}:{port} - {exc}")
                    try:
                        client.loop_stop()
                    except:
                        pass
                    return False

            try:
                # Use asyncio.wait_for to enforce timeout at the executor level
                success = await asyncio.wait_for(
                    loop.run_in_executor(None, _connect),
                    timeout=3.0
                )
                if success:
                    self._connections[connection_key] = client
                    return client
                else:
                    return None
            except asyncio.TimeoutError:
                logger.error(f"Timeout while connecting to {host}:{port}")
                try:
                    client.loop_stop()
                except:
                    pass
                return None
            except Exception as exc:
                logger.error(f"Exception while connecting to {host}:{port} - {exc}")
                try:
                    client.loop_stop()
                except:
                    pass
                return None

    async def publish(
        self,
        host: str,
        port: int,
        topic: str,
        payload: Dict[str, Any],
        username: Optional[str] = None,
        password: Optional[str] = None,
        assistant_name: Optional[str] = None,
        session_id: Optional[str] = None,
    ) -> bool:
        """Publish a message using a persistent connection.

        Extracts the MQTT_value field from the payload if present, otherwise sends the entire payload.
        """
        client = await self.get_or_create_connection(host, port, username, password, assistant_name, session_id)
        if not client:
            logger.error(f"Failed to get MQTT connection for {host}:{port}")
            return False

        # Extract MQTT_value if present, otherwise use entire payload
        mqtt_value = payload.get("MQTT_value")
        if mqtt_value is not None:
            logger.info(f"📤 Extracted MQTT_value field from payload: {mqtt_value}")
            payload_to_send = mqtt_value
        else:
            logger.info(f"⚠️ No MQTT_value field found in payload, sending entire payload")
            payload_to_send = payload
        
        # Convert to JSON string if it's a dict, otherwise convert to string
        if isinstance(payload_to_send, dict):
            payload_text = json.dumps(payload_to_send)
        elif isinstance(payload_to_send, str):
            payload_text = payload_to_send
        else:
            payload_text = str(payload_to_send)
        
        loop = asyncio.get_event_loop()

        def _publish():
            try:
                result = client.publish(topic, payload_text, qos=1)
                # Wait for publish to complete
                result.wait_for_publish(timeout=5.0)
                return result.rc == mqtt.MQTT_ERR_SUCCESS
            except Exception as exc:
                logger.error(f"Failed to publish to {topic} - {exc}")
                return False

        try:
            success = await loop.run_in_executor(None, _publish)
            if success:
                logger.info(f"📤 Successfully published to {host}:{port}/{topic}")
            else:
                logger.warning(f"⚠️ Failed to publish to {host}:{port}/{topic}")
            return success
        except Exception as exc:
            logger.error(f"Exception while publishing to {topic} - {exc}")
            return False

    async def test_connection(
        self,
        host: str,
        port: int,
        username: Optional[str] = None,
        password: Optional[str] = None,
        assistant_name: Optional[str] = None,
        session_id: Optional[str] = None,
    ) -> bool:
        """Test connection to MQTT broker."""
        client = await self.get_or_create_connection(host, port, username, password, assistant_name, session_id)
        return client is not None and client.is_connected()

    async def subscribe(
        self,
        host: str,
        port: int,
        topic: str,
        username: Optional[str] = None,
        password: Optional[str] = None,
        assistant_name: Optional[str] = None,
        session_id: Optional[str] = None,
    ) -> bool:
        """Subscribe to an MQTT topic. Messages are received but discarded (headless listener)."""
        client = await self.get_or_create_connection(
            host, port, username, password, assistant_name, session_id
        )
        if not client:
            logger.error(f"Failed to get MQTT connection for subscribe to {host}:{port}")
            return False

        def on_message(client, userdata, msg):
            logger.debug(
                f"📥 [Session-0] Received on {msg.topic}: {msg.payload[:100]!r} (discarded)"
            )

        client.on_message = on_message

        loop = asyncio.get_event_loop()

        def _subscribe():
            try:
                result, mid = client.subscribe(topic, qos=1)
                return result == mqtt.MQTT_ERR_SUCCESS
            except Exception as exc:
                logger.error(f"Failed to subscribe to {topic} - {exc}")
                return False

        try:
            success = await loop.run_in_executor(None, _subscribe)
            if success:
                logger.info(f"📡 [Session-0] Subscribed to {host}:{port}/{topic}")
            else:
                logger.warning(f"⚠️ [Session-0] Failed to subscribe to {host}:{port}/{topic}")
            return success
        except Exception as exc:
            logger.error(f"Exception while subscribing to {topic} - {exc}")
            return False

    # ── Session-0 (headless receiver) lifecycle ──────────────────────────

    async def start_session_zero(
        self,
        assistant_id: str,
        host: str,
        port: int,
        receiver_topic: str,
        username: Optional[str] = None,
        password: Optional[str] = None,
        assistant_name: Optional[str] = None,
    ) -> bool:
        """Start a headless MQTT subscription (session-0) for an assistant.

        Keeps the MQTT connection alive and subscribed to the receiver topic
        even when no chat sessions are active.  Messages are discarded.
        """
        if assistant_id in self._session_zero:
            logger.info(f"♻️ [Session-0] Already running for assistant {assistant_id}")
            return True

        success = await self.subscribe(
            host, port, receiver_topic,
            username=username, password=password,
            assistant_name=assistant_name,
            session_id=SESSION_ZERO_ID,
        )
        if success:
            key = self._get_connection_key(
                host, port, username, assistant_name, SESSION_ZERO_ID
            )
            self._session_zero[assistant_id] = key
            logger.info(f"🟢 [Session-0] Started for assistant {assistant_id} on {receiver_topic}")
        return success

    async def stop_session_zero(self, assistant_id: str) -> bool:
        """Stop the headless session-0 subscription for an assistant."""
        key = self._session_zero.pop(assistant_id, None)
        if not key:
            logger.info(f"[Session-0] No active session-0 for assistant {assistant_id}")
            return False

        async with self._lock:
            client = self._connections.pop(key, None)
            if client:
                try:
                    client.loop_stop()
                    client.disconnect()
                    logger.info(f"🔴 [Session-0] Stopped for assistant {assistant_id}")
                except Exception as exc:
                    logger.error(f"❌ [Session-0] Error stopping for {assistant_id} - {exc}")
        return True

    def is_session_zero_active(self, assistant_id: str) -> bool:
        """Check if session-0 is currently active for an assistant."""
        return assistant_id in self._session_zero

    async def disconnect_session_connections(self, session_id: str) -> int:
        """Disconnect all MQTT connections for a specific session."""
        async with self._lock:
            disconnected_count = 0
            keys_to_remove = []

            # Find all connections that belong to this session
            for connection_key in self._connections.keys():
                # Connection keys are formatted as: host:port:username:user_email:session_id
                if connection_key.endswith(f":{session_id}"):
                    keys_to_remove.append(connection_key)

            # Disconnect and remove these connections
            for connection_key in keys_to_remove:
                try:
                    client = self._connections[connection_key]
                    client.loop_stop()
                    client.disconnect()
                    del self._connections[connection_key]
                    disconnected_count += 1
                    logger.info(f"✅ Disconnected session connection: {connection_key}")
                except Exception as exc:
                    logger.error(f"❌ Error disconnecting {connection_key} - {exc}")

            logger.info(f"🔌 Disconnected {disconnected_count} MQTT connections for session {session_id}")
            return disconnected_count

    async def disconnect_user_connections(self, user_email: str) -> int:
        """Disconnect all MQTT connections for a specific user."""
        async with self._lock:
            disconnected_count = 0
            keys_to_remove = []

            # Find all connections that belong to this user
            for connection_key in self._connections.keys():
                # Connection keys are formatted as: host:port:username:user_email or host:port:username:user_email:session_id
                if f":{user_email}" in connection_key or connection_key.endswith(f":{user_email}"):
                    keys_to_remove.append(connection_key)

            # Disconnect and remove these connections
            for connection_key in keys_to_remove:
                try:
                    client = self._connections[connection_key]
                    client.loop_stop()
                    client.disconnect()
                    del self._connections[connection_key]
                    disconnected_count += 1
                    logger.info(f"✅ Disconnected user connection: {connection_key}")
                except Exception as exc:
                    logger.error(f"❌ Error disconnecting {connection_key} - {exc}")

            logger.info(f"🔌 Disconnected {disconnected_count} MQTT connections for user {user_email}")
            return disconnected_count

    async def disconnect_all(self):
        """Disconnect all persistent connections (for shutdown)."""
        async with self._lock:
            logger.info(f"🔌 Disconnecting {len(self._connections)} MQTT connections")
            for connection_key, client in self._connections.items():
                try:
                    client.loop_stop()
                    client.disconnect()
                    logger.info(f"✅ Disconnected from {connection_key}")
                except Exception as exc:
                    logger.error(f"Error disconnecting from {connection_key} - {exc}")
            self._connections.clear()


# Global singleton instance
mqtt_manager = MqttConnectionManager()
