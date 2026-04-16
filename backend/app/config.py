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
# Supabase client
# ---------------------------------------------------------------------------
#
# We previously cached a single Supabase client process-wide. That broke in
# production: Supabase/PostgREST closes idle HTTP/2 connections after a
# short window, and the cached client's httpx session kept serving requests
# on the stale connection, raising
# ``httpx.RemoteProtocolError: ConnectionTerminated`` and turning every
# analysis endpoint into a 500 until the worker restarted.
#
# We now build a fresh client per call. The cost is a small httpx setup
# (~1-2 ms on a warm worker), negligible compared to the Supabase round
# trip, and the connection-reuse story is handled per-request rather than
# spanning the whole worker lifetime.


def get_supabase_client():
    """Return a fresh Supabase client.

    Intentionally not cached — see comment above. If you need to shave the
    httpx setup cost, wrap this with a cache that detects
    ``httpx.RemoteProtocolError`` and rebuilds, but do not cache blindly.
    """
    from supabase import create_client
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
