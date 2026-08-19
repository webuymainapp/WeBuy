import React, { Fragment } from 'react';
import { StudentProfile, Textbook } from '../types';
import {
  ArrowRight,
  BookOpen,
  CreditCard,
  Receipt,
  QrCode,
  Bell,
  CheckCircle2,
  Clock,
  Check,
  X,
  ShieldCheck,
  LogIn,
  UserPlus,
  FileCheck2,
  Wallet,
  History,
  LayoutDashboard,
  UserRound,
  Users,
  PackageCheck,
  TrendingUp,
  Lock,
} from 'lucide-react';
import { motion } from 'motion/react';

interface LandingPageProps {
  profile: StudentProfile;
  textbooks: Textbook[];
  onSignIn: () => void;
  onGetStarted: () => void;
}

const formatNaira = (amount: number) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  })
    .format(amount)
    .replace('NGN', '₦');

const FadeIn: React.FC<{
  children: React.ReactNode;
  delay?: number;
  className?: string;
}> = ({ children, delay = 0, className }) => (
  <motion.div
    className={className}
    initial={{ opacity: 0, y: 24 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: '-80px' }}
    transition={{ duration: 0.6, delay, ease: 'easeOut' }}
  >
    {children}
  </motion.div>
);

const BrandMark: React.FC<{ size?: 'sm' | 'md' }> = ({ size = 'md' }) => (
  <div
    className={`${
      size === 'md' ? 'w-9 h-9 rounded-xl text-lg' : 'w-7 h-7 rounded-lg text-sm'
    } bg-indigo-600 flex items-center justify-center text-white font-black shadow-sm shadow-indigo-200 dark:shadow-none`}
  >
    W
  </div>
);

const DashboardPhone: React.FC<{ profile: StudentProfile; textbooks: Textbook[] }> = ({
  profile,
  textbooks,
}) => {
  const unpaid = textbooks.filter((b) => b.status === 'unpaid');
  const sample = unpaid.slice(0, 3);
  const outstanding = unpaid.reduce((s, b) => s + b.price, 0);

  return (
    <div className="w-[300px] sm:w-[330px] rounded-[2.5rem] bg-slate-900 dark:bg-slate-800 p-2.5 shadow-2xl shadow-indigo-900/25 border border-slate-700/60">
      <div className="relative rounded-[2rem] overflow-hidden bg-white dark:bg-slate-950 flex flex-col h-[600px]">
        {/* Notch */}
        <div className="absolute left-1/2 -translate-x-1/2 top-2 w-20 h-4 bg-slate-900 dark:bg-slate-800 rounded-full z-20" />

        {/* Status bar */}
        <div className="flex items-center justify-between px-6 pt-3.5 pb-1 text-slate-400 text-[9px] font-bold">
          <span>9:41</span>
          <span className="tracking-tight">5G ▮▮▮▮ 100%</span>
        </div>

        {/* Mini Navbar */}
        <div className="px-4 pt-0.5 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-[10px] font-black">
              W
            </div>
            <span className="text-xs font-extrabold text-slate-900 dark:text-slate-100">Webuy</span>
          </div>
          <div className="relative">
            <Bell className="w-4 h-4 text-slate-400" />
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-rose-500" />
          </div>
        </div>

        {/* Session */}
        <div className="px-4 flex items-center gap-1.5 mb-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
          <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate">
            {profile.academicSession}
          </span>
        </div>

        {/* Wallet / Points */}
        <div className="mx-4 rounded-2xl bg-slate-900 text-white p-3.5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[9px] text-slate-400 font-semibold">Available Points</p>
              <p className="text-2xl font-extrabold font-mono mt-0.5">1,200 pts</p>
            </div>
            <span className="text-[8px] font-black bg-emerald-400/20 text-emerald-300 px-2 py-1 rounded-md uppercase">
              1 pt = ₦1
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-[9px]">
            <span className="text-slate-400">
              Funding acct: <span className="text-slate-100 font-mono">•••• 2190</span>
            </span>
            <span className="text-indigo-300 font-bold flex items-center gap-0.5">
              Fund + <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* Outstanding */}
        <div className="px-4 pt-3">
          <div className="flex items-center justify-between">
            <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Outstanding Balance
            </p>
            <span className="text-[8px] font-bold text-amber-500 bg-amber-400/10 px-1.5 py-0.5 rounded-md">
              {unpaid.length} Due
            </span>
          </div>
          <p className="text-xl font-extrabold font-mono text-slate-900 dark:text-slate-100 mt-0.5">
            {formatNaira(outstanding)}
          </p>
        </div>

        {/* Books */}
        <div className="flex-1 min-h-0 px-4 py-2.5 space-y-2 overflow-hidden">
          {sample.length === 0 ? (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 p-3 text-center">
              <p className="text-[9px] font-bold text-emerald-700 dark:text-emerald-300">
                Fully Paid 🎉
              </p>
            </div>
          ) : (
            sample.map((b) => (
              <div
                key={b.id}
                className="flex items-center gap-2.5 rounded-xl border border-slate-100 dark:border-slate-800 p-2"
              >
                <div className="w-9 h-12 rounded-md bg-slate-100 dark:bg-slate-800 overflow-hidden shrink-0 flex items-center justify-center">
                  <img src={b.coverUrl} alt="" className="w-full h-full object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-extrabold text-slate-900 dark:text-slate-100">
                    {b.courseCode}
                  </p>
                  <p className="text-[8px] text-slate-500 dark:text-slate-400 truncate">
                    {b.courseTitle}
                  </p>
                  <p className="text-[10px] font-mono font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                    {formatNaira(b.price)}
                  </p>
                </div>
                <button className="shrink-0 px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white text-[8px] font-bold shadow-sm shadow-indigo-200 dark:shadow-none">
                  Pay Now
                </button>
              </div>
            ))
          )}
        </div>

        {/* QR Pass */}
        <div className="mx-4 mb-2 flex items-center gap-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-800 p-2.5">
          <div className="w-9 h-9 rounded-lg bg-white dark:bg-slate-900 flex items-center justify-center shrink-0">
            <QrCode className="w-5 h-5 text-indigo-600" />
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-extrabold text-indigo-700 dark:text-indigo-300">QR Pickup Pass</p>
            <p className="text-[8px] text-indigo-500 dark:text-indigo-400 truncate">
              Show at the collection point to receive your books
            </p>
          </div>
        </div>

        {/* Bottom nav */}
        <div className="border-t border-slate-100 dark:border-slate-800 px-7 py-2.5 flex items-center justify-between text-slate-400">
          <LayoutDashboard className="w-4 h-4 text-indigo-600" />
          <History className="w-4 h-4" />
          <Wallet className="w-4 h-4" />
          <UserRound className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
};

const steps = [
  { icon: LogIn, title: 'Login', desc: 'Sign in with your registration number and portal password.' },
  { icon: BookOpen, title: 'View Assigned Books', desc: 'See only the compulsory books assigned to your courses.' },
  { icon: CreditCard, title: 'Fund & Pay', desc: 'Top up your wallet and pay with Webuy Points — 1 pt = ₦1.' },
  { icon: QrCode, title: 'Receive QR Pass', desc: 'Get a digital pickup pass and instant receipt.' },
  { icon: PackageCheck, title: 'Collect Textbooks', desc: 'Show the QR pass at the collection point and walk away.' },
];

const features = [
  { icon: BookOpen, title: 'Assigned Textbooks', desc: 'Only see books for your courses. No browsing, no noise.' },
  { icon: CreditCard, title: 'Fund Anywhere', desc: 'Transfer into your account and get Webuy Points automatically.' },
  { icon: Receipt, title: 'Digital Receipts', desc: 'Every payment logged. No paper slips required.' },
  { icon: QrCode, title: 'QR Pickup', desc: 'Class reps verify collection in seconds with one scan.' },
  { icon: TrendingUp, title: 'Payment Tracking', desc: 'Know exactly what you have left to pay, in real time.' },
  { icon: Bell, title: 'Instant Notifications', desc: 'Payment confirmations the moment they are processed.' },
];

const timeline = [
  { icon: UserPlus, label: 'Register' },
  { icon: CreditCard, label: 'Pay' },
  { icon: ShieldCheck, label: 'Verified' },
  { icon: FileCheck2, label: 'Collect' },
  { icon: CheckCircle2, label: 'Done' },
];

const comparison = [
  { label: 'Payments', traditional: 'Cash payments', webuy: 'Online payment' },
  { label: 'Receipts', traditional: 'Paper receipts', webuy: 'Digital receipts' },
  { label: 'Queues', traditional: 'Long queues', webuy: 'Fast verification' },
  { label: 'Records', traditional: 'Manual records', webuy: 'Automatic tracking' },
  { label: 'Proof', traditional: 'Lost payment slips', webuy: 'QR pickup pass' },
];

const focusTags = [
  'Compulsory textbooks',
  'Class reps',
  'QR pickup passes',
  'Webuy Points',
  'Digital receipts',
];

const navLinks = [
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Features', href: '#features' },
  { label: 'Dashboard', href: '#dashboard' },
];

// Honest highlights — real capabilities, no fabricated figures.
const highlights = [
  { icon: CreditCard, title: 'Webuy Points', desc: '1 pt = ₦1. Fund once, pay in seconds.' },
  { icon: QrCode, title: 'QR Pickup Pass', desc: 'Verified collection without paper slips.' },
  { icon: Receipt, title: 'Digital Receipts', desc: 'Every payment logged and searchable.' },
  { icon: Lock, title: 'Secure Funding', desc: 'Money lands via a dedicated virtual account.' },
];

export const LandingPage: React.FC<LandingPageProps> = ({ profile, textbooks, onSignIn, onGetStarted }) => {
  const unpaid = textbooks.filter((b) => b.status === 'unpaid');
  const paidCount = textbooks.filter((b) => b.status === 'paid' || b.status === 'collected').length;
  const totalOutstanding = unpaid.reduce((s, b) => s + b.price, 0);
  const pct = textbooks.length ? Math.round((paidCount / textbooks.length) * 100) : 0;
  const sample = unpaid.slice(0, 3);

  // Rep capabilities — illustrative, not real-time figures.
  const repCapabilities = [
    { icon: Users, title: 'Live Roster', desc: 'See who paid in real time' },
    { icon: QrCode, title: 'Scan to Verify', desc: 'Validate passes instantly' },
    { icon: PackageCheck, title: 'One-Tap Collection', desc: 'Mark handed out in a tap' },
    { icon: TrendingUp, title: 'Reconcile & Payout', desc: 'Track collections and request payouts' },
  ];

  return (
    <div className="min-h-dvh bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans overflow-x-clip">
      {/* Landing Nav */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md border-b border-slate-200/60 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <BrandMark />
            <span className="font-extrabold tracking-tight text-lg leading-tight">Webuy</span>
          </div>

          <nav className="hidden md:flex items-center gap-7 text-xs font-semibold text-slate-600 dark:text-slate-300">
            {navLinks.map((l) => (
              <a key={l.href} href={l.href} className="hover:text-slate-900 dark:hover:text-white transition-colors">
                {l.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <button
              onClick={onSignIn}
              className="hidden sm:block px-4 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Sign In
            </button>
            <button
              onClick={onGetStarted}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
            >
              Get Started
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-indigo-50/70 via-white to-white dark:from-indigo-950/30 dark:via-slate-950 dark:to-slate-950" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-16 pb-20 lg:pt-24 lg:pb-28 grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
          {/* Left */}
          <div className="text-center lg:text-left">
            <FadeIn>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-800 text-[11px] font-bold text-indigo-700 dark:text-indigo-300">
                <ShieldCheck className="w-3.5 h-3.5" />
                Textbook payments for students &amp; class reps
              </span>
            </FadeIn>
            <FadeIn delay={0.05}>
              <h1 className="mt-5 text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[1.05]">
                Pay for your{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-emerald-500">
                  textbooks
                </span>{' '}
                in minutes.
              </h1>
            </FadeIn>
            <FadeIn delay={0.1}>
              <p className="mt-5 text-base sm:text-lg text-slate-600 dark:text-slate-300 font-medium max-w-xl mx-auto lg:mx-0">
                Fund your wallet, pay with Webuy Points, and collect with a QR pass. No cash, no
                queues, no lost receipts — just your books when you need them.
              </p>
            </FadeIn>
            <FadeIn delay={0.15}>
              <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
                <button
                  onClick={onGetStarted}
                  className="px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/25 transition-all cursor-pointer"
                >
                  Get Started
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={onSignIn}
                  className="px-6 py-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 font-bold text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer"
                >
                  Sign In
                </button>
              </div>
            </FadeIn>
            <FadeIn delay={0.2}>
              <div className="mt-7 flex items-center justify-center lg:justify-start gap-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                <Lock className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>
                  Secure funding, verified payments, and class-rep QR pickup.
                </span>
              </div>
            </FadeIn>
          </div>

          {/* Right — Phone Mockup */}
          <FadeIn delay={0.15} className="relative flex justify-center mt-10 lg:mt-0">
            <div className="absolute top-12 left-1/2 -translate-x-1/2 w-80 h-80 bg-indigo-500/20 blur-3xl rounded-full" />
            <div className="relative">
              <DashboardPhone profile={profile} textbooks={textbooks} />

              <motion.div
                className="absolute -right-3 sm:-right-8 top-20 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 px-3 py-2 flex items-center gap-2"
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <div>
                  <p className="text-[10px] font-bold text-slate-900 dark:text-slate-100">Payment confirmed</p>
                  <p className="text-[9px] text-slate-500 dark:text-slate-400">Your QR pass is ready</p>
                </div>
              </motion.div>

              <motion.div
                className="absolute -left-3 sm:-left-10 bottom-24 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 px-3 py-2 flex items-center gap-2"
                animate={{ y: [0, 8, 0] }}
                transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
              >
                <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center shrink-0">
                  <QrCode className="w-4 h-4 text-indigo-600" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-900 dark:text-slate-100">QR pass ready</p>
                  <p className="text-[9px] text-slate-500 dark:text-slate-400">Show at pickup</p>
                </div>
              </motion.div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* Honest highlights — replaces fabricated statistics */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6">
        <FadeIn className="bg-slate-900 dark:bg-slate-900 rounded-3xl px-6 py-10 grid grid-cols-2 lg:grid-cols-4 gap-8">
          {highlights.map((h) => (
            <div key={h.title} className="text-center">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center mx-auto">
                <h.icon className="w-4.5 h-4.5 text-indigo-400" />
              </div>
              <p className="mt-3 text-sm font-black text-white">{h.title}</p>
              <p className="mt-1 text-xs font-semibold text-slate-400 leading-relaxed">{h.desc}</p>
            </div>
          ))}
        </FadeIn>
      </section>

      {/* How It Works */}
      <section className="py-20 lg:py-28 max-w-6xl mx-auto px-4 sm:px-6" id="how-it-works">
        <FadeIn className="text-center max-w-2xl mx-auto">
          <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">
            How It Works
          </p>
          <h2 className="mt-2 text-3xl sm:text-4xl font-black tracking-tight">
            From login to collection in 5 steps
          </h2>
          <p className="mt-3 text-sm sm:text-base text-slate-600 dark:text-slate-300">
            Webuy removes every point of friction between assignment and pickup.
          </p>
        </FadeIn>

        <div className="mt-12 flex flex-col lg:flex-row gap-4 items-stretch">
          {steps.map((s, i) => (
            <Fragment key={s.title}>
              <FadeIn delay={i * 0.06} className="flex-1">
                <div className="h-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs hover:shadow-md hover:-translate-y-1 transition-all">
                  <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black text-sm">
                    {i + 1}
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center mt-3">
                    <s.icon className="w-4 h-4 text-indigo-600" />
                  </div>
                  <p className="mt-2 text-sm font-extrabold text-slate-900 dark:text-slate-100">{s.title}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{s.desc}</p>
                </div>
              </FadeIn>
              {i < steps.length - 1 && (
                <div className="hidden lg:flex items-center justify-center shrink-0 text-slate-300 dark:text-slate-600">
                  <ArrowRight className="w-5 h-5" />
                </div>
              )}
            </Fragment>
          ))}
        </div>
      </section>

      {/* Dashboard Preview */}
      <section className="py-20 lg:py-28 bg-slate-50 dark:bg-slate-900/40" id="dashboard">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <FadeIn className="text-center max-w-2xl mx-auto">
            <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">
              Dashboard
            </p>
            <h2 className="mt-2 text-3xl sm:text-4xl font-black tracking-tight">
              See exactly what you owe. Nothing else.
            </h2>
            <p className="mt-3 text-sm sm:text-base text-slate-600 dark:text-slate-300">
              Students see their assigned books and what they owe. Class reps manage rosters and collections.
            </p>
          </FadeIn>

          <div className="mt-12 grid lg:grid-cols-2 gap-6 min-w-0">
            {/* Student Preview */}
            <FadeIn className="min-w-0 w-full">
              <div className="w-full max-w-[340px] sm:max-w-md mx-auto min-w-0 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400">Student Dashboard</p>
                  <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300">
                    Sample view
                  </span>
                </div>

                <div className="bg-slate-900 rounded-2xl p-4 text-white">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-slate-400 font-semibold">Outstanding Balance</p>
                    <button className="px-3 py-1.5 rounded-xl bg-indigo-600 text-[11px] font-bold flex items-center gap-1">
                      <CreditCard className="w-3.5 h-3.5" /> Pay Now
                    </button>
                  </div>
                  <p className="text-2xl font-extrabold font-mono mt-1">{formatNaira(totalOutstanding)}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 whitespace-nowrap">
                      {paidCount}/{textbooks.length} paid
                    </span>
                    <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-mono font-bold text-emerald-400">{pct}%</span>
                  </div>
                </div>

                <div className="mt-4 space-y-2.5">
                  {sample.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center gap-3 rounded-2xl border border-slate-100 dark:border-slate-800 p-3"
                    >
                      <div className="w-10 h-13 rounded-lg bg-slate-100 dark:bg-slate-800 overflow-hidden shrink-0 flex items-center justify-center">
                        <img src={b.coverUrl} alt="" className="w-full h-full object-cover" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-extrabold text-slate-900 dark:text-slate-100">
                          {b.courseCode}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {b.courseTitle}
                        </p>
                      </div>
                      <span className="text-xs font-mono font-bold text-slate-900 dark:text-slate-100 shrink-0">
                        {formatNaira(b.price)}
                      </span>
                    </div>
                  ))}
                  {sample.length === 0 && (
                    <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 p-4 text-center">
                      <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                        Fully Paid 🎉
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </FadeIn>

            {/* Class Rep / Department Preview */}
            <FadeIn delay={0.1} className="min-w-0 w-full">
              <div className="w-full max-w-[340px] sm:max-w-md mx-auto min-w-0 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400">Class Rep Portal</p>
                  <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                    For reps
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {repCapabilities.map((c) => (
                    <div
                      key={c.title}
                      className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 p-4"
                    >
                      <div className="w-8 h-8 rounded-lg bg-white dark:bg-slate-900 flex items-center justify-center">
                        <c.icon className="w-4 h-4 text-indigo-600" />
                      </div>
                      <p className="mt-2 text-xs font-black text-slate-900 dark:text-slate-100">
                        {c.title}
                      </p>
                      <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
                        {c.desc}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-2xl border border-slate-100 dark:border-slate-800 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                      Payment verified — pass ready to scan
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <QrCode className="w-4 h-4 text-indigo-500 shrink-0" />
                    <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                      Scan pass → mark as collected
                    </p>
                  </div>
                </div>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 lg:py-28 max-w-6xl mx-auto px-4 sm:px-6" id="features">
        <FadeIn className="text-center max-w-2xl mx-auto">
          <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">
            Features
          </p>
          <h2 className="mt-2 text-3xl sm:text-4xl font-black tracking-tight">
            Everything a student, department and rep needs
          </h2>
          <p className="mt-3 text-sm sm:text-base text-slate-600 dark:text-slate-300">
            Purpose-built for compulsory textbook distribution — not a general store.
          </p>
        </FadeIn>

        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f, i) => (
            <FadeIn key={f.title} delay={i * 0.05}>
              <div className="h-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs hover:shadow-md hover:-translate-y-1 transition-all">
                <div className="w-11 h-11 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center">
                  <f.icon className="w-5 h-5 text-indigo-600" />
                </div>
                <p className="mt-4 text-sm font-extrabold text-slate-900 dark:text-slate-100">{f.title}</p>
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{f.desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* Student Experience Timeline */}
      <section className="py-20 lg:py-24 bg-slate-50 dark:bg-slate-900/40">
        <FadeIn className="text-center max-w-2xl mx-auto px-4 sm:px-6">
          <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">
            Student Experience
          </p>
          <h2 className="mt-2 text-3xl sm:text-4xl font-black tracking-tight">
            From registration to "Done"
          </h2>
        </FadeIn>

        <div className="mt-12 max-w-4xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            {timeline.map((t, i) => (
              <Fragment key={t.label}>
                <FadeIn delay={i * 0.05} className="flex flex-col items-center gap-2">
                  <div className="w-14 h-14 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-center">
                    <t.icon className="w-6 h-6 text-indigo-600" />
                  </div>
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{t.label}</span>
                </FadeIn>
                {i < timeline.length - 1 && (
                  <ArrowRight className="w-5 h-5 text-slate-300 dark:text-slate-600 hidden sm:block" />
                )}
              </Fragment>
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose Webuy */}
      <section className="py-20 lg:py-28 max-w-4xl mx-auto px-4 sm:px-6">
        <FadeIn className="text-center max-w-2xl mx-auto">
          <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">
            Why Choose Webuy
          </p>
          <h2 className="mt-2 text-3xl sm:text-4xl font-black tracking-tight">
            The textbook queue, retired
          </h2>
        </FadeIn>

        <FadeIn delay={0.05}>
          <div className="mt-12 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60">
                  <th className="p-4 text-xs font-bold text-slate-500 w-1/3">Experience</th>
                  <th className="p-4 text-xs font-bold text-slate-500">Traditional</th>
                  <th className="p-4 text-xs font-bold text-indigo-600 dark:text-indigo-300 bg-indigo-50/60 dark:bg-indigo-950/30">
                    Webuy
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((c) => (
                  <tr
                    key={c.label}
                    className="border-t border-slate-100 dark:border-slate-800"
                  >
                    <td className="p-4 text-xs font-extrabold text-slate-800 dark:text-slate-100">
                      {c.label}
                    </td>
                    <td className="p-4 text-xs text-slate-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1.5">
                        <X className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        {c.traditional}
                      </span>
                    </td>
                    <td className="p-4 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-indigo-50/40 dark:bg-indigo-950/20">
                      <span className="inline-flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        {c.webuy}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </FadeIn>
      </section>

      {/* Built around the real flow */}
      <section className="py-16 lg:py-20 max-w-6xl mx-auto px-4 sm:px-6 text-center">
        <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
          Built around the real textbook flow
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {focusTags.map((tag) => (
            <span
              key={tag}
              className="px-5 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 font-extrabold text-sm text-slate-700 dark:text-slate-200"
            >
              {tag}
            </span>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 max-w-6xl mx-auto px-4 sm:px-6">
        <FadeIn className="relative overflow-hidden rounded-[2.5rem] bg-slate-900 text-white px-6 py-16 sm:px-16 text-center">
          <div className="absolute -top-24 -right-24 w-72 h-72 bg-indigo-600/30 blur-3xl rounded-full" />
          <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-emerald-500/20 blur-3xl rounded-full" />
          <div className="relative">
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight">
              Ready to pay for your textbooks?
            </h2>
            <p className="mt-3 text-sm sm:text-base text-slate-300 max-w-xl mx-auto">
              Fund your Webuy wallet, pay with Points, and collect with a QR pass — this session.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={onSignIn}
                className="px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                Login
              </button>
              <button
                onClick={onGetStarted}
                className="px-6 py-3 rounded-2xl bg-white text-slate-900 hover:bg-slate-100 font-bold text-sm transition-all cursor-pointer"
              >
                Activate Account
              </button>
            </div>
          </div>
        </FadeIn>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 grid gap-10 md:grid-cols-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <BrandMark />
              <span className="font-extrabold tracking-tight text-lg leading-tight">Webuy</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-xs">
              Pay for compulsory university textbooks in minutes. Fund your wallet, pay with Points,
              and collect with a QR pass.
            </p>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-indigo-600" />
              <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                Powered by Webuy Points
              </span>
            </div>
          </div>

          <div>
            <p className="text-xs font-extrabold text-slate-900 dark:text-slate-100 mb-3">Students</p>
            <ul className="space-y-2 text-xs text-slate-500 dark:text-slate-400">
              <li><button onClick={onGetStarted} className="hover:text-slate-900 dark:hover:text-white cursor-pointer">Create Account</button></li>
              <li><button onClick={onSignIn} className="hover:text-slate-900 dark:hover:text-white cursor-pointer">Sign In</button></li>
              <li><a href="#dashboard" className="hover:text-slate-900 dark:hover:text-white">Dashboard</a></li>
            </ul>
          </div>

          <div>
            <p className="text-xs font-extrabold text-slate-900 dark:text-slate-100 mb-3">Product</p>
            <ul className="space-y-2 text-xs text-slate-500 dark:text-slate-400">
              <li><a href="#how-it-works" className="hover:text-slate-900 dark:hover:text-white">How It Works</a></li>
              <li><a href="#features" className="hover:text-slate-900 dark:hover:text-white">Features</a></li>
              <li><a href="#dashboard" className="hover:text-slate-900 dark:hover:text-white">Class Rep Portal</a></li>
            </ul>
          </div>

          <div>
            <p className="text-xs font-extrabold text-slate-900 dark:text-slate-100 mb-3">Legal</p>
            <ul className="space-y-2 text-xs text-slate-500 dark:text-slate-400">
              <li><a href="#" className="hover:text-slate-900 dark:hover:text-white">Privacy</a></li>
              <li><a href="#" className="hover:text-slate-900 dark:hover:text-white">Terms</a></li>
              <li><a href="#" className="hover:text-slate-900 dark:hover:text-white">Contact</a></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-slate-200 dark:border-slate-800 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
          © 2026 Webuy. All rights reserved.
        </div>
      </footer>
    </div>
  );
};
