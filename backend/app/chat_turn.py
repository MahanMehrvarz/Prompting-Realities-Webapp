"""One assistant turn, shared by the HTTP chat route and the headless MQTT receiver.

Both entry points must produce identical conversation state -- same model call,
same ``_response_id_marker`` bookkeeping -- so they run through here rather than
keeping two copies that drift apart.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional, Tuple

from .conversation_service import run_model_turn

logger = logging.getLogger(__name__)

# Conversation context is threaded through OpenAI's Responses API via
# previous_response_id. The id for a thread is parked on a marker row in
# chat_messages: user_text IS NULL and assistant_payload holds only
# {"_response_id_marker": ...}. The chat UI filters these rows out of the
# transcript (see the displayableRecords filter in the chat page).
RESPONSE_ID_MARKER_KEY = "_response_id_marker"


def load_thread_response_id(session_id: str, thread_id: str) -> Optional[str]:
    """Return the last OpenAI response_id for a thread, or None if it has none.

    The browser reads this marker itself on page load; the headless receiver has
    no localStorage and no page load, so it resolves the thread's context here.
    """
    from .config import get_supabase_client

    try:
        supabase = get_supabase_client()
        result = (
            supabase.table("chat_messages")
            .select("assistant_payload")
            .eq("session_id", session_id)
            .eq("thread_id", thread_id)
            .is_("user_text", None)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        if result.data:
            marker = result.data[0].get("assistant_payload")
            if isinstance(marker, dict) and RESPONSE_ID_MARKER_KEY in marker:
                return marker[RESPONSE_ID_MARKER_KEY]
    except Exception as exc:
        logger.warning(f"⚠️ [ChatTurn] Failed to load response_id for thread {thread_id}: {exc}")
    return None


def _persist_response_id(
    *,
    session_id: str,
    assistant_id: str,
    assistant_name: Optional[str],
    thread_id: str,
    response_id: str,
) -> None:
    """Upsert the thread's response_id marker row.

    Best-effort: a failure here costs conversation continuity on the next turn,
    which is not worth failing the turn the user just got a reply for.
    """
    from .config import get_supabase_client

    try:
        supabase = get_supabase_client()
        existing_marker = (
            supabase.table("chat_messages")
            .select("id")
            .eq("session_id", session_id)
            .eq("thread_id", thread_id)
            .is_("user_text", None)
            .limit(1)
            .execute()
        )

        if existing_marker.data and len(existing_marker.data) > 0:
            marker_record = existing_marker.data[0]
            if isinstance(marker_record, dict):
                marker_id = marker_record.get("id")
                if marker_id:
                    supabase.table("chat_messages").update({
                        "assistant_payload": {RESPONSE_ID_MARKER_KEY: response_id},
                        "assistant_name": assistant_name,
                    }).eq("id", marker_id).execute()
                    logger.info(f"💾 [ChatTurn] Updated response_id {response_id} for thread {thread_id}")
        else:
            supabase.table("chat_messages").insert({
                "session_id": session_id,
                "assistant_id": assistant_id,
                "assistant_name": assistant_name,
                "thread_id": thread_id,
                "user_text": None,
                "assistant_payload": {RESPONSE_ID_MARKER_KEY: response_id},
                "response_text": None,
                "mqtt_payload": None,
                "device_id": None,
            }).execute()
            logger.info(f"💾 [ChatTurn] Inserted response_id {response_id} for thread {thread_id}")
    except Exception as exc:
        logger.warning(f"⚠️ [ChatTurn] Failed to save response_id: {exc}")


async def run_assistant_turn(
    *,
    assistant: Dict[str, Any],
    api_key: str,
    user_message: str,
    previous_response_id: Optional[str],
    session_id: Optional[str],
    thread_id: Optional[str],
    model: str = "gpt-4o-mini",
) -> Tuple[Optional[Dict[str, Any]], Optional[str], Optional[str]]:
    """Run one model turn and persist the thread's response_id.

    Returns ``(payload, response_id, display_text)``.
    """
    prompt_instruction_raw = assistant.get("prompt_instruction", "You are a helpful assistant.")
    prompt_instruction = str(prompt_instruction_raw) if prompt_instruction_raw else "You are a helpful assistant."

    json_schema_raw = assistant.get("json_schema")
    json_schema = json_schema_raw if isinstance(json_schema_raw, dict) else None

    logger.info(f"📋 [ChatTurn] Prompt instruction: {prompt_instruction[:50]}...")
    logger.info(f"📊 [ChatTurn] JSON schema present: {json_schema is not None}")

    payload, response_id, display_text = await run_model_turn(
        previous_response_id,
        user_message,
        api_key,
        prompt_instruction,
        json_schema,
        model=model,
    )

    if session_id and thread_id and response_id:
        _persist_response_id(
            session_id=session_id,
            assistant_id=str(assistant.get("id")),
            assistant_name=assistant.get("name"),
            thread_id=thread_id,
            response_id=response_id,
        )

    return payload, response_id, display_text


def extract_mqtt_value(payload: Optional[Dict[str, Any]]) -> Optional[Any]:
    """Pull the publishable value out of a model payload.

    Mirrors the precedence the chat page uses before calling /ai/mqtt/publish
    (MQTT_value, then MQTT_values, then values, then the whole payload) so a
    receiver-driven turn puts the same thing on the wire as a typed one.
    """
    if not payload:
        return None
    for key in ("MQTT_value", "MQTT_values", "values"):
        value = payload.get(key)
        if value is not None:
            return value
    return payload
