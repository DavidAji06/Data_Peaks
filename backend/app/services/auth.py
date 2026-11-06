import os
import secrets

from fastapi import Depends, HTTPException
from fastapi.security import APIKeyHeader

# Set MODERATOR_KEY before starting the server for anything beyond local use
MODERATOR_KEY = os.getenv("MODERATOR_KEY", "dev-moderator-key")

moderator_header = APIKeyHeader(name="X-Moderator-Key", auto_error=False)


def require_moderator(key: str | None = Depends(moderator_header)):
    if key is None or not secrets.compare_digest(key, MODERATOR_KEY):
        raise HTTPException(status_code=401, detail="Moderator key required")
