"""Pydantic schemas for request/response bodies."""

from __future__ import annotations

import datetime as dt
from typing import Any, Optional

from pydantic import BaseModel, EmailStr, Field


class UserBase(BaseModel):
    email: EmailStr


class UserCreate(UserBase):
    password: str = Field(min_length=6, max_length=72)


class UserOut(UserBase):
    id: int
    created_at: dt.datetime

    class Config:
        from_attributes = True


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class AssistantBase(BaseModel):
    name: str
    prompt_instruction: str = ""
    json_schema: str = ""
    mqtt_host: str
    mqtt_port: int = 1883
    mqtt_user: Optional[str] = None
    mqtt_pass: Optional[str] = None
    mqtt_topic: str
    api_key: Optional[str] = None


class AssistantCreate(AssistantBase):
    pass


class AssistantUpdate(BaseModel):
    name: Optional[str] = None
    prompt_instruction: Optional[str] = None
    json_schema: Optional[str] = None
    mqtt_host: Optional[str] = None
    mqtt_port: Optional[int] = None
    mqtt_user: Optional[str] = None
    mqtt_pass: Optional[str] = None
    mqtt_topic: Optional[str] = None
    api_key: Optional[str] = None


class AssistantOut(AssistantBase):
    id: int
    created_at: dt.datetime
    updated_at: dt.datetime
    latest_session_id: Optional[int] = None
    latest_share_token: Optional[str] = None

    class Config:
        from_attributes = True


class SessionOut(BaseModel):
    id: int
    assistant_id: int
    status: str
    mqtt_connected: bool
    active: bool
    share_token: str
    created_at: dt.datetime

    class Config:
        from_attributes = True


class MessageOut(BaseModel):
    id: int
    role: str
    user_text: Optional[str]
    response_text: Optional[str]
    value_json: Optional[str]
    assistant_payload: Optional[str]
    created_at: dt.datetime

    class Config:
        from_attributes = True


class MqttLogOut(BaseModel):
    id: int
    payload: dict[str, Any]
    created_at: dt.datetime

    class Config:
        from_attributes = True


class SendMessageRequest(BaseModel):
    text: str


class TranscriptionOut(BaseModel):
    text: str
