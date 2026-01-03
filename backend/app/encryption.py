"""Encryption utilities for sensitive data like API keys."""

from __future__ import annotations

import base64
import os
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

# Get encryption key from environment variable
ENCRYPTION_SECRET = os.getenv("ENCRYPTION_SECRET")

if not ENCRYPTION_SECRET:
    raise RuntimeError("ENCRYPTION_SECRET environment variable is required")


def _get_fernet() -> Fernet:
    """
    Generate a Fernet cipher from the encryption secret.
    Uses PBKDF2 to derive a proper key from the secret.
    """
    if not ENCRYPTION_SECRET:
        raise RuntimeError("ENCRYPTION_SECRET is not set")
    
    # Use a fixed salt for deterministic key derivation
    # In production, you might want to use a configurable salt
    salt = b"prompting_realities_salt_v1"
    
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=100000,
    )
    key = base64.urlsafe_b64encode(kdf.derive(ENCRYPTION_SECRET.encode()))
    return Fernet(key)


def encrypt_api_key(api_key: str) -> str:
    """
    Encrypt an API key for storage in the database.
    
    Args:
        api_key: The plaintext API key
        
    Returns:
        The encrypted API key as a base64-encoded string
    """
    if not api_key:
        return ""
    
    fernet = _get_fernet()
    encrypted_bytes = fernet.encrypt(api_key.encode())
    return encrypted_bytes.decode()


def decrypt_api_key(encrypted_key: str) -> str:
    """
    Decrypt an API key retrieved from the database.
    
    Args:
        encrypted_key: The encrypted API key as a base64-encoded string
        
    Returns:
        The decrypted plaintext API key
    """
    if not encrypted_key:
        return ""
    
    fernet = _get_fernet()
    decrypted_bytes = fernet.decrypt(encrypted_key.encode())
    return decrypted_bytes.decode()
