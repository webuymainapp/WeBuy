import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ReceiptText,
  Loader2,
  AlertCircle,
  X,
  Search,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Banknote,
  ShoppingCart,
  Eye,
} from 'lucide-react';
import { accountApi, repApi, ApiError, type AccountTransaction } from '../lib/api';

interface RepTransactionsProps {
  onToast: (msg: string) => void;
  isChief: boolean;
}

const PAGE = 50;

const formatNaira = (amount: number) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  })
    .format(amount)
    .replace('NGN', '₦');

interface RepOption {
  id: string;
  full_name: string;
  reg_no: string;
}

export const RepTransactions: React.FC<RepTransactionsProps> = ({ isChief }) => {
  const [open, setOpen] = useState(false);
  const [txs, setTxs] = useState<AccountTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'purchases' | 'payins'>('purchases');
  const [reps, setReps] = useState<RepOption[]>([]);
  const [repId, setRepId] = useState('');
  const [repOpen, setRepOpen] = useState(false);

  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [offset, setOffset] = useState(0);

  const currentRepName = reps.find((r) => r.id === repId)?.full_name ?? '';

  // Load the rep list for the chief's "view another rep" dropdown.
  useEffect(() => {
    if (!open || !isChief) return;
    repApi
      .getReps()
      .then(setReps)
      .catch(() => setReps([]));
  }, [open, isChief]);

  // Debounce the free-text search so typing doesn't spam the API.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q.trim());
      setOffset(0);
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(
    async (nextOffset: number, appliedQ: string, appliedFrom: string, appliedTo: string, appliedView: typeof view, appliedRepId: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await accountApi.transactions({
          q: appliedQ || undefined,
          from: appliedFrom || undefined,
          to: appliedTo || undefined,
          view: appliedView,
          repId: isChief ? appliedRepId || undefined : undefined,
          limit: PAGE,
          offset: nextOffset,
        });
        setTxs(res.transactions);
        setTotal(res.total);
        setOffset(nextOffset);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not load transactions');
      } finally {
        setLoading(false);
      }
    },
    [isChief],
  );

  // Reset to page 0 whenever filters, view, or rep selection change.
  useEffect(() => {
    if (open) load(0, debouncedQ, from, to, view, repId);
  }, [open, debouncedQ, from, to, view, repId, load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE));
  const currentPage = Math.floor(offset / PAGE) + 1;

  return (
    <>
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
        <button
          onClick={() => setOpen(true)}
          className="w-full flex items-center gap-2 text-left cursor-pointer group"
        >
          <ReceiptText className="w-4 h-4 text-indigo-600 shrink-0 group-hover:text-indigo-500 transition-colors" />
          <div className="flex-1 min-w-0">
            <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-base">
              Transactions
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
              Students buying textbooks with their points — searchable by name, Reg No, rep or date.
            </p>
          </div>
          <span className="text-[10px] font-extrabold font-mono px-2 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 shrink-0">
            View log
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
              className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col max-h-[88dvh]"
            >
              {/* Fixed header — stays put; only the list scrolls below. */}
              <div className="p-4 sm:p-5 bg-slate-900 dark:bg-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/20 flex items-center justify-center shrink-0">
                  <ReceiptText className="w-5 h-5 text-indigo-400" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-base text-white leading-tight truncate">
                    {view === 'purchases' ? 'Transaction Log' : 'Payins'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {total.toLocaleString()} record{total === 1 ? '' : 's'}
                    {debouncedQ || from || to ? ' filtered' : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {isChief && view === 'purchases' && (
                  <div className="relative">
                    <button
                      onClick={() => setRepOpen((o) => !o)}
                      title="View another rep's purchases"
                      className="p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    {repOpen && (
                      <div className="absolute right-0 top-11 z-50 w-56 max-h-64 overflow-y-auto rounded-xl bg-slate-800 border border-slate-700 shadow-xl py-1">
                        <button
                          onClick={() => { setRepId(''); setRepOpen(false); setOffset(0); }}
                          className="w-full text-left px-3 py-2 text-xs font-bold text-white hover:bg-slate-700"
                        >
                          My purchases
                        </button>
                        {reps.map((r) => (
                          <button
                            key={r.id}
                            onClick={() => { setRepId(r.id); setRepOpen(false); setOffset(0); }}
                            className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-700 ${
                              r.id === repId ? 'text-emerald-400 font-bold' : 'text-slate-300 font-semibold'
                            }`}
                          >
                            {r.full_name}
                            <span className="block text-[9px] text-slate-500">{r.reg_no}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {isChief && (
                  <button
                    onClick={() => {
                      setView((v) => (v === 'purchases' ? 'payins' : 'purchases'));
                      setOffset(0);
                    }}
                    title={view === 'purchases' ? 'Show payins (chief only)' : 'Back to textbook purchases'}
                    className="p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                  >
                    {view === 'purchases' ? (
                      <Banknote className="w-4 h-4" />
                    ) : (
                      <ShoppingCart className="w-4 h-4" />
                    )}
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {isChief && view === 'purchases' && currentRepName && (
              <div className="px-4 sm:px-5 pt-3 pb-0">
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300">
                  <Eye className="w-3 h-3" /> Viewing: {currentRepName}&apos;s purchases
                </span>
              </div>
            )}

              {/* Filters — also fixed */}
              <div className="p-4 sm:p-5 pb-3 border-b border-slate-200 dark:border-slate-800 space-y-2.5">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search by name or Reg No…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold bg-slate-50 dark:bg-slate-800 dark:text-slate-100 focus:outline-indigo-600"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" />
                  <input
                    type="date"
                    value={from}
                    onChange={(e) => { setFrom(e.target.value); setOffset(0); }}
                    aria-label="From date"
                    className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold bg-slate-50 dark:bg-slate-800 dark:text-slate-100 focus:outline-indigo-600"
                  />
                  <span className="text-slate-400 text-xs">–</span>
                  <input
                    type="date"
                    value={to}
                    onChange={(e) => { setTo(e.target.value); setOffset(0); }}
                    aria-label="To date"
                    className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold bg-slate-50 dark:bg-slate-800 dark:text-slate-100 focus:outline-indigo-600"
                  />
                </div>
              </div>

              {/* Scrollable body — the only fixed-height scrolling region */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-1.5 min-h-0">
                {error && (
                  <div className="flex items-start gap-2 p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                {loading ? (
                  <div className="flex items-center justify-center py-10 text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    <span className="text-xs font-semibold">Loading transactions…</span>
                  </div>
                ) : txs.length === 0 ? (
                  <div className="text-center py-10 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 p-4">
                    <ReceiptText className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-1" />
                    <p className="font-bold text-slate-700 dark:text-slate-300 text-sm">
                      No transactions found
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      {debouncedQ || from || to
                        ? 'Try a different name, date range or clear the filters.'
                        : 'Payments will appear here as they come in.'}
                    </p>
                  </div>
                ) : (
                  txs.map((t) => {
                    const isPurchase = t.kind === 'purchase';
                    const isDeposit = t.kind === 'deposit';
                    const success =
                      t.status === 'success' || t.status === 'completed';
                    return (
                      <div
                        key={`${t.kind}-${t.reference}-${t.created_at}`}
                        className="flex items-center justify-between gap-2 text-xs p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800"
                      >
                        <div className="min-w-0">
                          <span
                            className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded uppercase ${
                              isPurchase
                                ? 'bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
                                : isDeposit
                                  ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                                  : 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
                            }`}
                          >
                            {isPurchase ? 'Purchase' : isDeposit ? 'Payin' : 'Payout'}
                          </span>
                          <span className="text-slate-600 dark:text-slate-300 ml-1.5 font-semibold line-clamp-1">
                            {t.person}
                            {t.reg_no ? ` (${t.reg_no})` : ''}
                          </span>
                          {isPurchase && (
                            <span className="block text-[9px] text-slate-500 dark:text-slate-400 truncate">
                              {t.book}
                              {t.rep ? ` — ${t.rep}` : ''}
                            </span>
                          )}
                          <span className="block text-[9px] text-slate-400 dark:text-slate-500 font-mono truncate">
                            {new Date(t.created_at).toLocaleDateString('en-NG', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                            {' · '}
                            {t.reference}
                          </span>
                        </div>
                        <div className="text-right shrink-0">
                          <span
                            className={`font-mono font-bold ${
                              isDeposit
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : isPurchase
                                  ? 'text-indigo-600 dark:text-indigo-300'
                                  : 'text-amber-600 dark:text-amber-400'
                            }`}
                          >
                            {isDeposit ? '+' : '−'}
                            {formatNaira(t.amount)}
                          </span>
                          <span
                            className={`block text-[9px] font-extrabold uppercase ${
                              success
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : t.status === 'failed'
                                  ? 'text-rose-500 dark:text-rose-400'
                                  : 'text-slate-400 dark:text-slate-500'
                            }`}
                          >
                            {t.status}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Pagination — fixed footer */}
              {total > PAGE && (
                <div className="p-3 sm:p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                  <span className="text-[10px] font-mono font-semibold text-slate-500 dark:text-slate-400">
                    Page {currentPage} of {totalPages}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        if (offset > 0) load(offset - PAGE, debouncedQ, from, to, view, repId);
                      }}
                      disabled={offset === 0 || loading}
                      className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40 cursor-pointer"
                      aria-label="Previous page"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (offset + PAGE < total) load(offset + PAGE, debouncedQ, from, to, view, repId);
                      }}
                      disabled={offset + PAGE >= total || loading}
                      className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:opacity-60 transition-colors disabled:opacity-40 cursor-pointer"
                      aria-label="Next page"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};