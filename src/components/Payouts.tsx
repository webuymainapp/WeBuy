import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Textbook } from '../types';
import {
  Wallet,
  Loader2,
  AlertCircle,
  X,
  Check,
  Clock,
  Plus,
} from 'lucide-react';
import { soundEffects } from '../utils/audio';
import { repApi, ApiError, type PayoutRequest } from '../lib/api';

const FEE = 100;

interface PayoutsProps {
  isChief: boolean;
  myBooks: Textbook[];
  onChanged: () => void;
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

export const Payouts: React.FC<PayoutsProps> = ({ isChief, myBooks, onChanged, onToast }) => {
  const [open, setOpen] = useState(false);
  const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [bookId, setBookId] = useState('');
  const [copies, setCopies] = useState('');
  const [paidCount, setPaidCount] = useState(0);
  const [busy, setBusy] = useState(false);

  const [banks, setBanks] = useState<{ code: string; name: string }[]>([]);
  const [bankCode, setBankCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [resolved, setResolved] = useState<{ accountName: string; accountNumber: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const selectedBook = myBooks.find((b) => b.id === bookId);
  const perBook = selectedBook ? Math.max(selectedBook.price - FEE, 0) : 0;
  const amount = perBook * (parseInt(copies, 10) || 0);
  const selectedBankName = banks.find((b) => b.code === bankCode)?.name ?? '';

  // Load the bank list for account verification.
  useEffect(() => {
    repApi
      .getBanks()
      .then(setBanks)
      .catch(() => setBanks([]));
  }, []);

  // Show how many copies students have already paid for the selected course.
  useEffect(() => {
    if (!bookId) return;
    repApi
      .getPaidCopies(bookId)
      .then(setPaidCount)
      .catch(() => setPaidCount(0));
  }, [bookId]);

  const handleVerify = async () => {
    if (!bankCode || accountNumber.trim().length < 10) {
      setError('Select your bank and enter your 10-digit account number.');
      return;
    }
    setVerifying(true);
    setError(null);
    try {
      const r = await repApi.resolveAccount({ accountNumber: accountNumber.trim(), bankCode });
      setResolved(r);
      // Do NOT confirm yet — the rep must tap "Yes, this is mine" first.
      setConfirming(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not verify account');
      setResolved(null);
      setConfirming(false);
    } finally {
      setVerifying(false);
    }
  };

  const resetBank = () => {
    setResolved(null);
    setConfirming(false);
    setAccountNumber('');
    setBankCode('');
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPayouts(await repApi.getPayouts());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load payouts');
      setPayouts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      load();
      if (!bookId && myBooks.length) setBookId(myBooks[0].id);
    }
  }, [open, load, bookId, myBooks]);

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookId || !copies || !confirming || !resolved) return;
    setBusy(true);
    setError(null);
    try {
      await repApi.createPayout({
        textbookId: bookId,
        copies: parseInt(copies, 10),
        accountNumber: resolved.accountNumber,
        bankCode,
        bankName: selectedBankName,
      });
      soundEffects.playSuccessChime();
      onToast('Payout requested. The chief admin will review and settle it.');
      setCopies('');
      resetBank();
      await load();
      onChanged();
    } catch (err) {
      soundEffects.playError();
      setError(err instanceof ApiError ? err.message : 'Could not request payout');
    } finally {
      setBusy(false);
    }
  };

  const handleSettle = async (id: string) => {
    if (!window.confirm('Mark this payout as SETTLED (money withdrawn)? This cannot be undone.')) return;
    setBusy(true);
    setError(null);
    try {
      await repApi.settlePayout(id);
      soundEffects.playSuccessChime();
      onToast('Payout settled. Balances have been updated.');
      await load();
      onChanged();
    } catch (err) {
      soundEffects.playError();
      setError(err instanceof ApiError ? err.message : 'Could not settle payout');
    } finally {
      setBusy(false);
    }
  };

  const statusPill = (s: string) =>
    s === 'completed' ? (
      <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
        <Check className="w-3 h-3" /> Settled
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">
        <Clock className="w-3 h-3" /> {s === 'processing' ? 'Processing' : 'Requested'}
      </span>
    );

  return (
    <>
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
        <button
          onClick={() => {
            soundEffects.playTap();
            setOpen(true);
          }}
          className="w-full flex items-center gap-2 text-left cursor-pointer group"
        >
          <Wallet className="w-4 h-4 text-indigo-600 shrink-0 group-hover:text-indigo-500 transition-colors" />
          <div className="flex-1 min-w-0">
            <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-base">
                      {isChief ? 'Money Requests' : 'Request Money for Books'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
              {isChief
                ? 'Review reps\' requests and settle when money is withdrawn.'
                : 'Pick one of your courses and how many copies you need — we calculate the amount.'}
            </p>
          </div>
          <span className="text-[10px] font-extrabold font-mono px-2 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 shrink-0">
            {isChief ? 'Review' : 'Request'}
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
              className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col max-h-[88dvh]"
            >
              <div className="p-4 sm:p-5 bg-slate-900 dark:bg-slate-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-indigo-500/20 flex items-center justify-center shrink-0">
                    <Wallet className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-base text-white leading-tight truncate">
              {isChief ? 'Money Requests' : 'Request Money for Books'}
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      {payouts.length} request{payouts.length === 1 ? '' : 's'}
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

              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 min-h-0">
                {error && (
                  <div className="flex items-start gap-2 p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <form
                  onSubmit={handleRequest}
                  className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-3"
                >
                  <p className="text-xs font-extrabold text-slate-900 dark:text-slate-100">
                    New Request
                  </p>
                  {myBooks.length === 0 ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        You haven&apos;t added any textbooks yet. Add a textbook first to request money for it.
                      </p>
                    ) : (
                      <>
                        <label className="block">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Course
                          </span>
                          <select
                            value={bookId}
                            onChange={(e) => setBookId(e.target.value)}
                            className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold bg-slate-50 dark:bg-slate-800 dark:text-slate-100 focus:outline-indigo-600"
                          >
                            {myBooks.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.courseCode} — {b.bookTitle}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="block">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            How many copies do you need?
                          </span>
                          <input
                            type="number"
                            min="1"
                            max={paidCount > 0 ? paidCount : undefined}
                            value={copies}
                            onChange={(e) => setCopies(e.target.value)}
                            placeholder="e.g. 30"
                            className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold bg-slate-50 dark:bg-slate-800 dark:text-slate-100 focus:outline-indigo-600"
                          />
                          <span className="mt-1 block text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                            {paidCount} student{paidCount === 1 ? '' : 's'} ha{paidCount === 1 ? 's' : 've'} paid for this course — you can request up to {paidCount} cop{paidCount === 1 ? 'y' : 'ies'}.
                          </span>
                        </label>

                        {/* Where the money should be sent */}
                        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-3 space-y-2">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Where should the money go?
                          </p>
                          <label className="block">
                            <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Bank</span>
                            <select
                              value={bankCode}
                              onChange={(e) => { setBankCode(e.target.value); setResolved(null); setConfirming(false); }}
                              disabled={confirming}
                              className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold bg-slate-50 dark:bg-slate-800 dark:text-slate-100 focus:outline-indigo-600"
                            >
                              <option value="">Select bank</option>
                              {banks.map((b) => (
                                <option key={b.code} value={b.code}>{b.name}</option>
                              ))}
                            </select>
                          </label>
                          <label className="block">
                            <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Account number</span>
                            <input
                              type="text"
                              inputMode="numeric"
                              maxLength={10}
                              value={accountNumber}
                              onChange={(e) => { setAccountNumber(e.target.value.replace(/\D/g, '')); setResolved(null); setConfirming(false); }}
                              disabled={confirming}
                              placeholder="10-digit account number"
                              className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold bg-slate-50 dark:bg-slate-800 dark:text-slate-100 focus:outline-indigo-600"
                            />
                          </label>

                          {!resolved ? (
                            <button
                              type="button"
                              onClick={handleVerify}
                              disabled={verifying || !bankCode || accountNumber.length < 10}
                              className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors cursor-pointer"
                            >
                              {verifying ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Verify account name'}
                            </button>
                          ) : (
                            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 p-3 space-y-2">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                                Account name
                              </p>
                              <p className="text-sm font-extrabold text-emerald-900 dark:text-emerald-100">
                                {resolved.accountName}
                              </p>
                              {!confirming && (
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => { setConfirming(false); setResolved(null); }}
                                    className="flex-1 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold transition-colors cursor-pointer"
                                  >
                                    Not mine
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirming(true)}
                                    className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors cursor-pointer"
                                  >
                                    Yes, this is mine
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 p-3 flex items-center justify-between">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                              Amount Needed
                            </p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400">
                              {copies ? `${copies} × ${formatNaira(perBook)}` : 'Enter copies above'}
                            </p>
                          </div>
                          <span className="font-mono font-black text-lg text-indigo-700 dark:text-indigo-300">
                            {formatNaira(amount)}
                          </span>
                        </div>

                        <button
                          type="submit"
                          disabled={
                            busy ||
                            !bookId ||
                            !copies ||
                            amount <= 0 ||
                            parseInt(copies, 10) > paidCount ||
                            !confirming
                          }
                          className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
                        >
                          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                          Request {formatNaira(amount)}
                        </button>
                      </>
                    )}
                  </form>

                {/* Requests list */}
                <div className="space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    {isChief ? 'All Requests' : 'My Requests'}
                  </p>
                  {loading ? (
                    <div className="flex items-center justify-center py-6 text-slate-400">
                      <Loader2 className="w-5 h-5 animate-spin mr-2" />
                      <span className="text-xs font-semibold">Loading…</span>
                    </div>
                  ) : payouts.length === 0 ? (
                    <div className="text-center py-8 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                      <Wallet className="w-7 h-7 text-slate-300 dark:text-slate-600 mx-auto mb-1" />
                      <p className="font-bold text-slate-600 dark:text-slate-300 text-sm">No requests yet</p>
                    </div>
                  ) : (
                    payouts.map((p) => {
                      const settled = p.status === 'completed';
                      return (
                        <div
                          key={p.id}
                          className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 p-3 space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs font-extrabold text-slate-900 dark:text-slate-100">
                                {p.course_code ?? 'Course'}
                                <span className="text-slate-400 font-medium"> · {p.copies} copies</span>
                              </p>
                              <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                {isChief && p.rep_name ? `${p.rep_name} · ` : ''}
                                {new Date(p.created_at).toLocaleDateString('en-NG', {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                  hour: 'numeric',
                                  minute: '2-digit',
                                })}
                              </p>
                              {p.account_name && (
                                <p className="text-[10px] text-slate-600 dark:text-slate-300 font-semibold truncate">
                                  {p.bank_name ?? ''} · {p.account_name} ({p.account_number})
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-mono font-black text-slate-900 dark:text-slate-100">
                                {formatNaira(p.amount)}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            {statusPill(p.status)}
                            {isChief &&
                              (settled ? (
                                <span className="text-[10px] font-semibold text-slate-400">
                                  Cannot be changed
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleSettle(p.id)}
                                  disabled={busy}
                                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-[11px] font-bold transition-colors cursor-pointer"
                                >
                                  Settle
                                </button>
                              ))}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
