from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone

from app.db.session import get_db
from app.models.prefix import Prefix
from app.models.settings import Settings
from app.models.attack_event import AttackEvent
from app.api.deps import get_current_admin
from app.core.security import decrypt_value
from app.services.imperva import ImpervaClient, ImpervaAPIError, ImpervaKeyExpiredError

router = APIRouter(prefix="/prefixes", tags=["prefixes"])


class PrefixUpdateRequest(BaseModel):
    customer_id: Optional[int] = None
    threshold_mbps: Optional[float] = None
    threshold_kpps: Optional[float] = None
    acl_policy_id: Optional[str] = None
    action_on_attack: Optional[str] = None  # "block" | "pass"
    notify_customer: Optional[bool] = None


class PrefixResponse(BaseModel):
    id: int
    imperva_asset_id: str
    cidr: str
    name: Optional[str]
    customer_id: Optional[int]
    customer_name: Optional[str]
    threshold_mbps: Optional[float]
    threshold_kpps: Optional[float]
    acl_policy_id: Optional[str]
    action_on_attack: str
    notify_customer: bool
    is_under_attack: bool
    attack_started_at: Optional[datetime]
    last_seen: Optional[datetime]

    class Config:
        from_attributes = True


def _prefix_to_dict(p: Prefix) -> dict:
    return {
        "id": p.id,
        "imperva_asset_id": p.imperva_asset_id,
        "cidr": p.cidr,
        "name": p.name,
        "customer_id": p.customer_id,
        "customer_name": p.customer.name if p.customer else None,
        "threshold_mbps": p.threshold_mbps,
        "threshold_kpps": p.threshold_kpps,
        "acl_policy_id": p.acl_policy_id,
        "action_on_attack": p.action_on_attack or "block",
        "notify_customer": p.notify_customer or False,
        "is_under_attack": p.is_under_attack or False,
        "attack_started_at": p.attack_started_at,
        "last_seen": p.last_seen,
    }


@router.get("/")
def list_prefixes(
    db: Session = Depends(get_db),
    _: Settings = Depends(get_current_admin),
):
    prefixes = db.query(Prefix).all()
    return [_prefix_to_dict(p) for p in prefixes]


@router.get("/{prefix_id}")
def get_prefix(
    prefix_id: int,
    db: Session = Depends(get_db),
    _: Settings = Depends(get_current_admin),
):
    p = db.query(Prefix).filter(Prefix.id == prefix_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Prefix not found")
    return _prefix_to_dict(p)


@router.patch("/{prefix_id}")
def update_prefix(
    prefix_id: int,
    req: PrefixUpdateRequest,
    db: Session = Depends(get_db),
    _: Settings = Depends(get_current_admin),
):
    """Update customer assignment, thresholds, ACL, action, notify flag."""
    p = db.query(Prefix).filter(Prefix.id == prefix_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Prefix not found")

    update_data = req.model_dump(exclude_unset=True)
    if "customer_id" in update_data:
        p.customer_id = update_data["customer_id"]
    if "threshold_mbps" in update_data:
        p.threshold_mbps = update_data["threshold_mbps"]
    if "threshold_kpps" in update_data:
        p.threshold_kpps = update_data["threshold_kpps"]
    if "acl_policy_id" in update_data:
        p.acl_policy_id = update_data["acl_policy_id"]
    if "action_on_attack" in update_data:
        if update_data["action_on_attack"] not in ("block", "pass"):
            raise HTTPException(status_code=400, detail="action_on_attack must be 'block' or 'pass'")
        p.action_on_attack = update_data["action_on_attack"]
    if "notify_customer" in update_data:
        p.notify_customer = update_data["notify_customer"]

    db.commit()
    db.refresh(p)
    return _prefix_to_dict(p)


@router.post("/sync")
async def sync_prefixes(
    db: Session = Depends(get_db),
    cfg: Settings = Depends(get_current_admin),
):
    """Pull all protected IPs from Imperva and upsert into local DB."""
    if not cfg.api_id or not cfg.api_key:
        raise HTTPException(status_code=400, detail="API credentials not configured")

    try:
        api_id = decrypt_value(cfg.api_id)
        api_key = decrypt_value(cfg.api_key)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to decrypt credentials")

    client = ImpervaClient(
        api_id=api_id, api_key=api_key,
        account_id=cfg.account_id, base_url=cfg.api_base_url,
    )
    try:
        assets = await client.get_protected_ips()
    except ImpervaKeyExpiredError:
        cfg.api_key_expired = True
        db.commit()
        raise HTTPException(status_code=400, detail="API key expired")
    except ImpervaAPIError as exc:
        raise HTTPException(status_code=400, detail=exc.message)
    finally:
        await client.close()

    created, updated = 0, 0
    now = datetime.now(timezone.utc)
    for asset in assets:
        asset_id = str(asset.get("assetId", asset.get("id", "")))
        cidr = asset.get("cidr", asset.get("ipRange", asset.get("prefix", "")))
        name = asset.get("name", asset.get("assetName", ""))

        existing = db.query(Prefix).filter(Prefix.imperva_asset_id == asset_id).first()
        if existing:
            existing.cidr = cidr
            existing.name = name
            existing.last_seen = now
            updated += 1
        else:
            db.add(Prefix(
                imperva_asset_id=asset_id,
                cidr=cidr,
                name=name,
                action_on_attack="pass",
                last_seen=now,
            ))
            created += 1

    db.commit()
    return {"created": created, "updated": updated, "total": len(assets)}


@router.get("/{prefix_id}/attack-history")
def get_attack_history(
    prefix_id: int,
    db: Session = Depends(get_db),
    _: Settings = Depends(get_current_admin),
):
    events = (
        db.query(AttackEvent)
        .filter(AttackEvent.prefix_id == prefix_id)
        .order_by(AttackEvent.detected_at.desc())
        .limit(100)
        .all()
    )
    return [
        {
            "id": e.id,
            "event_type": e.event_type,
            "detected_at": e.detected_at,
            "resolved_at": e.resolved_at,
            "acl_applied": e.acl_applied,
            "acl_policy_id": e.acl_policy_id,
            "peak_mbps": e.peak_mbps,
        }
        for e in events
    ]
