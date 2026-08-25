import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { StudentProfile, Textbook } from '../types';
import {
  ShieldCheck,
  Search,
  CheckCircle2,
  Clock,
  Download,
  Check,
  BookOpen,
  Users,
  Sparkles,
  CheckCheck,
  FileCheck2,
  AlertCircle,
  TrendingUp,
  QrCode,
  Loader2,
  ChevronDown,
  Banknote,
  X,
  ClipboardList,
  RefreshCw,
} from 'lucide-react';
import { soundEffects } from '../utils/audio';
import { ManageTextbooks } from './ManageTextbooks';
import { ScanQrModal } from './ScanQrModal';
import { UsersManagement } from './UsersManagement';
import { AccountBalance } from './AccountBalance';
import { RepTransactions } from './RepTransactions';
import { Payouts } from './Payouts';
import { ClassesManagement } from './ClassesManagement';
import { DbMonitor } from './DbMonitor';
import { repApi, passesApi, dataApi, ApiError, type RosterItem } from '../lib/api';

const formatNaira = (amount: number) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  })
    .format(amount)
    .replace('NGN', '₦');

interface ClassRepPortalProps {
  studentProfile: StudentProfile;
  isChief: boolean;
  onDataChanged: () => void;
}

export const ClassRepPortal: React.FC<ClassRepPortalProps> = ({
  studentProfile,
  isChief,
  onDataChanged,
}) => {
  const [catalog, setCatalog] = useState<Textbook[]>([]);
  const [courses, setCourses] = useState<string[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<string>('');
  const [roster, setRoster] = useState<RosterItem[]>([]);
  const [availableSlots, setAvailableSlots] = useState<number | null>(null);
  const [rosterOwnerId, setRosterOwnerId] = useState<string | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);

  // Search input & filter
  const [searchInput, setSearchInput] = useState('');
  const [rosterFilter, setRosterFilter] = useState<'all' | 'pending' | 'collected'>('all');

  // Toast message state
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Bumped whenever rep data changes so balance/revenue cards re-fetch fresh
  // numbers instead of showing stale totals after new payments or toggles.
  const [refreshKey, setRefreshKey] = useState(0);

  // QR scan modal state
  const [isScanOpen, setIsScanOpen] = useState(false);

  // Roster modal state
  const [rosterOpen, setRosterOpen] = useState(false);

  const bumpRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  const loadCatalog = useCallback(async () => {
    try {
      const catalogData = await dataApi.getCatalog();
      setCatalog(catalogData);
      const codes = Array.from(new Set(catalogData.map((t) => t.courseCode))).sort();
      setCourses(codes);
      setSelectedCourse((prev) => (prev && codes.includes(prev) ? prev : codes[0] ?? ''));
    } catch {
      showToast('Could not load the textbook catalog.');
    } finally {
      setLoadingCatalog(false);
    }
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const loadRoster = useCallback(async (course: string) => {
    if (!course) {
      setRoster([]);
      setAvailableSlots(null);
      setRosterOwnerId(null);
      return;
    }
    setLoadingRoster(true);
    setRosterError(null);
    try {
      const data = await repApi.getRoster(course);
      setRoster(data.roster);
      setAvailableSlots(data.availableSlots);
      setRosterOwnerId(data.ownerId);
    } catch (err) {
      setRosterError(err instanceof ApiError ? err.message : 'Could not load roster');
      setRoster([]);
      setAvailableSlots(null);
      setRosterOwnerId(null);
    } finally {
      setLoadingRoster(false);
    }
  }, []);

  useEffect(() => {
    loadRoster(selectedCourse);
    // If the course changes while the roster modal is open, close it so the
    // user sees the roster for the newly selected course.
    setRosterOpen(false);
  }, [selectedCourse, loadRoster]);

  const activeBook = catalog.find((t) => t.courseCode === selectedCourse);

  // Toggle collection handler for any student in the roster
  const handleToggleStudent = async (item: RosterItem) => {
    const shouldCollect = !item.isCollected;
    try {
      if (shouldCollect) {
        await repApi.collectRoster(item.studentTextbookId);
        soundEffects.playSuccessChime();
        showToast(`Marked as COLLECTED for ${item.fullName}! Syncing with student portal...`);
      } else {
        await repApi.revertRoster(item.studentTextbookId);
        soundEffects.playTap();
        showToast(`Reverted to PENDING PICKUP for ${item.fullName}.`);
      }
      await loadRoster(selectedCourse);
      onDataChanged();
      bumpRefresh();
    } catch (err) {
      soundEffects.playError();
      showToast(err instanceof ApiError ? err.message : 'Could not update collection status');
    }
  };

  // Chief grants extra collection slots for a course once the rep has the books.
  const [grantCopies, setGrantCopies] = useState('');
  const [grantBusy, setGrantBusy] = useState(false);
  const handleGrant = async () => {
    if (!activeBook || !grantCopies) return;
    setGrantBusy(true);
    try {
      await repApi.grantToggles(activeBook.id, parseInt(grantCopies, 10));
      soundEffects.playSuccessChime();
      showToast('Collection slots granted to the course rep.');
      setGrantCopies('');
      await loadRoster(selectedCourse);
    } catch (err) {
      soundEffects.playError();
      showToast(err instanceof ApiError ? err.message : 'Could not grant slots');
    } finally {
      setGrantBusy(false);
    }
  };

  // Handle a scanned/pasted QR pass token (verified server-side)
  const handleScanDecoded = async (
    rawToken: string,
  ): Promise<'ok' | 'not_found' | 'already' | 'error'> => {
    try {
      const verified = await passesApi.verify(rawToken);
      if (!verified.valid || !verified.student) {
        return 'not_found';
      }
      if (verified.status === 'collected') {
        showToast(`${verified.student.fullName}'s pass was already collected.`);
        return 'already';
      }
      if (verified.status !== 'paid') {
        showToast(`${verified.student.fullName} has not paid for this textbook yet.`);
        return 'not_found';
      }

      await passesApi.collect(rawToken, verified.pickupLocation ?? 'Lecture hall');
      if (verified.book?.courseCode) setSelectedCourse(verified.book.courseCode);
      await loadRoster(selectedCourse);
      onDataChanged();
      bumpRefresh();
      showToast(`COLLECTED for ${verified.student.fullName}! Syncing with student portal...`);
      return 'ok';
    } catch (err) {
      soundEffects.playError();
      showToast(err instanceof ApiError ? err.message : 'Verification failed');
      return 'error';
    }
  };

  // Filter roster based on tab & search query
  const filteredRoster = roster.filter((item) => {
    if (rosterFilter === 'pending' && item.isCollected) return false;
    if (rosterFilter === 'collected' && !item.isCollected) return false;
    if (searchInput.trim()) {
      const q = searchInput.toLowerCase().trim();
      const match =
        item.fullName.toLowerCase().includes(q) ||
        item.regNo.toLowerCase().includes(q) ||
        (item.transactionRef ?? '').toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  // Metrics
  const totalPaidCount = roster.length;
  const collectedCount = roster.filter((i) => i.isCollected).length;
  const pendingCount = totalPaidCount - collectedCount;
  const collectionPercentage =
    totalPaidCount > 0 ? Math.round((collectedCount / totalPaidCount) * 100) : 0;

  // Export CSV Handler
  const handleExportCSV = (courseCode: string = selectedCourse) => {
    soundEffects.playTap();
    const rosterData = courseCode === selectedCourse ? roster : [];
    const headers = ['Course Code', 'Student Name', 'Reg Number', 'Department', 'Reference', 'Collection Status', 'Collected At'];
    const rows = rosterData.map((item) => [
      item.courseCode,
      `"${item.fullName}"`,
      item.regNo,
      `"${item.department}"`,
      item.transactionRef ?? 'N/A',
      item.isCollected ? 'COLLECTED' : 'PENDING PICKUP',
      item.collectedAt ? new Date(item.collectedAt).toLocaleString() : 'N/A',
    ]);
    const csvContent = [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Distribution_Roster_${courseCode}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Toast Alert Banner */}
      {toastMessage && (
        <div className="fixed top-20 right-4 z-50 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-2xl border border-indigo-500/30 flex items-center gap-3 animate-slide-in text-xs font-semibold">
          <Sparkles className="w-4 h-4 text-emerald-400 shrink-0 animate-pulse" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Class Rep Top Header */}
      <div className="bg-slate-900 text-white rounded-3xl p-5 sm:p-7 shadow-xl border border-slate-800 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-wider mb-1">
              <ShieldCheck className="w-4 h-4" />
              <span>Class Representative Portal</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Textbook Distribution & Pickup Roster
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-xl">
              Select a course to view all students who paid. Tick{' '}
              <strong>Collected</strong> when handing out textbooks — changes sync instantly to the
              student&apos;s portal.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                soundEffects.playTap();
                bumpRefresh();
                loadRoster(selectedCourse);
                onDataChanged();
                showToast('Data refreshed.');
              }}
              className="px-3.5 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Refresh</span>
            </button>

            <button
              onClick={() => {
                soundEffects.playTap();
                setIsScanOpen(true);
              }}
              className="shrink-0 px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
            >
              <QrCode className="w-4 h-4" />
              <span>Scan QR Pass</span>
            </button>
          </div>
        </div>
      </div>

      {/* Common Account Balance */}
      <AccountBalance onToast={showToast} isChief={isChief} refreshKey={refreshKey} />

      {/* Recent Transactions */}
      <RepTransactions onToast={showToast} isChief={isChief} />

      {/* Payout requests — reps request money for their courses, chief settles */}
      <Payouts
        isChief={isChief}
        myBooks={
          isChief
            ? catalog
            : catalog.filter((t) => t.addedBy === studentProfile.id)
        }
        onToast={showToast}
        onChanged={() => {
          loadCatalog();
          onDataChanged();
        }}
      />

      {/* Manage Textbooks */}
      <ManageTextbooks
        catalog={catalog}
        currentUserId={studentProfile.id}
        isChief={isChief}
        onToast={showToast}
        onChanged={() => {
          loadCatalog();
          onDataChanged();
        }}
      />

      {/* Manage Rep Access — chief admin only decides who gets the rep panel */}
      {isChief && (
        <UsersManagement currentUserRegNo={studentProfile.regNo} onToast={showToast} />
      )}

      {/* Classes & Invite Codes — platform admin creates classes, class chiefs run theirs */}
      <ClassesManagement
        isChief={isChief}
        currentUserId={studentProfile.id}
        onToast={showToast}
      />

      {/* Database Monitor — chief admin only */}
      {isChief && <DbMonitor onToast={showToast} />}

      {/* Course Selection Tabs Bar */}
      <div className="bg-white dark:bg-neutral-900 rounded-3xl p-4 sm:p-5 border border-slate-200 dark:border-neutral-700 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-indigo-600" />
            <span>Select Course Roster</span>
          </label>
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            {courses.length} Active Courses
          </span>
        </div>

        {/* Course Dropdown */}
        {loadingCatalog ? (
          <div className="flex items-center gap-2 text-slate-400 py-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs font-semibold">Loading courses…</span>
          </div>
        ) : courses.length === 0 ? (
          <p className="text-xs text-slate-400 py-2">No courses yet — add textbooks to get started.</p>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative flex-1">
              <BookOpen className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={selectedCourse}
                onChange={(e) => {
                  soundEffects.playTap();
                  setSelectedCourse(e.target.value);
                }}
                aria-label="Select course roster"
                className="w-full pl-9 pr-8 py-2.5 rounded-xl border border-slate-200 dark:border-neutral-700 text-xs font-bold bg-slate-50 dark:bg-neutral-800 dark:text-slate-100 focus:outline-indigo-600 appearance-none cursor-pointer"
              >
                {courses.map((course) => (
                  <option key={course} value={course}>
                    {course}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            <button
              onClick={() => handleExportCSV(selectedCourse)}
              className="shrink-0 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-neutral-800 hover:bg-slate-200 dark:hover:bg-neutral-700 text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          </div>
        )}
      </div>

      {/* Selected Course Summary Banner & Metrics */}
      {activeBook && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          {/* Left Course Detail Card */}
          <div className="md:col-span-5 bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-900 text-white p-5 sm:p-6 rounded-3xl shadow-lg relative overflow-hidden flex flex-col justify-between">
            <div className="relative z-10 space-y-3">
              <div className="flex items-center justify-between">
                <span className="px-2.5 py-1 rounded-md bg-white/10 text-emerald-300 font-mono font-bold text-xs">
                  {activeBook.courseCode}
                </span>
                <span className="text-xs font-mono font-extrabold text-amber-300 bg-amber-400/10 px-2.5 py-0.5 rounded-full border border-amber-400/20">
                  ₦{(activeBook.price - 100).toLocaleString()}
                </span>
              </div>

              <div>
                <h3 className="text-lg font-extrabold leading-snug text-white">
                  {activeBook.bookTitle}
                </h3>
                <p className="text-xs text-indigo-200 italic mt-1">{activeBook.author}</p>
              </div>
            </div>
          </div>

          {/* Right Metrics Cards */}
          <div className="md:col-span-7 grid grid-cols-2 sm:grid-cols-4 gap-3 min-w-0">
            <div className="bg-white dark:bg-neutral-900 p-4 rounded-3xl border border-slate-200 dark:border-neutral-700 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                <span className="text-[11px] font-bold uppercase tracking-wider">Paid Students</span>
                <Users className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="mt-2">
                <p className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 font-mono">{totalPaidCount}</p>
                <p className="text-[10px] text-emerald-600 font-semibold mt-0.5">Payment Verified</p>
              </div>
            </div>

            <div className="bg-white dark:bg-neutral-900 p-4 rounded-3xl border border-slate-200 dark:border-neutral-700 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                <span className="text-[11px] font-bold uppercase tracking-wider">Collected</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="mt-2">
                <p className="text-2xl sm:text-3xl font-black text-emerald-700 dark:text-emerald-300 font-mono">{collectedCount}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold mt-0.5">Handed Out</p>
              </div>
            </div>

            <div className="bg-white dark:bg-neutral-900 p-4 rounded-3xl border border-slate-200 dark:border-neutral-700 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                <span className="text-[11px] font-bold uppercase tracking-wider">Pending</span>
                <Clock className="w-4 h-4 text-amber-500" />
              </div>
              <div className="mt-2">
                <p className="text-2xl sm:text-3xl font-black text-amber-600 dark:text-amber-300 font-mono">{pendingCount}</p>
                <p className="text-[10px] text-amber-700 dark:text-amber-300 font-semibold mt-0.5">Not Taken Yet</p>
              </div>
            </div>

            <div className="bg-white dark:bg-neutral-900 p-4 rounded-3xl border border-slate-200 dark:border-neutral-700 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                <span className="text-[11px] font-bold uppercase tracking-wider">Total Paid</span>
                <Banknote className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="mt-2">
                <p className="text-2xl sm:text-3xl font-black text-indigo-700 dark:text-indigo-300 font-mono">
                  {formatNaira((activeBook.price - 100) * totalPaidCount)}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold mt-0.5">
                  {formatNaira(activeBook.price - 100)} × {totalPaidCount} paid
                </p>
              </div>
            </div>

            <div className="col-span-2 sm:col-span-4 bg-white dark:bg-neutral-900 p-3.5 rounded-2xl border border-slate-200 dark:border-neutral-700 flex items-center gap-4">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 shrink-0">
                <TrendingUp className="w-4 h-4 text-indigo-600" />
                <span>Collection Progress:</span>
              </div>
              <div className="flex-1 bg-slate-100 dark:bg-neutral-800 h-3 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${collectionPercentage}%` }}
                />
              </div>
              <span className="font-mono text-xs font-extrabold text-slate-900 dark:text-slate-100 shrink-0">
                {collectionPercentage}%
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Roster trigger card — opens the roster modal */}
      <div className="bg-white dark:bg-neutral-900 rounded-3xl p-5 border border-slate-200 dark:border-neutral-700 shadow-sm">
        <button
          onClick={() => {
            soundEffects.playTap();
            setRosterOpen(true);
          }}
          className="w-full flex items-center gap-3 text-left cursor-pointer group min-w-0"
        >
          <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 flex items-center justify-center shrink-0">
            <ClipboardList className="w-5 h-5 text-indigo-600 dark:text-indigo-300" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
              {selectedCourse} Paid Student Roster
              <span className="text-[10px] font-extrabold font-mono px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300">
                {totalPaidCount} paid
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
              Tick the toggle switch when a student takes their textbook
            </p>
          </div>
          <Users className="w-4 h-4 text-slate-400 shrink-0 group-hover:text-indigo-500 transition-colors" />
        </button>
      </div>

      {/* Roster Modal */}
      <AnimatePresence>
        {rosterOpen && (
          <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setRosterOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-xs"
            />
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              className="relative w-full max-w-md bg-white dark:bg-neutral-900 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-neutral-700 overflow-hidden max-h-[85dvh] flex flex-col"
            >
              {/* Header */}
              <div className="p-4 sm:p-5 bg-slate-900 dark:bg-neutral-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-indigo-500/20 flex items-center justify-center shrink-0">
                    <ClipboardList className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-base text-white leading-tight truncate">
                      {selectedCourse} Paid Roster
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Tick the toggle when a student takes their textbook
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setRosterOpen(false)}
                  className="p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Collection slots */}
              <div className="px-4 sm:px-5 pt-3">
                {rosterOwnerId === studentProfile.id ? (
                  <div
                    className={`flex items-start gap-2 rounded-xl px-3 py-2 text-xs font-bold border ${
                      availableSlots != null && availableSlots <= 0
                        ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
                        : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                    }`}
                  >
                    <ClipboardList className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      {availableSlots != null && availableSlots <= 0
                        ? 'No collection slots left. You can only mark collected as many students as copies you have had settled — settle a payout or ask the chief admin to grant more.'
                        : `${availableSlots} collection slot${availableSlots === 1 ? '' : 's'} left (settled copies − collected)`}
                    </span>
                  </div>
                ) : isChief ? (
                  <div className="flex items-center gap-2 rounded-xl bg-slate-100 dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 p-2">
                    <input
                      type="number"
                      min="1"
                      value={grantCopies}
                      onChange={(e) => setGrantCopies(e.target.value)}
                      placeholder="Slots to grant"
                      className="w-24 px-3 py-2 rounded-lg border border-slate-200 dark:border-neutral-700 text-xs font-semibold bg-white dark:bg-neutral-900 text-slate-900 dark:text-slate-100 focus:outline-indigo-600"
                    />
                    <button
                      onClick={handleGrant}
                      disabled={grantBusy || !grantCopies}
                      className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold transition-colors cursor-pointer"
                    >
                      {grantBusy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Grant collection slots'}
                    </button>
                  </div>
                ) : null}
              </div>

              {/* Search */}
              <div className="p-4 sm:p-5 pb-0">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search name, Reg No or Ref..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-neutral-700 text-xs font-semibold bg-slate-50 dark:bg-neutral-800 dark:text-slate-100 focus:outline-indigo-600"
                  />
                </div>

                {/* Status Filter Pills */}
                <div className="flex items-center gap-2 text-xs mt-3 flex-wrap">
                  <button
                    onClick={() => setRosterFilter('all')}
                    className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                      rosterFilter === 'all'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-neutral-700'
                    }`}
                  >
                    All ({totalPaidCount})
                  </button>
                  <button
                    onClick={() => setRosterFilter('pending')}
                    className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                      rosterFilter === 'pending'
                        ? 'bg-amber-600 text-white'
                        : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40'
                    }`}
                  >
                    Pending ({pendingCount})
                  </button>
                  <button
                    onClick={() => setRosterFilter('collected')}
                    className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                      rosterFilter === 'collected'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'
                    }`}
                  >
                    Collected ({collectedCount})
                  </button>
                </div>
              </div>

              {/* Student Roster Cards */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
                {loadingRoster ? (
                  <div className="flex items-center justify-center py-10 text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    <span className="text-xs font-semibold">Loading roster…</span>
                  </div>
                ) : rosterError ? (
                  <div className="flex items-start gap-2 p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{rosterError}</span>
                  </div>
                ) : filteredRoster.length === 0 ? (
                  <div className="text-center py-10 bg-slate-50 dark:bg-neutral-800 rounded-2xl border border-dashed border-slate-200 dark:border-neutral-700 p-4">
                    <FileCheck2 className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-1" />
                    <p className="font-bold text-slate-700 dark:text-slate-300 text-sm">No paid students yet</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">Paid students for this course appear here automatically.</p>
                  </div>
                ) : (
                  filteredRoster.map((item) => {
                    const isCol = item.isCollected;
                    // Collection is only toggled by the rep who added the book —
                    // even the chief only toggles their own.
                    const canManage = item.addedBy === studentProfile.id;
                    return (
                      <div
                        key={item.studentTextbookId}
                        className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                          isCol
                            ? 'bg-emerald-50/40 dark:bg-emerald-950/40 border-emerald-200/80 dark:border-emerald-800/80 shadow-2xs'
                            : 'bg-white dark:bg-neutral-900 border-slate-200 dark:border-neutral-700 hover:border-slate-300 dark:hover:border-neutral-600'
                        }`}
                      >
                        {/* Left: Student Information */}
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black text-sm shrink-0 ${
                              isCol ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-neutral-800 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {item.fullName
                              .split(' ')
                              .map((n) => n[0])
                              .join('')
                              .toUpperCase()}
                          </div>

                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">{item.fullName}</h4>
                              {item.regNo === studentProfile.regNo && (
                                <span className="text-[9px] bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-extrabold px-1.5 py-0.2 rounded uppercase">
                                  You (Current Profile)
                                </span>
                              )}
                            </div>
                            <p className="text-xs font-mono font-semibold text-slate-600 dark:text-slate-400">
                              {item.regNo} • <span className="text-slate-500 dark:text-slate-400 font-sans">{item.department}</span>
                            </p>
                            <p className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">
                              Ref: <strong className="text-indigo-600 dark:text-indigo-400">{item.transactionRef ?? 'N/A'}</strong>
                            </p>
                          </div>
                        </div>

                        {/* Right: Toggle Switch Action */}
                        <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-neutral-800">
                          <div className="text-right">
                            <span
                              className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider inline-flex items-center gap-1 ${
                                isCol
                                  ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                                  : 'bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                              }`}
                            >
                              {isCol ? (
                                <>
                                  <CheckCheck className="w-3 h-3 text-emerald-600" />
                                  <span>COLLECTED</span>
                                </>
                              ) : (
                                <>
                                  <Clock className="w-3 h-3 text-amber-600" />
                                  <span>NOT TAKEN</span>
                                </>
                              )}
                            </span>
                          </div>

                          <div className="flex flex-col items-end gap-1">
                            {!canManage && (
                              <span className="text-[9px] font-semibold text-slate-400 dark:text-slate-500">
                                Only the rep who added this book can toggle it
                              </span>
                            )}
                            {canManage && !item.isCollected && availableSlots != null && availableSlots <= 0 && (
                              <span className="text-[9px] font-semibold text-rose-500 dark:text-rose-300 text-right">
                                No slots left — mark collected after settling a payout
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => handleToggleStudent(item)}
                              disabled={!canManage || (!item.isCollected && availableSlots != null && availableSlots <= 0)}
                              className={`relative inline-flex h-8 w-16 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
                                canManage ? 'cursor-pointer' : 'opacity-40 cursor-not-allowed'
                              } ${
                                isCol ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
                              }`}
                              role="switch"
                              aria-checked={isCol}
                            >
                              <span
                                className={`pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out flex items-center justify-center text-xs font-extrabold ${
                                  isCol ? 'translate-x-8 text-emerald-600' : 'translate-x-0 text-slate-400'
                                }`}
                              >
                                {isCol ? <Check className="w-4 h-4 stroke-[3]" /> : '×'}
                              </span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* QR Scan Modal */}
      <ScanQrModal
        isOpen={isScanOpen}
        onClose={() => setIsScanOpen(false)}
        onDecoded={handleScanDecoded}
      />
    </div>
  );
};
