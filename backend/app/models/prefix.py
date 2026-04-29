from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float, Text, Enum, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import enum as pyenum

from app.db.session import Base


class ActionOnAttack(str, pyenum.Enum):
    block = "block"
    pass_ = "pass"


class Prefix(Base):
    __tablename__ = "prefixes"

    id = Column(Integer, primary_key=True, index=True)
    imperva_asset_id = Column(String, unique=True, index=True, nullable=False)
    cidr = Column(String, nullable=False)
    name = Column(String, nullable=True)  # friendly name from Imperva
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True)
    threshold_mbps = Column(Float, nullable=True, default=None)
    threshold_kpps = Column(Float, nullable=True, default=None)
    acl_policy_id = Column(String, nullable=True)
    action_on_attack = Column(String, default="pass")
    notify_customer = Column(Boolean, default=False)
    is_under_attack = Column(Boolean, default=False)
    attack_started_at = Column(DateTime, nullable=True)
    last_seen = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    customer = relationship("Customer", back_populates="prefixes")
    attack_events = relationship("AttackEvent", back_populates="prefix", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Prefix {self.cidr}>"
