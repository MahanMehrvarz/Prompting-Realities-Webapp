"""Assistant CRUD endpoints."""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..security import get_current_user

router = APIRouter(prefix="/assistants", tags=["assistants"])


@router.get("/", response_model=list[schemas.AssistantOut])
def list_assistants(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    assistants = (
        db.query(models.Assistant)
        .filter(models.Assistant.user_id == user.id)
        .all()
    )
    for assistant in assistants:
        latest_session = (
            db.query(models.AssistantSession)
            .filter(models.AssistantSession.assistant_id == assistant.id)
            .order_by(models.AssistantSession.created_at.desc())
            .first()
        )
        setattr(assistant, "latest_session_id", latest_session.id if latest_session else None)
        setattr(assistant, "latest_share_token", latest_session.share_token if latest_session else None)
    return assistants


@router.post("/", response_model=schemas.AssistantOut, status_code=status.HTTP_201_CREATED)
def create_assistant(
    payload: schemas.AssistantCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    assistant = models.Assistant(
        user_id=user.id,
        **payload.dict(),
    )
    db.add(assistant)
    db.commit()
    db.refresh(assistant)
    return assistant


@router.patch("/{assistant_id}", response_model=schemas.AssistantOut)
def update_assistant(
    assistant_id: int,
    payload: schemas.AssistantUpdate,
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

    for field, value in payload.dict(exclude_unset=True).items():
        setattr(assistant, field, value)
    db.commit()
    db.refresh(assistant)
    return assistant


@router.delete("/{assistant_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_assistant(
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
    db.delete(assistant)
    db.commit()


def _get_user_assistant(db: Session, assistant_id: int, user: models.User) -> models.Assistant:
    assistant = (
        db.query(models.Assistant)
        .filter(models.Assistant.id == assistant_id, models.Assistant.user_id == user.id)
        .first()
    )
    if not assistant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assistant not found")
    return assistant


@router.get("/{assistant_id}/messages", response_model=list[schemas.MessageOut])
def assistant_messages(
    assistant_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    assistant = _get_user_assistant(db, assistant_id, user)
    return (
        db.query(models.ChatMessage)
        .filter(models.ChatMessage.assistant_id == assistant.id)
        .order_by(models.ChatMessage.created_at)
        .all()
    )


@router.get("/{assistant_id}/mqtt-log", response_model=list[schemas.MqttLogOut])
def assistant_mqtt_log(
    assistant_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    assistant = _get_user_assistant(db, assistant_id, user)
    messages = (
        db.query(models.ChatMessage)
        .filter(
            models.ChatMessage.assistant_id == assistant.id,
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
        except Exception:
            continue
        if not isinstance(payload, dict) or not payload:
            continue
        log_entries.append(
            schemas.MqttLogOut(id=message.id, payload=payload, created_at=message.created_at)
        )
    return log_entries
