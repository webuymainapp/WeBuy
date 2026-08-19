import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Textbook } from '../types';
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Save,
  BookOpen,
  ImageIcon,
  Loader2,
  AlertCircle,
  BookPlus,
  ArrowLeftRight,
} from 'lucide-react';
import { soundEffects } from '../utils/audio';
import { repApi, ApiError } from '../lib/api';

interface ManageTextbooksProps {
  catalog: Textbook[];
  currentUserId: string;
  isChief: boolean;
  onChanged: () => void;
  onToast: (msg: string) => void;
}

interface TextBookForm {
  courseCode: string;
  courseTitle: string;
  price: string;
}

const emptyForm: TextBookForm = {
  courseCode: '',
  courseTitle: '',
  price: '',
};

const formatNaira = (amount: number) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  })
    .format(amount)
    .replace('NGN', '₦');

export const ManageTextbooks: React.FC<ManageTextbooksProps> = ({
  catalog,
  currentUserId,
  isChief,
  onChanged,
  onToast,
}) => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TextBookForm>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [recycleOpen, setRecycleOpen] = useState(false);
  const [recycled, setRecycled] = useState<Textbook[]>([]);
  const [loadingRecycled, setLoadingRecycled] = useState(false);
  const [recycleError, setRecycleError] = useState<string | null>(null);
  const [revenue, setRevenue] = useState<{ revenue: number; paidBooks: number } | null>(null);
  const [reps, setReps] = useState<{ id: string; full_name: string; reg_no: string }[]>([]);
  const [transferBook, setTransferBook] = useState<Textbook | null>(null);
  const [transferRepId, setTransferRepId] = useState('');
  const [busyTransfer, setBusyTransfer] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);

  // This rep's own revenue (their share of the PocketFi balance), refreshed
  // whenever the manage modal opens. Chief admin sees the platform-wide total.
  useEffect(() => {
    if (!open) return;
    repApi
      .getRevenue()
      .then(setRevenue)
      .catch(() => undefined);
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const set = (key: keyof TextBookForm) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const openAdd = () => {
    soundEffects.playTap();
    setEditingId(null);
    setForm(emptyForm);
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEdit = (book: Textbook) => {
    soundEffects.playTap();
    setEditingId(book.id);
    setForm({
      courseCode: book.courseCode,
      courseTitle: book.courseTitle,
      price: String(book.price),
    });
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleDelete = async (book: Textbook) => {
    if (!window.confirm(`Delete "${book.bookTitle}" (${book.courseCode})? It moves to the recycle bin and can be restored for 24 hours.`)) {
      return;
    }
    try {
      await repApi.deleteTextbook(book.id);
      soundEffects.playTap();
      onToast(`Moved ${book.courseCode} to the recycle bin.`);
      onChanged();
    } catch (err) {
      soundEffects.playError();
      onToast(err instanceof ApiError ? err.message : 'Delete failed');
    }
  };

  const handleRestore = async (book: Textbook) => {
    try {
      await repApi.restoreTextbook(book.id);
      soundEffects.playTap();
      onToast(`Restored ${book.courseCode}.`);
      setRecycled((prev) => prev.filter((b) => b.id !== book.id));
      onChanged();
    } catch (err) {
      soundEffects.playError();
      onToast(err instanceof ApiError ? err.message : 'Could not restore textbook');
    }
  };

  const handlePurge = async (book: Textbook) => {
    if (!window.confirm(`Permanently delete "${book.bookTitle}" (${book.courseCode})? This cannot be undone.`)) {
      return;
    }
    try {
      await repApi.purgeTextbook(book.id);
      soundEffects.playTap();
      onToast(`Permanently deleted ${book.courseCode}.`);
      setRecycled((prev) => prev.filter((b) => b.id !== book.id));
      onChanged();
    } catch (err) {
      soundEffects.playError();
      onToast(err instanceof ApiError ? err.message : 'Could not delete textbook');
    }
  };

  const openTransfer = async (book: Textbook) => {
    soundEffects.playTap();
    setTransferBook(book);
    setTransferRepId('');
    setTransferError(null);
    setBusyTransfer(false);
    try {
      setReps(await repApi.getReps());
    } catch {
      setReps([]);
    }
  };

  const handleTransfer = async () => {
    if (!transferBook) return;
    if (!transferRepId) {
      setTransferError('Select a rep to take over the course.');
      return;
    }
    setBusyTransfer(true);
    setTransferError(null);
    try {
      await repApi.transferTextbook(transferBook.id, transferRepId);
      soundEffects.playSuccessChime();
      onToast(`${transferBook.courseCode} assigned to the selected rep.`);
      setTransferBook(null);
      onChanged();
    } catch (err) {
      soundEffects.playError();
      setTransferError(err instanceof ApiError ? err.message : 'Could not transfer course');
    } finally {
      setBusyTransfer(false);
    }
  };

  const loadRecycled = async () => {
    setLoadingRecycled(true);
    setRecycleError(null);
    try {
      setRecycled(await repApi.getDeletedTextbooks());
    } catch (err) {
      setRecycleError(err instanceof ApiError ? err.message : 'Could not load recycle bin');
      setRecycled([]);
    } finally {
      setLoadingRecycled(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const price = Math.max(0, parseInt(form.price, 10) || 0);
    const body = {
      courseCode: form.courseCode.trim().toUpperCase(),
      courseTitle: form.courseTitle.trim(),
      price,
    };

    setBusy(true);
    try {
      if (editingId) {
        await repApi.updateTextbook(editingId, body);
      } else {
        await repApi.createTextbook(body);
      }
      soundEffects.playSuccessChime();
      onToast(editingId ? 'Textbook updated.' : 'Textbook added to the catalog.');
      setIsFormOpen(false);
      onChanged();
    } catch (err) {
      soundEffects.playError();
      setFormError(err instanceof ApiError ? err.message : 'Could not save textbook');
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    'w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold bg-slate-50 dark:bg-slate-800 dark:text-slate-100 focus:outline-indigo-600';

  return (
    <>
      {/* Trigger card — opens the textbooks modal */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
        <button
          onClick={() => {
            soundEffects.playTap();
            setOpen(true);
          }}
          className="w-full flex items-center gap-2 text-left cursor-pointer group min-w-0"
        >
          <BookOpen className="w-4 h-4 text-indigo-600 shrink-0" />
          <div className="min-w-0 flex-1">
            <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
              Manage Textbooks
              <span className="text-[10px] font-extrabold font-mono px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300">
                {catalog.length} books
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
              Add or edit the books students owe — prices update instantly on their portal.
            </p>
          </div>
          <BookPlus className="w-4 h-4 text-slate-400 shrink-0 group-hover:text-indigo-500 transition-colors" />
        </button>
      </div>

      {/* Textbooks modal */}
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-xs"
            />
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden max-h-[85dvh] flex flex-col"
            >
              {/* Header */}
              <div className="p-4 sm:p-5 bg-slate-900 dark:bg-slate-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-indigo-500/20 flex items-center justify-center shrink-0">
                    <BookOpen className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-base text-white leading-tight">Manage Textbooks</h3>
                    <p className="text-[11px] text-slate-400">
                      {catalog.length} books • {new Set(catalog.map((t) => t.courseCode)).size} courses
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Add / Recycle buttons */}
              <div className="p-4 sm:p-5 pb-0 flex gap-2">
                <button
                  onClick={openAdd}
                  className="flex-1 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/25 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Add Textbook
                </button>
                <button
                  onClick={() => {
                    soundEffects.playTap();
                    loadRecycled();
                    setRecycleOpen(true);
                  }}
                  className="px-4 py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-bold flex items-center gap-2 transition-all cursor-pointer"
                  title="Recycle bin — restore recently deleted textbooks"
                >
                  <Trash2 className="w-4 h-4" />
                  Recycle Bin
                </button>
              </div>

              {/* Scrollable content: stats + list */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
                {/* Quick Stats */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-3 border border-slate-200 dark:border-slate-700">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Books</p>
                    <p className="text-xl font-black font-mono text-slate-900 dark:text-slate-100 mt-1">{catalog.length}</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-3 border border-slate-200 dark:border-slate-700">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Courses</p>
                    <p className="text-xl font-black font-mono text-indigo-600 dark:text-indigo-300 mt-1">
                      {new Set(catalog.map((t) => t.courseCode)).size}
                    </p>
                  </div>
                  <div className="col-span-2 bg-indigo-50/70 dark:bg-indigo-950/40 rounded-2xl p-4 border border-indigo-100 dark:border-indigo-900 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                        {isChief ? 'Total Revenue' : 'Your Revenue'}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {revenue
                          ? `From your ${revenue.paidBooks} paid book${revenue.paidBooks === 1 ? '' : 's'}`
                          : 'Loading…'}
                      </p>
                    </div>
                    <p className="text-lg sm:text-xl font-black font-mono text-indigo-700 dark:text-indigo-300 whitespace-nowrap">
                      {revenue ? formatNaira(revenue.revenue) : '—'}
                    </p>
                  </div>
                </div>

                {/* Textbook List */}
                <div className="space-y-2">
                  {catalog.length === 0 && (
                    <div className="text-center py-8 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                      <ImageIcon className="w-7 h-7 text-slate-300 dark:text-slate-600 mx-auto mb-1" />
                      <p className="font-bold text-slate-600 dark:text-slate-300 text-sm">No textbooks yet</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">Click &quot;Add Textbook&quot; to create the first one.</p>
                    </div>
                  )}

                  {catalog.map((book) => (
                    <div
                      key={book.id}
                      className="flex items-center gap-3 p-3 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 hover:border-slate-200 dark:hover:border-slate-700 transition-colors"
                    >
                      {/* Cover thumbnail or placeholder */}
                      <div className="w-11 h-14 shrink-0 rounded-lg overflow-hidden bg-slate-200 dark:bg-slate-700 border border-slate-200 dark:border-slate-700 flex items-center justify-center">
                        {book.coverUrl ? (
                          <img
                            src={book.coverUrl}
                            alt={book.bookTitle}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <ImageIcon className="w-4 h-4 text-slate-400" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-extrabold font-mono px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300">
                            {book.courseCode}
                          </span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                            {formatNaira(book.price)}
                          </span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                            {book.level}
                          </span>
                        </div>
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate mt-1">{book.bookTitle}</p>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {isChief || book.addedBy === currentUserId ? (
                          <>
                            {isChief && (
                              <button
                                onClick={() => openTransfer(book)}
                                title="Transfer course to another rep"
                                className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-600 dark:hover:text-emerald-300 transition-colors cursor-pointer"
                              >
                                <ArrowLeftRight className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => openEdit(book)}
                              title="Edit"
                              className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors cursor-pointer"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(book)}
                              title="Delete"
                              className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600 dark:hover:text-rose-300 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800">
                            Added by other rep
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add / Edit Form Modal */}
      <AnimatePresence>
        {isFormOpen && (
          <div className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative max-w-lg w-full bg-white dark:bg-slate-900 rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800">
                <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-sm">
                  {editingId ? 'Edit Textbook' : 'Add Textbook'}
                </h3>
                <button
                  onClick={() => setIsFormOpen(false)}
                  className="p-2 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSave} className="p-4 sm:p-5 space-y-3 max-h-[70vh] overflow-y-auto">
                {formError && (
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{formError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Course Code *</span>
                    <input required value={form.courseCode} onChange={set('courseCode')} placeholder="EEE 311" className={`${inputCls} mt-1`} />
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Price (₦) *</span>
                    <input required type="number" min="0" value={form.price} onChange={set('price')} placeholder="6500" className={`${inputCls} mt-1`} />
                  </label>
                </div>

                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Course Title *</span>
                  <input required value={form.courseTitle} onChange={set('courseTitle')} placeholder="Engineering Mathematics IV & Numerical Analysis" className={`${inputCls} mt-1`} />
                </label>

                <div className="flex items-start gap-2 p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                  <BookOpen className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    {editingId
                      ? 'Price already includes the ₦100 PocketFi service charge.'
                      : 'A ₦100 PocketFi service charge is added automatically to the posted price — students pay the all-inclusive amount.'}
                  </span>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-indigo-200 dark:shadow-indigo-950 transition-all cursor-pointer"
                  >
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    {editingId ? 'Save Changes' : 'Add Textbook'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Transfer Course Modal */}
      <AnimatePresence>
        {transferBook && (
          <div className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative max-w-lg w-full bg-white dark:bg-slate-900 rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
                    <ArrowLeftRight className="w-4 h-4 text-emerald-600" />
                    Transfer Course
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Reassign &quot;{transferBook.courseCode}&quot; to another rep.
                  </p>
                </div>
                <button
                  onClick={() => setTransferBook(null)}
                  className="p-2 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 sm:p-5 space-y-3">
                {transferError && (
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{transferError}</span>
                  </div>
                )}

                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">New Class Rep *</span>
                  <select
                    value={transferRepId}
                    onChange={(e) => setTransferRepId(e.target.value)}
                    className={`${inputCls} mt-1`}
                  >
                    <option value="">Select a rep…</option>
                    {reps
                      .filter((r) => r.id !== transferBook.addedBy)
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.full_name} — {r.reg_no}
                        </option>
                      ))}
                  </select>
                </label>

                <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  <ArrowLeftRight className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    The new rep takes over the course, its pending procurement
                    requests and collection slots. The current owner is notified.
                  </span>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setTransferBook(null)}
                    className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleTransfer}
                    disabled={busyTransfer}
                    className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-200 dark:shadow-emerald-950 transition-all cursor-pointer"
                  >
                    {busyTransfer ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowLeftRight className="w-3.5 h-3.5" />}
                    Transfer Course
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Recycle Bin Modal */}
      <AnimatePresence>
        {recycleOpen && (
          <div className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative max-w-lg w-full bg-white dark:bg-slate-900 rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
                    <Trash2 className="w-4 h-4 text-rose-500" />
                    Recycle Bin
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Deleted textbooks are kept for 24 hours, then removed permanently.
                  </p>
                </div>
                <button
                  onClick={() => setRecycleOpen(false)}
                  className="p-2 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 sm:p-5 max-h-[70vh] overflow-y-auto space-y-2">
                {recycleError && (
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{recycleError}</span>
                  </div>
                )}

                {loadingRecycled ? (
                  <div className="flex items-center justify-center py-10 text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    <span className="text-xs font-semibold">Loading recycle bin…</span>
                  </div>
                ) : recycled.length === 0 ? (
                  <div className="text-center py-10 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                    <Trash2 className="w-7 h-7 text-slate-300 dark:text-slate-600 mx-auto mb-1" />
                    <p className="font-bold text-slate-600 dark:text-slate-300 text-sm">Recycle bin is empty</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Deleted textbooks appear here for 24 hours.</p>
                  </div>
                ) : (
                  recycled.map((book) => (
                    <div
                      key={book.id}
                      className="flex items-center gap-3 p-3 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50"
                    >
                      <div className="w-11 h-14 shrink-0 rounded-lg overflow-hidden bg-slate-200 dark:bg-slate-700 border border-slate-200 dark:border-slate-700 flex items-center justify-center">
                        {book.coverUrl ? (
                          <img
                            src={book.coverUrl}
                            alt={book.bookTitle}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <ImageIcon className="w-4 h-4 text-slate-400" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-extrabold font-mono px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300">
                            {book.courseCode}
                          </span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                            {formatNaira(book.price)}
                          </span>
                        </div>
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate mt-1">{book.bookTitle}</p>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleRestore(book)}
                          title="Restore"
                          className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition-colors cursor-pointer"
                        >
                          Restore
                        </button>
                        <button
                          onClick={() => handlePurge(book)}
                          title="Delete forever"
                          className="p-2 rounded-xl text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
