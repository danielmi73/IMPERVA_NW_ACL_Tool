"""
Attack Monitor — Background Automation Engine
=============================================
Polls Imperva every 60 seconds for DDoS events.
Applies ACL blocking when attack exceeds thresholds.
Removes ACL when attack ends.
"""
import logging
from datetime import datetime, timezone, timedelta

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.prefix import Prefix
from app.models.settings import Settings
from app.models.attack_event import AttackEvent
from app.services.imperva import ImpervaClient, ImpervaAPIError, ImpervaKeyExpiredError
from app.core.security import decrypt_value

logger = logging.getLogger(__name__)

def _parse_event_time(event: dict) -> datetime:
    t = event.get("eventTime")
    if t and t.endswith(" UTC"):
        try:
            return datetime.strptime(t[:-4], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    return datetime.now(timezone.utc)


def _get_client_from_db(db: Session) -> ImpervaClient | None:
    """Build an ImpervaClient from the stored (encrypted) credentials."""
    cfg: Settings = db.query(Settings).filter(Settings.id == 1).first()
    if not cfg or not cfg.api_id or not cfg.api_key or not cfg.account_id:
        logger.warning("Imperva credentials not configured — skipping poll")
        return None
    if cfg.api_key_expired:
        logger.warning("API key is marked as expired — skipping poll")
        return None
    try:
        api_id = decrypt_value(cfg.api_id)
        api_key = decrypt_value(cfg.api_key)
    except Exception as exc:
        logger.error(f"Failed to decrypt API credentials: {exc}")
        return None
    return ImpervaClient(
        api_id=api_id,
        api_key=api_key,
        account_id=cfg.account_id,
        base_url=cfg.api_base_url,
    )


def _mark_api_expired(db: Session):
    cfg: Settings = db.query(Settings).filter(Settings.id == 1).first()
    if cfg:
        cfg.api_key_expired = True
        db.commit()
    logger.error("Imperva API key expired/invalid — scheduler paused until key is updated")


def _update_last_check(db: Session):
    cfg: Settings = db.query(Settings).filter(Settings.id == 1).first()
    if cfg:
        cfg.last_api_check = datetime.now(timezone.utc)
        db.commit()


async def run_attack_monitor():
    """
    Main scheduler job. Called every POLL_INTERVAL_SECONDS.
    """
    logger.info("Attack monitor: starting poll cycle")
    db: Session = SessionLocal()
    client: ImpervaClient | None = None

    try:
        client = _get_client_from_db(db)
        if client is None:
            return

        # Query last 10 minutes of events (to capture any delayed events from Imperva)
        now = datetime.now(timezone.utc)
        from_dt = now - timedelta(minutes=10)

        events = await client.get_infra_events(from_dt=from_dt, to_dt=now)
        logger.info(f"Attack monitor: received {len(events)} events")

        for event in events:
            # Real API response fields: eventType, eventTarget (CIDR), eventId
            event_type = event.get("eventType", "")
            cidr = event.get("eventTarget", "")
            asset_id = str(event.get("eventId", ""))  # use eventId as fallback lookup key

            if event_type == "DDOS_START_IP_RANGE":
                await _handle_attack_start(db, client, event, asset_id, cidr)
            elif event_type == "DDOS_STOP_IP_RANGE":
                await _handle_attack_stop(db, client, event, asset_id, cidr)

        _update_last_check(db)

    except ImpervaKeyExpiredError as exc:
        logger.error(f"API key issue: {exc}")
        if getattr(exc, 'status_code', 401) == 401:
            _mark_api_expired(db)
        else:
            logger.error("API key lacks permissions for events endpoint, but is not expired.")
    except ImpervaAPIError as exc:
        logger.error(f"Imperva API error during poll: {exc}")
    except Exception as exc:
        logger.exception(f"Unexpected error in attack monitor: {exc}")
    finally:
        if client:
            await client.close()
        db.close()


async def _handle_attack_start(
    db: Session,
    client: ImpervaClient,
    event: dict,
    asset_id: str,
    cidr: str,
):
    """Handle a DDOS_START_IP_RANGE event."""
    # Find the prefix in our DB
    prefix: Prefix | None = None
    if asset_id:
        prefix = db.query(Prefix).filter(Prefix.imperva_asset_id == asset_id).first()
    if prefix is None and cidr:
        prefix = db.query(Prefix).filter(Prefix.cidr == cidr).first()

    if prefix is None:
        logger.info(f"Attack start event for unknown asset {asset_id} / {cidr} — not in DB, ignoring")
        return

    imperva_event_id = str(event.get("eventId", event.get("id", "")))
    if imperva_event_id:
        existing = db.query(AttackEvent).filter(AttackEvent.imperva_event_id == imperva_event_id).first()
        if existing:
            return  # Already processed this exact event

    # Extract attack size - prefer bwBlocked (traffic actually blocked), fallback to bwTotal
    peak_mbps = event.get("bwBlocked", event.get("bwTotal", event.get("peakMbps", event.get("attackSize", None))))
    if isinstance(peak_mbps, str):
        try:
            peak_mbps = float(peak_mbps)
        except ValueError:
            peak_mbps = None

    # Check threshold
    if prefix.threshold_mbps and peak_mbps is not None:
        if peak_mbps < prefix.threshold_mbps:
            logger.info(f"Attack on {prefix.cidr} ({peak_mbps} Mbps) below threshold ({prefix.threshold_mbps} Mbps) — ignoring")
            return

    # Check if action is "block" and ACL is configured
    acl_applied = False
    if prefix.action_on_attack != "block":
        logger.info(f"Prefix {prefix.cidr} action is '{prefix.action_on_attack}' — not blocking, but marking as under attack")
    elif not prefix.acl_policy_id:
        logger.warning(f"Prefix {prefix.cidr} has no ACL policy configured — cannot block, but marking as under attack")
    else:
        # Apply ACL
        try:
            await client.add_asset_to_acl(prefix.acl_policy_id, prefix.cidr)
            acl_applied = True
            logger.info(f"✅ ACL {prefix.acl_policy_id} applied to {prefix.cidr} — BLOCKING")
        except ImpervaAPIError as exc:
            logger.error(f"Failed to apply ACL to {prefix.cidr}: {exc}")
            raise

    event_time = _parse_event_time(event)

    # Always update prefix state so the UI reflects the ongoing attack
    prefix.is_under_attack = True
    prefix.attack_started_at = event_time
    db.commit()

    # Log event
    attack_event = _log_attack_event(
        db, prefix,
        event_type="DDOS_START_IP_RANGE",
        peak_mbps=peak_mbps,
        acl_applied=acl_applied,
        acl_policy_id=prefix.acl_policy_id if acl_applied else None,
        imperva_event_id=imperva_event_id,
        event_time=event_time,
    )
    logger.info(f"Attack event #{attack_event.id} recorded for prefix {prefix.cidr}")


async def _handle_attack_stop(
    db: Session,
    client: ImpervaClient,
    event: dict,
    asset_id: str,
    cidr: str,
):
    """Handle a DDOS_STOP_IP_RANGE event."""
    prefix: Prefix | None = None
    if asset_id:
        prefix = db.query(Prefix).filter(Prefix.imperva_asset_id == asset_id).first()
    if prefix is None and cidr:
        prefix = db.query(Prefix).filter(Prefix.cidr == cidr).first()

    if prefix is None:
        logger.info(f"Attack stop event for unknown asset {asset_id} / {cidr} — ignoring")
        return

    imperva_event_id = str(event.get("eventId", event.get("id", "")))
    if imperva_event_id:
        existing = db.query(AttackEvent).filter(AttackEvent.imperva_event_id == imperva_event_id).first()
        if existing:
            return  # Already processed this stop event

    event_time = _parse_event_time(event)

    if not prefix.is_under_attack:
        logger.info(f"Prefix {prefix.cidr} not marked under attack — nothing to clear")
        # Ensure we still log the stop event just in case
    else:
        # Update prefix state
        prefix.is_under_attack = False
        prefix.attack_started_at = None
        db.commit()

    # Remove ACL if it was applied
    if prefix.acl_policy_id and prefix.action_on_attack == "block":
        try:
            await client.remove_asset_from_acl(prefix.acl_policy_id, prefix.cidr)
            logger.info(f"✅ ACL {prefix.acl_policy_id} removed from {prefix.cidr} — UNBLOCKED")
        except ImpervaAPIError as exc:
            logger.error(f"Failed to remove ACL from {prefix.cidr}: {exc}")

    # Find the open attack event and close it, updating peak stats from stop event
    peak_mbps = event.get("bwBlocked", event.get("bwTotal", None))
    open_event: AttackEvent | None = (
        db.query(AttackEvent)
        .filter(
            AttackEvent.prefix_id == prefix.id,
            AttackEvent.event_type == "DDOS_START_IP_RANGE",
            AttackEvent.resolved_at.is_(None),
        )
        .order_by(AttackEvent.detected_at.desc())
        .first()
    )
    if open_event:
        open_event.resolved_at = event_time
        # Update peak_mbps from the stop event if it has more accurate data
        if peak_mbps is not None:
            open_event.peak_mbps = peak_mbps
        db.commit()
        logger.info(f"Attack event #{open_event.id} resolved for prefix {prefix.cidr}")
    else:
        # Log a standalone stop event if no open start event was found
        _log_attack_event(db, prefix, event_type="DDOS_STOP_IP_RANGE", imperva_event_id=imperva_event_id, event_time=event_time, peak_mbps=peak_mbps)


def _log_attack_event(
    db: Session,
    prefix: Prefix,
    event_type: str,
    peak_mbps: float | None = None,
    acl_applied: bool = False,
    acl_policy_id: str | None = None,
    imperva_event_id: str | None = None,
    event_time: datetime | None = None,
) -> AttackEvent:
    evt = AttackEvent(
        prefix_id=prefix.id,
        event_type=event_type,
        detected_at=event_time or datetime.now(timezone.utc),
        acl_applied=acl_applied,
        acl_policy_id=acl_policy_id or prefix.acl_policy_id,
        peak_mbps=peak_mbps,
        imperva_event_id=str(imperva_event_id) if imperva_event_id else None,
    )
    db.add(evt)
    db.commit()
    db.refresh(evt)
    return evt
