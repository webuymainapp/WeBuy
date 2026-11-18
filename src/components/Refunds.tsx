import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  RotateCcw,
  Loader2,
  AlertCircle,
  X,
  Check,
  Clock,
} from 'lucide-react';
import { soundEffects } from '../utils/audio';
import { repApi, ApiError, type RefundRequest } from '../lib/api';

interface RefundsProps {
  isChief: boolean;
  onToast: (msg: string) => void;
  onChanged: () => void;
}

const formatNaira = (amount: number) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  })
    .format(amount)
    .replace('NGN', '₦');

export const Refunds: React.FC<RefundsProps> = ({ isChief, onToast, onChanged }) => {
  const [open, setOpen] = useState(false);
  const [refunds, setRefunds] = useState<RefundRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRefunds(await repApi.getRefunds());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load refund requests');
      setRefunds([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const handleApprove = async (r: RefundRequest) => {
    if (
      !window.confirm(
        `Approve this ${formatNaira(r.amount)} refund for ${r.studentName ?? 'this student'} (${r.courseCode})? The points are credited to their wallet and the textbook becomes unpaid.`,
      )
    ) {
      return;
    }
    setBusyId(r.id);
    setError(null);
    try {
      await repApi.approveRefund(r.id);
      soundEffects.playSuccessChime();
      onToast(`Refund approved — ${formatNaira(r.amount)} credited to ${r.studentName ?? 'the student'}.`);
      await load();
      onChanged();
    } catch (err) {
      soundEffects.playError();
      setError(err instanceof ApiError ? err.message : 'Could not approve refund');
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (r: RefundRequest) => {
    setBusyId(r.id);
    setError(null);
    try {
      await repApi.rejectRefund(r.id, rejectNote.trim() || undefined);
      soundEffects.playTap();
      onToast(`Refund request declined for ${r.courseCode}. The student keeps the book.`);
      setRejectingId(null);
      setRejectNote('');
      await load();
      onChanged();
    } catch (err) {
      soundEffects.playError();
      setError(err instanceof ApiError ? err.message : 'Could not reject refund');
    } finally {
      setBusyId(null);
    }
  };

  const statusPill = (s: RefundRequest['status']) =>
    s === 'approved' ? (
      <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
        <Check className="w-3 h-3" /> Approved
      </span>
    ) : s === 'rejected' ? (
      <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300">
        <X className="w-3 h-3" /> Declined
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">
        <Clock className="w-3 h-3" /> Pending
      </span>
    );

  return (
    <>
      {/* Trigger card — opens the refund requests modal */}
      <div className="bg-white dark:bg-neutral-900 rounded-3xl p-4 sm:p-5 border border-slate-200 dark:border-neutral-700 shadow-sm">
        <button
          onClick={() => {
            soundEffects.playTap();
            setOpen(true);
          }}
          className="w-full flex items-center gap-2 text-left cursor-pointer group"
        >
          <RotateCcw className="w-4 h-4 text-amber-600 shrink-0 group-hover:text-amber-500 transition-colors" />
          <div className="flex-1 min-w-0">
            <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-base">
              Refund Requests
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
              {isChief
                ? "Review students' refunds across every course."
                : "Review refund requests for the textbooks you added — approve to release the points."}
            </p>
          </div>
          <span className="text-[10px] font-extrabold font-mono px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 shrink-0">
            {refunds.filter((r) => r.status === 'pending').length} pending
          </span>
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center">
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
              className="relative w-full max-w-lg bg-white dark:bg-neutral-900 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-neutral-700 overflow-hidden flex flex-col max-h-[88dvh]"
            >
              <div className="p-4 sm:p-5 bg-slate-900 dark:bg-neutral-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
                    <RotateCcw className="w-5 h-5 text-amber-400" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-base text-white leading-tight truncate">
                      Refund Requests
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      {refunds.filter((r) => r.status === 'pending').length} pending ·{' '}
                      {refunds.length} total
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

              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 min-h-0">
                {error && (
                  <div className="flex items-start gap-2 p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                {loading ? (
                  <div className="flex items-center justify-center py-10 text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    <span className="text-xs font-semibold">Loading refund requests…</span>
                  </div>
                ) : refunds.length === 0 ? (
                  <div className="text-center py-10 bg-slate-50 dark:bg-neutral-800 rounded-2xl border border-dashed border-slate-200 dark:border-neutral-700">
                    <RotateCcw className="w-7 h-7 text-slate-300 dark:text-slate-600 mx-auto mb-1" />
                    <p className="font-bold text-slate-600 dark:text-slate-300 text-sm">No refund requests</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                      Students can request refunds on the books you&apos;ve opened for refunds in Manage Textbooks.
                    </p>
                  </div>
                ) : (
                  refunds.map((r) => {
                    const pending = r.status === 'pending';
                    const rejecting = rejectingId === r.id;
                    return (
                      <div
                        key={r.id}
                        className="rounded-2xl border border-slate-100 dark:border-neutral-800 bg-slate-50/50 dark:bg-neutral-800/50 p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-extrabold text-slate-900 dark:text-slate-100">
                              {r.courseCode}
                              <span className="text-slate-400 font-medium"> · {r.studentName}</span>
                            </p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                              {r.studentRegNo} ·{' '}
                              {new Date(r.createdAt).toLocaleDateString('en-NG', {
                                day: 'numeric',
                                month: 'short',
                                hour: 'numeric',
                                minute: '2-digit',
                              })}
                            </p>
                          </div>
                          <span className="font-mono font-black text-slate-900 dark:text-slate-100 shrink-0">
                            {formatNaira(r.amount)}
                          </span>
                        </div>

                        {r.reason && (
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 font-medium bg-white dark:bg-neutral-900 rounded-lg px-2.5 py-1.5 border border-slate-100 dark:border-neutral-800">
                            “{r.reason}”
                          </p>
                        )}

                        {(r.reviewNote || r.reviewedAt) && (
                          <p className="text-[10px] text-slate-400 dark:text-slate-500">
                            {r.reviewNote
                              ? `Note: ${r.reviewNote}`
                              : r.status === 'approved'
                                ? `Approved ${new Date(r.reviewedAt ?? '').toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}`
                                : `Declined ${new Date(r.reviewedAt ?? '').toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}`}
                          </p>
                        )}

                        <div className="flex items-center justify-between gap-2">
                          {statusPill(r.status)}
                          <div className="flex items-center gap-1.5">
                            {pending && (
                              <>
                                <button
                                  onClick={() => handleApprove(r)}
                                  disabled={busyId === r.id}
                                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                                >
                                  {busyId === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                  Approve
                                </button>
                                <button
                                  onClick={() => {
                                    setRejectingId(r.id);
                                    setRejectNote('');
                                  }}
                                  disabled={busyId === r.id}
                                  className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                                >
                                  <X className="w-3 h-3" />
                                  Decline
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {pending && rejecting && (
                          <div className="space-y-1.5 pt-1 border-t border-slate-100 dark:border-neutral-800">
                            <textarea
                              value={rejectNote}
                              onChange={(e) => setRejectNote(e.target.value.slice(0, 500))}
                              rows={2}
                              placeholder="Optional reason the student will see…"
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-neutral-700 text-xs font-semibold bg-white dark:bg-neutral-900 dark:text-slate-100 focus:outline-rose-500 resize-none"
                            />
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => setRejectingId(null)}
                                className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-neutral-700 text-slate-600 dark:text-slate-300 text-[11px] font-bold transition-colors cursor-pointer"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleReject(r)}
                                disabled={busyId === r.id}
                                className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                              >
                                {busyId === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                                Confirm decline
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};