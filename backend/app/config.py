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


# Supabase configuration for JWT validation
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_JWT_SECRET:
    raise RuntimeError("SUPABASE_URL and SUPABASE_JWT_SECRET environment variables are required")

# Reuse legacy settings module for OpenAI/MQTT defaults when custom assistant
# values are missing.
try:
    from settings import settings  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    settings = {}


# ---------------------------------------------------------------------------
# Shared Supabase client
# ---------------------------------------------------------------------------
#
# Route handlers previously instantiated a new client on every request via
# ``create_client(...)``. Each call pays HTTP client setup cost and loses the
# benefits of connection keep-alive. We lazily initialise one client per
# process and reuse it.

_supabase_client = None


def get_supabase_client():
    """Return a process-wide cached Supabase client."""
    global _supabase_client
    if _supabase_client is None:
        from supabase import create_client
        _supabase_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    return _supabase_client
