"""Wrapper utilities around the legacy conversation helpers."""

from __future__ import annotations

import logging
import json
from typing import Optional, Tuple, Dict, Any, cast
from openai import AsyncOpenAI
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


async def run_model_turn(
    previous_response_id: Optional[str],
    user_message: str,
    api_key: str,
    prompt_instruction: str = "You are a helpful assistant.",
    json_schema: Optional[Dict[str, Any]] = None,
    conversation_history: Optional[list[dict[str, str]]] = None
) -> Tuple[Optional[Dict[str, Any]], Optional[str], Optional[str]]:
    """
    Call OpenAI API to generate a response.
    
    Args:
        previous_response_id: ID of the previous response (for conversation continuity)
        user_message: The user's message
        api_key: OpenAI API key
        prompt_instruction: System prompt for the assistant
        json_schema: Optional JSON schema for structured output
        conversation_history: Optional list of previous messages in the conversation
        
    Returns:
        Tuple of (payload dict, response_id string, display_text string)
    """
    logger.info("🔧 [ConversationService] run_model_turn called")
    logger.info(f"📝 [ConversationService] previous_response_id: {previous_response_id}")
    logger.info(f"💬 [ConversationService] user_message: {user_message}")
    logger.info(f"📋 [ConversationService] prompt_instruction: {prompt_instruction[:50]}...")
    logger.info(f"🔑 [ConversationService] API key present: {bool(api_key)}")
    logger.info(f"📊 [ConversationService] JSON schema provided: {bool(json_schema)}")
    logger.info(f"📜 [ConversationService] Conversation history provided: {bool(conversation_history)}")
    if conversation_history:
        logger.info(f"📜 [ConversationService] Conversation history length: {len(conversation_history)}")
    
    if not api_key:
        logger.error("❌ [ConversationService] No API key provided")
        raise ValueError("OpenAI API key is required")
    
    try:
        # Initialize OpenAI client with explicit http_client to avoid proxy issues
        import httpx
        http_client = httpx.AsyncClient()
        client = AsyncOpenAI(api_key=api_key, http_client=http_client)
        
        # Build messages for the conversation
        messages: list[ChatCompletionMessageParam] = [
            {"role": "system", "content": prompt_instruction}
        ]
        
        # Add conversation history if provided
        if conversation_history:
            for msg in conversation_history:
                if msg.get("role") in ["user", "assistant"] and msg.get("content"):
                    messages.append({
                        "role": msg["role"],  # type: ignore
                        "content": msg["content"]
                    })
        
        # Add the current user message
        messages.append({"role": "user", "content": user_message})
        
        logger.info("🤖 [ConversationService] Calling OpenAI API...")
        
        # Make the API call
        if json_schema and isinstance(json_schema, dict) and json_schema.get("type") == "object":
            # Use structured output if schema is provided
            logger.info("📊 [ConversationService] Using structured output with JSON schema")
            logger.info(f"📊 [ConversationService] Schema details: {json_schema}")
            
            # Use non-strict mode to let OpenAI handle the schema validation
            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=messages,
                response_format={
                    "type": "json_schema",
                    "json_schema": {
                        "name": "assistant_response",
                        "strict": False,  # Non-strict mode is more flexible
                        "schema": json_schema
                    }
                }
            )
        else:
            # Regular text response
            if json_schema:
                logger.warning(f"⚠️ [ConversationService] Invalid JSON schema provided (type: {type(json_schema)}, value: {json_schema}), falling back to regular text response")
            else:
                logger.info("💬 [ConversationService] No JSON schema provided, using regular text response")
            
            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=messages
            )
        
        # Extract the response
        assistant_message = response.choices[0].message.content
        response_id = response.id
        
        logger.info(f"✅ [ConversationService] OpenAI response received, ID: {response_id}")
        if assistant_message:
            logger.info(f"📝 [ConversationService] Response preview: {assistant_message[:100]}...")
        else:
            logger.info(f"📝 [ConversationService] Response preview: None...")
        
        # Parse the response into a payload
        if json_schema and assistant_message:
            try:
                payload = json.loads(assistant_message)
                logger.info("✅ [ConversationService] Successfully parsed JSON response")
                logger.info(f"📦 [ConversationService] Parsed payload: {payload}")
            except json.JSONDecodeError as e:
                logger.warning(f"⚠️ [ConversationService] Failed to parse JSON response: {e}")
                logger.warning(f"📝 [ConversationService] Raw assistant_message: {assistant_message}")
                payload = {"response": assistant_message}
        else:
            logger.info(f"💬 [ConversationService] No JSON schema or no assistant message, wrapping in response object")
            logger.info(f"📊 [ConversationService] json_schema present: {bool(json_schema)}")
            logger.info(f"📝 [ConversationService] assistant_message present: {bool(assistant_message)}")
            payload = {"response": assistant_message}
        
        # Extract display text from the payload
        display_text = extract_display_text_from_payload(payload)
        logger.info(f"📝 [ConversationService] Extracted display text: {display_text[:100] if display_text else 'None'}...")
        logger.info(f"📤 [ConversationService] Final payload being returned: {payload}")
        
        return payload, response_id, display_text
        
    except Exception as e:
        logger.error(f"❌ [ConversationService] Error calling OpenAI API: {e}", exc_info=True)
        raise


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
