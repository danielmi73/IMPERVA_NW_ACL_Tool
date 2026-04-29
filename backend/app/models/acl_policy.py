from sqlalchemy import Column, String, DateTime, Text
from datetime import datetime, timezone

from app.db.session import Base


class ACLPolicy(Base):
    __tablename__ = "acl_policies"

    id = Column(String, primary_key=True)  # Imperva policy ID
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)     # Editable locally for clarity
    imperva_description = Column(Text, nullable=True)  # Original from Imperva
    last_synced = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    def __repr__(self):
        return f"<ACLPolicy {self.id} name={self.name}>"
