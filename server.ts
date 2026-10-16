import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -----------------------------------------------------------------------------
// Data Types & In-Memory Store with Strict Concurrency Locking
// -----------------------------------------------------------------------------

export type BookingStatus = 'CONFIRMED' | 'WAITLIST' | 'CHECKED_IN' | 'CANCELLED';
export type UserRole = 'CLIENT' | 'ADMIN' | 'MAIN_ADMIN';
export type UserStatus = 'ACTIVE' | 'PENDING_APPROVAL' | 'SUSPENDED';

export interface User {
  id: string;
  name: string;
  email: string;
  password: string; // stored for demo
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  approvedAt?: string;
  approvedBy?: string;
}

export interface AdminApprovalNotification {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  requestedRole: 'ADMIN';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  timestamp: string;
  notificationSentTo: string;
}

export interface Booking {
  id: number;
  sessionId: number;
  userId: string;
  userName: string;
  userEmail: string;
  status: BookingStatus;
  matNumber: number | null;
  waitlistPosition: number | null;
  checkInCode: string | null;
  checkedInAt: string | null;
  createdAt: string;
}

export interface HourlySession {
  id: number;
  startTime: string;
  endTime: string;
  displayTime: string;
  title: string;
  intensity: string;
  coach: string;
  maxMats: number;
}

const MAIN_ADMIN_EMAIL = 'prabaldadwal2008@gmail.com';

const HOURLY_SCHEDULE: Array<Omit<HourlySession, 'id'>> = [
  { startTime: '06:00', endTime: '07:00', displayTime: '06:00 AM - 07:00 AM', title: 'DAWN ENDURANCE // INTERVAL MATS', intensity: 'HIGH', coach: 'M. VANCE', maxMats: 20 },
  { startTime: '07:00', endTime: '08:00', displayTime: '07:00 AM - 08:00 AM', title: 'KINETIC POWER FLOW // CORE A', intensity: 'HIGH', coach: 'E. KIP', maxMats: 20 },
  { startTime: '08:00', endTime: '09:00', displayTime: '08:00 AM - 09:00 AM', title: 'APEX MOBILITY // PEAK CAP', intensity: 'STRENGTH', coach: 'T. SLOAN', maxMats: 20 },
  { startTime: '09:00', endTime: '10:00', displayTime: '09:00 AM - 10:00 AM', title: 'TEMPO DRILLS // ISOMETRIC B', intensity: 'ENDURANCE', coach: 'L. CHEN', maxMats: 20 },
  { startTime: '10:00', endTime: '11:00', displayTime: '10:00 AM - 11:00 AM', title: 'MIDDAY RECOVERY // DYNAMIC MATS', intensity: 'RECOVERY', coach: 'A. MERCER', maxMats: 20 },
  { startTime: '11:00', endTime: '12:00', displayTime: '11:00 AM - 12:00 PM', title: 'THRESHOLD CIRCUIT // SERIES I', intensity: 'HIGH', coach: 'M. VANCE', maxMats: 20 },
  { startTime: '12:00', endTime: '13:00', displayTime: '12:00 PM - 01:00 PM', title: 'EXPRESS POWER // LUNCH PROTOCOL', intensity: 'STRENGTH', coach: 'E. KIP', maxMats: 20 },
  { startTime: '13:00', endTime: '14:00', displayTime: '01:00 PM - 02:00 PM', title: 'POST-LUNCH METABOLIC RESET', intensity: 'RECOVERY', coach: 'T. SLOAN', maxMats: 20 },
  { startTime: '14:00', endTime: '15:00', displayTime: '02:00 PM - 03:00 PM', title: 'TECHNICAL STRENGTH // MAT DRILLS', intensity: 'STRENGTH', coach: 'L. CHEN', maxMats: 20 },
  { startTime: '15:00', endTime: '16:00', displayTime: '03:00 PM - 04:00 PM', title: 'AEROBIC FOUNDATIONS // STAGE II', intensity: 'ENDURANCE', coach: 'A. MERCER', maxMats: 20 },
  { startTime: '16:00', endTime: '17:00', displayTime: '04:00 PM - 05:00 PM', title: 'EARLY SURGE // PLYOMETRICS', intensity: 'HIGH', coach: 'M. VANCE', maxMats: 20 },
  { startTime: '17:00', endTime: '18:00', displayTime: '05:00 PM - 06:00 PM', title: 'PRIME SPRINT // CAPACITY RUN', intensity: 'MAX EFFORT', coach: 'E. KIP', maxMats: 20 },
  { startTime: '18:00', endTime: '19:00', displayTime: '06:00 PM - 07:00 PM', title: 'RUSH HOUR // APEX 20 CHAMPION', intensity: 'MAX EFFORT', coach: 'T. SLOAN', maxMats: 20 },
  { startTime: '19:00', endTime: '20:00', displayTime: '07:00 PM - 08:00 PM', title: 'EVENING HEAVY COMBAT MATS', intensity: 'STRENGTH', coach: 'L. CHEN', maxMats: 20 },
  { startTime: '20:00', endTime: '21:00', displayTime: '08:00 PM - 09:00 PM', title: 'NIGHT PROTOCOL // DEEP FLOW', intensity: 'RECOVERY', coach: 'A. MERCER', maxMats: 20 },
  { startTime: '21:00', endTime: '22:00', displayTime: '09:00 PM - 10:00 PM', title: 'FINAL RESET // TACTICAL DOWN', intensity: 'RECOVERY', coach: 'STAFF ROTATION', maxMats: 20 },
];

const MOCK_ATHLETES = [
  ['Marcus Chen', 'marcus.chen@athletic.io'],
  ['Sarah Lindqvist', 'sarah.l@tracksmith.dev'],
  ['Dante Rossi', 'dante.r@kinetic.run'],
  ['Elena Rostova', 'elena@apexmat.org'],
  ['Liam Thorne', 'liam.t@sub4.run'],
  ['Maya Patel', 'maya.patel@endurance.co'],
  ['Kai Tanaka', 'kai.t@speedlab.jp'],
  ['Zoe Zimmerman', 'zoe.z@tempo.cc'],
  ['Noah Sterling', 'noah@hybrid.fit'],
  ['Ava Dubois', 'ava.dubois@paris-track.fr'],
  ['Mateo Silva', 'mateo.s@triathlon.br'],
  ['Chloe Bennett', 'chloe.b@stride.com'],
  ['Lucas Wright', 'lucas@apexathletic.com'],
  ['Hannah Becker', 'hannah.b@berlin-run.de'],
  ['Devon Brooks', 'devon@interval.io'],
  ['Jasmine Morales', 'j.morales@crossflow.co'],
  ['Kobe Anderson', 'kobe.a@altitude.run'],
  ['Aaliyah Washington', 'aaliyah.w@velocity.us'],
  ['Soren Nielsen', 'soren.n@copenhagen-track.dk'],
  ['Amara Okafor', 'amara.o@lagos-runner.ng'],
];

function generateCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let p1 = '';
  let p2 = '';
  for (let i = 0; i < 4; i++) {
    p1 += chars.charAt(Math.floor(Math.random() * chars.length));
    p2 += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${p1}-${p2}`;
}

function normalizeCode(c: string): string {
  return c.trim().replace(/[- ]/g, '').toUpperCase();
}

// Global In-Memory & File-Backed Database
const DATA_FILE = path.resolve(__dirname, 'bookings_store.json');
const SESSIONS: HourlySession[] = HOURLY_SCHEDULE.map((s, idx) => ({ id: idx + 1, ...s }));
let BOOKINGS: Booking[] = [];
let USERS: User[] = [];
let ADMIN_REQUESTS: AdminApprovalNotification[] = [];
let nextBookingId = 1;

function saveToDisk() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify({ nextBookingId, bookings: BOOKINGS, users: USERS, adminRequests: ADMIN_REQUESTS }, null, 2)
    );
  } catch (err) {
    console.error('Failed to persist store to disk:', err);
  }
}

function loadFromDisk(): boolean {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      if (Array.isArray(data.bookings) && data.bookings.length > 0) {
        BOOKINGS = data.bookings;
        nextBookingId = data.nextBookingId || Math.max(...BOOKINGS.map((b) => b.id), 0) + 1;
        USERS = Array.isArray(data.users) ? data.users : [];
        ADMIN_REQUESTS = Array.isArray(data.adminRequests) ? data.adminRequests : [];
        return true;
      }
    }
  } catch (err) {
    console.error('Failed to read bookings_store.json:', err);
  }
  return false;
}

// Seed initial data
function seedInitialData() {
  if (loadFromDisk()) {
    console.log(`[APEX MAT LAB] Loaded ${BOOKINGS.length} bookings & ${USERS.length} users.`);
    // Ensure main admin exists
    ensureMainAdmin();
    return;
  }

  // Pre-seed Main Admin: prabaldadwal2008@gmail.com
  ensureMainAdmin();

  // Session 3 (08:00 AM) -> EXACTLY 20/20 FULL + 3 WAITLIST
  const s3 = SESSIONS[2];
  for (let m = 1; m <= 20; m++) {
    const athlete = MOCK_ATHLETES[m - 1] || [`Athlete ${m}`, `athlete${m}@apex.io`];
    const isChecked = m <= 5;
    BOOKINGS.push({
      id: nextBookingId++,
      sessionId: s3.id,
      userId: `user_seed_${m}`,
      userName: athlete[0],
      userEmail: athlete[1],
      status: isChecked ? 'CHECKED_IN' : 'CONFIRMED',
      matNumber: m,
      waitlistPosition: null,
      checkInCode: generateCode(),
      checkedInAt: isChecked ? new Date().toISOString() : null,
      createdAt: new Date().toISOString(),
    });
  }

  // 3 Waitlist athletes
  const waitlistAthletes = [
    ['Devon Brooks', 'devon@interval.io'],
    ['Jasmine Morales', 'j.morales@crossflow.co'],
    ['Kobe Anderson', 'kobe.a@altitude.run'],
  ];
  waitlistAthletes.forEach((w, wIdx) => {
    BOOKINGS.push({
      id: nextBookingId++,
      sessionId: s3.id,
      userId: `user_waitlist_${wIdx + 1}`,
      userName: w[0],
      userEmail: w[1],
      status: 'WAITLIST',
      matNumber: null,
      waitlistPosition: wIdx + 1,
      checkInCode: null,
      checkedInAt: null,
      createdAt: new Date().toISOString(),
    });
  });

  // Session 1 (06:00 AM) -> 16 confirmed, 12 checked in (4 open mats)
  const s1 = SESSIONS[0];
  for (let m = 1; m <= 16; m++) {
    const athlete = MOCK_ATHLETES[m - 1];
    const isChecked = m <= 12;
    BOOKINGS.push({
      id: nextBookingId++,
      sessionId: s1.id,
      userId: `user_dawn_${m}`,
      userName: athlete[0],
      userEmail: athlete[1],
      status: isChecked ? 'CHECKED_IN' : 'CONFIRMED',
      matNumber: m,
      waitlistPosition: null,
      checkInCode: generateCode(),
      checkedInAt: isChecked ? new Date().toISOString() : null,
      createdAt: new Date().toISOString(),
    });
  }

  // Other sessions: 8-14 mats booked
  SESSIONS.forEach((s) => {
    if (s.id !== 1 && s.id !== 3) {
      const count = 10 + (s.id % 5);
      for (let m = 1; m <= count; m++) {
        const athlete = MOCK_ATHLETES[(m + s.id) % MOCK_ATHLETES.length];
        BOOKINGS.push({
          id: nextBookingId++,
          sessionId: s.id,
          userId: `user_gen_${s.id}_${m}`,
          userName: athlete[0],
          userEmail: athlete[1],
          status: 'CONFIRMED',
          matNumber: m,
          waitlistPosition: null,
          checkInCode: generateCode(),
          checkedInAt: null,
          createdAt: new Date().toISOString(),
        });
      }
    }
  });

  saveToDisk();
}

function ensureMainAdmin() {
  const existing = USERS.find((u) => u.email.toLowerCase() === MAIN_ADMIN_EMAIL.toLowerCase());
  if (!existing) {
    USERS.push({
      id: 'admin_prabal_root',
      name: 'Prabal Dadwal (Main Admin)',
      email: MAIN_ADMIN_EMAIL,
      password: 'admin123',
      role: 'MAIN_ADMIN',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      approvedAt: new Date().toISOString(),
      approvedBy: 'SYSTEM_GENESIS',
    });
  } else {
    existing.role = 'MAIN_ADMIN';
    existing.status = 'ACTIVE';
  }

  // Also pre-seed a sample pending admin request to demonstrate the regulation workflow immediately
  const samplePending = USERS.find((u) => u.email === 'marcus.staff@apex.io');
  if (!samplePending) {
    const sampleUser: User = {
      id: 'user_req_marcus',
      name: 'Marcus Vance',
      email: 'marcus.staff@apex.io',
      password: 'password123',
      role: 'ADMIN',
      status: 'PENDING_APPROVAL',
      createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    };
    USERS.push(sampleUser);
    ADMIN_REQUESTS.push({
      id: 'req_marcus_01',
      userId: sampleUser.id,
      userName: sampleUser.name,
      userEmail: sampleUser.email,
      requestedRole: 'ADMIN',
      status: 'PENDING',
      timestamp: sampleUser.createdAt,
      notificationSentTo: MAIN_ADMIN_EMAIL,
    });
  }

  saveToDisk();
}

seedInitialData();

// -----------------------------------------------------------------------------
// Real-Time SSE Broadcaster
// -----------------------------------------------------------------------------

type SSEClient = { id: number; res: Response };
let sseClients: SSEClient[] = [];
let nextClientId = 1;

function broadcastUpdate(sessionId: number, action: string, extra?: Record<string, any>) {
  const payload = JSON.stringify({ sessionId, action, timestamp: new Date().toISOString(), ...extra });
  sseClients.forEach((client) => {
    client.res.write(`event: session_update\ndata: ${payload}\n\n`);
  });
}

function broadcastAdminEvent(action: string, extra?: Record<string, any>) {
  const payload = JSON.stringify({ action, timestamp: new Date().toISOString(), ...extra });
  sseClients.forEach((client) => {
    client.res.write(`event: admin_update\ndata: ${payload}\n\n`);
  });
}

// -----------------------------------------------------------------------------
// Express Server Setup
// -----------------------------------------------------------------------------

async function startServer() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // SSE Stream Route
  app.get('/api/events', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const clientId = nextClientId++;
    sseClients.push({ id: clientId, res });

    res.write(`event: connected\ndata: ${JSON.stringify({ status: 'live' })}\n\n`);

    req.on('close', () => {
      sseClients = sseClients.filter((c) => c.id !== clientId);
    });
  });

  // ---------------------------------------------------------------------------
  // AUTHENTICATION & ADMIN REGULATION APIS
  // ---------------------------------------------------------------------------

  // Register endpoint
  app.post('/api/auth/register', (req: Request, res: Response) => {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = USERS.find((u) => u.email.toLowerCase() === cleanEmail);
    if (existing) {
      return res.status(400).json({ error: 'An account with this email already exists. Please log in.' });
    }

    const isMainAdmin = cleanEmail === MAIN_ADMIN_EMAIL.toLowerCase();
    const requestedRole: UserRole = isMainAdmin ? 'MAIN_ADMIN' : role === 'ADMIN' ? 'ADMIN' : 'CLIENT';

    // If client or main admin, automatically ACTIVE. If requested ADMIN by another email, PENDING_APPROVAL.
    const status: UserStatus = isMainAdmin || requestedRole === 'CLIENT' ? 'ACTIVE' : 'PENDING_APPROVAL';

    const newUser: User = {
      id: `usr_${Math.random().toString(36).substring(2, 10)}`,
      name: name.trim(),
      email: cleanEmail,
      password: password.trim(),
      role: requestedRole,
      status,
      createdAt: new Date().toISOString(),
      approvedAt: status === 'ACTIVE' ? new Date().toISOString() : undefined,
      approvedBy: isMainAdmin ? 'ROOT' : undefined,
    };

    USERS.push(newUser);

    let notificationSent = false;
    if (requestedRole === 'ADMIN' && status === 'PENDING_APPROVAL') {
      const adminReq: AdminApprovalNotification = {
        id: `req_${Math.random().toString(36).substring(2, 10)}`,
        userId: newUser.id,
        userName: newUser.name,
        userEmail: newUser.email,
        requestedRole: 'ADMIN',
        status: 'PENDING',
        timestamp: new Date().toISOString(),
        notificationSentTo: MAIN_ADMIN_EMAIL,
      };
      ADMIN_REQUESTS.push(adminReq);
      notificationSent = true;
      broadcastAdminEvent('new_request', { user: newUser.name, email: newUser.email });
    }

    saveToDisk();

    if (status === 'PENDING_APPROVAL') {
      return res.json({
        success: true,
        pendingApproval: true,
        message: `Admin registration submitted. An authorization request was dispatched to Main Admin (${MAIN_ADMIN_EMAIL}). Access will be activated upon approval.`,
        user: {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          role: newUser.role,
          status: newUser.status,
        },
      });
    }

    return res.json({
      success: true,
      pendingApproval: false,
      message: isMainAdmin
        ? `Welcome Main Admin (${newUser.name}). You hold full regulatory authorization.`
        : `Welcome ${newUser.name}. Client account activated.`,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        status: newUser.status,
      },
    });
  });

  // Login endpoint
  app.post('/api/auth/login', (req: Request, res: Response) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = USERS.find((u) => u.email.toLowerCase() === cleanEmail);

    if (!user) {
      // If user is trying to log in as Main Admin for the first time with any password, allow bootstrap
      if (cleanEmail === MAIN_ADMIN_EMAIL.toLowerCase()) {
        const mainAdmin: User = {
          id: 'admin_prabal_root',
          name: 'Prabal Dadwal',
          email: MAIN_ADMIN_EMAIL,
          password: password.trim(),
          role: 'MAIN_ADMIN',
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
          approvedAt: new Date().toISOString(),
          approvedBy: 'SYSTEM_BOOTSTRAP',
        };
        USERS.push(mainAdmin);
        saveToDisk();
        return res.json({
          success: true,
          message: 'Main Admin account initialized & authenticated.',
          user: {
            id: mainAdmin.id,
            name: mainAdmin.name,
            email: mainAdmin.email,
            role: mainAdmin.role,
            status: mainAdmin.status,
          },
        });
      }
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (user.password !== password.trim()) {
      return res.status(401).json({ error: 'Incorrect password.' });
    }

    if (user.status === 'PENDING_APPROVAL') {
      return res.status(403).json({
        error: `Your Admin application is currently PENDING APPROVAL from Main Admin (${MAIN_ADMIN_EMAIL}). Please wait for regulatory approval.`,
        pendingApproval: true,
      });
    }

    if (user.status === 'SUSPENDED') {
      return res.status(403).json({ error: 'Your account has been suspended by administration.' });
    }

    return res.json({
      success: true,
      message: `Authenticated as ${user.name} (${user.role}).`,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
      },
    });
  });

  // Get Admin Directory & Approvals (Admin/Main Admin only)
  app.get('/api/admin/overview', (req: Request, res: Response) => {
    res.json({
      mainAdminEmail: MAIN_ADMIN_EMAIL,
      users: USERS.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        status: u.status,
        createdAt: u.createdAt,
        approvedAt: u.approvedAt,
        approvedBy: u.approvedBy,
      })),
      adminRequests: ADMIN_REQUESTS,
      totalUsers: USERS.length,
      totalAdmins: USERS.filter((u) => u.role === 'ADMIN' || u.role === 'MAIN_ADMIN').length,
      pendingRequests: ADMIN_REQUESTS.filter((r) => r.status === 'PENDING').length,
    });
  });

  // Approve Admin Request (Admin regulation)
  app.post('/api/admin/approve-request', (req: Request, res: Response) => {
    const { requestId, approverEmail } = req.body;
    const reqItem = ADMIN_REQUESTS.find((r) => r.id === requestId);
    if (!reqItem) {
      return res.status(404).json({ error: 'Approval request not found.' });
    }

    reqItem.status = 'APPROVED';

    const user = USERS.find((u) => u.id === reqItem.userId);
    if (user) {
      user.role = 'ADMIN';
      user.status = 'ACTIVE';
      user.approvedAt = new Date().toISOString();
      user.approvedBy = approverEmail || MAIN_ADMIN_EMAIL;
    }

    saveToDisk();
    broadcastAdminEvent('approved', { requestId, userName: reqItem.userName });

    return res.json({
      success: true,
      message: `Admin access granted to ${reqItem.userName} (${reqItem.userEmail}).`,
    });
  });

  // Reject / Revoke Admin Request
  app.post('/api/admin/reject-request', (req: Request, res: Response) => {
    const { requestId } = req.body;
    const reqItem = ADMIN_REQUESTS.find((r) => r.id === requestId);
    if (!reqItem) {
      return res.status(404).json({ error: 'Request not found.' });
    }

    reqItem.status = 'REJECTED';
    const user = USERS.find((u) => u.id === reqItem.userId);
    if (user && user.role !== 'MAIN_ADMIN') {
      user.role = 'CLIENT';
      user.status = 'ACTIVE';
    }

    saveToDisk();
    broadcastAdminEvent('rejected', { requestId, userName: reqItem.userName });

    return res.json({
      success: true,
      message: `Admin request for ${reqItem.userName} rejected. Reverted to Client profile.`,
    });
  });

  // Update user role or status (Regulation console)
  app.post('/api/admin/update-user', (req: Request, res: Response) => {
    const { userId, role, status } = req.body;
    const user = USERS.find((u) => u.id === userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (user.email.toLowerCase() === MAIN_ADMIN_EMAIL.toLowerCase()) {
      return res.status(400).json({ error: 'The Main Admin account cannot be demoted or modified.' });
    }

    if (role) user.role = role;
    if (status) user.status = status;

    saveToDisk();
    broadcastAdminEvent('user_updated', { userId, name: user.name, role: user.role, status: user.status });

    return res.json({
      success: true,
      message: `User ${user.name} updated to Role: ${user.role}, Status: ${user.status}.`,
    });
  });

  // ---------------------------------------------------------------------------
  // MAT BOOKING & FLOOR CONTROL APIS
  // ---------------------------------------------------------------------------

  // API: Get all sessions with live summary
  app.get('/api/sessions', (_req: Request, res: Response) => {
    const list = SESSIONS.map((s) => {
      const active = BOOKINGS.filter(
        (b) => b.sessionId === s.id && (b.status === 'CONFIRMED' || b.status === 'CHECKED_IN')
      );
      const checkedIn = active.filter((b) => b.status === 'CHECKED_IN').length;
      const waitlist = BOOKINGS.filter((b) => b.sessionId === s.id && b.status === 'WAITLIST').length;
      const matsRemaining = Math.max(0, 20 - active.length);

      return {
        ...s,
        confirmedCount: active.length,
        checkedInCount: checkedIn,
        waitlistCount: waitlist,
        matsRemaining,
        isFull: active.length >= 20,
      };
    });

    res.json({ sessions: list });
  });

  // API: Get single session summary
  app.get('/api/sessions/:id', (req: Request, res: Response) => {
    const sid = parseInt(req.params.id, 10);
    const session = SESSIONS.find((s) => s.id === sid);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const activeBookings = BOOKINGS.filter(
      (b) => b.sessionId === sid && (b.status === 'CONFIRMED' || b.status === 'CHECKED_IN')
    );
    const checkedInCount = activeBookings.filter((b) => b.status === 'CHECKED_IN').length;
    const waitlist = BOOKINGS.filter((b) => b.sessionId === sid && b.status === 'WAITLIST').sort(
      (a, b) => (a.waitlistPosition || 0) - (b.waitlistPosition || 0)
    );

    // 1 to 20 mat mapping
    const matMap: Record<number, Booking | null> = {};
    for (let i = 1; i <= 20; i++) {
      matMap[i] = activeBookings.find((b) => b.matNumber === i) || null;
    }

    res.json({
      session,
      confirmedCount: activeBookings.length,
      checkedInCount,
      waitlistCount: waitlist.length,
      matsRemaining: Math.max(0, 20 - activeBookings.length),
      isFull: activeBookings.length >= 20,
      matMap,
      waitlist,
      confirmedBookings: activeBookings,
    });
  });

  // API: Book session (Atomic 20-mat invariant lock)
  app.post('/api/book', (req: Request, res: Response) => {
    const { sessionId, userName, userEmail, userId } = req.body;
    const sid = parseInt(sessionId, 10);
    const session = SESSIONS.find((s) => s.id === sid);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const uid = userId || `ath_${Math.random().toString(36).substring(2, 10)}`;
    const name = (userName || 'Anonymous Athlete').trim();
    const email = (userEmail || `${uid}@apex.run`).trim();

    // Check if user already booked in this session
    const existing = BOOKINGS.find((b) => b.sessionId === sid && b.userId === uid && b.status !== 'CANCELLED');
    if (existing) {
      return res.json({
        success: true,
        isNew: false,
        message:
          existing.status === 'WAITLIST'
            ? `You are currently #${existing.waitlistPosition} on the waitlist.`
            : `You already hold Mat #${String(existing.matNumber).padStart(2, '0')}.`,
        booking: existing,
      });
    }

    // Active count for session
    const active = BOOKINGS.filter(
      (b) => b.sessionId === sid && (b.status === 'CONFIRMED' || b.status === 'CHECKED_IN')
    );

    if (active.length < 20) {
      // Find lowest free mat number
      const taken = new Set(active.map((b) => b.matNumber));
      let assignedMat = 1;
      for (let m = 1; m <= 20; m++) {
        if (!taken.has(m)) {
          assignedMat = m;
          break;
        }
      }

      const newBooking: Booking = {
        id: nextBookingId++,
        sessionId: sid,
        userId: uid,
        userName: name,
        userEmail: email,
        status: 'CONFIRMED',
        matNumber: assignedMat,
        waitlistPosition: null,
        checkInCode: generateCode(),
        checkedInAt: null,
        createdAt: new Date().toISOString(),
      };

      BOOKINGS.push(newBooking);
      saveToDisk();
      broadcastUpdate(sid, 'booked', { type: 'confirmed', matNumber: assignedMat });

      return res.json({
        success: true,
        isNew: true,
        message: `Mat #${String(assignedMat).padStart(2, '0')} reserved successfully.`,
        booking: newBooking,
      });
    } else {
      // Add to waitlist
      const currentWaitlist = BOOKINGS.filter((b) => b.sessionId === sid && b.status === 'WAITLIST');
      const newPos = currentWaitlist.length + 1;

      const newBooking: Booking = {
        id: nextBookingId++,
        sessionId: sid,
        userId: uid,
        userName: name,
        userEmail: email,
        status: 'WAITLIST',
        matNumber: null,
        waitlistPosition: newPos,
        checkInCode: null,
        checkedInAt: null,
        createdAt: new Date().toISOString(),
      };

      BOOKINGS.push(newBooking);
      saveToDisk();
      broadcastUpdate(sid, 'waitlisted', { position: newPos });

      return res.json({
        success: true,
        isNew: true,
        message: `Session full (20/20). Placed at Position #${newPos} on waitlist.`,
        booking: newBooking,
      });
    }
  });

  // API: Cancel booking (Atomic waitlist promotion)
  app.post('/api/cancel', (req: Request, res: Response) => {
    const { bookingId } = req.body;
    const bid = parseInt(bookingId, 10);
    const booking = BOOKINGS.find((b) => b.id === bid);

    if (!booking) {
      return res.status(404).json({ error: 'Reservation not found' });
    }

    if (booking.status === 'CANCELLED') {
      return res.status(400).json({ error: 'Reservation already cancelled' });
    }

    const sid = booking.sessionId;
    const oldStatus = booking.status;
    const freedMat = booking.matNumber;
    const cancelledPos = booking.waitlistPosition;

    booking.status = 'CANCELLED';
    booking.matNumber = null;
    booking.waitlistPosition = null;
    booking.checkInCode = null;

    let promotedAthlete: string | null = null;

    if (oldStatus === 'CONFIRMED' || oldStatus === 'CHECKED_IN') {
      // Find waitlist #1
      const waitlist = BOOKINGS.filter((b) => b.sessionId === sid && b.status === 'WAITLIST').sort(
        (a, b) => (a.waitlistPosition || 0) - (b.waitlistPosition || 0)
      );

      if (waitlist.length > 0) {
        const nextInLine = waitlist[0];
        nextInLine.status = 'CONFIRMED';
        nextInLine.matNumber = freedMat;
        nextInLine.checkInCode = generateCode();
        nextInLine.waitlistPosition = null;
        promotedAthlete = nextInLine.userName;

        // Shift remaining waitlist
        for (let i = 1; i < waitlist.length; i++) {
          if (waitlist[i].waitlistPosition !== null) {
            waitlist[i].waitlistPosition! -= 1;
          }
        }
      }
    } else if (oldStatus === 'WAITLIST' && cancelledPos !== null) {
      // Shift downstream waitlist
      BOOKINGS.filter((b) => b.sessionId === sid && b.status === 'WAITLIST' && (b.waitlistPosition || 0) > cancelledPos).forEach(
        (b) => {
          b.waitlistPosition! -= 1;
        }
      );
    }

    saveToDisk();
    broadcastUpdate(sid, 'cancelled', { promotedAthlete });

    res.json({
      success: true,
      message: promotedAthlete
        ? `Reservation cancelled. Waitlist #1 (${promotedAthlete}) automatically promoted to Mat #${freedMat}.`
        : 'Reservation cancelled successfully.',
    });
  });

  // API: Door Terminal Check-In
  app.post('/api/checkin', (req: Request, res: Response) => {
    const { code, sessionId } = req.body;
    if (!code) {
      return res.status(400).json({ error: 'Please enter an 8-character check-in code.' });
    }

    const clean = normalizeCode(code);
    const sid = sessionId ? parseInt(sessionId, 10) : null;

    // Search active confirmed bookings
    let candidates = BOOKINGS.filter(
      (b) => (b.status === 'CONFIRMED' || b.status === 'CHECKED_IN') && b.checkInCode
    );

    if (sid) {
      candidates = candidates.filter((b) => b.sessionId === sid);
    }

    const match = candidates.find((b) => normalizeCode(b.checkInCode || '') === clean);

    if (!match) {
      return res.status(404).json({
        success: false,
        message: sid
          ? `Code '${code}' not recognized for the selected session. Check code or switch session.`
          : `Invalid code '${code}'. No active reservation found.`,
      });
    }

    if (match.status === 'CHECKED_IN') {
      return res.json({
        success: true,
        alreadyCheckedIn: true,
        message: `ALREADY CHECKED IN — ${match.userName} on Mat #${String(match.matNumber).padStart(2, '0')}.`,
        booking: match,
      });
    }

    match.status = 'CHECKED_IN';
    match.checkedInAt = new Date().toISOString();
    saveToDisk();

    broadcastUpdate(match.sessionId, 'checkin', { matNumber: match.matNumber, userName: match.userName });

    res.json({
      success: true,
      alreadyCheckedIn: false,
      message: `ACCESS GRANTED — ${match.userName.toUpperCase()} CHECKED IN TO MAT #${String(match.matNumber).padStart(2, '0')}.`,
      booking: match,
    });
  });

  // Development: Mount Vite SPA
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[APEX MAT LAB] Dev server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
