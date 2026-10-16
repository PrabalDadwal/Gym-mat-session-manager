import asyncio
import pytest
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import select, func

from app.models import Base, HourlySession, Booking, BookingStatus
from app.services import (
    book_session,
    cancel_booking,
    check_in_by_code,
    get_session_summary,
    normalize_code,
)

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"

async def setup_test_env():
    engine = create_async_engine(TEST_DB_URL, echo=False)
    async_session = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
    async with async_session() as session:
        s = HourlySession(
            session_date="2026-10-15",
            start_time="08:00",
            end_time="09:00",
            display_time="08:00 AM - 09:00 AM",
            title="TEST CAPACITY SESSION",
            intensity="HIGH",
            coach="COACH TEST",
            max_mats=20,
            is_active=True,
        )
        session.add(s)
        await session.commit()
        await session.refresh(s)
        return engine, async_session, s.id


def test_booking_under_capacity_allocates_mat_and_code():
    async def run():
        engine, async_session, session_id = await setup_test_env()
        async with async_session() as session:
            booking, is_new, msg = await book_session(
                db=session,
                session_id=session_id,
                user_id="user_1",
                user_name="Alex Rivera",
                user_email="alex@apex.run",
            )
            assert is_new is True
            assert booking.status == BookingStatus.CONFIRMED
            assert booking.mat_number == 1
            assert booking.waitlist_position is None
            assert booking.check_in_code is not None
            assert len(normalize_code(booking.check_in_code)) == 8
        await engine.dispose()

    asyncio.run(run())


def test_hard_invariant_never_21_and_waitlist_order():
    async def run():
        engine, async_session, session_id = await setup_test_env()
        async with async_session() as session:
            # Book first 20 spots
            for i in range(1, 21):
                b, is_new, _ = await book_session(
                    db=session,
                    session_id=session_id,
                    user_id=f"user_{i}",
                    user_name=f"Athlete {i}",
                    user_email=f"athlete{i}@test.com",
                )
                assert b.status == BookingStatus.CONFIRMED
                assert b.mat_number == i
                assert b.waitlist_position is None
                
            # Verify exactly 20 confirmed mats
            count_stmt = select(func.count(Booking.id)).where(
                Booking.session_id == session_id,
                Booking.status == BookingStatus.CONFIRMED,
            )
            confirmed_count = (await session.execute(count_stmt)).scalar()
            assert confirmed_count == 20

            # Book 21st user -> MUST be waitlist position #1 (HARD INVARIANT: NEVER 21 CONFIRMED)
            b21, is_new, msg21 = await book_session(
                db=session,
                session_id=session_id,
                user_id="user_21",
                user_name="Athlete 21",
                user_email="athlete21@test.com",
            )
            assert b21.status == BookingStatus.WAITLIST
            assert b21.mat_number is None
            assert b21.waitlist_position == 1
            assert b21.check_in_code is None

            # Book 22nd user -> MUST be waitlist position #2
            b22, is_new, msg22 = await book_session(
                db=session,
                session_id=session_id,
                user_id="user_22",
                user_name="Athlete 22",
                user_email="athlete22@test.com",
            )
            assert b22.status == BookingStatus.WAITLIST
            assert b22.mat_number is None
            assert b22.waitlist_position == 2

            # Re-verify confirmed count remains strictly 20
            confirmed_count_after = (await session.execute(count_stmt)).scalar()
            assert confirmed_count_after == 20
        await engine.dispose()

    asyncio.run(run())


def test_cancellation_auto_promotes_waitlist_1_and_shifts_queue():
    async def run():
        engine, async_session, session_id = await setup_test_env()
        async with async_session() as session:
            # Book 20 confirmed spots
            confirmed_bookings = []
            for i in range(1, 21):
                b, _, _ = await book_session(
                    db=session,
                    session_id=session_id,
                    user_id=f"user_{i}",
                    user_name=f"Athlete {i}",
                    user_email=f"athlete{i}@test.com",
                )
                confirmed_bookings.append(b)

            # Book 2 waitlist users (#1 and #2)
            w1, _, _ = await book_session(
                db=session,
                session_id=session_id,
                user_id="user_w1",
                user_name="Waitlist One",
                user_email="w1@test.com",
            )
            w2, _, _ = await book_session(
                db=session,
                session_id=session_id,
                user_id="user_w2",
                user_name="Waitlist Two",
                user_email="w2@test.com",
            )
            assert w1.waitlist_position == 1
            assert w2.waitlist_position == 2

            # Cancel confirmed user on Mat #5
            target_to_cancel = confirmed_bookings[4] # user_5, Mat 5
            success, msg, sid = await cancel_booking(
                db=session,
                booking_id=target_to_cancel.id,
                user_id="user_5",
            )
            assert success is True

            # Refresh w1 and w2 from DB
            await session.refresh(w1)
            await session.refresh(w2)

            # w1 MUST be automatically promoted to CONFIRMED with freed Mat #5 and a check-in code!
            assert w1.status == BookingStatus.CONFIRMED
            assert w1.mat_number == 5
            assert w1.waitlist_position is None
            assert w1.check_in_code is not None
            assert len(normalize_code(w1.check_in_code)) == 8

            # w2 MUST have shifted from position #2 to position #1!
            assert w2.status == BookingStatus.WAITLIST
            assert w2.waitlist_position == 1

            # Confirmed count must STILL strictly be 20
            summary = await get_session_summary(session, session_id)
            assert summary["confirmed_count"] == 20
            assert summary["waitlist_count"] == 1
        await engine.dispose()

    asyncio.run(run())


def test_door_check_in_terminal():
    async def run():
        engine, async_session, session_id = await setup_test_env()
        async with async_session() as session:
            # Book a user
            b, _, _ = await book_session(
                db=session,
                session_id=session_id,
                user_id="user_terminal",
                user_name="Jordan Vance",
                user_email="jvance@apex.run",
            )
            code = b.check_in_code
            assert code is not None

            # Test Invalid Code
            inv_success, inv_msg, _ = await check_in_by_code(session, "INVALID-99", session_id)
            assert inv_success is False

            # Test Valid Code Check-In
            success, msg, checked_b = await check_in_by_code(session, code, session_id)
            assert success is True
            assert checked_b.status == BookingStatus.CHECKED_IN
            assert checked_b.checked_in_at is not None

            # Test Duplicate Check-In
            dup_success, dup_msg, _ = await check_in_by_code(session, code, session_id)
            assert dup_success is True
            assert "ALREADY CHECKED IN" in dup_msg
        await engine.dispose()

    asyncio.run(run())


def test_concurrent_bookings_preserves_invariant():
    async def run():
        engine, async_session, session_id = await setup_test_env()
        async with async_session() as session:
            # Fire 25 concurrent booking attempts
            async def book_athlete(num: int):
                return await book_session(
                    db=session,
                    session_id=session_id,
                    user_id=f"concurrent_{num}",
                    user_name=f"Concurrent {num}",
                    user_email=f"c{num}@test.com",
                )

            tasks = [book_athlete(i) for i in range(1, 26)]
            results = await asyncio.gather(*tasks)

            confirmed = [r[0] for r in results if r[0].status == BookingStatus.CONFIRMED]
            waitlisted = [r[0] for r in results if r[0].status == BookingStatus.WAITLIST]

            # HARD INVARIANT: Exactly 20 confirmed, 5 waitlisted
            assert len(confirmed) == 20
            assert len(waitlisted) == 5

            # Check mat numbers are unique 1..20
            mat_nums = sorted([c.mat_number for c in confirmed])
            assert mat_nums == list(range(1, 21))

            # Check waitlist positions are unique 1..5
            wl_positions = sorted([w.waitlist_position for w in waitlisted])
            assert wl_positions == list(range(1, 6))
        await engine.dispose()

    asyncio.run(run())
