import React, { useState, useEffect, useRef, useCallback } from 'react';

export type BookingStatus = 'CONFIRMED' | 'WAITLIST' | 'CHECKED_IN' | 'CANCELLED';
export type UserRole = 'CLIENT' | 'ADMIN' | 'MAIN_ADMIN';
export type UserStatus = 'ACTIVE' | 'PENDING_APPROVAL' | 'SUSPENDED';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  createdAt?: string;
  approvedAt?: string;
  approvedBy?: string;
}

export interface AdminRequest {
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
  confirmedCount?: number;
  checkedInCount?: number;
  waitlistCount?: number;
  matsRemaining?: number;
  isFull?: boolean;
}

export interface SessionDetail {
  session: HourlySession;
  confirmedCount: number;
  checkedInCount: number;
  waitlistCount: number;
  matsRemaining: number;
  isFull: boolean;
  matMap: Record<number, Booking | null>;
  waitlist: Booking[];
  confirmedBookings: Booking[];
}

const MAIN_ADMIN_EMAIL = 'prabaldadwal2008@gmail.com';

export default function App() {
  const [view, setView] = useState<'member' | 'staff' | 'admin'>('member');

  // Active Session & Data
  const [activeSessionId, setActiveSessionId] = useState<number>(3);
  const [sessions, setSessions] = useState<HourlySession[]>([]);
  const [currentSession, setCurrentSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Authentication State
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('apex_user');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return null;
      }
    }
    // Default bootstrap as Main Admin for seamless access
    return {
      id: 'admin_prabal_root',
      name: 'Prabal Dadwal',
      email: MAIN_ADMIN_EMAIL,
      role: 'MAIN_ADMIN',
      status: 'ACTIVE',
    };
  });

  // Auth Modal State
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authForm, setAuthForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'CLIENT' as 'CLIENT' | 'ADMIN',
  });
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccessNotice, setAuthSuccessNotice] = useState<string | null>(null);

  // Admin Console State
  const [adminTab, setAdminTab] = useState<'approvals' | 'users' | 'sessions' | 'dispatches'>('approvals');
  const [adminOverview, setAdminOverview] = useState<{
    users: User[];
    adminRequests: AdminRequest[];
    totalUsers: number;
    totalAdmins: number;
    pendingRequests: number;
  } | null>(null);

  // Door Terminal State
  const [scannerCode, setScannerCode] = useState<string>('');
  const [terminalResult, setTerminalResult] = useState<{
    success: boolean;
    message: string;
    booking?: Booking;
  } | null>(null);

  // Flash Notifications
  const [flash, setFlash] = useState<{ message: string; success: boolean } | null>(null);

  // Save user session
  const saveUserSession = (user: User | null) => {
    setCurrentUser(user);
    if (user) {
      localStorage.setItem('apex_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('apex_user');
    }
  };

  // Audio synthesizer chime
  const playDoorSound = useCallback((success: boolean) => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (success) {
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.setValueAtTime(1174.66, ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
      } else {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, ctx.currentTime);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      }
    } catch {
      // Audio not available
    }
  }, []);

  // Fetch all sessions
  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions');
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions);
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  // Fetch active session detail
  const fetchSessionDetail = useCallback(async (sid: number) => {
    try {
      const res = await fetch(`/api/sessions/${sid}`);
      if (res.ok) {
        const data = await res.json();
        setCurrentSession(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch Admin Overview
  const fetchAdminOverview = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/overview');
      if (res.ok) {
        const data = await res.json();
        setAdminOverview(data);
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
    fetchSessionDetail(activeSessionId);
    if (currentUser?.role === 'ADMIN' || currentUser?.role === 'MAIN_ADMIN') {
      fetchAdminOverview();
    }
  }, [fetchSessions, fetchSessionDetail, fetchAdminOverview, activeSessionId, currentUser]);

  // Real-Time SSE Subscription
  const activeSessionIdRef = useRef(activeSessionId);
  activeSessionIdRef.current = activeSessionId;

  useEffect(() => {
    const sse = new EventSource('/api/events');

    sse.addEventListener('session_update', () => {
      fetchSessions();
      fetchSessionDetail(activeSessionIdRef.current);
    });

    sse.addEventListener('admin_update', () => {
      fetchAdminOverview();
    });

    return () => {
      sse.close();
    };
  }, [fetchSessions, fetchSessionDetail, fetchAdminOverview]);

  // Live ticking clock
  const [clock, setClock] = useState<string>('');
  useEffect(() => {
    const update = () => {
      const d = new Date();
      setClock(d.toLocaleTimeString('en-US', { hour12: false }) + ' LOCAL');
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  // Authentication Handlers
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccessNotice(null);

    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
    const payload =
      authMode === 'login'
        ? { email: authForm.email, password: authForm.password }
        : { name: authForm.name, email: authForm.email, password: authForm.password, role: authForm.role };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        setAuthError(data.error || 'Authentication error.');
        return;
      }

      if (data.pendingApproval) {
        setAuthSuccessNotice(data.message);
        setAuthForm({ name: '', email: '', password: '', role: 'CLIENT' });
        return;
      }

      saveUserSession(data.user);
      setFlash({ message: data.message, success: true });
      setShowAuthModal(false);
      setAuthForm({ name: '', email: '', password: '', role: 'CLIENT' });
      fetchAdminOverview();
    } catch {
      setAuthError('Connection failed. Dev server may be restarting.');
    }
  };

  // Quick Login Helper
  const handleQuickLogin = (email: string) => {
    setAuthForm({
      name: email === MAIN_ADMIN_EMAIL ? 'Prabal Dadwal' : 'Alex Rivera',
      email,
      password: 'admin123',
      role: email === MAIN_ADMIN_EMAIL ? 'ADMIN' : 'CLIENT',
    });
  };

  // Admin Approval Actions
  const handleApproveRequest = async (requestId: string) => {
    try {
      const res = await fetch('/api/admin/approve-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, approverEmail: currentUser?.email }),
      });
      const data = await res.json();
      if (res.ok) {
        setFlash({ message: data.message, success: true });
        fetchAdminOverview();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    if (!confirm('Reject this admin request? User will be reverted to standard Client role.')) return;
    try {
      const res = await fetch('/api/admin/reject-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId }),
      });
      const data = await res.json();
      if (res.ok) {
        setFlash({ message: data.message, success: true });
        fetchAdminOverview();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateUser = async (userId: string, role?: UserRole, status?: UserStatus) => {
    try {
      const res = await fetch('/api/admin/update-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role, status }),
      });
      const data = await res.json();
      if (res.ok) {
        setFlash({ message: data.message, success: true });
        fetchAdminOverview();
      } else {
        setFlash({ message: data.error, success: false });
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Single-Click Booking Handler
  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSession) return;

    const athleteName = currentUser ? currentUser.name : 'Alex Rivera';
    const athleteEmail = currentUser ? currentUser.email : 'alex.rivera@athletic.io';
    const athleteId = currentUser ? currentUser.id : 'ath_guest_01';

    try {
      const res = await fetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSession.session.id,
          userName: athleteName,
          userEmail: athleteEmail,
          userId: athleteId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setFlash({ message: data.message, success: true });
        fetchSessionDetail(currentSession.session.id);
        fetchSessions();
      } else {
        setFlash({ message: data.error || 'Failed to book.', success: false });
      }
    } catch {
      setFlash({ message: 'Network connection failed.', success: false });
    }
  };

  // Cancellation Handler
  const handleCancel = async (bookingId: number) => {
    if (!confirm('Confirm cancellation? Waitlist position #1 will be promoted automatically.')) return;
    try {
      const res = await fetch('/api/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId }),
      });
      const data = await res.json();
      if (data.success) {
        setFlash({ message: data.message, success: true });
        if (currentSession) fetchSessionDetail(currentSession.session.id);
        fetchSessions();
      }
    } catch {
      setFlash({ message: 'Network request error.', success: false });
    }
  };

  // Door Terminal Check-In Submission
  const handleCheckInSubmit = async (e?: React.FormEvent, overrideCode?: string) => {
    if (e) e.preventDefault();
    const code = (overrideCode || scannerCode).trim();
    if (!code) return;

    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          sessionId: currentSession?.session.id,
        }),
      });
      const data = await res.json();
      playDoorSound(data.success);
      setTerminalResult(data);
      if (data.success) {
        setScannerCode('');
        if (currentSession) fetchSessionDetail(currentSession.session.id);
        fetchSessions();
      }
    } catch {
      playDoorSound(false);
      setTerminalResult({
        success: false,
        message: 'COMMUNICATION ERROR // TERMINAL OFFLINE',
      });
    }
  };

  // Code input formatter
  const handleCodeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (raw.length > 4) {
      raw = raw.slice(0, 4) + '-' + raw.slice(4, 8);
    }
    setScannerCode(raw);
  };

  // Active user's booking in this session
  const userBooking = currentSession && currentUser
    ? Object.values(currentSession.matMap).find(
        (b) => b && (b.userId === currentUser.id || b.userEmail === currentUser.email) && (b.status === 'CONFIRMED' || b.status === 'CHECKED_IN')
      ) || currentSession.waitlist.find((b) => b.userId === currentUser.id || b.userEmail === currentUser.email) || null
    : null;

  const isAdminOrMainAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'MAIN_ADMIN';

  return (
    <div className="min-h-screen bg-[#F4F4F0] text-[#0D0D0D] flex flex-col selection:bg-[#FF3B00] selection:text-white">
      {/* Top Tactical Header Strip */}
      <header className="bg-[#0D0D0D] text-white border-b-2 border-[#0D0D0D] px-4 md:px-8 py-3 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          {/* Logo & Identity */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setView('member')}
              className="flex items-center gap-2 text-left group cursor-pointer focus:outline-none"
            >
              <div className="w-7 h-7 bg-[#FF3B00] flex items-center justify-center font-black text-white text-base tracking-tighter">
                ▲
              </div>
              <div>
                <div className="font-display font-bold text-lg md:text-xl tracking-tight leading-none uppercase group-hover:text-[#FF3B00] transition-colors">
                  APEX MAT LAB
                </div>
                <div className="font-mono-numbers text-[10px] text-neutral-400 tracking-wider">
                  PROTOCOL // MAX 20 INVARIANT
                </div>
              </div>
            </button>
          </div>

          {/* Real-Time Metrics & UTC Clock */}
          <div className="hidden lg:flex items-center gap-6 font-mono-numbers text-xs">
            <div className="flex items-center gap-2 px-2.5 py-1 bg-neutral-900 border border-neutral-800">
              <span className="w-2 h-2 rounded-full bg-[#FF3B00] live-indicator"></span>
              <span className="tracking-widest uppercase font-semibold text-neutral-200">
                LIVE SSE SYNC ACTIVE
              </span>
            </div>
            <div className="text-neutral-400">
              STATION: <span className="text-white font-bold">ALPHA-01</span>
            </div>
            <div className="text-neutral-400">{clock}</div>
          </div>

          {/* Navigation & Auth Controls */}
          <nav className="flex items-center flex-wrap gap-2 font-mono-numbers text-xs">
            <button
              type="button"
              onClick={() => setView('member')}
              className={`px-3 py-1.5 border uppercase cursor-pointer transition-colors ${
                view === 'member'
                  ? 'bg-white text-black border-white font-bold'
                  : 'border-neutral-700 text-neutral-300 hover:border-white hover:text-white'
              }`}
            >
              [ MEMBER VIEW ]
            </button>
            <button
              type="button"
              onClick={() => setView('staff')}
              className={`px-3 py-1.5 border uppercase cursor-pointer transition-colors flex items-center gap-1.5 ${
                view === 'staff'
                  ? 'bg-white text-black border-white font-bold'
                  : 'border-neutral-700 text-neutral-300 hover:border-white hover:text-white'
              }`}
            >
              [ DOOR TERMINAL ]
            </button>

            {/* Admin Console Tab - High-Vis Orange */}
            <button
              type="button"
              onClick={() => setView('admin')}
              className={`px-3 py-1.5 border uppercase cursor-pointer transition-colors flex items-center gap-1.5 ${
                view === 'admin'
                  ? 'bg-[#FF3B00] text-white border-[#FF3B00] font-black'
                  : 'border-[#FF3B00] text-[#FF3B00] hover:bg-[#FF3B00] hover:text-white'
              }`}
            >
              <span className="w-2 h-2 bg-[#FF3B00] border border-white rounded-full"></span>
              [ ADMIN CONSOLE ]
              {adminOverview && adminOverview.pendingRequests > 0 && (
                <span className="px-1.5 py-0.2 bg-black text-white font-black text-[10px] rounded-full">
                  {adminOverview.pendingRequests}
                </span>
              )}
            </button>

            {/* User Profile / Auth Toggle */}
            {currentUser ? (
              <div className="flex items-center gap-2 pl-2 border-l border-neutral-700">
                <span className="text-neutral-300 hidden sm:inline">
                  {currentUser.role === 'MAIN_ADMIN' ? (
                    <span className="px-1.5 py-0.5 bg-[#FF3B00] text-white font-black text-[10px]">MAIN ADMIN</span>
                  ) : currentUser.role === 'ADMIN' ? (
                    <span className="px-1.5 py-0.5 bg-neutral-800 text-amber-400 font-bold text-[10px]">ADMIN</span>
                  ) : (
                    <span className="px-1.5 py-0.5 bg-neutral-800 text-neutral-300 text-[10px]">CLIENT</span>
                  )}
                </span>
                <span className="font-bold text-white max-w-[120px] truncate">{currentUser.name.split(' ')[0]}</span>
                <button
                  type="button"
                  onClick={() => saveUserSession(null)}
                  className="px-2 py-1 bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white border border-neutral-800 text-[10px] uppercase cursor-pointer"
                >
                  LOGOUT
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 pl-2 border-l border-neutral-700">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('login');
                    setShowAuthModal(true);
                  }}
                  className="px-2.5 py-1 bg-white text-black font-bold uppercase cursor-pointer"
                >
                  LOGIN
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('register');
                    setShowAuthModal(true);
                  }}
                  className="px-2.5 py-1 bg-[#FF3B00] text-white font-bold uppercase cursor-pointer"
                >
                  REGISTER
                </button>
              </div>
            )}
          </nav>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8 space-y-6">
        {/* Flash Notification */}
        {flash && (
          <div
            className={`border-sharp-2 p-4 shadow-hard flex items-center justify-between ${
              flash.success ? 'bg-[#0D0D0D] text-white border-black' : 'bg-[#FF3B00] text-white border-[#FF3B00]'
            }`}
          >
            <div className="flex items-center gap-3 font-mono-numbers text-sm">
              <span className="w-2.5 h-2.5 bg-white rounded-full"></span>
              <span className="font-bold tracking-tight uppercase">{flash.message}</span>
            </div>
            <button
              onClick={() => setFlash(null)}
              className="font-mono-numbers text-xs opacity-75 hover:opacity-100 uppercase cursor-pointer"
            >
              [ DISMISS ]
            </button>
          </div>
        )}

        {/* =====================================================================
           VIEW 1: ADMIN CONSOLE (REGULATION & APPROVALS)
           ===================================================================== */}
        {view === 'admin' ? (
          <div className="space-y-6">
            {/* Top Admin Banner */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-sharp-b pb-4">
              <div>
                <div className="flex items-center gap-2 font-mono-numbers text-xs text-neutral-500 mb-1">
                  <span className="w-2.5 h-2.5 bg-[#FF3B00] rounded-full live-indicator"></span>
                  <span className="text-black font-bold uppercase">ADMIN REGULATION HEADQUARTERS</span>
                  <span>•</span>
                  <span>MAIN ADMIN: {MAIN_ADMIN_EMAIL}</span>
                </div>
                <h1 className="font-display font-extrabold text-3xl md:text-5xl uppercase tracking-tighter text-black">
                  ADMIN REGULATION CONSOLE
                </h1>
                <p className="font-mono-numbers text-xs text-neutral-600 mt-0.5">
                  REGULATE ADMIN APPROVALS // MANAGE USER ROLES // OVERRIDE MAT ALLOCATIONS // AUDIT DISPATCHES
                </p>
              </div>

              {/* Status Badge */}
              <div className="bg-white border-sharp-2 p-3 font-mono-numbers text-xs shadow-hard self-start md:self-auto">
                <div className="text-[10px] text-neutral-500 uppercase font-bold">LOGGED IN ADMIN:</div>
                <div className="font-black text-black flex items-center gap-2 mt-0.5">
                  <span className="w-2 h-2 bg-[#FF3B00] rounded-full"></span>
                  <span>{currentUser ? currentUser.name : 'Not Logged In'}</span>
                  <span className="px-1.5 py-0.2 bg-black text-white text-[10px]">
                    {currentUser ? currentUser.role : 'GUEST'}
                  </span>
                </div>
              </div>
            </div>

            {/* Access Gate if not an Admin */}
            {!isAdminOrMainAdmin ? (
              <div className="bg-black text-white border-sharp-2 p-8 shadow-hard-lg max-w-2xl mx-auto text-center space-y-4">
                <div className="w-12 h-12 bg-[#FF3B00] text-white flex items-center justify-center font-black text-2xl mx-auto">
                  !
                </div>
                <h2 className="font-display font-black text-3xl uppercase tracking-tight">
                  ADMIN AUTHORIZATION REQUIRED
                </h2>
                <p className="font-mono-numbers text-xs text-neutral-400 max-w-lg mx-auto">
                  Access to the Admin Regulation Console is restricted to approved Administrators and the Main Admin ({MAIN_ADMIN_EMAIL}).
                </p>
                <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      saveUserSession({
                        id: 'admin_prabal_root',
                        name: 'Prabal Dadwal',
                        email: MAIN_ADMIN_EMAIL,
                        role: 'MAIN_ADMIN',
                        status: 'ACTIVE',
                      });
                      setFlash({ message: 'Authenticated as Main Admin (prabaldadwal2008@gmail.com).', success: true });
                    }}
                    className="btn-hard px-5 py-3 bg-[#FF3B00] hover:bg-[#E03400] text-white font-display font-black text-sm uppercase tracking-wider cursor-pointer border border-white shadow-hard"
                  >
                    LOGIN AS MAIN ADMIN ({MAIN_ADMIN_EMAIL})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('login');
                      setShowAuthModal(true);
                    }}
                    className="btn-hard px-5 py-3 bg-neutral-800 hover:bg-neutral-700 text-white font-mono-numbers text-xs uppercase cursor-pointer border border-neutral-600"
                  >
                    SIGN IN WITH ANOTHER ACCOUNT
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Admin Sub-Navigation Tabs */}
                <div className="flex border-sharp-2 bg-white divide-x-2 divide-black font-mono-numbers text-xs">
                  <button
                    type="button"
                    onClick={() => setAdminTab('approvals')}
                    className={`flex-1 py-3 px-4 font-bold uppercase transition-colors flex items-center justify-center gap-2 cursor-pointer ${
                      adminTab === 'approvals' ? 'bg-black text-white' : 'hover:bg-neutral-100 text-black'
                    }`}
                  >
                    <span>ADMIN APPROVAL QUEUE</span>
                    {adminOverview && adminOverview.pendingRequests > 0 && (
                      <span className="px-1.5 py-0.2 bg-[#FF3B00] text-white font-black text-[10px]">
                        {adminOverview.pendingRequests} PENDING
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdminTab('users')}
                    className={`flex-1 py-3 px-4 font-bold uppercase transition-colors cursor-pointer ${
                      adminTab === 'users' ? 'bg-black text-white' : 'hover:bg-neutral-100 text-black'
                    }`}
                  >
                    USER DIRECTORY ({adminOverview?.totalUsers || 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdminTab('sessions')}
                    className={`flex-1 py-3 px-4 font-bold uppercase transition-colors cursor-pointer ${
                      adminTab === 'sessions' ? 'bg-black text-white' : 'hover:bg-neutral-100 text-black'
                    }`}
                  >
                    CAPACITY & FLOOR REGULATION
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdminTab('dispatches')}
                    className={`flex-1 py-3 px-4 font-bold uppercase transition-colors cursor-pointer ${
                      adminTab === 'dispatches' ? 'bg-black text-white' : 'hover:bg-neutral-100 text-black'
                    }`}
                  >
                    AUTHORIZATION DISPATCHES ({adminOverview?.adminRequests.length || 0})
                  </button>
                </div>

                {/* TAB 1: PENDING ADMIN APPROVALS QUEUE */}
                {adminTab === 'approvals' && (
                  <div className="space-y-4">
                    <div className="bg-white border-sharp-2 p-5 shadow-hard flex items-center justify-between">
                      <div>
                        <div className="font-display font-black text-xl uppercase tracking-tight text-black">
                          PENDING ADMINISTRATOR APPLICATIONS
                        </div>
                        <div className="font-mono-numbers text-xs text-neutral-500">
                          Candidates registered as "ADMIN" require approval from Main Admin ({MAIN_ADMIN_EMAIL}) before elevation.
                        </div>
                      </div>
                      <span className="font-mono-numbers text-xs px-2.5 py-1 bg-black text-white font-bold uppercase">
                        MAIN REGULATOR: {MAIN_ADMIN_EMAIL}
                      </span>
                    </div>

                    {adminOverview && adminOverview.adminRequests.filter((r) => r.status === 'PENDING').length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {adminOverview.adminRequests
                          .filter((r) => r.status === 'PENDING')
                          .map((req) => (
                            <div key={req.id} className="bg-white border-sharp-2 p-5 shadow-hard space-y-4">
                              <div className="flex items-start justify-between border-sharp-b pb-3">
                                <div>
                                  <span className="px-2 py-0.5 bg-[#FF3B00] text-white font-mono-numbers text-[10px] font-black uppercase">
                                    PENDING APPROVAL
                                  </span>
                                  <h3 className="font-display font-black text-xl text-black uppercase mt-1">
                                    {req.userName}
                                  </h3>
                                  <div className="font-mono-numbers text-xs text-neutral-600">{req.userEmail}</div>
                                </div>
                                <span className="font-mono-numbers text-[10px] text-neutral-400">
                                  {new Date(req.timestamp).toLocaleTimeString()}
                                </span>
                              </div>

                              <div className="bg-[#F4F4F0] border-sharp p-3 font-mono-numbers text-xs space-y-1">
                                <div className="text-[10px] text-neutral-500 uppercase">NOTIFICATION ROUTED TO:</div>
                                <div className="font-bold text-black">{req.notificationSentTo}</div>
                                <div className="text-[10px] text-neutral-500 pt-1">
                                  PERMISSION REQUEST: Full Floor Roster Access, Check-in Overrides, Mat Allocations.
                                </div>
                              </div>

                              <div className="flex items-center gap-2 pt-2">
                                <button
                                  type="button"
                                  onClick={() => handleApproveRequest(req.id)}
                                  className="btn-hard flex-1 py-3 bg-[#008744] hover:bg-emerald-800 text-white border border-black font-display font-bold text-sm uppercase tracking-wider cursor-pointer shadow-hard"
                                >
                                  ✓ APPROVE ADMIN ACCESS
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRejectRequest(req.id)}
                                  className="btn-hard px-4 py-3 bg-white hover:bg-neutral-100 text-neutral-700 hover:text-black border border-neutral-300 font-mono-numbers text-xs uppercase cursor-pointer"
                                >
                                  ✕ REJECT
                                </button>
                              </div>
                            </div>
                          ))}
                      </div>
                    ) : (
                      <div className="bg-white border-sharp-2 p-12 text-center font-mono-numbers text-sm text-neutral-500">
                        NO PENDING ADMIN APPLICATIONS. ALL OPERATORS REGULATED.
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 2: USER DIRECTORY & REGULATION */}
                {adminTab === 'users' && (
                  <div className="bg-white border-sharp-2 shadow-hard overflow-hidden">
                    <div className="p-4 border-sharp-b bg-neutral-50 flex items-center justify-between">
                      <div className="font-display font-bold text-base uppercase tracking-tight text-black">
                        REGISTERED USER DIRECTORY & ROLES
                      </div>
                      <div className="font-mono-numbers text-xs text-neutral-500">
                        MAIN ADMIN: {MAIN_ADMIN_EMAIL}
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left font-mono-numbers text-xs border-collapse">
                        <thead>
                          <tr className="border-sharp-b bg-neutral-100 text-neutral-600 uppercase text-[11px]">
                            <th className="p-3 border-sharp-r">NAME</th>
                            <th className="p-3 border-sharp-r">EMAIL</th>
                            <th className="p-3 border-sharp-r">ROLE</th>
                            <th className="p-3 border-sharp-r">STATUS</th>
                            <th className="p-3 text-right">REGULATION ACTION</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-200">
                          {adminOverview?.users.map((u) => {
                            const isMain = u.email.toLowerCase() === MAIN_ADMIN_EMAIL.toLowerCase();
                            return (
                              <tr key={u.id} className="hover:bg-neutral-50 transition-colors">
                                <td className="p-3 border-sharp-r font-bold text-black flex items-center gap-2">
                                  {isMain && <span className="text-[#FF3B00] font-black">★</span>}
                                  {u.name}
                                </td>
                                <td className="p-3 border-sharp-r text-neutral-600">{u.email}</td>
                                <td className="p-3 border-sharp-r">
                                  {u.role === 'MAIN_ADMIN' ? (
                                    <span className="px-2 py-0.5 bg-[#FF3B00] text-white font-black text-[10px]">
                                      MAIN ADMIN
                                    </span>
                                  ) : u.role === 'ADMIN' ? (
                                    <span className="px-2 py-0.5 bg-black text-white font-bold text-[10px]">ADMIN</span>
                                  ) : (
                                    <span className="px-2 py-0.5 bg-neutral-200 text-neutral-700 text-[10px]">
                                      CLIENT
                                    </span>
                                  )}
                                </td>
                                <td className="p-3 border-sharp-r">
                                  {u.status === 'ACTIVE' ? (
                                    <span className="text-[#008744] font-bold">● ACTIVE</span>
                                  ) : u.status === 'PENDING_APPROVAL' ? (
                                    <span className="text-[#FF3B00] font-bold">● PENDING APPROVAL</span>
                                  ) : (
                                    <span className="text-neutral-400 font-bold">● SUSPENDED</span>
                                  )}
                                </td>
                                <td className="p-3 text-right space-x-2">
                                  {!isMain ? (
                                    <>
                                      {u.role === 'ADMIN' ? (
                                        <button
                                          type="button"
                                          onClick={() => handleUpdateUser(u.id, 'CLIENT', 'ACTIVE')}
                                          className="px-2 py-1 bg-white hover:bg-neutral-100 text-neutral-700 border border-neutral-300 font-semibold text-[10px] uppercase cursor-pointer"
                                        >
                                          DEMOTE TO CLIENT
                                        </button>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => handleUpdateUser(u.id, 'ADMIN', 'ACTIVE')}
                                          className="px-2 py-1 bg-black hover:bg-neutral-800 text-white font-bold text-[10px] uppercase cursor-pointer"
                                        >
                                          PROMOTE TO ADMIN
                                        </button>
                                      )}
                                      {u.status === 'ACTIVE' ? (
                                        <button
                                          type="button"
                                          onClick={() => handleUpdateUser(u.id, undefined, 'SUSPENDED')}
                                          className="px-2 py-1 bg-white hover:bg-red-50 text-red-600 border border-red-300 font-semibold text-[10px] uppercase cursor-pointer"
                                        >
                                          SUSPEND
                                        </button>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => handleUpdateUser(u.id, undefined, 'ACTIVE')}
                                          className="px-2 py-1 bg-emerald-700 text-white font-semibold text-[10px] uppercase cursor-pointer"
                                        >
                                          ACTIVATE
                                        </button>
                                      )}
                                    </>
                                  ) : (
                                    <span className="text-neutral-400 text-[10px] uppercase font-semibold">
                                      ROOT PROTECTED
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* TAB 3: CAPACITY & FLOOR REGULATION */}
                {adminTab === 'sessions' && (
                  <div className="space-y-4">
                    <div className="bg-white border-sharp-2 p-4 shadow-hard flex items-center justify-between">
                      <div className="font-display font-black text-lg uppercase tracking-tight text-black">
                        ALL 16 HOURLY SESSIONS // FLOOR REGULATION
                      </div>
                      <span className="font-mono-numbers text-xs text-neutral-500">HARD CAPACITY: 20 MATS/HOUR</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                      {sessions.map((s) => (
                        <div key={s.id} className="bg-white border-sharp-2 p-4 shadow-hard flex flex-col justify-between">
                          <div>
                            <div className="flex items-center justify-between font-mono-numbers text-xs mb-1">
                              <span className="font-black text-black">{s.startTime}</span>
                              <span
                                className={`px-1.5 py-0.2 text-[10px] font-bold ${
                                  s.isFull ? 'bg-[#FF3B00] text-white' : 'bg-neutral-200 text-black'
                                }`}
                              >
                                {s.isFull ? 'CAPACITY (20/20)' : `${s.matsRemaining} OPEN`}
                              </span>
                            </div>
                            <div className="font-display font-bold text-sm uppercase truncate">{s.title}</div>
                            <div className="font-mono-numbers text-[10px] text-neutral-500 mt-1">
                              Confirmed: <strong>{s.confirmedCount}</strong> | Waitlist: <strong>{s.waitlistCount}</strong>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveSessionId(s.id);
                              setView('member');
                            }}
                            className="btn-hard mt-3 w-full py-2 bg-black hover:bg-neutral-800 text-white font-mono-numbers text-xs uppercase cursor-pointer"
                          >
                            REGULATE SESSION →
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* TAB 4: AUTHORIZATION DISPATCHES AUDIT LOG */}
                {adminTab === 'dispatches' && (
                  <div className="bg-white border-sharp-2 shadow-hard overflow-hidden">
                    <div className="p-4 border-sharp-b bg-neutral-900 text-white flex items-center justify-between">
                      <div className="font-display font-bold text-base uppercase tracking-tight flex items-center gap-2">
                        <span className="w-2.5 h-2.5 bg-[#FF3B00] rounded-full live-indicator"></span>
                        <span>SIMULATED EMAIL DISPATCHES TO {MAIN_ADMIN_EMAIL}</span>
                      </div>
                      <span className="font-mono-numbers text-xs text-neutral-400">AUDIT TRAIL</span>
                    </div>

                    <div className="divide-y divide-neutral-200 font-mono-numbers text-xs">
                      {adminOverview?.adminRequests.map((req) => (
                        <div key={req.id} className="p-4 hover:bg-neutral-50 transition-colors space-y-2">
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="text-[10px] text-neutral-400 uppercase">
                                TO: {req.notificationSentTo} | FROM: system-auth@apexmatlab.internal
                              </div>
                              <div className="font-bold text-black text-sm mt-0.5">
                                [ACTION REQUIRED] Administrator Authorization Request — {req.userName} ({req.userEmail})
                              </div>
                            </div>
                            <span
                              className={`px-2 py-0.5 font-bold uppercase text-[10px] ${
                                req.status === 'APPROVED'
                                  ? 'bg-[#008744] text-white'
                                  : req.status === 'PENDING'
                                  ? 'bg-[#FF3B00] text-white'
                                  : 'bg-neutral-300 text-black'
                              }`}
                            >
                              {req.status}
                            </span>
                          </div>
                          <p className="text-neutral-600 text-[11px] bg-neutral-50 p-2.5 border border-neutral-200">
                            "User {req.userName} has applied for facility Administrator credentials. This role grants authority over session floor plans, waitlist promotions, and door terminal verification. Main Admin approval required."
                          </p>
                          {req.status === 'PENDING' && (
                            <div className="flex items-center gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => handleApproveRequest(req.id)}
                                className="px-3 py-1 bg-[#008744] text-white font-bold text-[10px] uppercase cursor-pointer"
                              >
                                APPROVE NOW
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRejectRequest(req.id)}
                                className="px-3 py-1 bg-neutral-200 hover:bg-neutral-300 text-neutral-800 font-bold text-[10px] uppercase cursor-pointer"
                              >
                                REJECT
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        ) : view === 'member' ? (
          /* =====================================================================
             VIEW 2: MEMBER VIEW
             ===================================================================== */
          <>
            {/* Header Strip */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-sharp-b pb-4">
              <div>
                <div className="flex items-center gap-2 font-mono-numbers text-xs text-neutral-500 mb-1">
                  <span className="w-2 h-2 rounded-full bg-[#008744]"></span>
                  <span>TODAY'S SCHEDULE: LIVE ROTATION</span>
                  <span>•</span>
                  <span>06:00 — 21:00 (60-MIN SESSIONS)</span>
                </div>
                <h1 className="font-display font-extrabold text-3xl md:text-5xl uppercase tracking-tighter text-black">
                  HOURLY MAT PROTOCOL
                </h1>
                <p className="font-mono-numbers text-xs md:text-sm text-neutral-600 mt-1">
                  HIGH-PRECISION GYM MAT BOOKING // STRICT 20-MAT CAP // INSTANT 8-CHAR DOOR CODES
                </p>
              </div>

              {/* Active User Card */}
              <div className="bg-white border-sharp-2 p-3 font-mono-numbers text-xs shadow-hard self-start md:self-auto">
                <div className="text-[10px] text-neutral-500 uppercase font-bold">CURRENT MEMBER:</div>
                <div className="font-bold text-black flex items-center gap-2 mt-0.5">
                  <span className="w-2 h-2 bg-[#FF3B00] rounded-full"></span>
                  <span>{currentUser ? currentUser.name : 'Guest Athlete'}</span>
                  <span className="text-neutral-400 font-normal">
                    ({currentUser ? currentUser.email : 'guest@apex.run'})
                  </span>
                </div>
              </div>
            </div>

            {/* Hourly Schedule Timeline Bar */}
            <div>
              <div className="flex items-center justify-between mb-2 font-mono-numbers text-xs text-neutral-500">
                <span className="font-bold uppercase tracking-wider text-black">SELECT HOURLY SESSION</span>
                <span>HORIZONTAL TIMELINE (06:00 - 21:00) →</span>
              </div>

              <div className="overflow-x-auto pb-2 scrollbar-thin">
                <div className="flex items-stretch gap-2 min-w-max">
                  {sessions.map((s) => {
                    const isActive = s.id === activeSessionId;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setActiveSessionId(s.id);
                          fetchSessionDetail(s.id);
                        }}
                        className={`text-left p-3 border-sharp-2 transition-all cursor-pointer flex flex-col justify-between w-36 h-22 ${
                          isActive
                            ? 'bg-black text-white border-black shadow-hard'
                            : 'bg-white text-black border-neutral-300 hover:border-black'
                        }`}
                      >
                        <div className="flex items-center justify-between font-mono-numbers text-[11px] mb-1">
                          <span className="font-bold">{s.startTime}</span>
                          <span
                            className={`text-[9px] uppercase px-1 py-0.2 ${
                              isActive ? 'bg-[#FF3B00] text-white' : 'bg-neutral-200 text-neutral-700'
                            }`}
                          >
                            60 MIN
                          </span>
                        </div>
                        <div className="font-display font-bold text-xs uppercase tracking-tight truncate">
                          {s.title.split('//')[0]}
                        </div>
                        <div
                          className={`font-mono-numbers text-[10px] mt-1 pt-1 border-t flex justify-between ${
                            isActive ? 'border-neutral-700 text-neutral-300' : 'border-neutral-200 text-neutral-500'
                          }`}
                        >
                          <span>{s.coach.split(' ')[0]}</span>
                          <span className={`font-bold ${s.isFull ? 'text-[#FF3B00]' : ''}`}>
                            {s.isFull ? 'FULL (20)' : `${s.matsRemaining} OPEN`}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Active Session Content */}
            {loading || !currentSession ? (
              <div className="p-12 text-center font-mono-numbers text-sm text-neutral-500 bg-white border-sharp-2">
                LOADING REAL-TIME SESSION TELEMETRY...
              </div>
            ) : (
              <div className="space-y-6">
                {/* Session Spec Header */}
                <div className="bg-white border-sharp-2 p-5 shadow-hard flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 bg-[#0D0D0D] text-white font-mono-numbers text-xs font-bold uppercase tracking-wider">
                        SESSION #{String(currentSession.session.id).padStart(2, '0')}
                      </span>
                      <span className="px-2 py-0.5 border border-black font-mono-numbers text-xs uppercase font-semibold">
                        INTENSITY // {currentSession.session.intensity}
                      </span>
                      <span className="text-xs font-mono-numbers text-neutral-500 uppercase">
                        COACH: {currentSession.session.coach}
                      </span>
                    </div>
                    <h2 className="font-display font-extrabold text-2xl md:text-3xl uppercase tracking-tight text-[#0D0D0D]">
                      {currentSession.session.title}
                    </h2>
                    <div className="font-mono-numbers text-sm text-neutral-600 mt-0.5">
                      TIME WINDOW: <strong className="text-black">{currentSession.session.displayTime}</strong>
                    </div>
                  </div>

                  {/* Stark Big Capacity Metrics */}
                  <div className="flex items-stretch border-sharp bg-[#F4F4F0] divide-x divide-black self-start md:self-auto font-mono-numbers">
                    <div className="px-4 py-2 text-center">
                      <div className="text-[10px] text-neutral-500 uppercase font-semibold tracking-wider">
                        MATS REMAINING
                      </div>
                      <div
                        className={`font-display font-black text-2xl md:text-3xl ${
                          currentSession.matsRemaining === 0 ? 'text-[#FF3B00]' : 'text-black'
                        }`}
                      >
                        {String(currentSession.matsRemaining).padStart(2, '0')}
                        <span className="text-xs font-normal text-neutral-500">/20</span>
                      </div>
                    </div>
                    <div className="px-4 py-2 text-center">
                      <div className="text-[10px] text-neutral-500 uppercase font-semibold tracking-wider">
                        CONFIRMED
                      </div>
                      <div className="font-display font-black text-2xl md:text-3xl text-black">
                        {String(currentSession.confirmedCount).padStart(2, '0')}
                      </div>
                    </div>
                    <div className="px-4 py-2 text-center">
                      <div className="text-[10px] text-neutral-500 uppercase font-semibold tracking-wider">
                        WAITLIST
                      </div>
                      <div
                        className={`font-display font-black text-2xl ${
                          currentSession.waitlistCount > 0 ? 'text-[#FF3B00]' : 'text-neutral-400'
                        }`}
                      >
                        {String(currentSession.waitlistCount).padStart(2, '0')}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Operations Layout (2 Columns) */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Left Column: 20-Mat Floor Plan */}
                  <div className="lg:col-span-7 bg-white border-sharp-2 p-5 shadow-hard flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between pb-3 mb-4 border-sharp-b">
                        <div className="font-display font-bold text-lg uppercase tracking-tight flex items-center gap-2">
                          <span>MAT GRID ROSTER</span>
                          <span className="text-xs font-mono-numbers px-2 py-0.5 bg-neutral-200 text-black">
                            20 MAT INVARIANT
                          </span>
                        </div>
                        <div className="flex items-center gap-3 font-mono-numbers text-[11px]">
                          <div className="flex items-center gap-1.5">
                            <span className="w-3 h-3 bg-white border border-black inline-block"></span>
                            <span>OPEN</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="w-3 h-3 bg-[#0D0D0D] inline-block"></span>
                            <span>BOOKED</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="w-3 h-3 bg-[#008744] inline-block"></span>
                            <span>CHECKED IN</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="w-3 h-3 bg-[#FF3B00] inline-block"></span>
                            <span>YOU</span>
                          </div>
                        </div>
                      </div>

                      {/* 20 Mat Tiles (4 x 5 Grid) */}
                      <div className="grid grid-cols-4 sm:grid-cols-5 gap-2.5">
                        {Array.from({ length: 20 }, (_, i) => i + 1).map((matNum) => {
                          const booked = currentSession.matMap[matNum];
                          const isMine =
                            userBooking &&
                            userBooking.matNumber === matNum &&
                            (userBooking.status === 'CONFIRMED' || userBooking.status === 'CHECKED_IN');

                          let tileBg = 'bg-neutral-50 text-neutral-800 border-dashed border-neutral-400 hover:border-black hover:bg-white';
                          if (isMine) {
                            tileBg = 'bg-[#FF3B00] text-white border-black ring-2 ring-black shadow-hard';
                          } else if (booked && booked.status === 'CHECKED_IN') {
                            tileBg = 'bg-[#008744] text-white border-black';
                          } else if (booked) {
                            tileBg = 'bg-[#0D0D0D] text-white border-black';
                          }

                          return (
                            <div
                              key={matNum}
                              className={`relative p-2.5 flex flex-col justify-between h-20 border-sharp transition-all ${tileBg}`}
                            >
                              <div className="flex items-start justify-between font-mono-numbers">
                                <span className="text-xs font-bold tracking-tighter">
                                  #{String(matNum).padStart(2, '0')}
                                </span>
                                {isMine ? (
                                  <span className="text-[9px] font-black uppercase tracking-widest bg-black text-white px-1">
                                    YOU
                                  </span>
                                ) : booked && booked.status === 'CHECKED_IN' ? (
                                  <span className="text-[9px] font-black uppercase tracking-widest bg-black text-white px-1">
                                    IN
                                  </span>
                                ) : booked ? (
                                  <span className="text-[9px] font-mono-numbers opacity-80 uppercase">RES</span>
                                ) : (
                                  <span className="text-[9px] font-mono-numbers text-neutral-400 uppercase">FREE</span>
                                )}
                              </div>
                              <div className="text-[11px] truncate font-medium font-mono-numbers mt-1">
                                {isMine ? (
                                  <span className="font-bold underline decoration-white">
                                    {currentUser ? currentUser.name : 'You'}
                                  </span>
                                ) : booked ? (
                                  <span className="opacity-90">{booked.userName.split(' ')[0]}</span>
                                ) : (
                                  <span className="text-neutral-400 font-normal">--</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="mt-5 pt-4 border-t border-neutral-300 flex items-center justify-between text-xs font-mono-numbers text-neutral-600">
                      <div>
                        FLOOR OCCUPANCY: <strong className="text-black">{currentSession.confirmedCount} / 20</strong> (
                        {Math.round((currentSession.confirmedCount / 20) * 100)}%)
                      </div>
                      <div>
                        CHECKED IN: <strong className="text-[#008744]">{currentSession.checkedInCount}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Dynamic Action State Card / Pass */}
                  <div className="lg:col-span-5 flex flex-col gap-6">
                    {userBooking && (userBooking.status === 'CONFIRMED' || userBooking.status === 'CHECKED_IN') ? (
                      /* STATE A: ATHLETE CONFIRMED ENTRY PASS */
                      <div className="relative bg-white border-sharp-2 p-6 shadow-hard-lg overflow-hidden">
                        <div className="ticket-notch-left"></div>
                        <div className="ticket-notch-right"></div>

                        <div className="flex items-center justify-between border-sharp-b pb-3 mb-4">
                          <div className="flex items-center gap-2">
                            <span className="w-3 h-3 bg-[#FF3B00]"></span>
                            <span className="font-display font-black text-sm tracking-wider uppercase text-black">
                              OFFICIAL APEX ENTRY PASS
                            </span>
                          </div>
                          <span
                            className={`font-mono-numbers text-xs px-2 py-0.5 font-bold uppercase ${
                              userBooking.status === 'CHECKED_IN' ? 'bg-[#008744] text-white' : 'bg-black text-white'
                            }`}
                          >
                            {userBooking.status === 'CHECKED_IN' ? 'CHECKED IN' : 'CONFIRMED'}
                          </span>
                        </div>

                        <div className="bg-[#F4F4F0] border-sharp p-4 mb-4 flex items-center justify-between">
                          <div>
                            <div className="font-mono-numbers text-xs text-neutral-500 uppercase">
                              RESERVED MAT ALLOCATION
                            </div>
                            <div className="font-display font-black text-4xl text-black">
                              MAT // {String(userBooking.matNumber).padStart(2, '0')}
                            </div>
                          </div>
                          <div className="text-right font-mono-numbers text-xs">
                            <div className="text-neutral-500">MEMBER</div>
                            <div className="font-bold text-black uppercase">{userBooking.userName}</div>
                          </div>
                        </div>

                        <div className="border-sharp-2 bg-black text-white p-4 text-center mb-4">
                          <div className="font-mono-numbers text-[10px] text-neutral-400 uppercase tracking-widest mb-1">
                            8-CHARACTER DOOR CHECK-IN CODE
                          </div>
                          <div className="font-mono-numbers font-black text-3xl tracking-widest text-[#FF3B00] select-all py-1">
                            {userBooking.checkInCode}
                          </div>
                          <div className="text-[10px] font-mono-numbers text-neutral-400 mt-1">
                            ENTER AT DOOR TERMINAL OR SHOW TO APEX STAFF
                          </div>
                        </div>

                        <div className="mb-4">
                          <div className="barcode-strip border border-black mb-1"></div>
                          <div className="font-mono-numbers text-[9px] text-center text-neutral-500 tracking-widest uppercase">
                            APX*SESSION-{currentSession.session.id}*{userBooking.checkInCode}*MAT-{userBooking.matNumber}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleCancel(userBooking.id)}
                          className="btn-hard w-full py-3 bg-white hover:bg-neutral-100 text-black border-sharp-2 font-display font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-hard"
                        >
                          ✕ CANCEL RESERVATION
                        </button>
                        <p className="text-[10px] font-mono-numbers text-neutral-500 mt-2 text-center">
                          AUTOMATIC PROMOTION: Cancelling immediately promotes Waitlist #1 to this mat.
                        </p>
                      </div>
                    ) : userBooking && userBooking.status === 'WAITLIST' ? (
                      /* STATE B: ATHLETE WAITLIST TICKER */
                      <div className="bg-black text-white border-sharp-2 p-6 shadow-hard-lg">
                        <div className="flex items-center justify-between pb-3 border-b border-neutral-800 mb-4 font-mono-numbers text-xs">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 bg-[#FF3B00] rounded-full live-indicator"></span>
                            <span className="text-[#FF3B00] font-bold uppercase tracking-widest">
                              LIVE QUEUE TICKER
                            </span>
                          </div>
                          <span className="text-neutral-400">SSE SYNCED</span>
                        </div>

                        <div className="text-center py-4 bg-neutral-900 border border-neutral-800 mb-4">
                          <div className="font-mono-numbers text-xs text-neutral-400 uppercase tracking-wider mb-1">
                            CURRENT WAITLIST STANDING
                          </div>
                          <div className="font-display font-black text-5xl md:text-6xl text-[#FF3B00] tracking-tight">
                            #{String(userBooking.waitlistPosition).padStart(2, '0')}
                          </div>
                          <div className="font-mono-numbers text-xs text-neutral-300 mt-2 uppercase font-semibold">
                            YOU ARE POSITION #{userBooking.waitlistPosition} IN QUEUE
                          </div>
                        </div>

                        <div className="space-y-2 font-mono-numbers text-xs text-neutral-300 mb-5 border-l-2 border-[#FF3B00] pl-3 py-1">
                          <p>• Zero page refresh required. This screen updates live via Server-Sent Events.</p>
                          <p>• If an athlete cancels their reservation, your position advances automatically.</p>
                          <p>• Position #1 is automatically promoted to CONFIRMED with an 8-character check-in code.</p>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleCancel(userBooking.id)}
                          className="btn-hard w-full py-3 bg-neutral-800 hover:bg-neutral-700 text-white border border-neutral-600 font-display font-bold text-sm uppercase tracking-wider cursor-pointer shadow-hard"
                        >
                          LEAVE WAITLIST
                        </button>
                      </div>
                    ) : (
                      /* STATE C: UNBOOKED (RESERVE MAT OR JOIN WAITLIST) */
                      <div className="bg-white border-sharp-2 p-6 shadow-hard flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between border-sharp-b pb-3 mb-4">
                            <span className="font-display font-bold text-base uppercase tracking-tight text-black">
                              {currentSession.isFull ? 'JOIN SESSION WAITLIST' : 'RESERVE YOUR MAT'}
                            </span>
                            <span
                              className={`font-mono-numbers text-xs px-2 py-0.5 font-bold uppercase ${
                                currentSession.isFull ? 'bg-[#FF3B00] text-white' : 'bg-black text-white'
                              }`}
                            >
                              {currentSession.isFull
                                ? 'CAPACITY FULL (20/20)'
                                : `${currentSession.matsRemaining} OPEN MATS`}
                            </span>
                          </div>

                          <form onSubmit={handleBook} className="space-y-4">
                            <div>
                              <label className="block font-mono-numbers text-xs text-neutral-600 uppercase font-bold mb-1">
                                ATHLETE NAME
                              </label>
                              <input
                                type="text"
                                readOnly={!!currentUser}
                                value={currentUser ? currentUser.name : 'Alex Rivera'}
                                className="w-full bg-[#F4F4F0] border-sharp p-2.5 font-mono-numbers text-sm text-black focus:outline-none"
                              />
                            </div>

                            <div>
                              <label className="block font-mono-numbers text-xs text-neutral-600 uppercase font-bold mb-1">
                                MEMBER EMAIL (FOR CONFIRMATION)
                              </label>
                              <input
                                type="email"
                                readOnly={!!currentUser}
                                value={currentUser ? currentUser.email : 'alex.rivera@athletic.io'}
                                className="w-full bg-[#F4F4F0] border-sharp p-2.5 font-mono-numbers text-sm text-black focus:outline-none"
                              />
                            </div>

                            <div className="pt-3">
                              {currentSession.isFull ? (
                                <button
                                  type="submit"
                                  className="btn-hard w-full py-4 bg-[#FF3B00] hover:bg-[#E03400] text-white border-sharp-2 font-display font-black text-lg uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-hard"
                                >
                                  <span>JOIN WAITLIST // POSITION #{currentSession.waitlistCount + 1}</span>
                                  <span>→</span>
                                </button>
                              ) : (
                                <button
                                  type="submit"
                                  className="btn-hard w-full py-4 bg-[#0D0D0D] hover:bg-black text-white border-sharp-2 font-display font-black text-lg uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-hard"
                                >
                                  <span>RESERVE MAT // SINGLE-CLICK</span>
                                  <span>→</span>
                                </button>
                              )}
                            </div>
                          </form>
                        </div>

                        <div className="mt-6 pt-4 border-t border-neutral-300 font-mono-numbers text-[11px] text-neutral-500">
                          SYSTEM INVARIANT: Hard limit of 20 mats strictly enforced by transaction locks.
                        </div>
                      </div>
                    )}

                    {/* Waitlist Queue Display Panel */}
                    {currentSession.waitlistCount > 0 && (
                      <div className="bg-white border-sharp-2 p-4 shadow-hard">
                        <div className="flex items-center justify-between border-sharp-b pb-2 mb-3 font-mono-numbers text-xs">
                          <span className="font-bold uppercase tracking-wider text-black">
                            ACTIVE WAITLIST QUEUE ({currentSession.waitlistCount})
                          </span>
                          <span className="text-[#FF3B00] font-semibold">PRIORITY ORDER</span>
                        </div>
                        <div className="space-y-1.5 font-mono-numbers text-xs">
                          {currentSession.waitlist.map((w) => {
                            const isMe = currentUser && (w.userId === currentUser.id || w.userEmail === currentUser.email);
                            return (
                              <div
                                key={w.id}
                                className={`flex items-center justify-between p-2 ${
                                  isMe
                                    ? 'bg-black text-white font-bold'
                                    : 'bg-neutral-100 text-neutral-800 border border-neutral-200'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <span className="w-5 h-5 bg-[#FF3B00] text-white flex items-center justify-center font-bold text-[10px]">
                                    #{w.waitlistPosition}
                                  </span>
                                  <span>{w.userName}</span>
                                </div>
                                <span className="text-[10px] opacity-75">{isMe ? 'YOU' : 'QUEUED'}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          /* =====================================================================
             VIEW 3: DOOR TERMINAL VIEW (/staff)
             ===================================================================== */
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-sharp-b pb-4">
              <div>
                <div className="flex items-center gap-2 font-mono-numbers text-xs text-neutral-500 mb-1">
                  <span className="w-2.5 h-2.5 bg-[#FF3B00] rounded-full live-indicator"></span>
                  <span className="text-black font-bold uppercase">STATION: ENTRY PORTAL 01</span>
                  <span>•</span>
                  <span>HIGH-EFFICIENCY CHECK-IN ENGINE</span>
                </div>
                <h1 className="font-display font-extrabold text-3xl md:text-5xl uppercase tracking-tighter text-black">
                  DOOR CHECK-IN TERMINAL
                </h1>
                <p className="font-mono-numbers text-xs text-neutral-600 mt-0.5">
                  SCAN BARCODE OR ENTER 8-CHARACTER CODE // CONFIRM FLOOR ENTRY // REAL-TIME SSE SYNC
                </p>
              </div>

              <div className="bg-white border-sharp p-3 font-mono-numbers text-xs shadow-hard self-start md:self-auto">
                <div className="text-[10px] text-neutral-500 uppercase font-bold mb-1">MONITORED SESSION:</div>
                <select
                  value={activeSessionId}
                  onChange={(e) => {
                    const sid = parseInt(e.target.value, 10);
                    setActiveSessionId(sid);
                    fetchSessionDetail(sid);
                  }}
                  className="bg-[#F4F4F0] border-sharp p-2 text-black font-bold text-xs focus:outline-none cursor-pointer"
                >
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.startTime} // {s.title.split('//')[0]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Giant Scanner Card */}
            <div className="bg-black text-white border-sharp-2 p-6 md:p-8 shadow-hard-lg">
              <div className="max-w-2xl mx-auto space-y-4">
                <div className="flex items-center justify-between font-mono-numbers text-xs text-neutral-400">
                  <span className="uppercase tracking-widest text-[#FF3B00] font-bold flex items-center gap-2">
                    <span className="w-2 h-2 bg-[#FF3B00]"></span>
                    DOOR CODE ENTRY / SCANNER INPUT
                  </span>
                  <span>AUTO-FORMAT // PRESS ENTER</span>
                </div>

                <form onSubmit={(e) => handleCheckInSubmit(e)} className="space-y-4">
                  <div className="relative">
                    <input
                      type="text"
                      autoFocus
                      autoComplete="off"
                      spellCheck="false"
                      placeholder="XXXX-XXXX"
                      maxLength={9}
                      value={scannerCode}
                      onChange={handleCodeInputChange}
                      className="w-full bg-neutral-900 border-2 border-neutral-700 p-4 text-center font-mono-numbers font-black text-3xl md:text-5xl text-[#FF3B00] tracking-widest uppercase focus:outline-none focus:border-[#FF3B00] focus:ring-2 focus:ring-[#FF3B00]"
                    />
                    {scannerCode && (
                      <button
                        type="button"
                        onClick={() => setScannerCode('')}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white font-mono-numbers text-xs uppercase cursor-pointer"
                      >
                        [ CLEAR ]
                      </button>
                    )}
                  </div>

                  <button
                    type="submit"
                    className="btn-hard w-full py-4 bg-[#FF3B00] hover:bg-[#E03400] text-white border border-white font-display font-black text-lg uppercase tracking-wider cursor-pointer shadow-hard flex items-center justify-center gap-2"
                  >
                    <span>VERIFY & CHECK IN MEMBER</span>
                    <span>→</span>
                  </button>
                </form>

                {/* Quick-test Codes */}
                {currentSession && currentSession.confirmedBookings.length > 0 && (
                  <div className="pt-3 border-t border-neutral-800">
                    <div className="font-mono-numbers text-[10px] text-neutral-400 uppercase tracking-wider mb-2">
                      QUICK-TEST CODES FROM CURRENT SESSION (CLICK TO AUTO-VERIFY):
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {currentSession.confirmedBookings.slice(0, 4).map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => {
                            if (b.checkInCode) {
                              setScannerCode(b.checkInCode);
                              handleCheckInSubmit(undefined, b.checkInCode);
                            }
                          }}
                          className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 font-mono-numbers text-xs text-neutral-200 cursor-pointer flex items-center gap-1.5"
                        >
                          <span className="text-[#FF3B00] font-bold">{b.checkInCode}</span>
                          <span className="text-neutral-400">({b.userName.split(' ')[0]})</span>
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => handleCheckInSubmit(undefined, 'INVALID-99')}
                        className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 font-mono-numbers text-xs text-red-400 cursor-pointer"
                      >
                        Test Invalid Code
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Check-In Result Banner */}
            {terminalResult && (
              <div
                className={`border-sharp-2 p-5 shadow-hard transition-all ${
                  terminalResult.success ? 'bg-[#008744] text-white border-black' : 'bg-[#FF3B00] text-white border-black'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="font-mono-numbers text-xs uppercase tracking-widest flex items-center gap-2">
                      <span className="w-2.5 h-2.5 bg-white rounded-full"></span>
                      <span>
                        {terminalResult.success
                          ? 'TERMINAL STATUS: ACCESS GRANTED'
                          : 'TERMINAL STATUS: VERIFICATION FAILED'}
                      </span>
                    </div>
                    <div className="font-display font-black text-2xl md:text-3xl uppercase tracking-tight">
                      {terminalResult.message}
                    </div>
                    {terminalResult.booking && (
                      <div className="font-mono-numbers text-xs text-neutral-100 flex flex-wrap gap-4 pt-1">
                        <span>
                          MAT:{' '}
                          <strong className="text-white text-sm">
                            #{String(terminalResult.booking.matNumber).padStart(2, '0')}
                          </strong>
                        </span>
                        <span>
                          MEMBER: <strong className="text-white">{terminalResult.booking.userName}</strong>
                        </span>
                        <span>
                          CODE: <strong className="text-white">{terminalResult.booking.checkInCode}</strong>
                        </span>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setTerminalResult(null)}
                    className="text-white font-mono-numbers text-sm px-2 py-1 bg-black hover:bg-neutral-800 cursor-pointer"
                  >
                    [ CLEAR ]
                  </button>
                </div>
              </div>
            )}

            {/* Roster & Floor View */}
            {currentSession && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono-numbers">
                  <div className="bg-white border-sharp p-3">
                    <div className="text-[10px] text-neutral-500 uppercase">MAT CAPACITY</div>
                    <div className="font-display font-black text-2xl text-black">
                      {currentSession.confirmedCount} <span className="text-xs text-neutral-400 font-normal">/ 20</span>
                    </div>
                  </div>
                  <div className="bg-white border-sharp p-3">
                    <div className="text-[10px] text-neutral-500 uppercase">CHECKED IN</div>
                    <div className="font-display font-black text-2xl text-[#008744]">
                      {currentSession.checkedInCount}
                    </div>
                  </div>
                  <div className="bg-white border-sharp p-3">
                    <div className="text-[10px] text-neutral-500 uppercase">PENDING ARRIVAL</div>
                    <div className="font-display font-black text-2xl text-black">
                      {currentSession.confirmedCount - currentSession.checkedInCount}
                    </div>
                  </div>
                  <div className="bg-white border-sharp p-3">
                    <div className="text-[10px] text-neutral-500 uppercase">WAITLIST QUEUE</div>
                    <div
                      className={`font-display font-black text-2xl ${
                        currentSession.waitlistCount > 0 ? 'text-[#FF3B00]' : 'text-neutral-400'
                      }`}
                    >
                      {currentSession.waitlistCount}
                    </div>
                  </div>
                </div>

                {/* Confirmed Roster Table */}
                <div className="bg-white border-sharp-2 shadow-hard overflow-hidden">
                  <div className="p-4 border-sharp-b bg-neutral-50 flex items-center justify-between">
                    <div className="font-display font-bold text-base uppercase tracking-tight text-black flex items-center gap-2">
                      <span>SESSION ROSTER // CONFIRMED MEMBERS</span>
                      <span className="font-mono-numbers text-xs px-2 py-0.5 bg-black text-white">
                        {currentSession.confirmedCount} / 20
                      </span>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left font-mono-numbers text-xs border-collapse">
                      <thead>
                        <tr className="border-sharp-b bg-neutral-100 text-neutral-600 uppercase text-[11px]">
                          <th className="p-3 border-sharp-r w-16">MAT</th>
                          <th className="p-3 border-sharp-r">ATHLETE NAME</th>
                          <th className="p-3 border-sharp-r">CHECK-IN CODE</th>
                          <th className="p-3 border-sharp-r">STATUS</th>
                          <th className="p-3 text-right">ACTION</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-200">
                        {currentSession.confirmedBookings.map((b) => (
                          <tr
                            key={b.id}
                            className={`hover:bg-neutral-50 transition-colors ${
                              b.status === 'CHECKED_IN' ? 'bg-emerald-50/40' : ''
                            }`}
                          >
                            <td className="p-3 border-sharp-r font-bold text-black text-sm">
                              #{String(b.matNumber).padStart(2, '0')}
                            </td>
                            <td className="p-3 border-sharp-r">
                              <div className="font-bold text-black">{b.userName}</div>
                              <div className="text-[10px] text-neutral-500">{b.userEmail}</div>
                            </td>
                            <td className="p-3 border-sharp-r font-black text-sm tracking-wider text-black">
                              {b.checkInCode || '--'}
                            </td>
                            <td className="p-3 border-sharp-r">
                              {b.status === 'CHECKED_IN' ? (
                                <span className="px-2 py-0.5 bg-[#008744] text-white font-bold text-[10px] uppercase">
                                  CHECKED IN
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 bg-black text-white font-semibold text-[10px] uppercase">
                                  CONFIRMED
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-right space-x-2">
                              {b.status !== 'CHECKED_IN' && b.checkInCode && (
                                <button
                                  type="button"
                                  onClick={() => handleCheckInSubmit(undefined, b.checkInCode!)}
                                  className="btn-hard px-2.5 py-1 bg-[#008744] hover:bg-emerald-800 text-white font-bold text-[10px] uppercase tracking-wider cursor-pointer border border-black"
                                >
                                  ONE-TAP CHECK IN
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleCancel(b.id)}
                                className="px-2 py-1 bg-white hover:bg-neutral-100 text-neutral-700 hover:text-black font-semibold text-[10px] uppercase cursor-pointer border border-neutral-300"
                              >
                                RELEASE
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* =======================================================================
         REGISTER / LOGIN MODAL
         ======================================================================= */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-white border-sharp-2 max-w-md w-full shadow-hard-lg overflow-hidden">
            {/* Modal Header */}
            <div className="bg-black text-white p-4 flex items-center justify-between">
              <div className="font-display font-black text-lg uppercase tracking-tight">
                {authMode === 'login' ? 'PORTAL LOGIN' : 'CREATE APEX ACCOUNT'}
              </div>
              <button
                type="button"
                onClick={() => setShowAuthModal(false)}
                className="text-neutral-400 hover:text-white font-mono-numbers text-xs uppercase cursor-pointer"
              >
                [ CLOSE ✕ ]
              </button>
            </div>

            {/* Mode Switcher */}
            <div className="flex border-sharp-b bg-neutral-100 divide-x divide-neutral-300 font-mono-numbers text-xs">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setAuthError(null);
                  setAuthSuccessNotice(null);
                }}
                className={`flex-1 py-2.5 font-bold uppercase cursor-pointer ${
                  authMode === 'login' ? 'bg-white text-black' : 'text-neutral-500 hover:text-black'
                }`}
              >
                SIGN IN
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('register');
                  setAuthError(null);
                  setAuthSuccessNotice(null);
                }}
                className={`flex-1 py-2.5 font-bold uppercase cursor-pointer ${
                  authMode === 'register' ? 'bg-white text-black' : 'text-neutral-500 hover:text-black'
                }`}
              >
                REGISTER
              </button>
            </div>

            <div className="p-6 space-y-4">
              {authError && (
                <div className="p-3 bg-[#FF3B00] text-white font-mono-numbers text-xs border border-black">
                  ERROR: {authError}
                </div>
              )}

              {authSuccessNotice && (
                <div className="p-3 bg-black text-white font-mono-numbers text-xs border-2 border-[#FF3B00] space-y-1">
                  <div className="text-[#FF3B00] font-black uppercase">DISPATCHED TO MAIN ADMIN:</div>
                  <div>{authSuccessNotice}</div>
                </div>
              )}

              <form onSubmit={handleAuthSubmit} className="space-y-4">
                {authMode === 'register' && (
                  <div>
                    <label className="block font-mono-numbers text-xs text-neutral-600 uppercase font-bold mb-1">
                      FULL NAME
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Jordan Taylor"
                      value={authForm.name}
                      onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                      className="w-full bg-[#F4F4F0] border-sharp p-2.5 font-mono-numbers text-sm text-black focus:outline-none focus:ring-2 focus:ring-black"
                    />
                  </div>
                )}

                <div>
                  <label className="block font-mono-numbers text-xs text-neutral-600 uppercase font-bold mb-1">
                    EMAIL ADDRESS
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="athlete@apex.run"
                    value={authForm.email}
                    onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                    className="w-full bg-[#F4F4F0] border-sharp p-2.5 font-mono-numbers text-sm text-black focus:outline-none focus:ring-2 focus:ring-black"
                  />
                  {authForm.email.toLowerCase() === MAIN_ADMIN_EMAIL.toLowerCase() && (
                    <div className="mt-1 text-[11px] font-mono-numbers text-[#FF3B00] font-bold">
                      ★ DETECTED MAIN ADMIN ADDRESS ({MAIN_ADMIN_EMAIL}). AUTOMATIC FULL REGULATORY AUTHORIZATION.
                    </div>
                  )}
                </div>

                <div>
                  <label className="block font-mono-numbers text-xs text-neutral-600 uppercase font-bold mb-1">
                    PASSWORD
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={authForm.password}
                    onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                    className="w-full bg-[#F4F4F0] border-sharp p-2.5 font-mono-numbers text-sm text-black focus:outline-none focus:ring-2 focus:ring-black"
                  />
                </div>

                {/* Role Selector during Registration */}
                {authMode === 'register' && (
                  <div className="pt-1">
                    <label className="block font-mono-numbers text-xs text-neutral-600 uppercase font-bold mb-1.5">
                      REGISTER AS:
                    </label>
                    <div className="grid grid-cols-2 gap-2 font-mono-numbers text-xs">
                      <button
                        type="button"
                        onClick={() => setAuthForm({ ...authForm, role: 'CLIENT' })}
                        className={`p-3 border text-left cursor-pointer transition-colors ${
                          authForm.role === 'CLIENT'
                            ? 'bg-black text-white border-black font-bold'
                            : 'bg-neutral-50 text-neutral-700 border-neutral-300 hover:border-black'
                        }`}
                      >
                        <div className="font-bold uppercase">● CLIENT</div>
                        <div className="text-[10px] opacity-75 mt-0.5">Gym Mat Reservations</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setAuthForm({ ...authForm, role: 'ADMIN' })}
                        className={`p-3 border text-left cursor-pointer transition-colors ${
                          authForm.role === 'ADMIN'
                            ? 'bg-[#FF3B00] text-white border-black font-bold ring-2 ring-black'
                            : 'bg-neutral-50 text-neutral-700 border-neutral-300 hover:border-black'
                        }`}
                      >
                        <div className="font-bold uppercase">● ADMIN</div>
                        <div className="text-[10px] opacity-75 mt-0.5">Requires Approval</div>
                      </button>
                    </div>

                    {authForm.role === 'ADMIN' && authForm.email.toLowerCase() !== MAIN_ADMIN_EMAIL.toLowerCase() && (
                      <div className="mt-2 p-2.5 bg-amber-50 border border-amber-300 font-mono-numbers text-[10px] text-amber-900">
                        <strong>NOTICE:</strong> Admin accounts require approval before activation. An authorization dispatch will be routed to Main Admin (<strong>{MAIN_ADMIN_EMAIL}</strong>).
                      </div>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  className="btn-hard w-full py-3.5 bg-black hover:bg-neutral-800 text-white font-display font-black text-base uppercase tracking-wider cursor-pointer border-sharp-2 shadow-hard mt-2"
                >
                  {authMode === 'login' ? 'SIGN IN' : 'SUBMIT REGISTRATION'}
                </button>
              </form>

              {/* Quick Preset Buttons for Instant Testing */}
              <div className="pt-3 border-t border-neutral-200">
                <div className="font-mono-numbers text-[10px] text-neutral-500 uppercase mb-1.5">
                  ONE-CLICK PRESET SIGN-IN:
                </div>
                <div className="flex flex-col gap-1.5 font-mono-numbers text-xs">
                  <button
                    type="button"
                    onClick={() => handleQuickLogin(MAIN_ADMIN_EMAIL)}
                    className="p-2 bg-neutral-100 hover:bg-neutral-200 border border-neutral-300 text-left cursor-pointer flex items-center justify-between"
                  >
                    <span className="font-bold text-black">Prabal Dadwal (Main Admin)</span>
                    <span className="text-[10px] text-[#FF3B00] font-black">{MAIN_ADMIN_EMAIL}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickLogin('alex.rivera@athletic.io')}
                    className="p-2 bg-neutral-100 hover:bg-neutral-200 border border-neutral-300 text-left cursor-pointer flex items-center justify-between"
                  >
                    <span className="font-bold text-black">Alex Rivera (Client)</span>
                    <span className="text-[10px] text-neutral-500">alex.rivera@athletic.io</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Industrial Footer */}
      <footer className="bg-white border-t border-[#0D0D0D] py-6 px-4 md:px-8 mt-12 font-mono-numbers text-xs text-neutral-600">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <span className="font-bold text-black uppercase">APEX KINETICS LAB</span>
            <span>•</span>
            <span>HARD CAPACITY: 20 MATS/HOUR</span>
            <span>•</span>
            <span>MAIN REGULATOR: {MAIN_ADMIN_EMAIL}</span>
          </div>
          <div className="text-neutral-500">
            FULL-STACK AUTH & REGULATION // SSE BROADCAST // PERSISTENT STORE
          </div>
        </div>
      </footer>
    </div>
  );
}
