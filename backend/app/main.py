import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.db.session import engine
from app.db.base import Base
from app.core.config import get_settings
from app.core.scheduler import start_scheduler, stop_scheduler
from app.models.settings import Settings
from app.db.session import SessionLocal
from app.api.routes import auth, admin, prefixes, customers

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ---- Startup ----
    logger.info("Starting DDoS Prefix Manager")

    # Create tables
    Base.metadata.create_all(bind=engine)

    # Ensure settings row exists and apply DB poll interval to scheduler trigger
    db = SessionLocal()
    try:
        cfg = db.query(Settings).filter(Settings.id == 1).first()
        if not cfg:
            cfg = Settings(id=1)
            db.add(cfg)
            db.commit()
        poll_interval = cfg.poll_interval_seconds or 60
    finally:
        db.close()

    # Start background scheduler
    start_scheduler()

    # Apply stored poll interval (overrides the default 60s config value)
    try:
        from apscheduler.triggers.interval import IntervalTrigger
        from app.core.scheduler import scheduler
        scheduler.reschedule_job(
            "attack_monitor",
            trigger=IntervalTrigger(seconds=poll_interval)
        )
        logger.info(f"Poll interval set to {poll_interval}s from DB")
    except Exception:
        pass  # Job may not be registered yet on very first boot

    yield

    # ---- Shutdown ----
    stop_scheduler()
    logger.info("DDoS Prefix Manager shutdown complete")


app = FastAPI(
    title="DDoS Prefix Manager",
    description="Automated DDoS detection and ACL management for Imperva Cloud",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

# CORS — tighten in production (nginx handles same-origin in Docker)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Routes
app.include_router(auth.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(prefixes.router, prefix="/api")
app.include_router(customers.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "ddos-manager"}


# Serve React frontend static files (in Docker, built into /usr/share/nginx/html)
# In dev mode (outside Docker), the frontend Vite dev server handles this.
FRONTEND_DIST = os.environ.get("FRONTEND_DIST", "/usr/share/nginx/html")
if os.path.isdir(FRONTEND_DIST):
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
