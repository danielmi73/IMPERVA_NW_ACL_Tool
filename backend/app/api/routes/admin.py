from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from app.db.session import get_db
from app.models.settings import Settings
from app.models.acl_policy import ACLPolicy
from app.core.security import encrypt_value, decrypt_value
from app.api.deps import get_current_admin
from app.services.imperva import ImpervaClient, ImpervaAPIError, ImpervaKeyExpiredError
from app.core.scheduler import scheduler

router = APIRouter(prefix="/admin", tags=["admin"])


class APICredentialsRequest(BaseModel):
    api_id: str
    api_key: str
    account_id: str
    api_base_url: Optional[str] = "https://my.imperva.com"


class SMTPRequest(BaseModel):
    smtp_host: str
    smtp_port: int = 587
    smtp_user: str
    smtp_password: str
    smtp_from_address: str
    smtp_use_tls: bool = True


class PollIntervalRequest(BaseModel):
    seconds: int

    def validate_seconds(self):
        if self.seconds < 10:
            raise ValueError("Poll interval must be at least 10 seconds")
        if self.seconds > 3600:
            raise ValueError("Poll interval cannot exceed 3600 seconds (1 hour)")


class AdminSettingsResponse(BaseModel):
    api_configured: bool
    account_id: Optional[str]
    api_base_url: Optional[str]
    api_key_expired: bool
    last_api_check: Optional[datetime]
    setup_complete: bool
    poll_interval_seconds: int
    smtp_configured: bool


@router.get("/settings", response_model=AdminSettingsResponse)
def get_settings(
    db: Session = Depends(get_db),
    _: Settings = Depends(get_current_admin),
):
    cfg: Settings = db.query(Settings).filter(Settings.id == 1).first()
    return AdminSettingsResponse(
        api_configured=bool(cfg.api_id and cfg.api_key),
        account_id=cfg.account_id,
        api_base_url=cfg.api_base_url,
        api_key_expired=cfg.api_key_expired or False,
        last_api_check=cfg.last_api_check,
        setup_complete=cfg.setup_complete,
        poll_interval_seconds=cfg.poll_interval_seconds or 60,
        smtp_configured=bool(cfg.smtp_host and cfg.smtp_user),
    )


@router.post("/credentials")
async def save_api_credentials(
    req: APICredentialsRequest,
    db: Session = Depends(get_db),
    _: Settings = Depends(get_current_admin),
):
    """Save (and validate) Imperva API credentials. Part of setup flow too."""
    # Validate credentials first
    client = ImpervaClient(
        api_id=req.api_id,
        api_key=req.api_key,
        account_id=req.account_id,
        base_url=req.api_base_url,
    )
    try:
        await client.validate_credentials()
    except ImpervaKeyExpiredError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid credentials: {exc.message}")
    except ImpervaAPIError as exc:
        raise HTTPException(status_code=400, detail=f"API error: {exc.message}")
    finally:
        await client.close()

    cfg: Settings = db.query(Settings).filter(Settings.id == 1).first()
    cfg.api_id = encrypt_value(req.api_id)
    cfg.api_key = encrypt_value(req.api_key)
    cfg.account_id = req.account_id
    cfg.api_base_url = req.api_base_url or "https://my.imperva.com"
    cfg.api_key_expired = False
    db.commit()
    return {"message": "Credentials saved and validated"}


@router.post("/setup/complete")
async def complete_setup(
    db: Session = Depends(get_db),
    cfg: Settings = Depends(get_current_admin),
):
    """Mark setup as complete and trigger first asset sync."""
    if not cfg.api_id or not cfg.api_key:
        raise HTTPException(status_code=400, detail="API credentials not configured")
    if not cfg.admin_password_hash:
        raise HTTPException(status_code=400, detail="Admin password not set")
    cfg.setup_complete = True
    db.commit()
    return {"message": "Setup complete"}


@router.post("/test-connection")
async def test_connection(
    db: Session = Depends(get_db),
    cfg: Settings = Depends(get_current_admin),
):
    """Test the stored API credentials."""
    if not cfg.api_id or not cfg.api_key:
        raise HTTPException(status_code=400, detail="No API credentials configured")
    try:
        api_id = decrypt_value(cfg.api_id)
        api_key = decrypt_value(cfg.api_key)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to decrypt credentials")

    client = ImpervaClient(
        api_id=api_id,
        api_key=api_key,
        account_id=cfg.account_id,
        base_url=cfg.api_base_url,
    )
    try:
        await client.validate_credentials()
        cfg.api_key_expired = False
        db.commit()
        return {"success": True, "message": "Connection successful"}
    except ImpervaKeyExpiredError as exc:
        # Only mark expired for 401 (invalid key), not 403 (permissions issue)
        if exc.status_code == 401:
            cfg.api_key_expired = True
            db.commit()
        raise HTTPException(status_code=400, detail=exc.message)
    except ImpervaAPIError as exc:
        raise HTTPException(status_code=400, detail=exc.message)
    finally:
        await client.close()


@router.post("/poll-interval")
def set_poll_interval(
    req: PollIntervalRequest,
    db: Session = Depends(get_db),
    _: Settings = Depends(get_current_admin),
):
    """Change the scheduler poll interval. Takes effect immediately."""
    if req.seconds < 10 or req.seconds > 3600:
        raise HTTPException(
            status_code=400,
            detail="Poll interval must be between 10 and 3600 seconds"
        )
    cfg: Settings = db.query(Settings).filter(Settings.id == 1).first()
    cfg.poll_interval_seconds = req.seconds
    db.commit()

    # Reschedule the job live
    try:
        from apscheduler.triggers.interval import IntervalTrigger
        scheduler.reschedule_job(
            "attack_monitor",
            trigger=IntervalTrigger(seconds=req.seconds)
        )
    except Exception as exc:
        # Scheduler might not be running yet (startup), that's ok
        pass

    return {"message": f"Poll interval updated to {req.seconds}s"}


@router.get("/acl-policies")
async def list_acl_policies(
    sync: bool = False,
    db: Session = Depends(get_db),
    cfg: Settings = Depends(get_current_admin),
):
    """Return cached ACL policies. Pass ?sync=true to refresh from Imperva."""
    if sync:
        if not cfg.api_id or not cfg.api_key:
            raise HTTPException(status_code=400, detail="API credentials not configured")
        try:
            api_id = decrypt_value(cfg.api_id)
            api_key = decrypt_value(cfg.api_key)
        except Exception:
            raise HTTPException(status_code=500, detail="Failed to decrypt credentials")

        client = ImpervaClient(
            api_id=api_id, api_key=api_key,
            account_id=cfg.account_id, base_url=cfg.api_base_url
        )
        try:
            policies = await client.get_acl_policies()
        except ImpervaKeyExpiredError as exc:
            # Never mark key as expired here — 403 just means missing ACL permissions
            raise HTTPException(
                status_code=400,
                detail=f"ACL sync failed ({exc.status_code}): {exc.message} — check API key permissions"
            )
        except ImpervaAPIError as exc:
            raise HTTPException(status_code=400, detail=exc.message)
        finally:
            await client.close()

        # Upsert into local cache
        from datetime import datetime, timezone
        for p in policies:
            policy_id = str(p.get("policyId", p.get("id", "")))
            existing = db.query(ACLPolicy).filter(ACLPolicy.id == policy_id).first()
            if existing:
                existing.name = p.get("name", existing.name)
                existing.imperva_description = p.get("description", "")
                existing.last_synced = datetime.now(timezone.utc)
            else:
                db.add(ACLPolicy(
                    id=policy_id,
                    name=p.get("name", policy_id),
                    imperva_description=p.get("description", ""),
                ))
        db.commit()

    policies = db.query(ACLPolicy).all()
    return [
        {
            "id": p.id,
            "name": p.name,
            "description": p.description or p.imperva_description or "",
            "last_synced": p.last_synced,
        }
        for p in policies
    ]


@router.patch("/acl-policies/{policy_id}")
def update_acl_policy_description(
    policy_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    _: Settings = Depends(get_current_admin),
):
    """Update the local description of an ACL policy."""
    policy = db.query(ACLPolicy).filter(ACLPolicy.id == policy_id).first()
    if not policy:
        raise HTTPException(status_code=404, detail="ACL policy not found")
    if "description" in payload:
        policy.description = payload["description"]
        db.commit()
    return {"id": policy.id, "description": policy.description}
