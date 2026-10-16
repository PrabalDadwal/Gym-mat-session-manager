import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, date
from typing import Optional

from fastapi import (
    FastAPI,
    Request,
    Response,
    Depends,
    Form,
    Query,
    HTTPException,
    status,
)
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from app.config import settings
from app.database import engine, init_db, get_db, AsyncSessionLocal
from app.models import HourlySession, Booking, BookingStatus
from app.schemas import BookingCreate, CheckInRequest
from app.services import (
    book_session,
    cancel_booking,
    check_in_by_code,
    get_session_summary,
    normalize_code,
)
from app.seed import seed_database
from app.sse import broadcaster


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB schema
    await init_db()
    # Seed mock data
    async with AsyncSessionLocal() as session:
        await seed_database(session)
    yield


app = FastAPI(
    title=settings.APP_NAME,
    description="High-Precision Hourly Gym Mat Booking System",
    version="1.0.0",
    lifespan=lifespan,
)

# Mount static files
app.mount("/static", StaticFiles(directory="app/static"), name="static")

# Templates
templates = Jinja2Templates(directory="app/templates")


def get_current_user_id(request: Request) -> str:
    """Retrieve or generate persistent member token from cookie or query."""
    uid = request.query_params.get("user_id") or request.cookies.get("apex_uid")
    if not uid:
        uid = f"ath_{uuid.uuid4().hex[:8]}"
    return uid


# -----------------------------------------------------------------------------
# Web HTML Routes (HTMX + Jinja2)
# -----------------------------------------------------------------------------

@app.get("/", response_class=HTMLResponse)
async def member_portal(
    request: Request,
    session_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
):
    user_id = get_current_user_id(request)
    user_name = request.cookies.get("apex_name", "Alex Rivera")
    user_email = request.cookies.get("apex_email", "alex.rivera@athletic.io")

    # Fetch all sessions for today
    stmt = select(HourlySession).order_by(HourlySession.start_time.asc())
    sessions = (await db.execute(stmt)).scalars().all()

    # Determine active session (default to session 3 i.e. 08:00 AM or first)
    active_session_id = session_id or (sessions[2].id if len(sessions) > 2 else (sessions[0].id if sessions else 1))

    # Get session summary & user's current booking
    summary = await get_session_summary(db, active_session_id)

    # Check if user has an active booking in this session
    user_booking_stmt = select(Booking).where(
        Booking.session_id == active_session_id,
        Booking.user_id == user_id,
        Booking.status.in_([BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN, BookingStatus.WAITLIST]),
    )
    user_booking = (await db.execute(user_booking_stmt)).scalar_one_or_none()

    response = templates.TemplateResponse(
        request=request,
        name="index.html",
        context={
            "request": request,
            "sessions": sessions,
            "active_session_id": active_session_id,
            "summary": summary,
            "user_booking": user_booking,
            "user_id": user_id,
            "user_name": user_name,
            "user_email": user_email,
            "now": datetime.utcnow(),
        },
    )

    # Ensure cookie is set
    if "apex_uid" not in request.cookies:
        response.set_cookie(key="apex_uid", value=user_id, max_age=86400 * 30, httponly=False)
        response.set_cookie(key="apex_name", value=user_name, max_age=86400 * 30, httponly=False)
        response.set_cookie(key="apex_email", value=user_email, max_age=86400 * 30, httponly=False)

    return response


@app.get("/partials/session/{session_id}", response_class=HTMLResponse)
async def get_session_partial(
    request: Request,
    session_id: int,
    db: AsyncSession = Depends(get_db),
):
    user_id = get_current_user_id(request)
    summary = await get_session_summary(db, session_id)
    if not summary:
        raise HTTPException(status_code=404, detail="Session not found")

    user_booking_stmt = select(Booking).where(
        Booking.session_id == session_id,
        Booking.user_id == user_id,
        Booking.status.in_([BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN, BookingStatus.WAITLIST]),
    )
    user_booking = (await db.execute(user_booking_stmt)).scalar_one_or_none()

    user_name = request.cookies.get("apex_name", "Alex Rivera")
    user_email = request.cookies.get("apex_email", "alex.rivera@athletic.io")

    return templates.TemplateResponse(
        request=request,
        name="partials/session_details.html",
        context={
            "request": request,
            "summary": summary,
            "active_session_id": session_id,
            "user_booking": user_booking,
            "user_id": user_id,
            "user_name": user_name,
            "user_email": user_email,
            "flash_message": None,
        },
    )


@app.post("/book", response_class=HTMLResponse)
async def handle_book(
    request: Request,
    session_id: int = Form(...),
    user_name: str = Form("Alex Rivera"),
    user_email: str = Form("alex.rivera@athletic.io"),
    db: AsyncSession = Depends(get_db),
):
    user_id = get_current_user_id(request)
    user_name = user_name.strip() or "Anonymous Athlete"
    user_email = user_email.strip() or f"{user_id}@apex.athletic"

    booking, is_new, message = await book_session(
        db=db,
        session_id=session_id,
        user_id=user_id,
        user_name=user_name,
        user_email=user_email,
    )

    summary = await get_session_summary(db, session_id)

    response = templates.TemplateResponse(
        request=request,
        name="partials/session_details.html",
        context={
            "request": request,
            "summary": summary,
            "active_session_id": session_id,
            "user_booking": booking,
            "user_id": user_id,
            "user_name": user_name,
            "user_email": user_email,
            "flash_message": message,
            "flash_success": True,
        },
    )
    # Save user preferences
    response.set_cookie(key="apex_uid", value=user_id, max_age=86400 * 30)
    response.set_cookie(key="apex_name", value=user_name, max_age=86400 * 30)
    response.set_cookie(key="apex_email", value=user_email, max_age=86400 * 30)
    return response


@app.post("/cancel", response_class=HTMLResponse)
async def handle_cancel(
    request: Request,
    booking_id: int = Form(...),
    session_id: int = Form(...),
    db: AsyncSession = Depends(get_db),
):
    user_id = get_current_user_id(request)
    success, message, _ = await cancel_booking(
        db=db,
        booking_id=booking_id,
        user_id=user_id,
        is_staff=False,
    )

    summary = await get_session_summary(db, session_id)

    # Re-check user booking
    user_booking_stmt = select(Booking).where(
        Booking.session_id == session_id,
        Booking.user_id == user_id,
        Booking.status.in_([BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN, BookingStatus.WAITLIST]),
    )
    user_booking = (await db.execute(user_booking_stmt)).scalar_one_or_none()

    user_name = request.cookies.get("apex_name", "Alex Rivera")
    user_email = request.cookies.get("apex_email", "alex.rivera@athletic.io")

    return templates.TemplateResponse(
        request=request,
        name="partials/session_details.html",
        context={
            "request": request,
            "summary": summary,
            "active_session_id": session_id,
            "user_booking": user_booking,
            "user_id": user_id,
            "user_name": user_name,
            "user_email": user_email,
            "flash_message": message,
            "flash_success": success,
        },
    )


# -----------------------------------------------------------------------------
# Staff Door Terminal (/staff)
# -----------------------------------------------------------------------------

@app.get("/staff", response_class=HTMLResponse)
async def staff_terminal(
    request: Request,
    session_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
):
    # Fetch all sessions
    stmt = select(HourlySession).order_by(HourlySession.start_time.asc())
    sessions = (await db.execute(stmt)).scalars().all()

    active_session_id = session_id or (sessions[2].id if len(sessions) > 2 else (sessions[0].id if sessions else 1))
    summary = await get_session_summary(db, active_session_id)

    return templates.TemplateResponse(
        request=request,
        name="staff.html",
        context={
            "request": request,
            "sessions": sessions,
            "active_session_id": active_session_id,
            "summary": summary,
            "verification_banner": None,
            "now": datetime.utcnow(),
        },
    )


@app.get("/partials/staff/{session_id}", response_class=HTMLResponse)
async def get_staff_partial(
    request: Request,
    session_id: int,
    db: AsyncSession = Depends(get_db),
):
    summary = await get_session_summary(db, session_id)
    return templates.TemplateResponse(
        request=request,
        name="partials/staff_roster.html",
        context={
            "request": request,
            "summary": summary,
            "active_session_id": session_id,
        },
    )


@app.post("/staff/checkin", response_class=HTMLResponse)
async def handle_staff_checkin(
    request: Request,
    code: str = Form(...),
    session_id: Optional[int] = Form(None),
    db: AsyncSession = Depends(get_db),
):
    success, message, booking = await check_in_by_code(
        db=db,
        code=code,
        session_id=session_id,
    )

    # Use booking's session if matched, or passed session
    active_sid = (booking.session_id if booking else session_id) or 1
    summary = await get_session_summary(db, active_sid)

    return templates.TemplateResponse(
        request=request,
        name="partials/checkin_response.html",
        context={
            "request": request,
            "success": success,
            "message": message,
            "booking": booking,
            "summary": summary,
            "active_session_id": active_sid,
        },
    )


@app.post("/staff/cancel-booking", response_class=HTMLResponse)
async def staff_cancel_booking(
    request: Request,
    booking_id: int = Form(...),
    session_id: int = Form(...),
    db: AsyncSession = Depends(get_db),
):
    success, message, _ = await cancel_booking(
        db=db,
        booking_id=booking_id,
        is_staff=True,
    )
    summary = await get_session_summary(db, session_id)
    return templates.TemplateResponse(
        request=request,
        name="partials/staff_roster.html",
        context={
            "request": request,
            "summary": summary,
            "active_session_id": session_id,
            "flash_notice": message,
        },
    )


# -----------------------------------------------------------------------------
# SSE Real-Time Route
# -----------------------------------------------------------------------------

@app.get("/events")
async def sse_events(request: Request):
    """Real-Time SSE Stream for zero-page-refresh HTMX client synchronization."""
    return EventSourceResponse(broadcaster.subscribe())


# -----------------------------------------------------------------------------
# JSON API Routes
# -----------------------------------------------------------------------------

@app.get("/api/sessions")
async def api_list_sessions(db: AsyncSession = Depends(get_db)):
    stmt = select(HourlySession).order_by(HourlySession.start_time.asc())
    sessions = (await db.execute(stmt)).scalars().all()
    results = []
    for s in sessions:
        summary = await get_session_summary(db, s.id)
        results.append({
            "id": s.id,
            "start_time": s.start_time,
            "end_time": s.end_time,
            "display_time": s.display_time,
            "title": s.title,
            "confirmed_count": summary.get("confirmed_count", 0),
            "checked_in_count": summary.get("checked_in_count", 0),
            "waitlist_count": summary.get("waitlist_count", 0),
            "mats_remaining": summary.get("mats_remaining", 20),
            "is_full": summary.get("is_full", False),
        })
    return {"sessions": results}


@app.get("/api/sessions/{session_id}")
async def api_get_session(session_id: int, db: AsyncSession = Depends(get_db)):
    summary = await get_session_summary(db, session_id)
    if not summary:
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        "session": {
            "id": summary["session"].id,
            "title": summary["session"].title,
            "display_time": summary["session"].display_time,
            "coach": summary["session"].coach,
        },
        "confirmed_count": summary["confirmed_count"],
        "checked_in_count": summary["checked_in_count"],
        "waitlist_count": summary["waitlist_count"],
        "mats_remaining": summary["mats_remaining"],
        "is_full": summary["is_full"],
        "waitlist": [
            {
                "id": w.id,
                "user_name": w.user_name,
                "position": w.waitlist_position,
            }
            for w in summary["waitlist"]
        ],
    }


@app.post("/api/book")
async def api_book(payload: BookingCreate, request: Request, db: AsyncSession = Depends(get_db)):
    user_id = get_current_user_id(request)
    booking, is_new, msg = await book_session(
        db=db,
        session_id=payload.session_id,
        user_id=user_id,
        user_name=payload.user_name,
        user_email=payload.user_email,
    )
    return {
        "success": True,
        "message": msg,
        "booking": {
            "id": booking.id,
            "status": booking.status.value,
            "mat_number": booking.mat_number,
            "waitlist_position": booking.waitlist_position,
            "check_in_code": booking.check_in_code,
        },
    }


@app.post("/api/cancel/{booking_id}")
async def api_cancel(booking_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    user_id = get_current_user_id(request)
    success, msg, session_id = await cancel_booking(db, booking_id, user_id=user_id)
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    return {"success": True, "message": msg, "session_id": session_id}


@app.post("/api/checkin")
async def api_checkin(payload: CheckInRequest, db: AsyncSession = Depends(get_db)):
    success, msg, booking = await check_in_by_code(db, payload.code, payload.session_id)
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    return {
        "success": True,
        "message": msg,
        "booking": {
            "id": booking.id,
            "user_name": booking.user_name,
            "mat_number": booking.mat_number,
            "status": booking.status.value,
        },
    }
