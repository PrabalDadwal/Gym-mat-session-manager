import asyncio
import random
import string
from datetime import datetime
from typing import Optional, List, Tuple, Dict, Any

from sqlalchemy import select, func, and_, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import HourlySession, Booking, BookingStatus
from app.config import settings
from app.sse import broadcaster

# Global concurrency lock dict per session to serialize booking & cancellation state transitions
_session_locks: Dict[int, asyncio.Lock] = {}
_global_lock = asyncio.Lock()


async def get_session_lock(session_id: int) -> asyncio.Lock:
    async with _global_lock:
        if session_id not in _session_locks:
            _session_locks[session_id] = asyncio.Lock()
        return _session_locks[session_id]


def generate_check_in_code() -> str:
    """
    Generate an 8-character high-contrast alphanumeric check-in code.
    Formatted as XXXX-XXXX (8 chars excluding delimiter) using unambiguous characters.
    """
    charset = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
    part1 = "".join(random.choices(charset, k=4))
    part2 = "".join(random.choices(charset, k=4))
    return f"{part1}-{part2}"


def normalize_code(code: str) -> str:
    """Strip whitespace and hyphens and uppercase for flexible scanner input."""
    return code.strip().replace("-", "").replace(" ", "").upper()


async def get_session_summary(db: AsyncSession, session_id: int) -> Dict[str, Any]:
    """Calculate real-time counts, mat status map, and waitlist for a session."""
    session = await db.get(HourlySession, session_id)
    if not session:
        return {}

    # Query all active bookings for this session
    stmt = (
        select(Booking)
        .where(
            Booking.session_id == session_id,
            Booking.status.in_([BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN, BookingStatus.WAITLIST])
        )
        .order_by(Booking.waitlist_position.asc().nullslast(), Booking.mat_number.asc().nullslast())
    )
    result = await db.execute(stmt)
    bookings = result.scalars().all()

    confirmed_bookings = [b for b in bookings if b.status in (BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN)]
    checked_in_bookings = [b for b in bookings if b.status == BookingStatus.CHECKED_IN]
    waitlist_bookings = [b for b in bookings if b.status == BookingStatus.WAITLIST]

    # Build 1..20 mat grid status
    mat_map: Dict[int, Optional[Booking]] = {m: None for m in range(1, settings.MAX_MATS_PER_SESSION + 1)}
    for b in confirmed_bookings:
        if b.mat_number and 1 <= b.mat_number <= settings.MAX_MATS_PER_SESSION:
            mat_map[b.mat_number] = b

    confirmed_count = len(confirmed_bookings)
    mats_remaining = max(0, settings.MAX_MATS_PER_SESSION - confirmed_count)

    return {
        "session": session,
        "confirmed_count": confirmed_count,
        "checked_in_count": len(checked_in_bookings),
        "waitlist_count": len(waitlist_bookings),
        "mats_remaining": mats_remaining,
        "is_full": confirmed_count >= settings.MAX_MATS_PER_SESSION,
        "mat_map": mat_map,
        "waitlist": waitlist_bookings,
        "confirmed_bookings": confirmed_bookings,
    }


async def book_session(
    db: AsyncSession,
    session_id: int,
    user_id: str,
    user_name: str,
    user_email: str,
) -> Tuple[Booking, bool, str]:
    """
    Atomic single-click booking with ACID transaction locking:
    - If seats < 20: allocate lowest free mat, status=CONFIRMED, generate 8-char code.
    - If seats == 20: place on waitlist with next sequential position.
    HARD INVARIANT: Total confirmed + checked_in seats NEVER exceeds 20.
    Returns (Booking, is_new, message).
    """
    lock = await get_session_lock(session_id)
    async with lock:
        # Check if user already has an active booking in this session
        existing_stmt = select(Booking).where(
            Booking.session_id == session_id,
            Booking.user_id == user_id,
            Booking.status.in_([BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN, BookingStatus.WAITLIST]),
        )
        existing = (await db.execute(existing_stmt)).scalar_one_or_none()
        if existing:
            if existing.status in (BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN):
                return existing, False, f"You already hold Mat #{existing.mat_number:02d}."
            else:
                return existing, False, f"You are currently #{existing.waitlist_position} on the waitlist."

        # Count active confirmed/checked-in bookings with transaction isolation
        count_stmt = select(func.count(Booking.id)).where(
            Booking.session_id == session_id,
            Booking.status.in_([BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN]),
        )
        confirmed_count = (await db.execute(count_stmt)).scalar() or 0

        if confirmed_count < settings.MAX_MATS_PER_SESSION:
            # Find the lowest available mat number (1 to 20)
            taken_mats_stmt = select(Booking.mat_number).where(
                Booking.session_id == session_id,
                Booking.status.in_([BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN]),
            )
            taken_mats = set((await db.execute(taken_mats_stmt)).scalars().all())
            available_mats = [m for m in range(1, settings.MAX_MATS_PER_SESSION + 1) if m not in taken_mats]
            assigned_mat = available_mats[0] if available_mats else 1

            code = generate_check_in_code()

            booking = Booking(
                session_id=session_id,
                user_id=user_id,
                user_name=user_name,
                user_email=user_email,
                status=BookingStatus.CONFIRMED,
                mat_number=assigned_mat,
                waitlist_position=None,
                check_in_code=code,
            )
            db.add(booking)
            await db.commit()
            await db.refresh(booking)

            # Broadcast SSE notification
            await broadcaster.broadcast("session_update", {"session_id": session_id, "action": "booked", "type": "confirmed"})
            return booking, True, f"Mat #{assigned_mat:02d} reserved successfully."
        else:
            # Session is full. Add to waitlist.
            max_wl_stmt = select(func.max(Booking.waitlist_position)).where(
                Booking.session_id == session_id,
                Booking.status == BookingStatus.WAITLIST,
            )
            max_pos = (await db.execute(max_wl_stmt)).scalar() or 0
            new_pos = max_pos + 1

            booking = Booking(
                session_id=session_id,
                user_id=user_id,
                user_name=user_name,
                user_email=user_email,
                status=BookingStatus.WAITLIST,
                mat_number=None,
                waitlist_position=new_pos,
                check_in_code=None,
            )
            db.add(booking)
            await db.commit()
            await db.refresh(booking)

            # Broadcast SSE notification
            await broadcaster.broadcast("session_update", {"session_id": session_id, "action": "waitlisted", "position": new_pos})
            return booking, True, f"Session at full capacity. Placed at Position #{new_pos} on waitlist."


async def cancel_booking(
    db: AsyncSession,
    booking_id: int,
    user_id: Optional[str] = None,
    is_staff: bool = False,
) -> Tuple[bool, str, Optional[int]]:
    """
    Cancellation logic with atomic promotion:
    - If a confirmed user cancels:
      1. Free their mat.
      2. Promote waitlist position #1 to CONFIRMED and generate an 8-char check-in code.
      3. Shift all remaining waitlist positions up by 1 (#2 -> #1, #3 -> #2).
    - If a waitlisted user cancels:
      1. Remove them from waitlist.
      2. Shift subsequent positions up.
    Returns (success, message, session_id).
    """
    booking = await db.get(Booking, booking_id)
    if not booking:
        return False, "Reservation not found.", None

    if not is_staff and user_id and booking.user_id != user_id:
        return False, "Unauthorized cancellation attempt.", None

    if booking.status == BookingStatus.CANCELLED:
        return False, "Reservation is already cancelled.", booking.session_id

    session_id = booking.session_id
    lock = await get_session_lock(session_id)

    async with lock:
        old_status = booking.status
        freed_mat = booking.mat_number
        cancelled_pos = booking.waitlist_position

        # Mark cancelled
        booking.status = BookingStatus.CANCELLED
        booking.mat_number = None
        booking.waitlist_position = None
        booking.check_in_code = None

        promoted_member = None

        if old_status in (BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN):
            # Find waitlist position #1 to promote
            wl_stmt = (
                select(Booking)
                .where(
                    Booking.session_id == session_id,
                    Booking.status == BookingStatus.WAITLIST,
                    Booking.waitlist_position == 1,
                )
            )
            next_in_line = (await db.execute(wl_stmt)).scalar_one_or_none()

            if next_in_line:
                # Promote to CONFIRMED
                next_in_line.status = BookingStatus.CONFIRMED
                next_in_line.mat_number = freed_mat
                next_in_line.check_in_code = generate_check_in_code()
                next_in_line.waitlist_position = None
                promoted_member = next_in_line.user_name

                # Shift all other waitlist positions up by 1
                remaining_stmt = (
                    select(Booking)
                    .where(
                        Booking.session_id == session_id,
                        Booking.status == BookingStatus.WAITLIST,
                        Booking.waitlist_position > 1,
                    )
                    .order_by(Booking.waitlist_position.asc())
                )
                remaining = (await db.execute(remaining_stmt)).scalars().all()
                for b in remaining:
                    b.waitlist_position -= 1

        elif old_status == BookingStatus.WAITLIST and cancelled_pos is not None:
            # Shift all waitlisted behind cancelled position up by 1
            subsequent_stmt = (
                select(Booking)
                .where(
                    Booking.session_id == session_id,
                    Booking.status == BookingStatus.WAITLIST,
                    Booking.waitlist_position > cancelled_pos,
                )
                .order_by(Booking.waitlist_position.asc())
            )
            subsequent = (await db.execute(subsequent_stmt)).scalars().all()
            for b in subsequent:
                b.waitlist_position -= 1

        await db.commit()

        # Broadcast SSE
        await broadcaster.broadcast(
            "session_update",
            {
                "session_id": session_id,
                "action": "cancelled",
                "promoted": promoted_member,
            },
        )

        msg = "Reservation cancelled."
        if promoted_member:
            msg += f" Waitlist #1 ({promoted_member}) automatically promoted to Mat #{freed_mat:02d}."
        return True, msg, session_id


async def check_in_by_code(
    db: AsyncSession,
    code: str,
    session_id: Optional[int] = None,
) -> Tuple[bool, str, Optional[Booking]]:
    """
    Check-in verification for door terminal:
    - Normalizes 8-char code.
    - Matches confirmed bookings.
    - Transitions status to CHECKED_IN.
    """
    clean_code = normalize_code(code)
    if not clean_code:
        return False, "Please enter an 8-character check-in code.", None

    # Query all active confirmed or checked-in bookings
    stmt = select(Booking).where(
        Booking.status.in_([BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN]),
        Booking.check_in_code.isnot(None),
    )
    if session_id:
        stmt = stmt.where(Booking.session_id == session_id)

    bookings = (await db.execute(stmt)).scalars().all()

    target: Optional[Booking] = None
    for b in bookings:
        if b.check_in_code and normalize_code(b.check_in_code) == clean_code:
            target = b
            break

    if not target:
        if session_id:
            return False, f"Code '{code}' not recognized for the selected session. Check code or switch session.", None
        return False, f"Invalid code '{code}'. No active reservation found.", None

    if target.status == BookingStatus.CHECKED_IN:
        ts = target.checked_in_at.strftime("%I:%M:%S %p") if target.checked_in_at else "recently"
        return (
            True,
            f"ALREADY CHECKED IN — {target.user_name} on Mat #{target.mat_number:02d} at {ts}.",
            target,
        )

    # Perform Check-In
    target.status = BookingStatus.CHECKED_IN
    target.checked_in_at = datetime.utcnow()
    await db.commit()
    await db.refresh(target)

    # Broadcast SSE
    await broadcaster.broadcast(
        "session_update",
        {
            "session_id": target.session_id,
            "action": "checkin",
            "mat_number": target.mat_number,
            "user_name": target.user_name,
        },
    )

    return (
        True,
        f"ACCESS GRANTED — {target.user_name.upper()} CHECKED IN TO MAT #{target.mat_number:02d}.",
        target,
    )
