"""Database models."""

from __future__ import annotations

import datetime as dt
import uuid

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from .database import Base


def utcnow() -> dt.datetime:
    return dt.datetime.utcnow().replace(tzinfo=dt.timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    assistants = relationship("Assistant", back_populates="owner", cascade="all, delete")
    tokens = relationship("AuthToken", back_populates="user", cascade="all, delete")


class AuthToken(Base):
    __tablename__ = "auth_tokens"

    id = Column(Integer, primary_key=True)
    token = Column(String(255), unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="tokens")


class Assistant(Base):
    __tablename__ = "assistants"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    prompt_instruction = Column(Text, default="", nullable=False)
    json_schema = Column(Text, default="", nullable=False)
    mqtt_host = Column(String(255), nullable=False)
    mqtt_port = Column(Integer, default=1883, nullable=False)
    mqtt_user = Column(String(255), nullable=True)
    mqtt_pass = Column(String(255), nullable=True)
    mqtt_topic = Column(String(255), nullable=False)
    api_key = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    owner = relationship("User", back_populates="assistants")
    sessions = relationship("AssistantSession", back_populates="assistant", cascade="all, delete")


class AssistantSession(Base):
    __tablename__ = "assistant_sessions"

    id = Column(Integer, primary_key=True)
    assistant_id = Column(Integer, ForeignKey("assistants.id", ondelete="CASCADE"), nullable=False)
    status = Column(String(32), default="running", nullable=False)
    mqtt_connected = Column(Boolean, default=False, nullable=False)
    active = Column(Boolean, default=True, nullable=False)
    last_response_id = Column(String(255), nullable=True)
    current_thread_id = Column(String(255), nullable=False, default=lambda: str(uuid.uuid4()))
    share_token = Column(String(255), unique=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    assistant = relationship("Assistant", back_populates="sessions")
    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete")


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    __table_args__ = (UniqueConstraint("session_id", "id"),)

    id = Column(Integer, primary_key=True)
    session_id = Column(Integer, ForeignKey("assistant_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    assistant_id = Column(Integer, ForeignKey("assistants.id", ondelete="CASCADE"), nullable=False, index=True)
    thread_id = Column(String(255), nullable=False, index=True)
    role = Column(String(16), nullable=False)  # "user" or "assistant"
    user_text = Column(Text, nullable=True)
    assistant_payload = Column(Text, nullable=True)
    response_text = Column(Text, nullable=True)
    value_json = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    session = relationship("AssistantSession", back_populates="messages")
