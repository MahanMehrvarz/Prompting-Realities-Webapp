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
# Supabase client (cached singleton with stale-connection auto-rebuild)
# ---------------------------------------------------------------------------
#
# Background: a previous attempt at a process-wide singleton broke in
# production because Supabase/PostgREST closes idle HTTP/2 connections and
# the cached client's httpx session kept reusing the dead connection,
# raising ``httpx.RemoteProtocolError: ConnectionTerminated``.
#
# This version keeps the singleton (~5-20 ms saved per call on cross-region
# hops to eu-west-1) but exposes ``reset_supabase_client()`` so the route
# layer can rebuild after a stale-connection error. Callers should wrap
# their first call in a try/except and retry once after reset.

_supabase_client = None


def get_supabase_client():
    """Return a cached Supabase client, building it on first use."""
    global _supabase_client
    if _supabase_client is None:
        from supabase import create_client
        _supabase_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    return _supabase_client


def reset_supabase_client():
    """Drop the cached client so the next call rebuilds it.

    Call this after seeing ``httpx.RemoteProtocolError`` or a similar
    stale-connection failure from a Supabase request.
    """
    global _supabase_client
    _supabase_client = None


def with_supabase_retry(fn):
    """Run ``fn(client)`` with the cached Supabase client.

    If the call fails with a stale-connection error, reset the client and
    retry once with a fresh one. Use this to wrap any Supabase query that
    you would otherwise call directly on ``get_supabase_client()``.
    """
    import httpx
    try:
        return fn(get_supabase_client())
    except (httpx.RemoteProtocolError, httpx.ReadError, httpx.ConnectError):
        reset_supabase_client()
        return fn(get_supabase_client())
