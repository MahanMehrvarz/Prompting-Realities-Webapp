"""Authentication helpers (password hashing + bearer tokens)."""

from __future__ import annotations

import datetime as dt
import secrets

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from .config import ACCESS_TOKEN_EXPIRE_MINUTES
from .database import get_db
from . import models

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return pwd_context.verify(password, hashed)


def create_token(db: Session, user: models.User) -> models.AuthToken:
    token_value = secrets.token_urlsafe(32)
    expires_at = dt.datetime.utcnow() + dt.timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    token = models.AuthToken(token=token_value, user=user, expires_at=expires_at)
    db.add(token)
    db.commit()
    db.refresh(token)
    return token


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> models.User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    token_value = credentials.credentials
    token = (
        db.query(models.AuthToken)
        .filter(models.AuthToken.token == token_value)
        .first()
    )
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    if token.expires_at and token.expires_at < dt.datetime.utcnow().replace(tzinfo=None):
        db.delete(token)
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")

    return token.user


def maybe_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> models.User | None:
    try:
        return get_current_user(credentials, db)
    except HTTPException:
        return None
