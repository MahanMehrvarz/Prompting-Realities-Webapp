"""AI operations endpoints (OpenAI, transcription)."""

from __future__ import annotations

import logging
from typing import Any, Dict

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel

from ..conversation_service import run_model_turn, transcribe_blob
from ..mqtt_utils import publish_payload, test_mqtt_connection
from ..security import get_current_user_id, get_current_user_email, maybe_current_user_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ai", tags=["ai"])


class ChatRequest(BaseModel):
    """Request to chat with OpenAI."""
    previous_response_id: str | None = None
    user_message: str
    assistant_id: str  # ID of the assistant to get config from database


class ChatResponse(BaseModel):
    """Response from OpenAI chat."""
    payload: Dict[str, Any] | None
    response_id: str | None


class MqttPublishRequest(BaseModel):
    """Request to publish to MQTT broker."""
    host: str
    port: int
    topic: str
    payload: Dict[str, Any]
    username: str | None = None
    password: str | None = None
    session_id: str | None = None


class MqttTestRequest(BaseModel):
    """Request to test MQTT connection."""
    host: str
    port: int
    username: str | None = None
    password: str | None = None


class MqttResponse(BaseModel):
    """Response from MQTT operation."""
    success: bool
    message: str | None = None


class TranscriptionResponse(BaseModel):
    """Response from audio transcription."""
    text: str


@router.post("/chat", response_model=ChatResponse)
async def chat_with_openai(
    request: ChatRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Call OpenAI API - fetches assistant config and API key from database.
    Frontend is responsible for storing the response in Supabase.
    """
    logger.info("🚀 [Backend] /ai/chat endpoint called")
    logger.info(f"📝 [Backend] User message: {request.user_message}")
    logger.info(f"🔑 [Backend] User ID: {user_id}")
    logger.info(f"🆔 [Backend] Assistant ID: {request.assistant_id}")
    
    try:
        # Import here to avoid circular dependency
        from supabase import create_client
        from ..config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
        from ..encryption import decrypt_api_key
        
        # Initialize Supabase client
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        
        # Fetch assistant configuration from database
        logger.info(f"🔍 [Backend] Fetching assistant configuration for {request.assistant_id}")
        response = supabase.table("assistants").select("*").eq("id", request.assistant_id).execute()
        
        if not response.data or len(response.data) == 0:
            logger.error(f"❌ [Backend] Assistant {request.assistant_id} not found")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Assistant not found"
            )
        
        assistant = response.data[0]
        
        # Verify the assistant belongs to the user
        if assistant["supabase_user_id"] != user_id:
            logger.error(f"❌ [Backend] User {user_id} does not own assistant {request.assistant_id}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have permission to use this assistant"
            )
        
        # Decrypt the API key
        encrypted_key = assistant.get("openai_key", "")
        if not encrypted_key:
            logger.error(f"❌ [Backend] No API key found for assistant {request.assistant_id}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="API key not configured for this assistant"
            )
        
        try:
            api_key = decrypt_api_key(encrypted_key)
        except Exception as decrypt_error:
            logger.error(f"❌ [Backend] Failed to decrypt API key: {decrypt_error}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to decrypt API key"
            )
        
        if not api_key:
            logger.error(f"❌ [Backend] Decrypted API key is empty for assistant {request.assistant_id}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="API key not configured for this assistant"
            )
        
        # Extract configuration
        prompt_instruction = assistant.get("prompt_instruction", "You are a helpful assistant.")
        json_schema = assistant.get("json_schema")
        
        logger.info(f"📋 [Backend] Prompt instruction: {prompt_instruction[:50]}...")
        logger.info(f"📊 [Backend] JSON schema present: {json_schema is not None}")
        logger.info("🤖 [Backend] Calling run_model_turn...")
        
        payload, response_id = await run_model_turn(
            request.previous_response_id,
            request.user_message,
            api_key,
            prompt_instruction,
            json_schema
        )
        logger.info(f"✅ [Backend] run_model_turn completed: payload={payload}, response_id={response_id}")
        
        response = ChatResponse(payload=payload, response_id=response_id)
        logger.info(f"📤 [Backend] Sending response back to frontend")
        return response
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"❌ [Backend] OpenAI chat failed: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get response from OpenAI: {str(exc)}"
        )


@router.post("/mqtt/publish", response_model=MqttResponse)
async def publish_to_mqtt(
    request: MqttPublishRequest,
    user_email: str = Depends(get_current_user_email),
):
    """
    Publish a payload to an MQTT broker.
    This is a server-side operation since browsers cannot connect to MQTT directly.
    """
    logger.info("📡 [Backend] /ai/mqtt/publish endpoint called")
    logger.info(f"📧 [Backend] User Email: {user_email}")
    logger.info(f"🆔 [Backend] Session ID: {request.session_id}")
    logger.info(f"🌐 [Backend] MQTT Host: {request.host}:{request.port}")
    logger.info(f"📋 [Backend] MQTT Topic: {request.topic}")
    logger.info(f"📦 [Backend] Payload: {request.payload}")
    logger.info(f"👤 [Backend] Username: {request.username}")
    logger.info(f"🔐 [Backend] Password present: {bool(request.password)}")
    
    try:
        logger.info("🚀 [Backend] Calling publish_payload...")
        success = await publish_payload(
            host=request.host,
            port=request.port,
            topic=request.topic,
            payload=request.payload,
            username=request.username,
            password=request.password,
            user_email=user_email,
            session_id=request.session_id,
        )
        logger.info(f"✅ [Backend] publish_payload completed: success={success}")
        
        return MqttResponse(
            success=success,
            message="Published successfully" if success else "Failed to publish"
        )
    except Exception as exc:
        logger.error(f"❌ [Backend] MQTT publish failed: {exc}", exc_info=True)
        return MqttResponse(success=False, message=str(exc))


@router.post("/mqtt/test", response_model=MqttResponse)
async def test_mqtt(
    request: MqttTestRequest,
    user_id: str | None = Depends(maybe_current_user_id),
):
    """
    Test connection to an MQTT broker without publishing.
    """
    try:
        success = await test_mqtt_connection(
            host=request.host,
            port=request.port,
            username=request.username,
            password=request.password,
        )
        return MqttResponse(
            success=success,
            message="Connection successful" if success else "Connection failed"
        )
    except Exception as exc:
        logger.error(f"MQTT test failed: {exc}")
        return MqttResponse(success=False, message=str(exc))


@router.post("/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio(
    file: UploadFile = File(...),
    api_key: str = Form(...),
    user_id: str | None = Depends(maybe_current_user_id),
):
    """
    Transcribe audio file using OpenAI Whisper API.
    Requires api_key to be sent as form data.
    """
    logger.info("🎤 [Backend] /ai/transcribe endpoint called")
    logger.info(f"📁 [Backend] File: {file.filename}, Content-Type: {file.content_type}")
    logger.info(f"🔑 [Backend] API key present: {bool(api_key)}")
    logger.info(f"👤 [Backend] User ID: {user_id}")
    
    try:
        if not api_key:
            logger.error("❌ [Backend] No API key provided")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="API key is required for transcription"
            )
        
        audio_bytes = await file.read()
        logger.info(f"📊 [Backend] Audio bytes read: {len(audio_bytes)} bytes")
        
        text = await transcribe_blob(audio_bytes, api_key)
        if text:
            logger.info(f"✅ [Backend] Transcription successful: {text[:100]}...")
        else:
            logger.info(f"✅ [Backend] Transcription successful but empty")
        
        if not text:
            logger.error("❌ [Backend] Transcription returned empty text")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unable to transcribe audio"
            )
        return TranscriptionResponse(text=text)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"❌ [Backend] Transcription failed: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Transcription failed: {str(exc)}"
        )
