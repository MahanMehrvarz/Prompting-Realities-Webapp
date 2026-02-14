"""Wrapper utilities around the legacy conversation helpers."""

from __future__ import annotations

import logging
import json
import asyncio
from typing import Optional, Tuple, Dict, Any, cast
from openai import AsyncOpenAI, OpenAI
from openai.types.chat import ChatCompletionMessageParam

logger = logging.getLogger(__name__)


def extract_display_text_from_payload(payload: Optional[Dict[str, Any]]) -> Optional[str]:
    """
    Extract displayable text from a JSON payload.
    
    This function handles various JSON schema formats by:
    1. Looking for common text fields (answer, response, text, content, message)
    2. Filtering out null values
    3. Providing a clean fallback for unknown schemas
    
    Args:
        payload: The JSON payload from the AI response
        
    Returns:
        Extracted text or None if no suitable text found
    """
    if not payload or not isinstance(payload, dict):
        return None
    
    # Try common field names for the actual response text
    common_fields = ["answer", "response", "text", "content", "message"]
    
    for field in common_fields:
        value = payload.get(field)
        if value is not None and isinstance(value, str) and value.strip():
            return value.strip()
    
    # If no common field found, create a formatted representation
    # Filter out null values and empty strings for cleaner display
    filtered_payload = {
        k: v for k, v in payload.items() 
        if v is not None and v != ""
    }
    
    # If we have any non-null values, format them nicely
    if filtered_payload:
        # Try to create a human-readable format
        text_parts = []
        for key, value in filtered_payload.items():
            if isinstance(value, (str, int, float, bool)):
                text_parts.append(f"{key}: {value}")
            elif isinstance(value, (dict, list)):
                text_parts.append(f"{key}: {json.dumps(value)}")
        
        if text_parts:
            return "\n".join(text_parts)
    
    # Last resort: return the full JSON as formatted string
    return json.dumps(payload, indent=2)


def _extract_assistant_text(response: Any) -> str:
    """Flatten the Responses API output into a raw text/JSON string.

    The Responses API returns a different structure than Chat Completions.
    This extracts the text content from the nested output structure.
    """
    chunks: list[str] = []
    for item in getattr(response, "output", []):
        if getattr(item, "type", None) != "message":
            continue
        for content in getattr(item, "content", []):
            if getattr(content, "type", None) == "output_text":
                text = getattr(content, "text", "")
                if text:
                    chunks.append(text)
    return "".join(chunks).strip()


async def run_model_turn(
    previous_response_id: Optional[str],
    user_message: str,
    api_key: str,
    prompt_instruction: str = "You are a helpful assistant.",
    json_schema: Optional[Dict[str, Any]] = None,
    model: str = "gpt-5-mini",
) -> Tuple[Optional[Dict[str, Any]], Optional[str], Optional[str]]:
    """
    Call OpenAI API to generate a response using Responses API.
    
    Args:
        previous_response_id: ID of the previous response (for conversation continuity)
        user_message: The user's message
        api_key: OpenAI API key
        prompt_instruction: System prompt for the assistant
        json_schema: Optional JSON schema for structured output
        model: Model to use (default: gpt-4o-mini)
        
    Returns:
        Tuple of (payload dict, response_id string, display_text string)
    """
    logger.info("🔧 [ConversationService] run_model_turn called")
    logger.info(f"📝 [ConversationService] previous_response_id: {previous_response_id}")
    logger.info(f"💬 [ConversationService] user_message: {user_message}")
    logger.info(f"📋 [ConversationService] prompt_instruction: {prompt_instruction[:50]}...")
    logger.info(f"🔑 [ConversationService] API key present: {bool(api_key)}")
    logger.info(f"📊 [ConversationService] JSON schema provided: {bool(json_schema)}")
    logger.info(f"🤖 [ConversationService] Model: {model}")
    
    if not api_key:
        logger.error("❌ [ConversationService] No API key provided")
        raise ValueError("OpenAI API key is required")
    
    try:
        # Initialize sync OpenAI client (responses.create uses sync API)
        sync_client = OpenAI(api_key=api_key)

        # Build input for Responses API
        request_input = [
            {
                "role": "user",
                "content": [{"type": "input_text", "text": user_message}],
            }
        ]

        # Build optional kwargs
        kwargs: Dict[str, Any] = {}

        # Pass previous_response_id if we have conversation context
        if previous_response_id:
            kwargs["previous_response_id"] = previous_response_id
            logger.info(f"📜 [ConversationService] Using previous_response_id: {previous_response_id}")

        # Pass system instructions
        if prompt_instruction:
            kwargs["instructions"] = prompt_instruction

        # Configure JSON schema output format if provided
        if json_schema and isinstance(json_schema, dict):
            logger.info("📊 [ConversationService] Using structured output with JSON schema")
            
            # Check if this is a wrapped schema (has name, strict, schema keys) or a direct schema
            if "schema" in json_schema and "name" in json_schema:
                # This is already a wrapped schema format from the database
                schema_name = json_schema.get("name", "assistant_response")
                # Validate and sanitize the schema name to match OpenAI's pattern ^[a-zA-Z0-9_-]+$
                # Remove any characters that don't match the pattern
                import re
                schema_name = re.sub(r'[^a-zA-Z0-9_-]', '_', schema_name)
                if not schema_name:
                    schema_name = "assistant_response"
                strict_mode = json_schema.get("strict", True)
                actual_schema = json_schema.get("schema", {})
                logger.info(f"📊 [ConversationService] Using wrapped schema format: name={schema_name}, strict={strict_mode}")
            else:
                # This is a direct schema, wrap it
                schema_name = "assistant_response"
                strict_mode = True
                actual_schema = json_schema
                logger.info(f"📊 [ConversationService] Using direct schema format, wrapping with strict={strict_mode}")
            
            kwargs["text"] = {
                "format": {
                    "type": "json_schema",
                    "name": schema_name,
                    "schema": actual_schema,
                    "strict": strict_mode,
                }
            }

        logger.info("🤖 [ConversationService] Calling OpenAI Responses API...")

        # Make the API call (wrap sync call in asyncio.to_thread)
        response = await asyncio.to_thread(
            sync_client.responses.create,
            model=model,
            input=request_input,
            **kwargs,
        )

        # Extract response text using helper
        assistant_text = _extract_assistant_text(response)
        response_id = getattr(response, "id", None)

        logger.info(f"✅ [ConversationService] Response received, ID: {response_id}")
        if assistant_text:
            logger.info(f"📝 [ConversationService] Response preview: {assistant_text[:100]}...")

        # Parse JSON if schema was provided
        if json_schema and assistant_text:
            try:
                payload = json.loads(assistant_text)
                logger.info("✅ [ConversationService] Successfully parsed JSON response")
            except json.JSONDecodeError as e:
                logger.warning(f"⚠️ [ConversationService] Failed to parse JSON: {e}")
                payload = {"response": assistant_text}
        else:
            payload = {"response": assistant_text}

        # Extract display text
        display_text = extract_display_text_from_payload(payload)

        return payload, response_id, display_text

    except Exception as e:
        logger.error(f"❌ [ConversationService] Error calling OpenAI API: {e}", exc_info=True)
        # On error, return the same previous_response_id so frontend can retry
        return (
            {"response": "An error occurred while processing your request"},
            previous_response_id,  # Return same ID on error for retry
            "An error occurred while processing your request",
        )


async def transcribe_blob(audio_bytes: bytes, api_key: str) -> Optional[str]:
    """
    Transcribe audio using OpenAI Whisper API.
    
    Args:
        audio_bytes: Audio file bytes
        api_key: OpenAI API key
        
    Returns:
        Transcribed text or None if transcription fails
    """
    logger.info("🔧 [ConversationService] transcribe_blob called")
    logger.info(f"📊 [ConversationService] audio_bytes length: {len(audio_bytes)}")
    logger.info(f"🔑 [ConversationService] API key present: {bool(api_key)}")
    
    if not api_key:
        logger.error("❌ [ConversationService] No API key provided for transcription")
        raise ValueError("OpenAI API key is required for transcription")
    
    if not audio_bytes:
        logger.error("❌ [ConversationService] No audio data provided")
        raise ValueError("Audio data is required")
    
    try:
        # Initialize OpenAI client with explicit http_client to avoid proxy issues
        import httpx
        http_client = httpx.AsyncClient()
        client = AsyncOpenAI(api_key=api_key, http_client=http_client)
        
        # Create a file-like object from bytes
        from io import BytesIO
        audio_file = BytesIO(audio_bytes)
        audio_file.name = "audio.webm"  # Give it a name with extension
        
        logger.info("🎤 [ConversationService] Calling OpenAI Whisper API...")
        
        # Call Whisper API
        transcription = await client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
            language="en"
        )
        
        text = transcription.text
        logger.info(f"✅ [ConversationService] Transcription successful: {text[:100]}...")
        
        return text
        
    except Exception as e:
        logger.error(f"❌ [ConversationService] Transcription failed: {e}", exc_info=True)
        raise
