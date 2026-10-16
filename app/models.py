import enum
from datetime import datetime
from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    DateTime,
    ForeignKey,
    Enum,
    UniqueConstraint,
    Index,
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


class BookingStatus(str, enum.Enum):
    CONFIRMED = "CONFIRMED"
    WAITLIST = "WAITLIST"
    CHECKED_IN = "CHECKED_IN"
    CANCELLED = "CANCELLED"


class HourlySession(Base):
    __tablename__ = "hourly_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_date = Column(String(10), nullable=False, index=True)  # YYYY-MM-DD
    start_time = Column(String(5), nullable=False)  # HH:MM e.g. 06:00
    end_time = Column(String(5), nullable=False)    # HH:MM e.g. 07:00
    display_time = Column(String(20), nullable=False)  # "06:00 AM - 07:00 AM"
    title = Column(String(100), nullable=False)
    intensity = Column(String(30), default="HIGH CAPACITY")
    coach = Column(String(50), default="APEX STAFF")
    max_mats = Column(Integer, default=20, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    bookings = relationship(
        "Booking",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="Booking.created_at",
    )

    __table_args__ = (
        UniqueConstraint("session_date", "start_time", name="uq_session_date_time"),
    )


class Booking(Base):
    __tablename__ = "bookings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("hourly_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(64), nullable=False, index=True)
    user_name = Column(String(100), nullable=False)
    user_email = Column(String(120), nullable=False)
    status = Column(Enum(BookingStatus), nullable=False, default=BookingStatus.CONFIRMED, index=True)
    
    # Mat allocation (1-20). Only valid when status is CONFIRMED or CHECKED_IN
    mat_number = Column(Integer, nullable=True)
    
    # Waitlist position (1, 2, 3...). Only valid when status is WAITLIST
    waitlist_position = Column(Integer, nullable=True)
    
    # 8-character check-in code (e.g. "K9TX-44M2" or "K9TX44M2")
    check_in_code = Column(String(12), nullable=True, unique=True, index=True)
    
    checked_in_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    session = relationship("HourlySession", back_populates="bookings")

    __table_args__ = (
        Index("ix_session_user_active", "session_id", "user_id"),
        Index("ix_session_status", "session_id", "status"),
    )
