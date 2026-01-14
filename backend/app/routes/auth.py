"""Authentication and session management endpoints."""

from __future__ import annotations

import logging
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from supabase import create_client

from ..config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
from ..mqtt_manager import mqtt_manager
from ..security import get_current_user_id, get_current_user_email

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


class LogoutResponse(BaseModel):
    """Response from logout operation."""
    success: bool
    message: str
    sessions_stopped: int
    mqtt_connections_closed: int


@router.post("/logout", response_model=LogoutResponse)
async def logout(
    user_id: str = Depends(get_current_user_id),
    user_email: str = Depends(get_current_user_email),
):
    """
    Clean up all LLM resources when a user logs out.
    
    This endpoint:
    1. Stops all active assistant sessions for the user
    2. Disconnects all MQTT connections associated with the user
    3. Cleans up any running LLM operations
    """
    logger.info(f"🚪 [Backend] /auth/logout endpoint called for user {user_email}")
    
    sessions_stopped = 0
    mqtt_connections_closed = 0
    
    try:
        # Initialize Supabase client
        if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Supabase configuration is missing"
            )
        
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        
        # 1. Find all assistants belonging to this user
        logger.info(f"🔍 [Backend] Finding assistants for user {user_id}")
        assistants_response = supabase.table("assistants").select("id").eq("supabase_user_id", user_id).execute()
        
        if assistants_response.data and isinstance(assistants_response.data, list):
            assistant_ids = [str(assistant.get("id", "")) for assistant in assistants_response.data if isinstance(assistant, dict)]
            logger.info(f"📋 [Backend] Found {len(assistant_ids)} assistants for user")
            
            # 2. Find all active sessions for these assistants
            for assistant_id in assistant_ids:
                sessions_response = supabase.table("assistant_sessions").select("*").eq("assistant_id", assistant_id).eq("active", True).execute()
                
                if sessions_response.data and isinstance(sessions_response.data, list):
                    logger.info(f"🔄 [Backend] Found {len(sessions_response.data)} active sessions for assistant {assistant_id}")
                    
                    # Stop each active session
                    for session in sessions_response.data:
                        if not isinstance(session, dict):
                            continue
                        try:
                            session_id = session.get("id")
                            if session_id:
                                supabase.table("assistant_sessions").update({
                                    "status": "stopped",
                                    "active": False
                                }).eq("id", session_id).execute()
                                sessions_stopped += 1
                                logger.info(f"✅ [Backend] Stopped session {session_id}")
                        except Exception as e:
                            logger.error(f"❌ [Backend] Failed to stop session {session.get('id', 'unknown')}: {e}")
        
        # 3. Disconnect all MQTT connections for this user
        logger.info(f"🔌 [Backend] Disconnecting MQTT connections for user {user_email}")
        mqtt_connections_closed = await mqtt_manager.disconnect_user_connections(user_email)
        logger.info(f"✅ [Backend] Disconnected {mqtt_connections_closed} MQTT connections")
        
        logger.info(f"✅ [Backend] Logout cleanup complete: {sessions_stopped} sessions stopped, {mqtt_connections_closed} MQTT connections closed")
        
        return LogoutResponse(
            success=True,
            message="Successfully cleaned up all LLM resources",
            sessions_stopped=sessions_stopped,
            mqtt_connections_closed=mqtt_connections_closed
        )
        
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"❌ [Backend] Logout cleanup failed: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to clean up resources: {str(exc)}"
        )
