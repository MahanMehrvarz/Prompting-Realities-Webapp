"""Wrapper utilities around the legacy conversation helpers."""

from __future__ import annotations

from typing import Optional, Tuple

from conversation_client import conversation_response, transcribe_audio


async def run_model_turn(previous_response_id: Optional[str], user_message: str):
    """Proxy to the original conversation workflow."""
    payload, new_response_id = await conversation_response(previous_response_id, user_message)
    return payload, new_response_id


async def transcribe_blob(audio_bytes: bytes) -> Optional[str]:
    return await transcribe_audio(audio_bytes)
