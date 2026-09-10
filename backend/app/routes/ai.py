"""AI operations endpoints (OpenAI, transcription)."""

from __future__ import annotations

import asyncio
import io
import logging
import random
import uuid
from typing import Any, Dict, Optional, Tuple

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse, StreamingResponse
from openai import OpenAI
from pydantic import BaseModel

from ..chat_turn import run_assistant_turn
from ..conversation_service import run_model_turn, transcribe_blob
from ..mqtt_utils import publish_payload, test_mqtt_connection
from ..security import get_current_user_email, maybe_current_user_id
from .. import voice_message_store
from .analysis import require_admin

ACK_PHRASES = [
    "Got it, give me a second.",
    "Sure, let me think about that.",
    "On it!",
    "Let me check that for you.",
    "Got your message, just a moment.",
    "Roger that, processing now.",
    "One second!",
    "Understood, working on it.",
]

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ai", tags=["ai"])


class ChatRequest(BaseModel):
    """Request to chat with OpenAI."""
    previous_response_id: str | None = None  # OpenAI Responses API context ID
    user_message: str
    assistant_id: str  # ID of the assistant to get config from database
    session_id: str | None = None  # Session ID for persisting response_id
    thread_id: str | None = None  # Thread ID for isolating conversation context per user/device


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


class TTSRequest(BaseModel):
    """Request to convert text to speech."""
    text: str
    voice: str = "alloy"  # alloy, echo, fable, onyx, nova, shimmer
    assistant_id: str
    model: str = "tts-1"  # tts-1 (faster) or tts-1-hd (higher quality)


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
        from ..config import get_supabase_client
        from ..encryption import decrypt_api_key
        
        supabase = get_supabase_client()
        
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
        
        # Skip ownership verification - allow any authenticated or anonymous user to use shared assistants
        # The session share_token is validated on the frontend, so if they have access to the session,
        # they should be able to use the assistant
        # Only the assistant owner can modify the assistant, but anyone with the session link can chat
        logger.info(f"✅ [Backend] Allowing access to assistant {request.assistant_id} for user {user_id or 'anonymous'}")
        
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
        
        # Run the turn and persist the thread's response_id. Shared with the
        # headless MQTT receiver so both paths keep conversation state the same way.
        logger.info("🤖 [Backend] Calling run_assistant_turn...")

        payload, response_id, display_text = await run_assistant_turn(
            assistant=assistant,
            api_key=api_key,
            user_message=request.user_message,
            previous_response_id=request.previous_response_id,
            session_id=request.session_id,
            thread_id=request.thread_id,
        )

        logger.info(f"✅ [Backend] run_assistant_turn completed: payload={payload}, response_id={response_id}")
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
        from ..config import get_supabase_client
        from ..encryption import decrypt_api_key
        
        supabase = get_supabase_client()
        
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
        
        # Use assistant name as MQTT client ID
        assistant_name = str(assistant.get("name", "")) or f"assistant_{request.assistant_id}"

        logger.info(f"🤖 [Backend] Assistant Name (MQTT client ID): {assistant_name}")
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
            assistant_name=assistant_name,
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


class MqttDisconnectRequest(BaseModel):
    """Request to disconnect MQTT connections for a session."""
    session_id: str


class MqttDisconnectResponse(BaseModel):
    """Response from MQTT disconnect operation."""
    success: bool
    connections_closed: int


@router.post("/mqtt/disconnect", response_model=MqttDisconnectResponse)
async def disconnect_mqtt(
    request: MqttDisconnectRequest,
    user_id: str | None = Depends(maybe_current_user_id),
):
    """
    Disconnect MQTT connections for a specific session.
    Called when stopping an LLM thing to clean up connections.
    """
    logger.info(f"🔌 [Backend] /ai/mqtt/disconnect endpoint called for session {request.session_id}")
    try:
        from ..mqtt_manager import mqtt_manager
        connections_closed = await mqtt_manager.disconnect_session_connections(request.session_id)
        return MqttDisconnectResponse(
            success=True,
            connections_closed=connections_closed
        )
    except Exception as exc:
        logger.error(f"MQTT disconnect failed: {exc}")
        return MqttDisconnectResponse(success=False, connections_closed=0)


# ---------------------------------------------------------------------------
# Persistent MQTT receiver (admin only)
#
# Arms a server-side subscription that outlives the browser tab. Admin-gated
# because it spends OpenAI credit unattended, and because admins are already
# the role that sits outside the chat queue.
# ---------------------------------------------------------------------------

class ReceiverSubscribeRequest(BaseModel):
    """Request to arm a persistent receiver for a session."""
    session_id: str
    assistant_id: str
    thread_id: str  # the admin's own thread, so turns land in their conversation
    topic: str


class ReceiverUnsubscribeRequest(BaseModel):
    """Request to disarm a session's persistent receiver."""
    session_id: str


class ReceiverStatusResponse(BaseModel):
    """Current state of a session's persistent receiver."""
    armed: bool           # a subscription row is active
    running: bool         # the backend actually holds a live MQTT connection
    paused: bool          # armed, but a visitor currently holds the lease
    topic: str | None = None
    thread_id: str | None = None
    last_message_at: str | None = None


@router.post("/mqtt/receiver/subscribe", response_model=ReceiverStatusResponse)
async def subscribe_receiver(
    request: ReceiverSubscribeRequest,
    admin_email: str = Depends(require_admin),
):
    """Arm a persistent MQTT receiver for a session."""
    from ..config import get_supabase_client
    from ..mqtt_receiver import mqtt_receiver

    logger.info(f"🎧 [Backend] Arming receiver for session {request.session_id} by {admin_email}")

    supabase = get_supabase_client()
    assistant, _api_key = await _get_assistant_and_key(request.assistant_id)

    # One armed receiver per session: retire any previous row before inserting,
    # so re-arming with a new topic replaces rather than collides with the
    # partial unique index.
    supabase.table("mqtt_receiver_subscriptions").update(
        {"active": False}
    ).eq("session_id", request.session_id).eq("active", True).execute()
    await mqtt_receiver.stop(request.session_id)

    inserted = supabase.table("mqtt_receiver_subscriptions").insert({
        "session_id": request.session_id,
        "assistant_id": request.assistant_id,
        "thread_id": request.thread_id,
        "topic": request.topic,
        "active": True,
        "created_by": admin_email,
    }).execute()

    subscription = inserted.data[0] if inserted.data else None
    if not subscription:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create receiver subscription",
        )

    started = await mqtt_receiver.start(subscription, assistant)
    if not started:
        # Don't leave a row claiming to be armed when the broker refused us.
        supabase.table("mqtt_receiver_subscriptions").update(
            {"active": False}
        ).eq("id", subscription["id"]).execute()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not connect to the MQTT broker",
        )

    return ReceiverStatusResponse(
        armed=True,
        running=True,
        paused=False,
        topic=request.topic,
        thread_id=request.thread_id,
    )


@router.post("/mqtt/receiver/unsubscribe", response_model=ReceiverStatusResponse)
async def unsubscribe_receiver(
    request: ReceiverUnsubscribeRequest,
    admin_email: str = Depends(require_admin),
):
    """Disarm a session's persistent receiver."""
    from ..mqtt_receiver import mqtt_receiver

    logger.info(f"🔇 [Backend] Disarming receiver for session {request.session_id} by {admin_email}")
    await mqtt_receiver.disarm(request.session_id)
    return ReceiverStatusResponse(armed=False, running=False, paused=False)


@router.get("/mqtt/receiver/status/{session_id}", response_model=ReceiverStatusResponse)
async def receiver_status(
    session_id: str,
    admin_email: str = Depends(require_admin),
):
    """Report whether a session's receiver is armed, live, and currently paused."""
    from ..mqtt_receiver import _fetch_active_subscription, _visitor_engaged, mqtt_receiver

    subscription = _fetch_active_subscription(session_id)
    if not subscription:
        return ReceiverStatusResponse(armed=False, running=False, paused=False)

    return ReceiverStatusResponse(
        armed=True,
        running=mqtt_receiver.is_running(session_id),
        paused=_visitor_engaged(session_id),
        topic=subscription.get("topic"),
        thread_id=subscription.get("thread_id"),
        last_message_at=subscription.get("last_message_at"),
    )


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
        from ..config import get_supabase_client
        from ..encryption import decrypt_api_key
        
        supabase = get_supabase_client()
        
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
        
        # Skip ownership verification - allow any authenticated or anonymous user to use shared assistants
        # The session share_token is validated on the frontend, so if they have access to the session,
        # they should be able to use the assistant for transcription
        logger.info(f"✅ [Backend] Allowing transcription access to assistant {assistant_id} for user {user_id or 'anonymous'}")
        
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


@router.post("/tts")
async def text_to_speech(
    request: TTSRequest,
    user_id: str | None = Depends(maybe_current_user_id),
):
    """
    Convert text to speech using OpenAI TTS API.
    Returns audio as streaming response (mp3 format).
    Allows anonymous access.
    """
    logger.info("🔊 [Backend] /ai/tts endpoint called")
    logger.info(f"📝 [Backend] Text length: {len(request.text)} characters")
    logger.info(f"🎙️ [Backend] Voice: {request.voice}, Model: {request.model}")
    logger.info(f"🔑 [Backend] User ID: {user_id} (anonymous: {user_id is None})")
    logger.info(f"🆔 [Backend] Assistant ID: {request.assistant_id}")

    # Validate voice
    valid_voices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"]
    if request.voice not in valid_voices:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid voice. Must be one of: {', '.join(valid_voices)}"
        )

    # Validate model
    valid_models = ["tts-1", "tts-1-hd"]
    if request.model not in valid_models:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid model. Must be one of: {', '.join(valid_models)}"
        )

    try:
        # Import here to avoid circular dependency
        from openai import OpenAI
        from fastapi.responses import StreamingResponse
        import io
        from ..config import get_supabase_client
        from ..encryption import decrypt_api_key

        supabase = get_supabase_client()

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

        logger.info(f"✅ [Backend] Allowing TTS access to assistant {request.assistant_id} for user {user_id or 'anonymous'}")

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

        logger.info(f"🔑 [Backend] API key retrieved and decrypted successfully")

        # Call OpenAI TTS API
        client = OpenAI(api_key=api_key)
        logger.info("🎵 [Backend] Calling OpenAI TTS API...")

        tts_response = client.audio.speech.create(
            model=request.model,
            voice=request.voice,  # type: ignore
            input=request.text,
        )

        # Get the audio content
        audio_content = tts_response.content
        logger.info(f"✅ [Backend] TTS successful, audio size: {len(audio_content)} bytes")

        # Return as streaming response
        return StreamingResponse(
            io.BytesIO(audio_content),
            media_type="audio/mpeg",
            headers={
                "Content-Disposition": "inline; filename=speech.mp3"
            }
        )

    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"❌ [Backend] TTS failed: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Text-to-speech failed: {str(exc)}"
        )


class MqttCredentialsResponse(BaseModel):
    """Response containing MQTT credentials for WebSocket connection."""
    mqtt_host: str | None = None
    mqtt_port: int = 1883
    mqtt_user: str | None = None
    mqtt_pass: str | None = None
    mqtt_topic: str | None = None


@router.get("/mqtt/credentials/{assistant_id}", response_model=MqttCredentialsResponse)
async def get_mqtt_credentials(
    assistant_id: str,
    user_id: str | None = Depends(maybe_current_user_id),
):
    """
    Get MQTT credentials for an assistant to use for WebSocket connection in browser.
    Allows anonymous access (for shared sessions).
    """
    logger.info("🔌 [Backend] /ai/mqtt/credentials endpoint called")
    logger.info(f"🆔 [Backend] Assistant ID: {assistant_id}")
    logger.info(f"🔑 [Backend] User ID: {user_id} (anonymous: {user_id is None})")

    try:
        from ..config import get_supabase_client

        supabase = get_supabase_client()

        # Fetch assistant configuration
        logger.info(f"🔍 [Backend] Fetching MQTT config for {assistant_id}")
        response = supabase.table("assistants").select(
            "mqtt_host, mqtt_port, mqtt_user, mqtt_pass, mqtt_topic"
        ).eq("id", assistant_id).execute()

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

        mqtt_host = assistant.get("mqtt_host")
        mqtt_port = assistant.get("mqtt_port", 1883)
        mqtt_user = assistant.get("mqtt_user")
        mqtt_pass = assistant.get("mqtt_pass")
        mqtt_topic = assistant.get("mqtt_topic")

        logger.info(f"✅ [Backend] MQTT config retrieved: host={mqtt_host}, port={mqtt_port}, topic={mqtt_topic}")

        return MqttCredentialsResponse(
            mqtt_host=mqtt_host,
            mqtt_port=mqtt_port if mqtt_port else 1883,
            mqtt_user=mqtt_user,
            mqtt_pass=mqtt_pass,
            mqtt_topic=mqtt_topic,
        )

    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"❌ [Backend] Failed to get MQTT credentials: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get MQTT credentials: {str(exc)}"
        )


# ---------------------------------------------------------------------------
# Shared helper: fetch assistant row + decrypt API key
# ---------------------------------------------------------------------------

async def _get_assistant_and_key(assistant_id: str) -> Tuple[dict, str]:
    """Fetch the assistant config from Supabase and return (assistant_dict, api_key).

    Raises HTTPException on any failure so callers don't need to repeat error handling.
    """
    from ..config import get_supabase_client
    from ..encryption import decrypt_api_key

    supabase = get_supabase_client()
    response = supabase.table("assistants").select("*").eq("id", assistant_id).execute()

    if not response.data or len(response.data) == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assistant not found")

    assistant = response.data[0]
    if not isinstance(assistant, dict):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Invalid assistant data",
        )

    encrypted_key = assistant.get("openai_key", "")
    if not encrypted_key or not isinstance(encrypted_key, str):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="API key not configured for this assistant",
        )

    try:
        api_key = decrypt_api_key(encrypted_key)
    except Exception as exc:
        logger.error(f"❌ [Backend] Failed to decrypt API key: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to decrypt API key",
        )

    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="API key not configured for this assistant",
        )

    return assistant, api_key


# ---------------------------------------------------------------------------
# Background processing function for voice messages
# ---------------------------------------------------------------------------

async def _process_voice_message(
    message_id: str,
    audio_bytes: bytes,
    api_key: str,
    prompt_instruction: str,
    json_schema: Optional[dict],
    previous_response_id: Optional[str],
) -> None:
    """Background task: transcribe -> chat -> store result."""
    try:
        logger.info(f"🎤 [VoiceMsg] Starting background processing for {message_id}")

        transcript = await transcribe_blob(audio_bytes, api_key)
        if not transcript:
            raise ValueError("Transcription returned empty text")

        logger.info(f"📝 [VoiceMsg] Transcript: {transcript[:100]}")

        payload, response_id, display_text = await run_model_turn(
            previous_response_id,
            transcript,
            api_key,
            prompt_instruction,
            json_schema,
            model="gpt-4o-mini",
        )

        logger.info(f"✅ [VoiceMsg] Processing complete for {message_id}")

        voice_message_store.update_entry(
            message_id,
            status="ready",
            transcript=transcript,
            response_text=display_text,
            response_payload=payload,
            response_id=response_id,
        )
    except Exception as exc:
        logger.error(f"❌ [VoiceMsg] Background processing failed for {message_id}: {exc}", exc_info=True)
        voice_message_store.update_entry(
            message_id,
            status="error",
            error=str(exc),
        )


# ---------------------------------------------------------------------------
# POST /ai/voice-message
# ---------------------------------------------------------------------------

@router.post("/voice-message")
async def send_voice_message(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    assistant_id: str = Form(...),
    session_id: Optional[str] = Form(None),
    thread_id: Optional[str] = Form(None),
    previous_response_id: Optional[str] = Form(None),
    voice: str = Form("alloy"),
    user_id: Optional[str] = Depends(maybe_current_user_id),
):
    """
    Accept a recorded audio blob, return an acknowledgement TTS mp3 immediately
    (in the response body), and kick off background processing.

    The X-Voice-Message-ID response header carries the job ID that the frontend
    should poll via GET /ai/voice-message/{message_id}/result.
    """
    logger.info(f"🎙️ [Backend] /ai/voice-message called — assistant={assistant_id}")

    try:
        assistant, api_key = await _get_assistant_and_key(assistant_id)

        audio_bytes = await file.read()
        logger.info(f"📊 [Backend] Audio bytes received: {len(audio_bytes)}")

        # Pick a random acknowledgement phrase
        ack_text = random.choice(ACK_PHRASES)
        logger.info(f"💬 [Backend] Ack phrase: {ack_text}")

        # Create the voice message store entry
        message_id = str(uuid.uuid4())
        voice_message_store.create_entry(message_id)
        logger.info(f"📦 [Backend] Created voice message store entry: {message_id}")

        # Extract assistant config to pass into background task
        prompt_instruction_raw = assistant.get("prompt_instruction", "You are a helpful assistant.")
        prompt_instruction = str(prompt_instruction_raw) if prompt_instruction_raw else "You are a helpful assistant."
        json_schema_raw = assistant.get("json_schema")
        json_schema = json_schema_raw if isinstance(json_schema_raw, dict) else None

        # Schedule background processing
        background_tasks.add_task(
            _process_voice_message,
            message_id,
            audio_bytes,
            api_key,
            prompt_instruction,
            json_schema,
            previous_response_id,
        )

        logger.info(f"✅ [Backend] Returning ack JSON for {message_id}")
        return JSONResponse(
            content={"message_id": message_id, "ack_text": ack_text},
        )

    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"❌ [Backend] voice-message failed: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Voice message processing failed: {str(exc)}",
        )


def _synthesize_tts_sync(api_key: str, text: str, voice: str) -> bytes:
    """Synchronous TTS call — run inside asyncio.to_thread."""
    client = OpenAI(api_key=api_key)
    response = client.audio.speech.create(model="tts-1", voice=voice, input=text)  # type: ignore[arg-type]
    return response.content


# ---------------------------------------------------------------------------
# GET /ai/voice-message/{message_id}/result
# ---------------------------------------------------------------------------

@router.get("/voice-message/{message_id}/result")
async def get_voice_message_result(
    message_id: str,
    user_id: Optional[str] = Depends(maybe_current_user_id),
):
    """
    Poll for the result of a background voice message processing job.
    Returns the entry dict: { status, transcript, response_text, response_payload, response_id, error }.
    """
    voice_message_store.cleanup_expired()
    entry = voice_message_store.get_entry(message_id)
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Voice message not found or expired",
        )
    return entry
