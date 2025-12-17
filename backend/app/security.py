"""Authentication helpers for Supabase JWT validation."""

from __future__ import annotations

import jwt
from jwt import PyJWKClient
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import SUPABASE_URL, SUPABASE_JWT_SECRET

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> str:
    """
    Extract and validate Supabase user ID from JWT token.
    
    Uses Supabase's JWKS endpoint to fetch and validate JWT signing keys (RS256).
    This is more secure than using the legacy JWT secret.
    """
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    if not SUPABASE_URL:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Supabase URL not configured. Please set SUPABASE_URL environment variable."
        )

    token = credentials.credentials
    
    try:
        
        # Check if token uses HS256 (symmetric) or RS256 (asymmetric)
        token_header = jwt.get_unverified_header(token)
        algorithm = token_header.get("alg")
        
        if algorithm == "HS256" and SUPABASE_JWT_SECRET:
            # Use JWT secret for HS256 tokens
            payload = jwt.decode(
                token,
                SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                options={"verify_aud": False}
            )
        elif algorithm == "RS256":
            # Use JWKS for RS256 tokens
            jwks_url = f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json"
            jwks_client = PyJWKClient(jwks_url, cache_keys=True)
            signing_key = jwks_client.get_signing_key_from_jwt(token)
            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256"],
                options={"verify_aud": False}
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Unsupported token algorithm: {algorithm}"
            )
        
        # Extract user ID from the 'sub' claim (subject)
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: missing user ID"
            )
        
        return user_id
        
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired"
        )
    except jwt.InvalidTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication error: {str(e)}"
        )


def maybe_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> str | None:
    """Optional authentication - returns None if not authenticated."""
    try:
        return get_current_user_id(credentials)
    except HTTPException:
        return None
