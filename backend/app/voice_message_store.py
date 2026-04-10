"""In-memory store for voice message processing jobs."""

from __future__ import annotations

import time
from typing import Any, Dict, Optional

# TTL for entries: 5 minutes
_TTL_SECONDS = 300

_store: Dict[str, Dict[str, Any]] = {}


def create_entry(message_id: str) -> None:
    """Create a new pending entry for a voice message job."""
    _store[message_id] = {
        "status": "pending",
        "transcript": None,
        "response_text": None,
        "response_payload": None,
        "response_id": None,
        "error": None,
        "created_at": time.time(),
    }


def get_entry(message_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve a voice message entry by ID. Returns None if not found."""
    return _store.get(message_id)


def update_entry(message_id: str, **kwargs: Any) -> None:
    """Update fields of an existing voice message entry."""
    if message_id in _store:
        _store[message_id].update(kwargs)


def cleanup_expired() -> None:
    """Remove entries older than TTL_SECONDS."""
    now = time.time()
    expired = [
        mid for mid, entry in _store.items()
        if now - entry.get("created_at", 0) > _TTL_SECONDS
    ]
    for mid in expired:
        del _store[mid]
