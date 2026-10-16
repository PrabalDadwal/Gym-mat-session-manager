from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field, EmailStr
from app.models import BookingStatus


class BookingCreate(BaseModel):
    session_id: int
    user_name: str = Field(..., min_length=2, max_length=100)
    user_email: EmailStr


class CheckInRequest(BaseModel):
    code: str = Field(..., min_length=6, max_length=12)
    session_id: Optional[int] = None


class BookingOut(BaseModel):
    id: int
    session_id: int
    user_id: str
    user_name: str
    user_email: str
    status: BookingStatus
    mat_number: Optional[int] = None
    waitlist_position: Optional[int] = None
    check_in_code: Optional[str] = None
    checked_in_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class SessionOut(BaseModel):
    id: int
    session_date: str
    start_time: str
    end_time: str
    display_time: str
    title: str
    intensity: str
    coach: str
    max_mats: int
    is_active: bool
    confirmed_count: int = 0
    checked_in_count: int = 0
    waitlist_count: int = 0
    mats_remaining: int = 20

    class Config:
        from_attributes = True
