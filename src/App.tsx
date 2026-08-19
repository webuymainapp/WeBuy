/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Textbook,
  StudentProfile,
  PaymentTransaction,
  AppSettings,
  NotificationItem,
} from './types';
import { Navbar } from './components/Navbar';
import { SummaryCard } from './components/SummaryCard';
import { TextbookCard } from './components/TextbookCard';
import { PaymentBottomSheet } from './components/PaymentBottomSheet';
import { ClassRepPortal } from './components/ClassRepPortal';
import { TransactionHistory } from './components/TransactionHistory';
import { AuthPage } from './components/AuthPage';
import { SettingsModal } from './components/SettingsModal';
import { BottomNav } from './components/BottomNav';
import { LandingPage } from './components/LandingPage';
import { QrPassModal } from './components/QrPassModal';
import { PwaInstallPrompt } from './components/PwaInstallPrompt';
import { NotificationIsland } from './components/NotificationIsland';
import { FloatingCart } from './components/FloatingCart';
import { CartModal } from './components/CartModal';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  BookCheck,
  CheckCircle2,
  Clock,
  Sparkles,
  X,
  AlertCircle,
} from 'lucide-react';
import { soundEffects } from './utils/audio';
import {
  authApi,
  dataApi,
  notificationsApi,
  walletApi,
  toStudentProfile,
  getToken,
  setToken,
  sendVerificationEmail,
  ApiError,
  type AuthStudent,
  type WalletTransaction,
} from './lib/api';

const SETTINGS_KEY = 'webuy_settings_v1';
const CART_KEY = 'webuy_cart_v1';
const defaultSettings: AppSettings = { theme: 'light', soundEnabled: true };

function readSettings(): AppSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
    return { ...defaultSettings, ...parsed };
  } catch {
    return defaultSettings;
  }
}

function readCart(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

// Static marketing visuals for the landing page phone mockup only.
const DEMO_PROFILE: StudentProfile = {
  id: 'demo',
  regNo: 'ENG/2022/88219',
  fullName: 'Victor Ogemdi',
  department: 'Computer & Electrical Engineering',
  faculty: 'Faculty of Engineering & Tech',
  level: '300 Level',
  academicSession: '2025/2026 First Semester',
  email: '',
  phone: '',
  avatarUrl: '',
};

const DEMO_BOOKS: Textbook[] = [
  {
    id: 'demo-1',
    courseCode: 'CSC 301',
    courseTitle: 'Modern Computer Networks & Distributed Systems',
    bookTitle: 'Modern Computer Networking & Cloud Architecture',
    author: 'Tanenbaum',
    edition: '6th Global Edition',
    price: 7200,
    status: 'paid',
    coverUrl: '/src/assets/images/computer_network_cover_1785578258297.jpg',
    department: 'Computer & Electrical Engineering',
    level: '300 Level',
    lecturerName: 'Dr. A. I. Adebayo',
    isbn: '',
    pickupLocation: 'ICT Centre - Office 08',
    classRepName: 'Class Rep',
  },
  {
    id: 'demo-2',
    courseCode: 'EEE 311',
    courseTitle: 'Engineering Mathematics IV & Numerical Analysis',
    bookTitle: 'Engineering Mathematics & Numerical Analysis (4th Edition)',
    author: 'Stroud',
    edition: '4th Edition',
    price: 6500,
    status: 'unpaid',
    coverUrl: '/src/assets/images/engineering_math_cover_1785578245477.jpg',
    department: 'Computer & Electrical Engineering',
    level: '300 Level',
    lecturerName: 'Prof. E. C. Okonkwo',
    isbn: '',
    pickupLocation: 'Faculty Building - Room 104',
    classRepName: 'Class Rep',
  },
];

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(readSettings);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [textbooks, setTextbooks] = useState<Textbook[]>([]);
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [wallet, setWallet] = useState<{
    points: number;
    accountNumber: string;
    bankName: string;
    accountName: string;
    fundingError?: string | null;
    transactions: WalletTransaction[];
  } | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [islandNotification, setIslandNotification] = useState<NotificationItem | null>(null);
  // IDs already shown via the island popup, so a notification only pops once.
  const seenNotificationIds = useRef<Set<string>>(new Set());
  // Last time the mail drainer was nudged (throttled; see the poll below).
  const lastMailDrainRef = useRef(0);

  const [authenticated, setAuthenticated] = useState<boolean>(() => !!getToken());
  const [booting, setBooting] = useState<boolean>(() => !!getToken());
  const [userRole, setUserRole] = useState<'student' | 'class_rep' | 'chief_admin'>('student');
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [dataError, setDataError] = useState<string | null>(null);

  const [activeRole, setActiveRole] = useState<'student' | 'class_rep'>('student');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'history' | 'class_rep'>('dashboard');
  const [activeFilter, setActiveFilter] = useState<'all' | 'unpaid' | 'paid' | 'collected'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Cart (persisted) + checkout modal
  const [cartIds, setCartIds] = useState<string[]>(readCart);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartCheckoutOpen, setCartCheckoutOpen] = useState(false);

  // Modals & Bottom sheets
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [passBook, setPassBook] = useState<Textbook | null>(null);

  // Persist local preferences
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // ignore
    }
    document.documentElement.classList.toggle('dark', settings.theme === 'dark');
    soundEffects.setEnabled(settings.soundEnabled);
  }, [settings]);

  // Persist the cart.
  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cartIds));
    } catch {
      // ignore
    }
  }, [cartIds]);

  const loadData = useCallback(async (regNo: string) => {
    try {
      const [books, txs, notifs] = await Promise.all([
        dataApi.getMyTextbooks(),
        dataApi.getMyTransactions(regNo),
        notificationsApi.get(),
      ]);
      setTextbooks(books);
      setTransactions(txs);
      setNotifications(notifs);
      // Load the points wallet (idempotently provisions the virtual account).
      walletApi
        .get()
        .then(setWallet)
        .catch(() => setWallet((w) => w ?? { points: 0, accountNumber: '', bankName: '', accountName: '', transactions: [] }));
      // Pop the newest unread notification that hasn't been shown yet (e.g. a
      // "Payment received" right after paying) as a Dynamic Island-style banner.
      const unseen = notifs.find(
        (n) => !n.read && !seenNotificationIds.current.has(n.id),
      );
      if (unseen) {
        seenNotificationIds.current.add(unseen.id);
        setIslandNotification(unseen);
      }
      setDataError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setToken(null);
        setAuthenticated(false);
        setProfile(null);
      } else {
        setDataError(err instanceof Error ? err.message : 'Could not load your data');
      }
    }
  }, []);

  // Poll for new notifications while signed in so payment/collection updates
  // surface as island popups without a manual refresh. Polls every 90s (up from
  // 20s) and ONLY while the tab is visible + the page is focused — a background
  // tab doesn't need live updates — which cuts polling bandwidth ~4.5x. The poll
  // also fetches unread-only so each response is a small payload.
  useEffect(() => {
    if (!authenticated || !profile) return;
    const poll = async () => {
      if (document.hidden || document.hasFocus?.() === false) return;
      try {
        const notifs = await notificationsApi.get(true);
        setNotifications((prev) => {
          // Keep the full list the page already loaded, but merge in fresh
          // unread items so the navbar badge / island stay current.
          const merged = [...notifs];
          for (const p of prev) {
            if (!merged.some((n) => n.id === p.id)) merged.push(p);
          }
          return merged.sort((a, b) =>
            b.createdAt.localeCompare(a.createdAt),
          );
        });
        const unseen = notifs.find(
          (n) => !n.read && !seenNotificationIds.current.has(n.id),
        );
        if (unseen) {
          seenNotificationIds.current.add(unseen.id);
          setIslandNotification(unseen);
        }
        // Prod mail delivery is drainer-triggered (the Vercel fn); give queued
        // alerts — e.g. money-request reminders — a gentle push every ~5 min so
        // they aren't stuck in the outbox. Locally the mail worker auto-drains.
        if (Date.now() - lastMailDrainRef.current >= 5 * 60_000) {
          lastMailDrainRef.current = Date.now();
          void sendVerificationEmail().catch(() => undefined);
        }
      } catch {
        // transient — retry next tick
      }
    };
    const interval = setInterval(poll, 90_000);
    const onVisible = () => {
      if (!document.hidden) poll();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [authenticated, profile]);

  // Bootstrap session on first load
  useEffect(() => {
    if (!getToken()) {
      setBooting(false);
      return;
    }

    authApi
      .me()
      .then(async (res) => {
        const student = res.student;
        setProfile(toStudentProfile(student, readSettings()));
        setUserRole(student.role);
        setBooting(false);
        await loadData(student.regNo);
      })
      .catch((err) => {
        // A 401 (expired/invalid token) OR 404 (account deleted/reset) means
        // the stored session no longer maps to a real student — clear it and
        // fall back to the startup/auth page.
        if (
          err instanceof ApiError &&
          (err.status === 401 || err.status === 404)
        ) {
          setToken(null);
          setAuthenticated(false);
          setProfile(null);
        }
        setBooting(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAuthSuccess = (student: AuthStudent) => {
    const p = toStudentProfile(student, settings);
    setProfile(p);
    setUserRole(student.role);
    setAuthenticated(true);
    setShowAuth(false);
    setActiveRole('student');
    setActiveTab('dashboard');
    loadData(p.regNo);
  };

  const handleSignOut = () => {
    setToken(null);
    setAuthenticated(false);
    setProfile(null);
    setTextbooks([]);
    setTransactions([]);
    setNotifications([]);
    setIslandNotification(null);
    seenNotificationIds.current = new Set();
    setCartIds([]);
    setCartOpen(false);
    setCartCheckoutOpen(false);
    setUserRole('student');
    setActiveRole('student');
    setActiveTab('dashboard');
    setShowAuth(false);
  };

  const handleRoleChange = (role: 'student' | 'class_rep') => {
    if (role === 'class_rep' && userRole === 'student') return;
    setActiveRole(role);
  };

  const isRep = userRole === 'class_rep' || userRole === 'chief_admin';
  const isChief = userRole === 'chief_admin';

  // ---- Cart helpers ------------------------------------------------------
  const cartItems = textbooks.filter(
    (b) => cartIds.includes(b.id) && b.status === 'unpaid',
  );
  const addToCart = useCallback((tb: Textbook) => {
    setCartIds((prev) => (prev.includes(tb.id) ? prev : [...prev, tb.id]));
  }, []);
  const removeFromCart = useCallback((tb: Textbook) => {
    setCartIds((prev) => prev.filter((id) => id !== tb.id));
  }, []);
  const clearCart = useCallback(() => setCartIds([]), []);
  const isInCart = useCallback(
    (id: string) => cartIds.includes(id),
    [cartIds],
  );

  const startCartCheckout = useCallback(async () => {
    setCartOpen(false);
    // Every checkout must charge books that already have a student_textbooks
    // row (so they carry a studentTextbookId). Assign any that don't yet, then
    // refresh so the fresh ids populate before the payment sheet opens.
    const toAssign = cartItems.filter((b) => !b.studentTextbookId);
    if (toAssign.length > 0) {
      try {
        await Promise.all(toAssign.map((b) => dataApi.assignTextbook(b.id)));
        if (profile) await loadData(profile.regNo);
      } catch {
        // Assignment failed — fall through and let checkout surface the error.
      }
    }
    setCartCheckoutOpen(true);
  }, [cartItems, profile, loadData]);

  // Derived counts
  const unpaidBooks = textbooks.filter((b) => b.status === 'unpaid');
  const paidPassesCount = textbooks.filter((b) => b.status === 'paid' || b.status === 'collected').length;

  // Search and Filter logic
  const filteredTextbooks = textbooks.filter((tb) => {
    if (activeFilter === 'unpaid' && tb.status !== 'unpaid') return false;
    if (activeFilter === 'paid' && tb.status !== 'paid') return false;
    if (activeFilter === 'collected' && tb.status !== 'collected') return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const match =
        tb.courseCode.toLowerCase().includes(q) ||
        tb.courseTitle.toLowerCase().includes(q) ||
        tb.bookTitle.toLowerCase().includes(q) ||
        tb.author.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  // ----- Unauthenticated views ---------------------------------------------
  if (!authenticated) {
    if (showAuth) {
      return (
        <AuthPage
          initialMode={authMode}
          onBack={() => setShowAuth(false)}
          onClose={() => {
            setShowAuth(false);
          }}
          onAuthSuccess={handleAuthSuccess}
        />
      );
    }

    return (
      <LandingPage
        profile={DEMO_PROFILE}
        textbooks={DEMO_BOOKS}
        onSignIn={() => {
          setAuthMode('signin');
          setShowAuth(true);
        }}
        onGetStarted={() => {
          setAuthMode('signup');
          setShowAuth(true);
        }}
      />
    );
  }

  if (booting) {
    return (
      <div className="min-h-dvh bg-slate-100 dark:bg-slate-950 flex flex-col items-center justify-center text-slate-900 dark:text-slate-100">
        <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white font-black text-xl mb-4">
          W
        </div>
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        <p className="text-xs font-semibold text-slate-500 mt-3">Loading your portal…</p>
      </div>
    );
  }

  const currentProfile = profile as StudentProfile;

  return (
    <div className={`min-h-dvh bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans overflow-x-clip ${
      activeRole === 'class_rep' ? 'pb-8' : 'pb-24 md:pb-12'
    }`}>
      {/* Dynamic Island-style notification popup */}
      <NotificationIsland
        notification={islandNotification}
        onDismiss={() => setIslandNotification(null)}
      />

      {/* Top Header */}
      <Navbar
        profile={currentProfile}
        activeRole={activeRole}
        isRep={isRep}
        onRoleChange={handleRoleChange}
        onSignOut={handleSignOut}
        onSelectTab={setActiveTab}
        activeTab={activeTab}
        notifications={notifications}
        onMarkAllRead={() => {
          notificationsApi.markAllRead();
          setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
        }}
      />

      {/* Main Container */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-5 space-y-6">
        {/* Backend connectivity banner */}
        <AnimatePresence>
          {dataError && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 flex items-start justify-between gap-3"
            >
              <div className="flex items-start gap-2.5 text-amber-800 dark:text-amber-300 text-xs font-semibold">
                <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p>Could not reach the Webuy backend.</p>
                  <p className="text-amber-600 dark:text-amber-400 font-medium mt-0.5">
                    {dataError} — check that the API is running and VITE_API_URL is set.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDataError(null)}
                className="p-1 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/40 text-amber-500"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <PwaInstallPrompt />

        {/* Tab 1: Student Dashboard */}
        {activeTab === 'dashboard' && activeRole === 'student' && (
          <div className="space-y-6">
            <SummaryCard
              profile={currentProfile}
              textbooks={textbooks}
              onPayAll={() => {
                soundEffects.playTap();
                // Pay All = add every unpaid book to the cart, then open it.
                setCartIds(unpaidBooks.map((b) => b.id));
                setCartOpen(true);
              }}
              onFilterChange={setActiveFilter}
              activeFilter={activeFilter}
              points={wallet?.points ?? 0}
              accountNumber={wallet?.accountNumber ?? ''}
              bankName={wallet?.bankName ?? ''}
              accountName={wallet?.accountName ?? ''}
              onCopyAccount={() => undefined}
              verifying={verifying}
              onVerify={() => {
                soundEffects.playTap();
                setVerifying(true);
                walletApi
                  .verify()
                  .then((res) => {
                    setWallet({
                      points: res.points,
                      accountNumber: res.accountNumber,
                      bankName: res.bankName,
                      accountName: res.accountName,
                      fundingError: res.fundingError,
                      transactions: res.transactions ?? [],
                    });
                    if (res.credited > 0) soundEffects.playSuccessChime();
                    else soundEffects.playTap();
                  })
                  .catch(() => soundEffects.playError())
                  .finally(() => setVerifying(false));
              }}
            />

            {/* Funding account error — usually a missing phone number */}
            {wallet?.fundingError && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
                <div className="flex items-start gap-2 min-w-0 flex-1">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                  <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                    {wallet.fundingError}
                  </p>
                </div>
                {!currentProfile.phone && (
                  <button
                    onClick={() => {
                      soundEffects.playTap();
                      setIsSettingsOpen(true);
                    }}
                    className="shrink-0 px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs transition-colors cursor-pointer"
                  >
                    Add phone number
                  </button>
                )}
              </div>
            )}

            {/* Filter Tabs & Search Header */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                    Compulsory Course Textbooks
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    Assigned for {currentProfile.department} • {currentProfile.level}
                  </p>
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search by course code or title..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold bg-slate-50 dark:bg-slate-800 dark:text-slate-100 focus:outline-indigo-600"
                  />
                </div>
              </div>

              {/* Status Filter Buttons */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                <button
                  onClick={() => setActiveFilter('all')}
                  className={`px-3.5 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all ${
                    activeFilter === 'all'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`}
                >
                  All Books ({textbooks.length})
                </button>

                <button
                  onClick={() => setActiveFilter('unpaid')}
                  className={`px-3.5 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all flex items-center gap-1 ${
                    activeFilter === 'unpaid'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-950/70'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Unpaid ({unpaidBooks.length})</span>
                </button>

                <button
                  onClick={() => setActiveFilter('paid')}
                  className={`px-3.5 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all flex items-center gap-1 ${
                    activeFilter === 'paid'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/70'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Ready for Pickup ({textbooks.filter((b) => b.status === 'paid').length})</span>
                </button>

                <button
                  onClick={() => setActiveFilter('collected')}
                  className={`px-3.5 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all flex items-center gap-1 ${
                    activeFilter === 'collected'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-950/70'
                  }`}
                >
                  <BookCheck className="w-3.5 h-3.5" />
                  <span>Collected ({textbooks.filter((b) => b.status === 'collected').length})</span>
                </button>
              </div>
            </div>

            {/* Textbook List Grid */}
            <div className="space-y-3">
              {filteredTextbooks.length === 0 ? (
                <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-200 dark:border-slate-700 p-6">
                  <BookCheck className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                  <h3 className="font-bold text-slate-800 dark:text-slate-200 text-base">No textbooks found</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                    Your assigned textbooks appear here. If this is empty, your class rep has not
                    added you to any course yet.
                  </p>
                </div>
              ) : (
                filteredTextbooks.map((tb) => (
                  <TextbookCard
                    key={tb.id}
                    textbook={tb}
                    onAddToCart={(b) => {
                      soundEffects.playTap();
                      addToCart(b);
                    }}
                    onRemoveFromCart={(b) => {
                      soundEffects.playTap();
                      removeFromCart(b);
                    }}
                    isInCart={isInCart}
                    onViewPass={(b) => {
                      soundEffects.playTap();
                      setPassBook(b);
                    }}
                  />
                ))
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Transaction History */}
        {activeTab === 'history' && <TransactionHistory transactions={transactions} />}

        {/* Tab 3: Class Rep Portal — only for class reps / chief admin */}
        {activeTab === 'class_rep' && isRep && (
          <ClassRepPortal
            studentProfile={currentProfile}
            isChief={isChief}
            onDataChanged={() => loadData(currentProfile.regNo)}
          />
        )}
      </main>

      {/* Floating cart — draggable, shows only for signed-in students */}
      {authenticated && activeRole === 'student' && (
        <FloatingCart
          count={cartItems.length}
          onOpen={() => {
            soundEffects.playTap();
            setCartOpen(true);
          }}
        />
      )}

      {/* Cart modal */}
      <CartModal
        isOpen={cartOpen}
        items={cartItems}
        onClose={() => setCartOpen(false)}
        onRemove={removeFromCart}
        onClear={clearCart}
        onCheckout={startCartCheckout}
      />

      {/* Checkout Bottom Sheet — fed from the cart so EVERY purchase goes through it */}
      <PaymentBottomSheet
        items={cartCheckoutOpen ? cartItems : []}
        isOpen={cartCheckoutOpen}
        onClose={() => setCartCheckoutOpen(false)}
        points={wallet?.points ?? 0}
        accountNumber={wallet?.accountNumber ?? ''}
        bankName={wallet?.bankName ?? ''}
        onPaid={(res) => {
          // Apply the authoritative remaining balance straight from the checkout
          // response so the UI reflects the deduction instantly (no refresh).
          if (res && typeof res.remaining === 'number') {
            setWallet((w) =>
              w ? { ...w, points: res.remaining } : w,
            );
          }
          if (profile) loadData(profile.regNo);
        }}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={setSettings}
        profile={currentProfile}
        onUpdateProfile={(p) => {
          const prevPhone = profile?.phone ?? '';
          setProfile(p);
          // Phone may have just been added/changed — refresh the wallet so the
          // funding account (re)provisions, the account name/bank appear, and
          // the "Add phone number" banner disappears.
          if (p.phone && p.phone !== prevPhone) {
            walletApi
              .get()
              .then(setWallet)
              .catch(() => undefined);
          }
        }}
      />

      {/* QR Pickup Pass Modal */}
      <QrPassModal
        textbook={passBook}
        profile={currentProfile}
        onClose={() => setPassBook(null)}
      />

      {/* Mobile Bottom Navigation — student view only */}
      {activeRole === 'student' && (
        <BottomNav
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          onOpenSettings={() => setIsSettingsOpen(true)}
          paidPassesCount={paidPassesCount}
        />
      )}
    </div>
  );
}
