import random
from datetime import datetime, date
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import HourlySession, Booking, BookingStatus
from app.services import generate_check_in_code


HOURLY_SCHEDULE = [
    ("06:00", "07:00", "06:00 AM - 07:00 AM", "DAWN ENDURANCE // INTERVAL MATS", "HIGH", "M. VANCE"),
    ("07:00", "08:00", "07:00 AM - 08:00 AM", "KINETIC POWER FLOW // CORE A", "HIGH", "E. KIP"),
    ("08:00", "09:00", "08:00 AM - 09:00 AM", "APEX MOBILITY // PEAK CAP", "STRENGTH", "T. SLOAN"),
    ("09:00", "10:00", "09:00 AM - 10:00 AM", "TEMPO DRILLS // ISOMETRIC B", "ENDURANCE", "L. CHEN"),
    ("10:00", "11:00", "10:00 AM - 11:00 AM", "MIDDAY RECOVERY // DYNAMIC MATS", "RECOVERY", "A. MERCER"),
    ("11:00", "12:00", "11:00 AM - 12:00 PM", "THRESHOLD CIRCUIT // SERIES I", "HIGH", "M. VANCE"),
    ("12:00", "13:00", "12:00 PM - 01:00 PM", "EXPRESS POWER // LUNCH PROTOCOL", "STRENGTH", "E. KIP"),
    ("13:00", "14:00", "01:00 PM - 02:00 PM", "POST-LUNCH METABOLIC RESET", "RECOVERY", "T. SLOAN"),
    ("14:00", "15:00", "02:00 PM - 03:00 PM", "TECHNICAL STRENGTH // MAT DRILLS", "STRENGTH", "L. CHEN"),
    ("15:00", "16:00", "03:00 PM - 04:00 PM", "AEROBIC FOUNDATIONS // STAGE II", "ENDURANCE", "A. MERCER"),
    ("16:00", "17:00", "04:00 PM - 05:00 PM", "EARLY SURGE // PLYOMETRICS", "HIGH", "M. VANCE"),
    ("17:00", "18:00", "05:00 PM - 06:00 PM", "PRIME SPRINT // CAPACITY RUN", "MAX EFFORT", "E. KIP"),
    ("18:00", "19:00", "06:00 PM - 07:00 PM", "RUSH HOUR // APEX 20 CHAMPION", "MAX EFFORT", "T. SLOAN"),
    ("19:00", "20:00", "07:00 PM - 08:00 PM", "EVENING HEAVY COMBAT MATS", "STRENGTH", "L. CHEN"),
    ("20:00", "21:00", "08:00 PM - 09:00 PM", "NIGHT PROTOCOL // DEEP FLOW", "RECOVERY", "A. MERCER"),
    ("21:00", "22:00", "09:00 PM - 10:00 PM", "FINAL RESET // TACTICAL DOWN", "RECOVERY", "STAFF ROTATION"),
]

MOCK_ATHLETES = [
    ("Marcus Chen", "marcus.chen@athletic.io"),
    ("Sarah Lindqvist", "sarah.l@tracksmith.dev"),
    ("Dante Rossi", "dante.r@kinetic.run"),
    ("Elena Rostova", "elena@apexmat.org"),
    ("Liam Thorne", "liam.t@sub4.run"),
    ("Maya Patel", "maya.patel@endurance.co"),
    ("Kai Tanaka", "kai.t@speedlab.jp"),
    ("Zoe Zimmerman", "zoe.z@tempo.cc"),
    ("Noah Sterling", "noah@hybrid.fit"),
    ("Ava Dubois", "ava.dubois@paris-track.fr"),
    ("Mateo Silva", "mateo.s@triathlon.br"),
    ("Chloe Bennett", "chloe.b@stride.com"),
    ("Lucas Wright", "lucas@apexathletic.com"),
    ("Hannah Becker", "hannah.b@berlin-run.de"),
    ("Devon Brooks", "devon@interval.io"),
    ("Jasmine Morales", "j.morales@crossflow.co"),
    ("Kobe Anderson", "kobe.a@altitude.run"),
    ("Aaliyah Washington", "aaliyah.w@velocity.us"),
    ("Soren Nielsen", "soren.n@copenhagen-track.dk"),
    ("Amara Okafor", "amara.o@lagos-runner.ng"),
    ("Gabe Romero", "gabe.romero@ultra.net"),
    ("Freja Hansen", "freja.h@nordic.fit"),
    ("Julian Moreau", "julian.m@tempo-lab.fr"),
]


async def seed_database(db: AsyncSession) -> None:
    """Seed sessions and realistic active bookings for today."""
    today_str = date.today().isoformat()

    existing_sessions = (await db.execute(select(func.count(HourlySession.id)))).scalar() or 0
    if existing_sessions > 0:
        return

    sessions: list[HourlySession] = []
    for start, end, display, title, intensity, coach in HOURLY_SCHEDULE:
        s = HourlySession(
            session_date=today_str,
            start_time=start,
            end_time=end,
            display_time=display,
            title=title,
            intensity=intensity,
            coach=coach,
            max_mats=20,
            is_active=True,
        )
        db.add(s)
        sessions.append(s)

    await db.commit()

    # Refresh sessions to get IDs
    for s in sessions:
        await db.refresh(s)

    # Populate bookings for realistic operational simulation
    # 08:00 AM session (index 2) -> EXACTLY 20/20 FULL + 3 WAITLISTED
    # 06:00 AM session (index 0) -> 16 confirmed, 10 checked in
    # 18:00 PM session (index 12) -> 19 confirmed, 1 open mat
    # Other sessions -> 10-15 confirmed

    for idx, s in enumerate(sessions):
        if idx == 2:  # 08:00 AM Peak Session - SOLD OUT (20 mats) + 3 Waitlist
            # Book 20 confirmed mats
            for mat_num in range(1, 21):
                athlete = MOCK_ATHLETES[mat_num - 1]
                b = Booking(
                    session_id=s.id,
                    user_id=f"user_seed_{mat_num}",
                    user_name=athlete[0],
                    user_email=athlete[1],
                    status=BookingStatus.CONFIRMED if mat_num > 5 else BookingStatus.CHECKED_IN,
                    mat_number=mat_num,
                    waitlist_position=None,
                    check_in_code=generate_check_in_code(),
                    checked_in_at=datetime.utcnow() if mat_num <= 5 else None,
                )
                db.add(b)

            # Add 3 waitlist members (#1, #2, #3)
            waitlist_athletes = [
                ("Devon Brooks", "devon@interval.io"),
                ("Jasmine Morales", "j.morales@crossflow.co"),
                ("Kobe Anderson", "kobe.a@altitude.run"),
            ]
            for w_idx, (w_name, w_email) in enumerate(waitlist_athletes, start=1):
                b = Booking(
                    session_id=s.id,
                    user_id=f"user_waitlist_{w_idx}",
                    user_name=w_name,
                    user_email=w_email,
                    status=BookingStatus.WAITLIST,
                    mat_number=None,
                    waitlist_position=w_idx,
                    check_in_code=None,
                )
                db.add(b)

        elif idx == 0:  # 06:00 AM Dawn Endurance: 16 confirmed (12 checked in)
            for mat_num in range(1, 17):
                athlete = MOCK_ATHLETES[mat_num - 1]
                is_checked = mat_num <= 12
                b = Booking(
                    session_id=s.id,
                    user_id=f"user_dawn_{mat_num}",
                    user_name=athlete[0],
                    user_email=athlete[1],
                    status=BookingStatus.CHECKED_IN if is_checked else BookingStatus.CONFIRMED,
                    mat_number=mat_num,
                    waitlist_position=None,
                    check_in_code=generate_check_in_code(),
                    checked_in_at=datetime.utcnow() if is_checked else None,
                )
                db.add(b)

        elif idx == 12:  # 18:00 PM Rush Hour: 19 confirmed, 1 open mat!
            for mat_num in range(1, 20):
                athlete = MOCK_ATHLETES[mat_num - 1]
                b = Booking(
                    session_id=s.id,
                    user_id=f"user_rush_{mat_num}",
                    user_name=athlete[0],
                    user_email=athlete[1],
                    status=BookingStatus.CONFIRMED,
                    mat_number=mat_num,
                    waitlist_position=None,
                    check_in_code=generate_check_in_code(),
                )
                db.add(b)

        else:
            # Random 8 to 14 mats
            num_bookings = random.randint(8, 14)
            chosen_athletes = random.sample(MOCK_ATHLETES, num_bookings)
            for m_idx, (a_name, a_email) in enumerate(chosen_athletes, start=1):
                b = Booking(
                    session_id=s.id,
                    user_id=f"user_gen_{s.id}_{m_idx}",
                    user_name=a_name,
                    user_email=a_email,
                    status=BookingStatus.CONFIRMED,
                    mat_number=m_idx,
                    waitlist_position=None,
                    check_in_code=generate_check_in_code(),
                )
                db.add(b)

    await db.commit()
