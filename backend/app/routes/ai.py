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
    previous_response_id: str | None = None  # OpenAI Responses API context ID
    user_message: str
    assistant_id: str  # ID of the assistant to get config from database
    session_id: str | None = None  # Session ID for persisting response_id


class ChatResponse(BaseModel):
    """Response from OpenAI chat."""
    payload: Dict[str, Any] | None
    response_id: str | None
    display_text: str | None


class MqttPublishRequest(BaseModel):
    """Request to publish to MQTT broker."""
    assistant_id: str  # Fetch MQTT config from database
    payload: Dict[str, Any]
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
    user_id: str | None = Depends(maybe_current_user_id),
):
    """
    Call OpenAI API - fetches assistant config and API key from database.
    Frontend is responsible for storing the response in Supabase.
    Allows anonymous access (user_id can be None).
    """
    logger.info("🚀 [Backend] /ai/chat endpoint called")
    logger.info(f"📝 [Backend] User message: {request.user_message}")
    logger.info(f"🔑 [Backend] User ID: {user_id} (anonymous: {user_id is None})")
    logger.info(f"🆔 [Backend] Assistant ID: {request.assistant_id}")
    
    try:
        # Import here to avoid circular dependency
        from supabase import create_client
        from ..config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
        from ..encryption import decrypt_api_key
        
        if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Supabase configuration is missing"
            )
        
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
        if not isinstance(assistant, dict):
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Invalid assistant data"
            )
        
        # Skip ownership verification for anonymous users
        # Anonymous users can use any assistant (you may want to add additional checks here)
        if user_id and assistant.get("supabase_user_id") != user_id:
            logger.error(f"❌ [Backend] User {user_id} does not own assistant {request.assistant_id}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have permission to use this assistant"
            )
        
        # Decrypt the API key
        encrypted_key = assistant.get("openai_key", "")
        if not encrypted_key or not isinstance(encrypted_key, str):
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
        prompt_instruction_raw = assistant.get("prompt_instruction", "You are a helpful assistant.")
        prompt_instruction = str(prompt_instruction_raw) if prompt_instruction_raw else "You are a helpful assistant."
        
        json_schema_raw = assistant.get("json_schema")
        json_schema = json_schema_raw if isinstance(json_schema_raw, dict) else None
        
        logger.info(f"📋 [Backend] Prompt instruction: {prompt_instruction[:50]}...")
        logger.info(f"📊 [Backend] JSON schema present: {json_schema is not None}")
        logger.info("🤖 [Backend] Calling run_model_turn...")
        
        payload, response_id, display_text = await run_model_turn(
            request.previous_response_id,
            request.user_message,
            api_key,
            prompt_instruction,
            json_schema,
            model="gpt-4o-mini",  # Or fetch from assistant config if you add model column
        )
        
        # Persist the response_id in the session for conversation continuity
        if request.session_id and response_id:
            try:
                supabase.table("assistant_sessions").update({
                    "last_response_id": response_id
                }).eq("id", request.session_id).execute()
                logger.info(f"💾 [Backend] Saved response_id {response_id} to session {request.session_id}")
            except Exception as e:
                logger.warning(f"⚠️ [Backend] Failed to save response_id: {e}")
        
        logger.info(f"✅ [Backend] run_model_turn completed: payload={payload}, response_id={response_id}")
        logger.info(f"📝 [Backend] Display text extracted: {display_text[:100] if display_text else 'None'}...")
        
        response = ChatResponse(payload=payload, response_id=response_id, display_text=display_text)
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
    user_id: str | None = Depends(maybe_current_user_id),
):
    """
    Publish a payload to an MQTT broker.
    Fetches MQTT configuration from the database using assistant_id.
    This is a server-side operation since browsers cannot connect to MQTT directly.
    Allows anonymous access.
    """
    logger.info("📡 [Backend] /ai/mqtt/publish endpoint called")
    logger.info(f"🔑 [Backend] User ID: {user_id} (anonymous: {user_id is None})")
    logger.info(f"🆔 [Backend] Assistant ID: {request.assistant_id}")
    logger.info(f"🆔 [Backend] Session ID: {request.session_id}")
    logger.info(f"📦 [Backend] Payload: {request.payload}")
    
    try:
        # Import here to avoid circular dependency
        from supabase import create_client
        from ..config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
        from ..encryption import decrypt_api_key
        
        if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Supabase configuration is missing"
            )
        
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
        if not isinstance(assistant, dict):
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Invalid assistant data"
            )
        
        # Extract MQTT configuration with type casting
        mqtt_host = str(assistant.get("mqtt_host", "")) if assistant.get("mqtt_host") else None
        mqtt_port_raw = assistant.get("mqtt_port", 1883)
        mqtt_port = int(mqtt_port_raw) if isinstance(mqtt_port_raw, (int, str)) else 1883
        mqtt_topic = str(assistant.get("mqtt_topic", "")) if assistant.get("mqtt_topic") else None
        mqtt_user = str(assistant.get("mqtt_user")) if assistant.get("mqtt_user") else None
        mqtt_pass = str(assistant.get("mqtt_pass")) if assistant.get("mqtt_pass") else None
        
        if not mqtt_host or not mqtt_topic:
            logger.error(f"❌ [Backend] MQTT configuration incomplete for assistant {request.assistant_id}")
            return MqttResponse(
                success=False,
                message="MQTT configuration is incomplete (missing host or topic)"
            )
        
        # Get user email if authenticated, otherwise use "anonymous"
        user_email = "anonymous"
        if user_id:
            try:
                user_response = supabase.auth.admin.get_user_by_id(user_id)
                if user_response and user_response.user:
                    user_email = user_response.user.email or "anonymous"
            except Exception as e:
                logger.warning(f"Failed to get user email: {e}")
        
        logger.info(f"📧 [Backend] User Email: {user_email}")
        logger.info(f"🌐 [Backend] MQTT Host: {mqtt_host}:{mqtt_port}")
        logger.info(f"📋 [Backend] MQTT Topic: {mqtt_topic}")
        logger.info(f"👤 [Backend] MQTT Username: {mqtt_user}")
        logger.info(f"🔐 [Backend] MQTT Password present: {bool(mqtt_pass)}")
        
        logger.info("🚀 [Backend] Calling publish_payload...")
        success = await publish_payload(
            host=mqtt_host,
            port=mqtt_port,
            topic=mqtt_topic,
            payload=request.payload,
            username=mqtt_user,
            password=mqtt_pass,
            user_email=user_email,
            session_id=request.session_id,
        )
        logger.info(f"✅ [Backend] publish_payload completed: success={success}")
        
        return MqttResponse(
            success=success,
            message="Published successfully" if success else "Failed to publish"
        )
    except HTTPException:
        raise
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
    assistant_id: str = Form(...),
    user_id: str | None = Depends(maybe_current_user_id),
):
    """
    Transcribe audio file using OpenAI Whisper API.
    Fetches assistant config and API key from database (like chat endpoint).
    Allows anonymous access.
    """
    logger.info("🎤 [Backend] /ai/transcribe endpoint called")
    logger.info(f"📁 [Backend] File: {file.filename}, Content-Type: {file.content_type}")
    logger.info(f"🔑 [Backend] User ID: {user_id} (anonymous: {user_id is None})")
    logger.info(f"🆔 [Backend] Assistant ID: {assistant_id}")
    
    try:
        # Import here to avoid circular dependency
        from supabase import create_client
        from ..config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
        from ..encryption import decrypt_api_key
        
        if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Supabase configuration is missing"
            )
        
        # Initialize Supabase client
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        
        # Fetch assistant configuration from database
        logger.info(f"🔍 [Backend] Fetching assistant configuration for {assistant_id}")
        response = supabase.table("assistants").select("*").eq("id", assistant_id).execute()
        
        if not response.data or len(response.data) == 0:
            logger.error(f"❌ [Backend] Assistant {assistant_id} not found")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Assistant not found"
            )
        
        assistant = response.data[0]
        if not isinstance(assistant, dict):
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Invalid assistant data"
            )
        
        # Skip ownership verification for anonymous users
        if user_id and assistant.get("supabase_user_id") != user_id:
            logger.error(f"❌ [Backend] User {user_id} does not own assistant {assistant_id}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have permission to use this assistant"
            )
        
        # Decrypt the API key
        encrypted_key = assistant.get("openai_key", "")
        if not encrypted_key or not isinstance(encrypted_key, str):
            logger.error(f"❌ [Backend] No API key found for assistant {assistant_id}")
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
            logger.error(f"❌ [Backend] Decrypted API key is empty for assistant {assistant_id}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="API key not configured for this assistant"
            )
        
        logger.info(f"🔑 [Backend] API key retrieved and decrypted successfully")
        
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
