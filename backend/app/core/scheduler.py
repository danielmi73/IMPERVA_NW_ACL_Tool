import asyncio
import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app.core.config import get_settings
from app.services.attack_monitor import run_attack_monitor

logger = logging.getLogger(__name__)
settings = get_settings()

scheduler = AsyncIOScheduler()


def start_scheduler():
    """Start the background APScheduler. Called on app startup."""
    scheduler.add_job(
        run_attack_monitor,
        trigger=IntervalTrigger(seconds=settings.POLL_INTERVAL_SECONDS),
        id="attack_monitor",
        name="DDoS Attack Monitor",
        replace_existing=True,
        max_instances=1,  # Prevent overlapping runs
        misfire_grace_time=30,
    )
    scheduler.start()
    logger.info(
        f"Scheduler started — polling Imperva every {settings.POLL_INTERVAL_SECONDS}s"
    )


def stop_scheduler():
    """Gracefully stop the scheduler on app shutdown."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")


def pause_scheduler():
    """Pause the attack monitor job (e.g. when API key expires)."""
    scheduler.pause_job("attack_monitor")
    logger.warning("Attack monitor PAUSED — API key issue")


def resume_scheduler():
    """Resume the monitor after key is updated."""
    scheduler.resume_job("attack_monitor")
    logger.info("Attack monitor RESUMED")
