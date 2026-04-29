from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, field_validator

from app.db.session import get_db
from app.models.settings import Settings
from app.core.security import (
    hash_password, verify_password, create_access_token, encrypt_value
)
from app.api.deps import get_setup_settings

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class SetupStep1Request(BaseModel):
    password: str

    @field_validator("password")
    @classmethod
    def password_strength(cls, v):
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v):
        if len(v) < 8:
            raise ValueError("New password must be at least 8 characters")
        return v


@router.get("/status")
def auth_status(db: Session = Depends(get_db)):
    """Returns whether first-time setup is complete."""
    cfg: Settings = db.query(Settings).filter(Settings.id == 1).first()
    setup_complete = cfg.setup_complete if cfg else False
    password_set = bool(cfg.admin_password_hash) if cfg else False
    return {"setup_complete": setup_complete, "password_set": password_set}


@router.post("/setup/password")
def setup_password(
    req: SetupStep1Request,
    cfg: Settings = Depends(get_setup_settings),
    db: Session = Depends(get_db),
):
    """Step 1 of first-time setup: set the admin password."""
    if cfg.setup_complete or cfg.admin_password_hash:
        raise HTTPException(status_code=400, detail="Password already set or setup complete")
    cfg.admin_password_hash = hash_password(req.password)
    db.commit()
    return {"message": "Password set successfully"}


@router.post("/login", response_model=LoginResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    cfg: Settings = db.query(Settings).filter(Settings.id == 1).first()
    if not cfg or not cfg.admin_password_hash:
        raise HTTPException(status_code=400, detail="Setup not complete")
    if not verify_password(req.password, cfg.admin_password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password",
        )
    token = create_access_token(data={"sub": "admin"})
    return LoginResponse(access_token=token)


@router.post("/change-password")
def change_password(
    req: ChangePasswordRequest,
    db: Session = Depends(get_db),
):
    cfg: Settings = db.query(Settings).filter(Settings.id == 1).first()
    if not cfg or not cfg.admin_password_hash:
        raise HTTPException(status_code=400, detail="No password set")
    if not verify_password(req.current_password, cfg.admin_password_hash):
        raise HTTPException(status_code=401, detail="Incorrect current password")
    cfg.admin_password_hash = hash_password(req.new_password)
    db.commit()
    return {"message": "Password changed successfully"}
