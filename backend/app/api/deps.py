from fastapi import Depends, HTTPException, status, Cookie
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from typing import Optional

from app.db.session import get_db
from app.core.security import decode_access_token
from app.models.settings import Settings

security = HTTPBearer(auto_error=False)


def get_current_admin(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
):
    """Validate JWT and return settings. Raises 401 if invalid."""
    token = None
    if credentials:
        token = credentials.credentials

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_access_token(token)
    if payload is None or payload.get("sub") != "admin":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    cfg: Settings = db.query(Settings).filter(Settings.id == 1).first()
    if not cfg:
        raise HTTPException(status_code=500, detail="Settings not initialised")
    return cfg


def get_setup_settings(db: Session = Depends(get_db)) -> Settings:
    """Return settings row (creates default if missing). Used in setup flow."""
    cfg = db.query(Settings).filter(Settings.id == 1).first()
    if not cfg:
        cfg = Settings(id=1)
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg
