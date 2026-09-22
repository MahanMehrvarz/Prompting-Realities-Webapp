"""Assistant management endpoints."""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from ..security import get_current_user_id
from ..encryption import encrypt_api_key, decrypt_api_key
from ..model_catalog import DEFAULT_MODEL, list_available_models, probe_models

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/assistants", tags=["assistants"])


class UpdateApiKeyRequest(BaseModel):
    """Request to update assistant's API key."""
    assistant_id: str
    api_key: str


class GetApiKeyResponse(BaseModel):
    """Response indicating if API key exists."""
    has_api_key: bool


@router.post("/update-api-key")
async def update_api_key(
    request: UpdateApiKeyRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Update an assistant's OpenAI API key (encrypted in database).
    """
    logger.info(f"🔑 [Backend] Updating API key for assistant {request.assistant_id}")
    
    try:
        # Use shared Supabase client
        from ..config import get_supabase_client
        supabase = get_supabase_client()
        
        # Verify the assistant belongs to the user
        response = supabase.table("assistants").select("id, supabase_user_id").eq("id", request.assistant_id).execute()
        
        if not response.data or len(response.data) == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Assistant not found"
            )
        
        assistant = response.data[0]
        if not isinstance(assistant, dict):
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Invalid assistant data"
            )
        
        if assistant.get("supabase_user_id") != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have permission to update this assistant"
            )
        
        # Encrypt the API key
        encrypted_key = encrypt_api_key(request.api_key)
        
        # Update the database
        supabase.table("assistants").update({
            "openai_key": encrypted_key
        }).eq("id", request.assistant_id).execute()
        
        logger.info(f"✅ [Backend] API key updated successfully for assistant {request.assistant_id}")
        return {"success": True, "message": "API key updated successfully"}
        
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"❌ [Backend] Failed to update API key: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update API key: {str(exc)}"
        )


@router.get("/get-api-key/{assistant_id}", response_model=GetApiKeyResponse)
async def get_api_key(
    assistant_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """
    Retrieve and decrypt an assistant's OpenAI API key.
    """
    logger.info(f"🔑 [Backend] Retrieving API key for assistant {assistant_id}")
    
    try:
        # Use shared Supabase client
        from ..config import get_supabase_client
        supabase = get_supabase_client()

        
        # Verify the assistant belongs to the user
        response = supabase.table("assistants").select("id, supabase_user_id, openai_key").eq("id", assistant_id).execute()
        
        if not response.data or len(response.data) == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Assistant not found"
            )
        
        assistant = response.data[0]
        if not isinstance(assistant, dict):
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Invalid assistant data"
            )
        
        if assistant.get("supabase_user_id") != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have permission to access this assistant"
            )
        
        # Check if API key exists
        encrypted_key = assistant.get("openai_key", "")
        has_key = bool(encrypted_key and isinstance(encrypted_key, str) and len(encrypted_key.strip()) > 0)
        
        logger.info(f"✅ [Backend] API key check completed for assistant {assistant_id}: {has_key}")
        return GetApiKeyResponse(has_api_key=has_key)
        
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"❌ [Backend] Failed to retrieve API key: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve API key: {str(exc)}"
        )


class BatchApiKeyRequest(BaseModel):
    assistant_ids: List[str]


@router.post("/get-api-keys-batch")
async def get_api_keys_batch(
    request: BatchApiKeyRequest,
    user_id: str = Depends(get_current_user_id),
) -> Dict[str, bool]:
    """Check API key existence for multiple assistants in one call."""
    from ..config import get_supabase_client
    sb = get_supabase_client()
    res = sb.table("assistants").select("id, openai_key").eq("supabase_user_id", user_id).in_("id", request.assistant_ids).execute()
    result: Dict[str, bool] = {}
    for row in (res.data or []):
        key = row.get("openai_key", "")
        result[row["id"]] = bool(key and isinstance(key, str) and len(key.strip()) > 0)
    return result


# ---------------------------------------------------------------------------
# Model selection
# ---------------------------------------------------------------------------

class ModelEntry(BaseModel):
    id: str
    speed: str
    note: str


class AvailableModelsResponse(BaseModel):
    default_model: str
    current_model: str
    models: List[ModelEntry]


class ProbeModelsRequest(BaseModel):
    """Which catalog models to time. Empty means every model the key can see."""
    models: List[str] = []


class ProbeResult(BaseModel):
    model: str
    ok: bool
    ms: int
    output_tokens: Optional[int] = None
    error: Optional[str] = None


class ProbeModelsResponse(BaseModel):
    results: List[ProbeResult]


def _load_owned_assistant_with_key(assistant_id: str, user_id: str) -> tuple[Dict[str, Any], str]:
    """Fetch the assistant row, enforce ownership, and decrypt its OpenAI key."""
    from ..config import get_supabase_client
    supabase = get_supabase_client()

    response = (
        supabase.table("assistants")
        .select("id, supabase_user_id, openai_key, json_schema, model")
        .eq("id", assistant_id)
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assistant not found")

    assistant = response.data[0]
    if not isinstance(assistant, dict):
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Invalid assistant data")
    if assistant.get("supabase_user_id") != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to access this assistant",
        )

    encrypted_key = assistant.get("openai_key")
    if not encrypted_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="API key not configured for this assistant",
        )
    try:
        api_key = decrypt_api_key(encrypted_key)
    except Exception as exc:
        logger.error(f"❌ [Backend] Failed to decrypt API key: {exc}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to decrypt API key")
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="API key not configured for this assistant",
        )
    return assistant, api_key


@router.get("/{assistant_id}/models", response_model=AvailableModelsResponse)
async def get_available_models(
    assistant_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """List structured-output-capable models the assistant's key can use."""
    assistant, api_key = _load_owned_assistant_with_key(assistant_id, user_id)
    try:
        models = list_available_models(api_key)
    except Exception as exc:
        logger.error(f"❌ [Backend] Failed to list models: {exc}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Failed to list models: {exc}")

    return AvailableModelsResponse(
        default_model=DEFAULT_MODEL,
        current_model=assistant.get("model") or DEFAULT_MODEL,
        models=[ModelEntry(**m) for m in models],
    )


@router.post("/{assistant_id}/models/probe", response_model=ProbeModelsResponse)
async def probe_available_models(
    assistant_id: str,
    request: ProbeModelsRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Time one structured-output request per model using the assistant's own schema.

    This spends a few tokens per model on the user's key, so it only runs on
    an explicit click, never automatically.
    """
    assistant, api_key = _load_owned_assistant_with_key(assistant_id, user_id)
    targets = request.models or [m["id"] for m in list_available_models(api_key)]

    json_schema_raw = assistant.get("json_schema")
    json_schema = json_schema_raw if isinstance(json_schema_raw, dict) else None

    logger.info(f"⏱️ [Backend] Probing {len(targets)} models for assistant {assistant_id}")
    results = await probe_models(api_key, targets, json_schema)
    return ProbeModelsResponse(results=[ProbeResult(**r) for r in results])
