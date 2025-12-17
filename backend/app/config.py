"""Configuration helpers for the FastAPI backend."""

from __future__ import annotations

import os
from dotenv import load_dotenv
from pathlib import Path

load_dotenv()

BASE_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = BASE_DIR / "backend"


def _env(key: str, default: str | None = None) -> str:
    value = os.getenv(key)
    if value is None:
        if default is None:
            raise RuntimeError(f"Missing required environment variable: {key}")
        return default
    return value


DATABASE_URL = os.getenv(
    "PR_BACKEND_DB_URL", f"sqlite:///{DATA_DIR / 'app.db'}"
)
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("PR_ACCESS_TOKEN_MINUTES", "43200"))  # 30 days.
SECRET_KEY = os.getenv("PR_SECRET_KEY", "dev-secret-change-me")

# Supabase configuration (optional - only needed if using Supabase auth)
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")

# Reuse legacy settings module for OpenAI/MQTT defaults when custom assistant
# values are missing.
try:
    from settings import settings  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    settings = {}
