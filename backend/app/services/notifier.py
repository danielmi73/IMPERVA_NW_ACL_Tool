"""
Phase 2: Email notification service.
Currently a stub — SMTP config and sending will be wired up in Phase 2.
"""
import logging

logger = logging.getLogger(__name__)


async def notify_attack_start(
    customer_email: str,
    customer_name: str,
    cidr: str,
    threshold_mbps: float | None,
    custom_message: str | None = None,
):
    """Send attack start notification to customer. Phase 2 implementation."""
    logger.info(
        f"[Phase 2 stub] Would notify {customer_email} about attack on {cidr} for {customer_name}"
    )
    # TODO Phase 2: implement SMTP sending via aiosmtplib


async def notify_attack_end(
    customer_email: str,
    customer_name: str,
    cidr: str,
):
    """Send attack end notification to customer. Phase 2 implementation."""
    logger.info(
        f"[Phase 2 stub] Would notify {customer_email} about attack end on {cidr} for {customer_name}"
    )
    # TODO Phase 2: implement SMTP sending via aiosmtplib
