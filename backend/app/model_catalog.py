"""OpenAI model catalog for per-assistant model selection.

Only models that support Structured Outputs (``text.format = json_schema`` with
``strict: true`` on the Responses API) are listed here, because every assistant
turn relies on that. ``/v1/models`` says nothing about capabilities or latency,
so the catalog is the source of truth for *which* models are offered and the
speed tier is an editorial hint; ``probe_models`` measures the real thing.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Dict, List, Optional

from openai import OpenAI

from .conversation_service import build_text_format

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "gpt-4o-mini"

# Ordered fastest-to-slowest within each family. ``speed`` is a coarse tier for
# the UI badge; ``note`` is the one-liner shown next to the model.
MODEL_CATALOG: List[Dict[str, str]] = [
    {"id": "gpt-4.1-nano", "speed": "fast", "note": "Smallest 4.1 model; quickest replies, simplest reasoning."},
    {"id": "gpt-4o-mini", "speed": "fast", "note": "Default. Cheap and quick, good enough for most kits."},
    {"id": "gpt-4.1-mini", "speed": "fast", "note": "Sharper than 4o-mini at similar speed."},
    {"id": "gpt-5-nano", "speed": "balanced", "note": "Smallest GPT-5; thinks briefly before answering."},
    {"id": "gpt-4o", "speed": "balanced", "note": "Full-size 4o; better instruction following."},
    {"id": "gpt-4.1", "speed": "balanced", "note": "Full-size 4.1; strong at long instructions."},
    {"id": "gpt-5-mini", "speed": "balanced", "note": "Mid-size GPT-5 with reasoning; slower but more careful."},
    {"id": "gpt-5", "speed": "slow", "note": "Most capable; reasoning adds noticeable latency."},
]

CATALOG_IDS = {entry["id"] for entry in MODEL_CATALOG}

# A probe runs the assistant's real schema, so a quiet one-liner is enough to
# get a well-formed response without burning tokens.
PROBE_PROMPT = "Reply with a very short greeting."
PROBE_TIMEOUT_SECONDS = 45.0


def list_available_models(api_key: str) -> List[Dict[str, str]]:
    """Return the catalog entries this API key can actually see.

    Falls back to the whole catalog if ``/v1/models`` fails, so a transient
    OpenAI hiccup does not leave the dropdown empty.
    """
    client = OpenAI(api_key=api_key)
    try:
        visible = {m.id for m in client.models.list()}
    except Exception as exc:
        logger.warning(f"⚠️ [ModelCatalog] models.list failed, showing full catalog: {exc}")
        return list(MODEL_CATALOG)

    available = [entry for entry in MODEL_CATALOG if entry["id"] in visible]
    logger.info(f"📋 [ModelCatalog] {len(available)}/{len(MODEL_CATALOG)} catalog models visible to key")
    return available


def _probe_one(client: OpenAI, model: str, text_format: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    kwargs: Dict[str, Any] = {}
    if text_format:
        kwargs["text"] = text_format

    started = time.perf_counter()
    try:
        response = client.responses.create(
            model=model,
            input=PROBE_PROMPT,
            timeout=PROBE_TIMEOUT_SECONDS,
            **kwargs,
        )
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        usage = getattr(response, "usage", None)
        output_tokens = getattr(usage, "output_tokens", None) if usage else None
        return {"model": model, "ok": True, "ms": elapsed_ms, "output_tokens": output_tokens, "error": None}
    except Exception as exc:
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        # OpenAI errors carry a readable ``message``; fall back to str().
        message = getattr(exc, "message", None) or str(exc)
        logger.warning(f"⚠️ [ModelCatalog] probe failed for {model}: {message}")
        return {"model": model, "ok": False, "ms": elapsed_ms, "output_tokens": None, "error": message[:300]}


async def probe_models(
    api_key: str,
    models: List[str],
    json_schema: Optional[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Time one structured-output request per model, all in parallel.

    Unknown model ids are dropped rather than probed so a client cannot use
    this endpoint to call arbitrary models on the user's key.
    """
    targets = [m for m in models if m in CATALOG_IDS]
    if not targets:
        return []

    client = OpenAI(api_key=api_key)
    text_format = build_text_format(json_schema)

    results = await asyncio.gather(
        *(asyncio.to_thread(_probe_one, client, model, text_format) for model in targets)
    )
    return list(results)
