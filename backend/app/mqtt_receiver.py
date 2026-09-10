"""Headless MQTT receiver: keeps a session listening after the tab is closed.

An admin arms a receive topic from the chat's MQTT Receiver modal. From then on
the backend -- not the browser -- holds the subscription, and every incoming
message runs the assistant's normal turn on the admin's own thread: model call,
publish to the assistant's main topic, one row in chat_messages. Closing the tab
changes nothing; the installation keeps reacting.

Two guards keep it from fighting a person standing at the screen:

* the engagement lease (session_activity) -- while a non-admin visitor is
  actively chatting, incoming messages are dropped rather than queued, so the
  windmills answer to the person in the room and no tokens are spent;
* a minimum interval between turns, so a chatty sensor can't melt the
  OpenAI bill.

Both are checked per message. There is no paused/running state machine to fall
out of sync: a lease simply expires and the receiver resumes on its own.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Set

import paho.mqtt.client as mqtt

logger = logging.getLogger(__name__)

# A visitor counts as "at the screen" while their heartbeat is this fresh.
# The chat page heartbeats every 15s, so this tolerates two missed beats before
# handing control back to the receiver.
ENGAGEMENT_LEASE_SECONDS = 45

# Floor on time between receiver-driven turns. Sensors publish far faster than
# an LLM (or a windmill) can respond; without this a 10 Hz topic would mean
# 10 model calls a second.
MIN_TURN_INTERVAL_SECONDS = 5.0


def _build_ws_or_tcp_client(session_id: str) -> mqtt.Client:
    """Create a clean-session client dedicated to one session's receiver.

    Distinct from the publish-side client ids in mqtt_manager (which use the
    assistant name), so arming a receiver never disturbs an existing publish
    connection sharing the same broker.
    """
    return mqtt.Client(client_id=f"pr-recv-{session_id}", clean_session=True)


class MqttReceiverRegistry:
    """Owns one live MQTT subscription per armed session."""

    def __init__(self) -> None:
        self._clients: Dict[str, mqtt.Client] = {}
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._lock = asyncio.Lock()
        # Sessions with a turn in flight. paho delivers on its own thread and an
        # LLM turn takes seconds; without this a burst would run turns
        # concurrently on one thread and scramble conversation order.
        self._inflight: Set[str] = set()

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        """Capture the event loop that paho callbacks will hand work back to."""
        self._loop = loop

    def is_running(self, session_id: str) -> bool:
        client = self._clients.get(session_id)
        return bool(client and client.is_connected())

    # -- lifecycle ---------------------------------------------------------

    async def start(self, subscription: Dict[str, Any], assistant: Dict[str, Any]) -> bool:
        """Connect and subscribe for one armed subscription. Idempotent."""
        session_id = str(subscription["session_id"])
        topic = str(subscription["topic"])

        host = str(assistant.get("mqtt_host") or "")
        if not host:
            logger.error(f"❌ [Receiver] Assistant has no mqtt_host; cannot arm session {session_id}")
            return False

        port_raw = assistant.get("mqtt_port", 1883)
        port = int(port_raw) if isinstance(port_raw, (int, str)) else 1883
        username = str(assistant.get("mqtt_user")) if assistant.get("mqtt_user") else None
        password = str(assistant.get("mqtt_pass")) if assistant.get("mqtt_pass") else None

        async with self._lock:
            existing = self._clients.get(session_id)
            if existing and existing.is_connected():
                logger.info(f"♻️ [Receiver] Session {session_id} already listening on {topic}")
                return True
            if existing:
                self._teardown(session_id)

            client = _build_ws_or_tcp_client(session_id)
            if username:
                client.username_pw_set(username=username, password=password)

            def on_connect(_client, _userdata, _flags, rc):
                if rc == 0:
                    # Subscribe from the callback so an automatic reconnect
                    # re-subscribes too, instead of silently going deaf.
                    _client.subscribe(topic, qos=1)
                    logger.info(f"✅ [Receiver] Session {session_id} subscribed to {topic}")
                else:
                    logger.error(f"❌ [Receiver] Connect failed for session {session_id}, rc={rc}")

            def on_disconnect(_client, _userdata, rc):
                if rc != 0:
                    logger.warning(f"⚠️ [Receiver] Session {session_id} dropped (rc={rc}); paho will retry")

            def on_message(_client, _userdata, message):
                try:
                    text = message.payload.decode("utf-8", errors="replace")
                except Exception:
                    text = str(message.payload)
                logger.info(f"📨 [Receiver] {session_id} <- {message.topic}: {text[:120]}")
                if self._loop is None:
                    logger.error("❌ [Receiver] No event loop bound; dropping message")
                    return
                # paho calls this on its network thread; hop back to the loop.
                asyncio.run_coroutine_threadsafe(
                    self._handle_message(session_id, text), self._loop
                )

            client.on_connect = on_connect
            client.on_disconnect = on_disconnect
            client.on_message = on_message

            loop = asyncio.get_event_loop()

            def _connect() -> bool:
                import time

                try:
                    client.connect(host, port, keepalive=60)
                    client.loop_start()
                    # Wait for CONNACK so arming reports the truth rather than
                    # optimism -- a bad host or rejected credentials must fail
                    # the request, not sit there looking armed.
                    deadline = time.time() + 5.0
                    while not client.is_connected():
                        if time.time() > deadline:
                            logger.error(f"❌ [Receiver] CONNACK timeout from {host}:{port}")
                            client.loop_stop()
                            return False
                        time.sleep(0.1)
                    return True
                except Exception as exc:
                    logger.error(f"❌ [Receiver] Failed to connect {host}:{port} - {exc}")
                    try:
                        client.loop_stop()
                    except Exception:
                        pass
                    return False

            try:
                ok = await asyncio.wait_for(loop.run_in_executor(None, _connect), timeout=10.0)
            except asyncio.TimeoutError:
                logger.error(f"❌ [Receiver] Timeout connecting to {host}:{port}")
                ok = False

            if not ok:
                return False

            self._clients[session_id] = client
            logger.info(f"🎧 [Receiver] Session {session_id} listening on {host}:{port}/{topic}")
            return True

    def _teardown(self, session_id: str) -> None:
        """Drop a client without touching the DB. Caller holds the lock."""
        client = self._clients.pop(session_id, None)
        if not client:
            return
        try:
            client.loop_stop()
            client.disconnect()
        except Exception as exc:
            logger.warning(f"⚠️ [Receiver] Error closing client for {session_id}: {exc}")

    async def stop(self, session_id: str) -> bool:
        """Disconnect a session's receiver. Safe to call when not running."""
        async with self._lock:
            was_running = session_id in self._clients
            self._teardown(session_id)
        if was_running:
            logger.info(f"🔇 [Receiver] Session {session_id} stopped listening")
        return was_running

    async def stop_all(self) -> None:
        """Shutdown hook. Leaves DB rows armed so startup rehydrates them."""
        async with self._lock:
            for session_id in list(self._clients.keys()):
                self._teardown(session_id)
        logger.info("🔇 [Receiver] All receivers disconnected")

    async def rehydrate(self) -> int:
        """Re-arm every active subscription after a restart.

        Render redeploys on every push to main, so without this each deploy
        would silently kill listeners that the DB still claims are armed.
        """
        from .config import get_supabase_client

        try:
            supabase = get_supabase_client()
            rows = (
                supabase.table("mqtt_receiver_subscriptions")
                .select("*")
                .eq("active", True)
                .execute()
            )
        except Exception as exc:
            logger.error(f"❌ [Receiver] Rehydrate query failed: {exc}")
            return 0

        started = 0
        for subscription in rows.data or []:
            try:
                assistant = _fetch_assistant(str(subscription["assistant_id"]))
                if not assistant:
                    continue
                if await self.start(subscription, assistant):
                    started += 1
            except Exception as exc:
                logger.error(f"❌ [Receiver] Rehydrate failed for {subscription.get('session_id')}: {exc}")

        logger.info(f"🎧 [Receiver] Rehydrated {started} receiver(s) on startup")
        return started

    # -- message handling --------------------------------------------------

    async def _handle_message(self, session_id: str, message_text: str) -> None:
        """Run one incoming MQTT message through the assistant, or drop it."""
        if session_id in self._inflight:
            logger.info(f"⏭️ [Receiver] {session_id}: turn already running, dropping message")
            return

        self._inflight.add(session_id)
        try:
            await self._run_turn(session_id, message_text)
        except Exception as exc:
            logger.error(f"❌ [Receiver] Turn failed for {session_id}: {exc}", exc_info=True)
        finally:
            self._inflight.discard(session_id)

    async def _run_turn(self, session_id: str, message_text: str) -> None:
        from .chat_turn import extract_mqtt_value, load_thread_response_id, run_assistant_turn
        from .config import get_supabase_client
        from .encryption import decrypt_api_key
        from .mqtt_manager import mqtt_manager

        supabase = get_supabase_client()

        subscription = _fetch_active_subscription(session_id)
        if not subscription:
            logger.info(f"⏭️ [Receiver] {session_id}: no longer armed, stopping")
            await self.stop(session_id)
            return

        # The LLM thing being stopped disarms the receiver -- that is one of the
        # two ways this feature is meant to end.
        # limit(1) rather than maybe_single(): the rest of the codebase reads
        # this way, and maybe_single raises on an empty result in some
        # supabase-py versions.
        session = (
            supabase.table("assistant_sessions")
            .select("active")
            .eq("id", session_id)
            .limit(1)
            .execute()
        )
        if not session.data or not session.data[0].get("active"):
            logger.info(f"⏭️ [Receiver] {session_id}: session stopped, disarming")
            await self.disarm(session_id)
            return

        if _visitor_engaged(session_id):
            logger.info(f"⏸️ [Receiver] {session_id}: visitor engaged, dropping message")
            return

        last_at = subscription.get("last_message_at")
        if last_at and _seconds_since(last_at) < MIN_TURN_INTERVAL_SECONDS:
            logger.info(f"⏭️ [Receiver] {session_id}: rate limited, dropping message")
            return

        assistant = _fetch_assistant(str(subscription["assistant_id"]))
        if not assistant:
            logger.error(f"❌ [Receiver] {session_id}: assistant missing, disarming")
            await self.disarm(session_id)
            return

        encrypted_key = assistant.get("openai_key") or ""
        if not encrypted_key:
            logger.error(f"❌ [Receiver] {session_id}: assistant has no API key")
            return
        api_key = decrypt_api_key(encrypted_key)

        thread_id = str(subscription["thread_id"])
        assistant_id = str(subscription["assistant_id"])

        # Claim the rate-limit slot before the (slow) model call so a burst
        # arriving mid-turn is rejected by the interval check.
        _touch_last_message(session_id)

        previous_response_id = load_thread_response_id(session_id, thread_id)

        payload, _response_id, display_text = await run_assistant_turn(
            assistant=assistant,
            api_key=api_key,
            user_message=message_text,
            previous_response_id=previous_response_id,
            session_id=session_id,
            thread_id=thread_id,
        )

        # Publish exactly what a typed turn would put on the wire.
        mqtt_value = extract_mqtt_value(payload)
        published_value = None
        if mqtt_value is not None and assistant.get("mqtt_host") and assistant.get("mqtt_topic"):
            to_send = mqtt_value if isinstance(mqtt_value, dict) else {"value": mqtt_value}
            port_raw = assistant.get("mqtt_port", 1883)
            success = await mqtt_manager.publish(
                str(assistant["mqtt_host"]),
                int(port_raw) if isinstance(port_raw, (int, str)) else 1883,
                str(assistant["mqtt_topic"]),
                to_send,
                str(assistant.get("mqtt_user")) if assistant.get("mqtt_user") else None,
                str(assistant.get("mqtt_pass")) if assistant.get("mqtt_pass") else None,
                str(assistant.get("name") or f"assistant_{assistant_id}"),
                session_id,
            )
            if success:
                published_value = mqtt_value
            else:
                logger.warning(f"⚠️ [Receiver] {session_id}: publish failed")

        # One row per turn, same shape the chat page writes.
        try:
            supabase.table("chat_messages").insert({
                "session_id": session_id,
                "assistant_id": assistant_id,
                "assistant_name": assistant.get("name"),
                "user_text": message_text,
                "assistant_payload": payload,
                "response_text": display_text,
                "mqtt_payload": published_value,
                "device_id": None,
                "thread_id": thread_id,
                "reaction": None,
            }).execute()
            logger.info(f"💾 [Receiver] {session_id}: turn saved to thread {thread_id}")
        except Exception as exc:
            logger.error(f"❌ [Receiver] {session_id}: failed to save turn: {exc}")

    async def disarm(self, session_id: str) -> None:
        """Stop listening and mark the subscription inactive."""
        from .config import get_supabase_client

        await self.stop(session_id)
        try:
            get_supabase_client().table("mqtt_receiver_subscriptions").update(
                {"active": False, "updated_at": _now_iso()}
            ).eq("session_id", session_id).eq("active", True).execute()
        except Exception as exc:
            logger.error(f"❌ [Receiver] Failed to disarm {session_id} in DB: {exc}")


# ---------------------------------------------------------------------------
# Small DB helpers, kept module-level so the registry stays about lifecycle
# ---------------------------------------------------------------------------

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_ts(value: str) -> datetime:
    """Parse a Postgres timestamptz string into an aware datetime."""
    text = value.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(text)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _seconds_since(value: str) -> float:
    try:
        return (datetime.now(timezone.utc) - _parse_ts(value)).total_seconds()
    except Exception:
        # An unparseable timestamp must not wedge the receiver shut.
        return float("inf")


def _fetch_assistant(assistant_id: str) -> Optional[Dict[str, Any]]:
    from .config import get_supabase_client

    try:
        result = (
            get_supabase_client()
            .table("assistants")
            .select("*")
            .eq("id", assistant_id)
            .limit(1)
            .execute()
        )
        return result.data[0] if result.data else None
    except Exception as exc:
        logger.error(f"❌ [Receiver] Failed to fetch assistant {assistant_id}: {exc}")
        return None


def _fetch_active_subscription(session_id: str) -> Optional[Dict[str, Any]]:
    from .config import get_supabase_client

    try:
        result = (
            get_supabase_client()
            .table("mqtt_receiver_subscriptions")
            .select("*")
            .eq("session_id", session_id)
            .eq("active", True)
            .limit(1)
            .execute()
        )
        return result.data[0] if result.data else None
    except Exception as exc:
        logger.error(f"❌ [Receiver] Failed to fetch subscription {session_id}: {exc}")
        return None


def _touch_last_message(session_id: str) -> None:
    from .config import get_supabase_client

    try:
        get_supabase_client().table("mqtt_receiver_subscriptions").update(
            {"last_message_at": _now_iso(), "updated_at": _now_iso()}
        ).eq("session_id", session_id).eq("active", True).execute()
    except Exception as exc:
        logger.warning(f"⚠️ [Receiver] Failed to touch last_message_at for {session_id}: {exc}")


def _visitor_engaged(session_id: str) -> bool:
    """True while a visitor's heartbeat is fresh enough to hold the lease.

    Fails open: if this check errors, the receiver keeps working. The opposite
    default would let a database hiccup silence the installation indefinitely.
    """
    from .config import get_supabase_client

    cutoff = (datetime.now(timezone.utc) - timedelta(seconds=ENGAGEMENT_LEASE_SECONDS)).isoformat()
    try:
        result = (
            get_supabase_client()
            .table("session_activity")
            .select("device_id")
            .eq("session_id", session_id)
            .gt("last_seen", cutoff)
            .limit(1)
            .execute()
        )
        return bool(result.data)
    except Exception as exc:
        logger.warning(f"⚠️ [Receiver] Lease check failed for {session_id}, assuming free: {exc}")
        return False


# Global singleton, mirroring mqtt_manager.
mqtt_receiver = MqttReceiverRegistry()
