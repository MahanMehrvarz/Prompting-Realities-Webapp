"""Utility helpers for per-assistant MQTT publishing.

This module now uses the persistent connection manager for better connection handling.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from .mqtt_manager import mqtt_manager

logger = logging.getLogger(__name__)


async def test_mqtt_connection(
    *,
    host: str,
    port: int,
    username: Optional[str] = None,
    password: Optional[str] = None,
    user_email: Optional[str] = None,
    session_id: Optional[str] = None,
) -> bool:
    """Test connection to MQTT broker using persistent connection.

    Returns:
        True if connection succeeded, False otherwise.
    """
    return await mqtt_manager.test_connection(host, port, username, password, user_email, session_id)


async def publish_payload(
    *,
    host: str,
    port: int,
    topic: str,
    payload: Dict[str, Any],
    username: Optional[str] = None,
    password: Optional[str] = None,
    user_email: Optional[str] = None,
    session_id: Optional[str] = None,
) -> bool:
    """Publish a JSON payload to the given MQTT broker using persistent connection.

    This function now uses a persistent connection manager that maintains connections
    across requests, so the connection counter in your MQTT broker interface will
    show active connections instead of always being at 0.
    
    Each unique combination of user_email and session_id gets its own connection.

    Returns:
        True if connection and publish succeeded, False otherwise.
    """
    return await mqtt_manager.publish(host, port, topic, payload, username, password, user_email, session_id)
