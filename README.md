# APEX MAT LAB // HOURLY MAT BOOKING & REGULATION SYSTEM

> High-precision hourly gym mat reservation protocol, real-time waitlist engine, door check-in terminal, and regulatory administration console.

---

## ⚡ Quick Start & Live Access

- **Development Port:** `http://localhost:3000`
- **Primary Views:**
  1. **Member View (`/`):** 16 hourly sessions (06:00 AM – 10:00 PM), interactive 20-mat floor matrix, instant booking, and waitlist passes.
  2. **Door Terminal (`/` with `[ DOOR TERMINAL ]`):** High-contrast tablet check-in station with 8-character code verification and audio chime.
  3. **Admin Console (`/` with `[ ADMIN CONSOLE ]`):** Full regulatory headquarters for user approvals, user directory, floor capacity, and dispatch audit logs.

---

## 👑 Main Admin & Regulatory System

### 1. Main Admin Account
- **Master Email:** `prabaldadwal2008@gmail.com`
- **Role:** `MAIN_ADMIN`
- **Initial Password:** `admin123` (or choose any password on initial login/registration)
- The Main Admin account is pre-initialized, permanent, and cannot be demoted or locked out.

### 2. How to Access the Admin Window
1. Click the **`[ ADMIN CONSOLE ]`** tab in the top navigation bar.
2. If you are not logged in:
   - Click the orange **`LOGIN AS MAIN ADMIN (prabaldadwal2008@gmail.com)`** button for 1-click access, or
   - Click **`LOGIN`** in the top-right corner and enter `prabaldadwal2008@gmail.com`.
3. If an account is already authenticated as `MAIN_ADMIN` or approved `ADMIN`, the **Admin Regulation Console** opens immediately.

### 3. Client vs. Admin Registration & Approval Protocol
When clicking **`REGISTER`** in the navigation:
- **Client Option (`● CLIENT`):**
  - Instant account activation (`status: ACTIVE`).
  - Allows booking hourly mat sessions, joining waitlists, and receiving door passes.
- **Admin Option (`● ADMIN`):**
  - Requires regulatory verification.
  - Upon submission, the account is set to **`PENDING_APPROVAL`**.
  - An authorization dispatch request is created and routed to **`prabaldadwal2008@gmail.com`**.
  - A real-time notification badge increments on the Main Admin's screen.
  - If the applicant tries to log in before approval, they receive an alert:
    > *"Your Admin application is currently PENDING APPROVAL from Main Admin (prabaldadwal2008@gmail.com). Please wait for regulatory approval."*
  - The Main Admin opens **`[ ADMIN CONSOLE ]` ➔ `ADMIN APPROVAL QUEUE`** and can click **`[ APPROVE ADMIN ACCESS ]`** or **`[ REJECT ]`**.

---

## 🧹 Dummy Names & Launching for Real Production Use

### Will the dummy names remain when you publish the site?
**No, you can wipe them completely clean with one click!**

Initially, sample athletes (such as Marcus Chen, Sarah Lindqvist, etc.) are pre-loaded to demonstrate full capacity (Session 3 at 20/20 full with waitlist) and door check-in features right out of the box.

### How to Start 100% Clean for Live Production:
1. Log into the **`[ ADMIN CONSOLE ]`** as Main Admin (`prabaldadwal2008@gmail.com`).
2. Open the **`CAPACITY & FLOOR REGULATION`** tab.
3. In the black **"LIVE PRODUCTION CONTROLS"** card at the top, choose your desired option:
   - **`CLEAR ALL BOOKINGS (0/20)`**: Resets all 16 hourly sessions to 0 bookings and 20 open mats. Real user registrations are kept intact.
   - **`PURGE DEMO DATA (LIVE READY)`**: Purges all dummy bookings, sample mock athletes, and test requests. Preserves `prabaldadwal2008@gmail.com` and all genuine registered users.
4. All connected screens and terminals update instantly via Server-Sent Events (SSE).
5. *(Optional)* If you ever want to demonstrate or test the floor full capacity again, click **`RE-SEED DEMO DATA`**.

---

## 🥋 Core System Invariants & Rules

### 1. Strict 20-Mat Cap (Hard Physical Invariant)
- Every 60-minute session has **exactly 20 mats** numbered `#01` to `#20`.
- Under no circumstance can a 21st confirmed mat booking exist.
- Reservations 1 through 20 are assigned the next available mat and receive an **8-character check-in code** (e.g., `4R7K-9P2M`).
- Reservation 21 and above are automatically placed into the **Atomic Waitlist** (`#1`, `#2`, `#3`...).

### 2. Atomic Waitlist Promotion
- When a confirmed athlete cancels their booking, the next waitlisted athlete (`Waitlist #1`) is atomically promoted to `CONFIRMED`.
- The promoted athlete is allocated the newly freed mat number and an 8-character door code is automatically generated.
- All remaining waitlist positions shift forward (`#2` becomes `#1`, `#3` becomes `#2`).

### 3. Door Terminal & Check-In Verification
- Front desk staff or gym tablets at the door operate on the **`[ DOOR TERMINAL ]`** view.
- Entering the athlete's 8-character code marks the mat as **`CHECKED IN`** (green visual indicator).
- Dual feedback: A high-contrast success banner and an audio chime sound.
- Duplicate or invalid check-in attempts are rejected with clear visual warnings.

---

## 🛠️ Tech Stack & Architecture

- **Frontend:** React 19, TypeScript, Tailwind CSS, Lucide Icons, Motion.
- **Backend Server:** Express + Node.js (`server.ts`) with Vite middleware mounting.
- **Real-Time Synchronization:** Server-Sent Events (`/api/events`) for zero-refresh floor and queue updates.
- **Persistence:** Local JSON database (`bookings_store.json`), preserving users, admin permissions, and mat reservations across restarts.
- **Styling Aesthetic:** High-contrast athletic editorial typography (Oswald, Space Grotesk, JetBrains Mono tabular figures, Signal Orange accent `#FF3B00`, Tactical Lime `#00FF66`).

---

## 🚀 Running & Developing

```bash
# Install dependencies
npm install

# Start development server (serves Express + Vite on port 3000)
npm run dev

# Run TypeScript type check
npm run lint

# Build production assets
npm run build
```

---

## 🛡️ Admin Regulation Workspaces

| Workspace | Description |
|---|---|
| **Admin Approval Queue** | Review pending Admin registration applications sent to `prabaldadwal2008@gmail.com`. One-click approve or reject. |
| **User Directory** | View all registered accounts, toggle between active/suspended statuses, promote clients to admin, or demote. |
| **Capacity & Floor Regulation** | Real-time overview of all 16 hourly blocks, live booking counts, and one-click production data purging. |
| **Authorization Dispatches** | Complete audit trail of simulated authorization emails dispatched to `prabaldadwal2008@gmail.com`. |
