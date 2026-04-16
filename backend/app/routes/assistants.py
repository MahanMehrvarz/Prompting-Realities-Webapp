"""Assistant management endpoints."""

from __future__ import annotations

import logging
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from ..security import get_current_user_id
from ..encryption import encrypt_api_key, decrypt_api_key

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
