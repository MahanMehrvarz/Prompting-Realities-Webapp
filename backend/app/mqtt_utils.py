"""Utility helpers for per-assistant MQTT publishing."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Dict, Optional

import paho.mqtt.client as mqtt

logger = logging.getLogger(__name__)


async def test_mqtt_connection(
    *,
    host: str,
    port: int,
    username: Optional[str] = None,
    password: Optional[str] = None,
) -> bool:
    """Test connection to MQTT broker without publishing.

    Returns:
        True if connection succeeded, False otherwise.
    """

    loop = asyncio.get_event_loop()
    client = mqtt.Client()
    if username:
        client.username_pw_set(username=username, password=password)

    def _connect_and_disconnect():
        try:
            client.connect(host, port, keepalive=10)
            client.disconnect()
            return True
        except Exception:
            return False

    try:
        result = await loop.run_in_executor(None, _connect_and_disconnect)
        if not result:
            logger.warning(f"MQTT connection test failed for {host}:{port}")
        return result
    except Exception as exc:
        logger.error(f"Failed to test MQTT connection to {host}:{port} - {exc}")
        return False


async def publish_payload(
    *,
    host: str,
    port: int,
    topic: str,
    payload: Dict[str, Any],
    username: Optional[str] = None,
    password: Optional[str] = None,
) -> bool:
    """Publish a JSON payload to the given MQTT broker.

    This function creates a short-lived client so different assistants can
    target different brokers without maintaining persistent connections.

    Returns:
        True if connection and publish succeeded, False otherwise.
    """

    loop = asyncio.get_event_loop()
    client = mqtt.Client()
    if username:
        client.username_pw_set(username=username, password=password)

    def _connect():
        client.connect(host, port, keepalive=30)

    try:
        await loop.run_in_executor(None, _connect)
    except Exception as exc:
        logger.error(f"Failed to connect to MQTT broker {host}:{port} - {exc}")
        return False

    payload_text = json.dumps(payload)

    def _publish():
        result = client.publish(topic, payload_text)
        client.disconnect()
        return result.rc == mqtt.MQTT_ERR_SUCCESS

    try:
        publish_success = await loop.run_in_executor(None, _publish)
        if not publish_success:
            logger.warning(f"MQTT publish failed to {host}:{port}/{topic}")
        return publish_success
    except Exception as exc:
        logger.error(f"Failed to publish to MQTT topic {topic} - {exc}")
        return False
