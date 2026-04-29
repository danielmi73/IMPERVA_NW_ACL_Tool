from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text
from datetime import datetime, timezone

from app.db.session import Base


class Settings(Base):
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True, default=1)
    # Admin auth
    admin_password_hash = Column(String, nullable=True)
    # Imperva API credentials (encrypted)
    api_id = Column(Text, nullable=True)
    api_key = Column(Text, nullable=True)
    account_id = Column(String, nullable=True)
    api_base_url = Column(String, default="https://api.imperva.com")
    # API health
    api_key_expired = Column(Boolean, default=False)
    last_api_check = Column(DateTime, nullable=True)
    # Setup state
    setup_complete = Column(Boolean, default=False)
    # SMTP (Phase 2)
    smtp_host = Column(String, nullable=True)
    smtp_port = Column(Integer, nullable=True)
    smtp_user = Column(String, nullable=True)
    smtp_password = Column(Text, nullable=True)  # encrypted
    smtp_from_address = Column(String, nullable=True)
    smtp_use_tls = Column(Boolean, default=True)
    # Scheduler
    poll_interval_seconds = Column(Integer, default=60)

    def __repr__(self):
        return f"<Settings setup_complete={self.setup_complete}>"
