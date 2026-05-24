"""
Email Notification Service — Phase 2
=====================================
Sends HTML/plaintext emails via aiosmtplib.
Template variables available in every email:
  {{event_type}}, {{prefix}}, {{acl_name}}, {{acl_id}},
  {{customer_name}}, {{detected_at}}, {{peak_mbps}},
  {{threshold_mbps}}, {{custom_message}}
"""
import logging
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

import aiosmtplib
from sqlalchemy.orm import Session

from app.core.security import decrypt_value
from app.models.settings import Settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Default template (used when DB has no override stored yet)
# ---------------------------------------------------------------------------

DEFAULT_SUBJECT = "[DDoS Alert] {event_type} — {prefix}"

DEFAULT_BODY = """\
Dear {customer_name},

This is an automated notification from the DDoS Management System.

Event:      {event_type}
Prefix:     {prefix}
ACL:        {acl_name} (ID: {acl_id})
Detected:   {detected_at}
Peak:       {peak_mbps} Mbps
Threshold:  {threshold_mbps} Mbps

{custom_message}

—
Imperva DDoS Management
"""


# ---------------------------------------------------------------------------
# Core send function
# ---------------------------------------------------------------------------

async def send_email_notification(
    *,
    db: Session,
    customer_email: str,
    customer_name: str,
    event_type: str,           # "Attack Started" | "Attack Stopped"
    prefix: str,               # CIDR string
    acl_id: Optional[str],
    acl_name: Optional[str],
    detected_at: datetime,
    peak_mbps: Optional[float],
    threshold_mbps: Optional[float],
    custom_message: Optional[str],
) -> None:
    """Render and send a notification email using the configured SMTP server."""
    cfg: Settings = db.query(Settings).filter(Settings.id == 1).first()

    if not cfg or not cfg.smtp_host or not cfg.smtp_user or not cfg.smtp_from_address:
        logger.info("SMTP not configured — skipping email notification")
        return

    # Resolve SMTP password
    try:
        smtp_password = decrypt_value(cfg.smtp_password) if cfg.smtp_password else ""
    except Exception as exc:
        logger.error(f"Failed to decrypt SMTP password: {exc}")
        return

    # Build variable map — use double-brace format in templates stored in DB
    # so we convert {{var}} → {var} for str.format_map
    fmt_vars = {
        "event_type":     event_type,
        "prefix":         prefix,
        "acl_name":       acl_name or "N/A",
        "acl_id":         acl_id or "N/A",
        "customer_name":  customer_name,
        "detected_at":    detected_at.strftime("%Y-%m-%d %H:%M UTC"),
        "peak_mbps":      f"{peak_mbps:.1f}" if peak_mbps is not None else "N/A",
        "threshold_mbps": f"{threshold_mbps:.1f}" if threshold_mbps is not None else "N/A",
        "custom_message": custom_message.strip() if custom_message and custom_message.strip() else "",
    }

    # Load subject/body from DB, falling back to defaults
    raw_subject = cfg.smtp_default_subject or DEFAULT_SUBJECT
    raw_body    = cfg.smtp_default_body    or DEFAULT_BODY

    # DB stores templates with {{var}} double-brace syntax; convert for format_map
    def _render(template: str) -> str:
        # Replace {{var}} → {var} so Python's str.format_map works
        import re
        converted = re.sub(r"\{\{(\w+)\}\}", r"{\1}", template)
        try:
            return converted.format_map(fmt_vars)
        except KeyError as exc:
            logger.warning(f"Template has unknown variable {exc} — rendering as-is")
            return converted

    subject = _render(raw_subject)
    body    = _render(raw_body)

    # If custom_message is empty, strip the blank line it would leave
    if not fmt_vars["custom_message"]:
        import re
        body = re.sub(r"\n\n\n+", "\n\n", body).strip()

    # Build MIME message
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = cfg.smtp_from_address
    msg["To"]      = customer_email
    msg.attach(MIMEText(body, "plain", "utf-8"))

    # Determine TLS mode
    encryption = (cfg.smtp_encryption or "STARTTLS").upper()
    use_tls    = encryption == "SSL/TLS"
    start_tls  = encryption == "STARTTLS"
    port       = cfg.smtp_port or (465 if use_tls else 587)

    logger.info(
        f"Sending '{event_type}' notification to {customer_email} "
        f"via {cfg.smtp_host}:{port} [{encryption}]"
    )

    try:
        await aiosmtplib.send(
            msg,
            hostname=cfg.smtp_host,
            port=port,
            username=cfg.smtp_user,
            password=smtp_password,
            use_tls=use_tls,
            start_tls=start_tls,
        )
        logger.info(f"✅ Email sent to {customer_email}")
    except aiosmtplib.SMTPException as exc:
        logger.error(f"SMTP error sending to {customer_email}: {exc}")
    except Exception as exc:
        logger.error(f"Unexpected error sending email to {customer_email}: {exc}")


# ---------------------------------------------------------------------------
# Public wrapper functions (called by attack_monitor.py)
# ---------------------------------------------------------------------------

async def notify_attack_start(
    *,
    db: Session,
    customer_email: str,
    customer_name: str,
    cidr: str,
    acl_id: Optional[str] = None,
    acl_name: Optional[str] = None,
    detected_at: Optional[datetime] = None,
    peak_mbps: Optional[float] = None,
    threshold_mbps: Optional[float] = None,
    custom_message: Optional[str] = None,
) -> None:
    """Send attack-start notification."""
    await send_email_notification(
        db=db,
        customer_email=customer_email,
        customer_name=customer_name,
        event_type="Attack Started",
        prefix=cidr,
        acl_id=acl_id,
        acl_name=acl_name,
        detected_at=detected_at or datetime.now(timezone.utc),
        peak_mbps=peak_mbps,
        threshold_mbps=threshold_mbps,
        custom_message=custom_message,
    )


async def notify_attack_end(
    *,
    db: Session,
    customer_email: str,
    customer_name: str,
    cidr: str,
    acl_id: Optional[str] = None,
    acl_name: Optional[str] = None,
    detected_at: Optional[datetime] = None,
    peak_mbps: Optional[float] = None,
    threshold_mbps: Optional[float] = None,
    custom_message: Optional[str] = None,
) -> None:
    """Send attack-stop notification."""
    await send_email_notification(
        db=db,
        customer_email=customer_email,
        customer_name=customer_name,
        event_type="Attack Stopped",
        prefix=cidr,
        acl_id=acl_id,
        acl_name=acl_name,
        detected_at=detected_at or datetime.now(timezone.utc),
        peak_mbps=peak_mbps,
        threshold_mbps=threshold_mbps,
        custom_message=custom_message,
    )
