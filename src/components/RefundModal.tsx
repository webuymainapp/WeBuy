import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Textbook } from '../types';
import { RotateCcw, Loader2, AlertCircle, X, ShieldCheck } from 'lucide-react';
import { soundEffects } from '../utils/audio';
import { refundsApi, ApiError } from '../lib/api';

interface RefundModalProps {
  textbook: Textbook | null;
  onClose: () => void;
  onRefunded: () => void;
  onToast: (msg: string) => void;
}

const formatNaira = (amount: number) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  })
    .format(amount)
    .replace('NGN', '₦');

export const RefundModal: React.FC<RefundModalProps> = ({
  textbook,
  onClose,
  onRefunded,
  onToast,
}) => {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (textbook) {
      setReason('');
      setError(null);
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }
  }, [textbook, onClose]);

  const refundAmount = textbook
    ? Math.max(textbook.price - (textbook.serviceFee ?? 100), 0)
    : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!textbook?.studentTextbookId) return;
    setBusy(true);
    setError(null);
    try {
      await refundsApi.request(textbook.studentTextbookId, reason.trim() || undefined);
      soundEffects.playSuccessChime();
      onToast(
        `Refund requested for ${textbook.courseCode}. The class rep will review it — your points are only refunded after approval.`,
      );
      onRefunded();
      onClose();
    } catch (err) {
      soundEffects.playError();
      setError(err instanceof ApiError ? err.message : 'Could not request refund');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {textbook && (
        <div className="fixed inset-0 z-[85] flex items-end sm:items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-xs"
          />
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="relative w-full max-w-md bg-white dark:bg-neutral-900 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-neutral-700 overflow-hidden max-h-[88dvh] flex flex-col"
          >
            <div className="p-4 sm:p-5 bg-slate-900 dark:bg-neutral-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
                  <RotateCcw className="w-5 h-5 text-amber-400" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-base text-white leading-tight truncate">
                    Request Refund
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {textbook.courseCode} — {textbook.courseTitle}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
              {error && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="rounded-2xl border border-slate-200 dark:border-neutral-700 p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Refund Value
                  </span>
                  <span className="font-mono font-black text-lg text-amber-600 dark:text-amber-300">
                    {formatNaira(refundAmount)}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  You&apos;ll get back what you paid ({formatNaira(textbook.price)})
                  minus the {formatNaira(textbook.serviceFee ?? 100)} PocketFi
                  service charge. Approved refunds are credited to your points
                  wallet and the textbook becomes unpaid again.
                </p>
              </div>

              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Reason (optional)
                </span>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value.slice(0, 500))}
                  rows={3}
                  placeholder="e.g. I already had a copy of this textbook."
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-neutral-700 text-xs font-semibold bg-slate-50 dark:bg-neutral-800 dark:text-slate-100 focus:outline-amber-500 resize-none"
                />
              </label>

              <div className="flex items-start gap-2 p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  The class rep must approve your request before the points are
                  released.
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-neutral-800 hover:bg-slate-200 dark:hover:bg-neutral-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy || !textbook.studentTextbookId}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-900 text-xs font-bold flex items-center gap-1.5 shadow-md shadow-amber-200 dark:shadow-amber-950 transition-all cursor-pointer"
                >
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                  Request Refund
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};