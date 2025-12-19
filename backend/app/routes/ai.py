"""AI operations endpoints (OpenAI, transcription)."""

from __future__ import annotations

import logging
from typing import Any, Dict

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel

from ..conversation_service import run_model_turn, transcribe_blob
from ..mqtt_utils import publish_payload, test_mqtt_connection
from ..security import get_current_user_id, maybe_current_user_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ai", tags=["ai"])


class ChatRequest(BaseModel):
    """Request to chat with OpenAI."""
    previous_response_id: str | None = None
    user_message: str
    assistant_config: Dict[str, Any]  # Contains prompt_instruction, json_schema, api_key


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
    Call OpenAI API with the provided configuration.
    Frontend is responsible for storing the response in Supabase.
    """
    logger.info("🚀 [Backend] /ai/chat endpoint called")
    logger.info(f"📝 [Backend] User message: {request.user_message}")
    logger.info(f"🔑 [Backend] User ID: {user_id}")
    logger.info(f"⚙️ [Backend] Assistant config keys: {list(request.assistant_config.keys())}")
    logger.info(f"📋 [Backend] Prompt instruction: {request.assistant_config.get('prompt_instruction', 'N/A')[:50]}...")
    logger.info(f"📊 [Backend] JSON schema type: {type(request.assistant_config.get('json_schema'))}")
    logger.info(f"📊 [Backend] JSON schema value: {request.assistant_config.get('json_schema')}")
    logger.info(f"🔑 [Backend] API key present: {bool(request.assistant_config.get('api_key'))}")
    
    try:
        # Extract API key from config
        api_key = request.assistant_config.get("api_key", "")
        if not api_key:
            logger.error("❌ [Backend] No API key provided in assistant_config")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="API key is required in assistant_config"
            )
        
        logger.info("🤖 [Backend] Calling run_model_turn...")
        payload, response_id = await run_model_turn(
            request.previous_response_id,
            request.user_message,
            api_key,
            request.assistant_config.get("prompt_instruction", "You are a helpful assistant."),
            request.assistant_config.get("json_schema")
        )
        logger.info(f"✅ [Backend] run_model_turn completed: payload={payload}, response_id={response_id}")
        
        response = ChatResponse(payload=payload, response_id=response_id)
        logger.info(f"📤 [Backend] Sending response back to frontend")
        return response
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
    This is a server-side operation since browsers cannot connect to MQTT directly.
    """
    try:
        success = await publish_payload(
            host=request.host,
            port=request.port,
            topic=request.topic,
            payload=request.payload,
            username=request.username,
            password=request.password,
        )
        return MqttResponse(
            success=success,
            message="Published successfully" if success else "Failed to publish"
        )
    except Exception as exc:
        logger.error(f"MQTT publish failed: {exc}")
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
    user_id: str | None = Depends(maybe_current_user_id),
):
    """
    Transcribe audio file using OpenAI Whisper API.
    """
    try:
        audio_bytes = await file.read()
        text = await transcribe_blob(audio_bytes)
        if not text:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unable to transcribe audio"
            )
        return TranscriptionResponse(text=text)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Transcription failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Transcription failed: {str(exc)}"
        )
