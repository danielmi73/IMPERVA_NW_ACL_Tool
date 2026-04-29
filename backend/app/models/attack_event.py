from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone

from app.db.session import Base


class AttackEvent(Base):
    __tablename__ = "attack_events"

    id = Column(Integer, primary_key=True, index=True)
    prefix_id = Column(Integer, ForeignKey("prefixes.id"), nullable=False)
    event_type = Column(String, nullable=False)  # DDOS_START_IP_RANGE | DDOS_STOP_IP_RANGE
    detected_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    resolved_at = Column(DateTime, nullable=True)
    acl_applied = Column(Boolean, default=False)
    acl_policy_id = Column(String, nullable=True)
    peak_mbps = Column(Float, nullable=True)
    notification_sent = Column(Boolean, default=False)  # Phase 2
    imperva_event_id = Column(String, nullable=True)   # Store Imperva's event ID if available

    prefix = relationship("Prefix", back_populates="attack_events")

    def __repr__(self):
        return f"<AttackEvent prefix_id={self.prefix_id} type={self.event_type}>"
