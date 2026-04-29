from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone

from app.db.session import Base


class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, nullable=True)
    custom_message = Column(Text, nullable=True)  # Phase 2
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    prefixes = relationship(
        "Prefix",
        back_populates="customer",
    )

    def __repr__(self):
        return f"<Customer {self.name}>"
