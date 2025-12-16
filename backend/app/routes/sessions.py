"""Assistant session + chat endpoints."""

from __future__ import annotations

import json
import logging
from typing import Optional

import secrets

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status, Query
from sqlalchemy.orm import Session

from .. import models, schemas
from ..conversation_service import run_model_turn, transcribe_blob
from ..database import get_db
from ..mqtt_utils import publish_payload, test_mqtt_connection
from ..security import get_current_user, maybe_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/sessions", tags=["sessions"])


def _get_session(
    db: Session,
    session_id: int,
    user: models.User | None,
    session_token: str | None = None,
) -> models.AssistantSession:
    session = (
        db.query(models.AssistantSession)
        .join(models.Assistant)
        .filter(
            models.AssistantSession.id == session_id,
        )
        .first()
    )
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if user and session.assistant.user_id == user.id:
        return session
    if session_token and session.share_token == session_token:
        return session
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authorized for this session")


@router.post("/start/{assistant_id}", response_model=schemas.SessionOut)
async def start_session(
    assistant_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    assistant = (
        db.query(models.Assistant)
        .filter(models.Assistant.id == assistant_id, models.Assistant.user_id == user.id)
        .first()
    )
    if not assistant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assistant not found")

    # Test MQTT connection when starting session
    mqtt_connected = await test_mqtt_connection(
        host=assistant.mqtt_host,
        port=assistant.mqtt_port,
        username=assistant.mqtt_user,
        password=assistant.mqtt_pass,
    )

    session = models.AssistantSession(
        assistant_id=assistant.id,
        status="running",
        mqtt_connected=mqtt_connected,
        share_token=secrets.token_urlsafe(16),
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.post("/{session_id}/stop", response_model=schemas.SessionOut)
def stop_session(
    session_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    session = _get_session(db, session_id, user)
    session.status = "idle"
    session.active = False
    db.commit()
    db.refresh(session)
    return session


@router.post("/{session_id}/reset", response_model=schemas.SessionOut)
async def reset_conversation(
    session_id: int,
    session_token: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: models.User | None = Depends(maybe_current_user),
):
    """Reset the conversation thread without deleting chat history.

    This creates a new thread ID and clears the last_response_id to start
    a fresh conversation context while keeping all existing messages in the database.
    """
    session = _get_session(db, session_id, user, session_token)

    # Reset the conversation thread by creating a new thread ID and clearing response ID
    session.current_thread_id = secrets.token_urlsafe(16)
    session.last_response_id = None
    db.commit()
    db.refresh(session)

    logger.info(f"Conversation reset for session {session_id} - new thread {session.current_thread_id}")
    return session


@router.get("/{session_id}/messages", response_model=list[schemas.MessageOut])
def get_messages(
    session_id: int,
    session_token: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: models.User | None = Depends(maybe_current_user),
):
    session = _get_session(db, session_id, user, session_token)
    # Return only messages for the current conversation thread
    return (
        db.query(models.ChatMessage)
        .filter(
            models.ChatMessage.session_id == session.id,
            models.ChatMessage.thread_id == session.current_thread_id
        )
        .order_by(models.ChatMessage.created_at)
        .all()
    )


@router.get("/{session_id}/mqtt-log", response_model=list[schemas.MqttLogOut])
def get_mqtt_log(
    session_id: int,
    session_token: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: models.User | None = Depends(maybe_current_user),
):
    session = _get_session(db, session_id, user, session_token)
    messages = (
        db.query(models.ChatMessage)
        .filter(
            models.ChatMessage.session_id == session.id,
            models.ChatMessage.role == "assistant",
            models.ChatMessage.value_json.isnot(None),
        )
        .order_by(models.ChatMessage.created_at)
        .all()
    )
    log_entries: list[schemas.MqttLogOut] = []
    for message in messages:
        if not message.value_json:
            continue
        try:
            payload = json.loads(message.value_json)
        except Exception:  # pragma: no cover - defensive
            continue
        if not isinstance(payload, dict) or not payload:
            continue
        log_entries.append(
            schemas.MqttLogOut(id=message.id, payload=payload, created_at=message.created_at)
        )
    return log_entries


@router.post("/{session_id}/messages", response_model=schemas.MessageOut)
async def send_message(
    session_id: int,
    payload: schemas.SendMessageRequest,
    session_token: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: models.User | None = Depends(maybe_current_user),
):
    session = _get_session(db, session_id, user, session_token)
    if not session.active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Session is not running")

    user_message = models.ChatMessage(
        session_id=session.id,
        assistant_id=session.assistant_id,
        thread_id=session.current_thread_id,
        role="user",
        user_text=payload.text,
    )
    db.add(user_message)
    db.commit()
    db.refresh(user_message)

    assistant_payload, new_response_id = await run_model_turn(session.last_response_id, payload.text)
    session.last_response_id = new_response_id
    db.commit()

    logger.info(f"Assistant payload received: {assistant_payload}")

    response_text = assistant_payload.get("response", "")
    # Extract value_content - check "values" (plural) first as per schema, then "value" (singular)
    if "values" in assistant_payload:
        value_content = assistant_payload["values"]
    elif "value" in assistant_payload:
        value_content = assistant_payload["value"]
    else:
        value_content = {}

    logger.info(f"Extracted value_content: {value_content}")

    assistant_record = models.ChatMessage(
        session_id=session.id,
        assistant_id=session.assistant_id,
        thread_id=session.current_thread_id,
        role="assistant",
        assistant_payload=json.dumps(assistant_payload),
        response_text=response_text,
        value_json=json.dumps(value_content),
    )
    db.add(assistant_record)
    db.commit()
    db.refresh(assistant_record)

    assistant = session.assistant
    # Always attempt to publish if we have value_content, even if it's an empty dict
    # The schema requires "values" to be present, so we should always try to publish
    if "values" in assistant_payload or "value" in assistant_payload:
        logger.info(f"Publishing to MQTT: {assistant.mqtt_host}:{assistant.mqtt_port}/{assistant.mqtt_topic}")
        mqtt_success = await publish_payload(
            host=assistant.mqtt_host,
            port=assistant.mqtt_port,
            topic=assistant.mqtt_topic,
            payload=value_content,
            username=assistant.mqtt_user,
            password=assistant.mqtt_pass,
        )

        logger.info(f"MQTT publish result: {mqtt_success}")

        # Update MQTT connection status based on publish result
        session.mqtt_connected = mqtt_success
        db.commit()
    else:
        logger.warning("No value/values field in assistant payload - skipping MQTT publish")

    return assistant_record


@router.post("/{session_id}/transcribe", response_model=schemas.TranscriptionOut)
async def transcribe_audio_route(
    session_id: int,
    file: UploadFile = File(...),
    session_token: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: models.User | None = Depends(maybe_current_user),
):
    _get_session(db, session_id, user, session_token)  # ensure access
    audio_bytes = await file.read()
    text = await transcribe_blob(audio_bytes)
    if not text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unable to transcribe audio")
    return schemas.TranscriptionOut(text=text)
