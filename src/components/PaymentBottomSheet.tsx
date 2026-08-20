import React, { useEffect, useState } from 'react';
import { Textbook } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  ShieldCheck,
  ArrowRight,
  AlertCircle,
  Loader2,
  Banknote,
  Copy,
  Check,
} from 'lucide-react';
import { soundEffects } from '../utils/audio';
import { walletApi, ApiError } from '../lib/api';

interface PaymentBottomSheetProps {
  items: Textbook[];
  isOpen: boolean;
  onClose: () => void;
  points: number;
  accountNumber: string;
  bankName: string;
  onPaid: (result: { spent: number; remaining: number; reference: string }) => void;
}

export const PaymentBottomSheet: React.FC<PaymentBottomSheetProps> = ({
  items,
  isOpen,
  onClose,
  points,
  accountNumber,
  bankName,
  onPaid,
}) => {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // If the browser restores this page from the back-forward cache, clear any
  // stuck "Checking out…" state.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        setBusy(false);
        setError(null);
      }
    };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);

  if (!isOpen || items.length === 0) return null;

  const itemsToPay = items;
  const isBatchPayment = itemsToPay.length > 1;

  const basePrice = itemsToPay.reduce((sum, item) => sum + item.price, 0);
  const totalPoints = basePrice; // 1 Webuy point = ₦1
  const canAfford = points >= totalPoints;

  const formatNaira = (amount: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      maximumFractionDigits: 0,
    }).format(amount).replace('NGN', '₦');
  };

  const handlePayWithPoints = async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const res = await walletApi.checkout(itemsToPay.map((b) => b.studentTextbookId).filter(Boolean) as string[]);
      soundEffects.playSuccessChime();
      onPaid(res);
      onClose();
    } catch (err) {
      soundEffects.playError();
      setError(err instanceof ApiError ? err.message : 'Could not complete checkout. Try again.');
      setBusy(false);
    }
  };

  const copyAccount = async () => {
    try {
      await navigator.clipboard?.writeText(accountNumber);
    } catch {
      /* ignore */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4">
        {/* Backdrop overlay */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0"
        />

        {/* Bottom Sheet Container */}
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-lg bg-white dark:bg-neutral-900 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-neutral-800 text-slate-900 dark:text-slate-100 max-h-[90vh] flex flex-col z-10"
        >
          {/* Top Handle / Points Header */}
          <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-neutral-800 flex items-center justify-between bg-slate-900 dark:bg-black text-white">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-400/10 border border-emerald-400/30 flex items-center justify-center text-emerald-400">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-base text-white leading-tight">
                    {isBatchPayment ? 'Batch Checkout' : 'Textbook Payment'}
                  </h3>
                  <span className="bg-emerald-400/20 text-emerald-300 text-[10px] font-black tracking-widest px-2 py-0.5 rounded-md uppercase">
                    Points
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-medium">
                  Pay with your Webuy Points (1 pt = ₦1)
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

          {/* Scrollable Content */}
          <div className="p-4 sm:p-6 overflow-y-auto space-y-5">
            {/* Points available */}
            <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900 flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">
                Available Points
              </span>
              <span className="font-mono font-black text-base text-emerald-700 dark:text-emerald-300">
                {points.toLocaleString()} pts
              </span>
            </div>

            {/* Order Summary Box */}
            <div className="p-4 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 space-y-2.5">
              <div className="flex items-center justify-between text-xs font-semibold text-indigo-950 dark:text-indigo-200">
                <span>Course & Textbook Item</span>
                <span>Amount</span>
              </div>

              <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                {itemsToPay.map((item) => (
                  <div key={item.id} className="flex items-start justify-between text-xs gap-2">
                    <div>
                      <span className="font-bold font-mono text-indigo-700 dark:text-indigo-300 mr-1.5">
                        {item.courseCode}
                      </span>
                      <span className="text-slate-800 dark:text-slate-200 font-medium line-clamp-1">{item.bookTitle}</span>
                    </div>
                    <span className="font-mono font-bold text-slate-900 dark:text-slate-100 shrink-0">
                      {item.price.toLocaleString()} pts
                    </span>
                  </div>
                ))}
              </div>

              <div className="pt-2 border-t border-indigo-100/80 dark:border-indigo-900 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                <div className="flex justify-between pt-1 font-extrabold text-sm text-slate-900 dark:text-slate-100 border-t border-indigo-200/60 dark:border-indigo-900">
                  <span>Total Points Needed</span>
                  <span className="font-mono text-indigo-700 dark:text-indigo-300 text-base">
                    {totalPoints.toLocaleString()} pts
                  </span>
                </div>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Insufficient points -> show funding account */}
            {!canAfford && accountNumber && (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 space-y-2">
                <div className="flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300">
                  <Banknote className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <p>
                    You need <strong>{totalPoints.toLocaleString()} pts</strong> but have{' '}
                    <strong>{points.toLocaleString()}</strong>. Fund your account by transferring to:
                  </p>
                </div>
                <div className="flex items-center justify-between gap-2 rounded-xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-700 px-3 py-2">
                  <div className="min-w-0">
                    <p className="font-mono font-black text-sm text-emerald-700 dark:text-emerald-300">
                      {accountNumber}
                    </p>
                    <p className="text-[10px] text-slate-400 truncate">via {bankName || 'PocketFi'}</p>
                  </div>
                  <button
                    onClick={copyAccount}
                    className="shrink-0 px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] flex items-center gap-1 transition-colors"
                  >
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500">
                  Once your transfer lands, your points update automatically — then come back and pay.
                </p>
              </div>
            )}
          </div>

          {/* Bottom Action Footer */}
          <div className="p-4 sm:p-5 border-t border-slate-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-2">
            <button
              onClick={handlePayWithPoints}
              disabled={busy || !canAfford}
              className="w-full py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 transition-all cursor-pointer"
            >
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Banknote className="w-4 h-4" />
              )}
              <span>
                {busy
                  ? 'Checking out…'
                  : canAfford
                    ? `Pay with Points (${totalPoints.toLocaleString()} pts)`
                    : `Need ${(totalPoints - points).toLocaleString()} more points`}
              </span>
              {!busy && canAfford && <ArrowRight className="w-4 h-4 ml-1" />}
            </button>

            <p className="text-[10px] text-center text-slate-400 dark:text-slate-500 flex items-center justify-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Points are deducted instantly and your QR pass is issued.</span>
            </p>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};