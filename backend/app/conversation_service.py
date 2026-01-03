"""Wrapper utilities around the legacy conversation helpers."""

from __future__ import annotations

import logging
import json
from typing import Optional, Tuple, Dict, Any
from openai import AsyncOpenAI

logger = logging.getLogger(__name__)


async def run_model_turn(
    previous_response_id: Optional[str],
    user_message: str,
    api_key: str,
    prompt_instruction: str = "You are a helpful assistant.",
    json_schema: Optional[Dict[str, Any]] = None
) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """
    Call OpenAI API to generate a response.
    
    Args:
        previous_response_id: ID of the previous response (for conversation continuity)
        user_message: The user's message
        api_key: OpenAI API key
        prompt_instruction: System prompt for the assistant
        json_schema: Optional JSON schema for structured output
        
    Returns:
        Tuple of (payload dict, response_id string)
    """
    logger.info("🔧 [ConversationService] run_model_turn called")
    logger.info(f"📝 [ConversationService] previous_response_id: {previous_response_id}")
    logger.info(f"💬 [ConversationService] user_message: {user_message}")
    logger.info(f"📋 [ConversationService] prompt_instruction: {prompt_instruction[:50]}...")
    logger.info(f"🔑 [ConversationService] API key present: {bool(api_key)}")
    logger.info(f"📊 [ConversationService] JSON schema provided: {bool(json_schema)}")
    
    if not api_key:
        logger.error("❌ [ConversationService] No API key provided")
        raise ValueError("OpenAI API key is required")
    
    try:
        # Initialize OpenAI client
        client = AsyncOpenAI(api_key=api_key)
        
        # Build messages for the conversation
        messages = [
            {"role": "system", "content": prompt_instruction},
            {"role": "user", "content": user_message}
        ]
        
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
        logger.info(f"📝 [ConversationService] Response preview: {assistant_message[:100] if assistant_message else 'None'}...")
        
        # Parse the response into a payload
        if json_schema and assistant_message:
            try:
                payload = json.loads(assistant_message)
                logger.info("✅ [ConversationService] Successfully parsed JSON response")
            except json.JSONDecodeError as e:
                logger.warning(f"⚠️ [ConversationService] Failed to parse JSON response: {e}")
                payload = {"response": assistant_message}
        else:
            payload = {"response": assistant_message}
        
        return payload, response_id
        
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
        # Initialize OpenAI client
        client = AsyncOpenAI(api_key=api_key)
        
        # Create a file-like object from bytes
        from io import BytesIO
        audio_file = BytesIO(audio_bytes)
        audio_file.name = "audio.webm"  # Give it a name with extension
        
        logger.info("🎤 [ConversationService] Calling OpenAI Whisper API...")
        
        # Call Whisper API
        transcription = await client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file
        )
        
        text = transcription.text
        logger.info(f"✅ [ConversationService] Transcription successful: {text[:100]}...")
        
        return text
        
    except Exception as e:
        logger.error(f"❌ [ConversationService] Transcription failed: {e}", exc_info=True)
        raise
