import React, { useCallback, useEffect, useState } from 'react';
import {
  Wallet,
  TrendingUp,
  Scale,
  Loader2,
  AlertCircle,
  ChevronDown,
} from 'lucide-react';
import { accountApi, repApi, ApiError, type AccountEntry } from '../lib/api';

interface AccountBalanceProps {
  onToast: (msg: string) => void;
  isChief: boolean;
  refreshKey?: number;
}

const formatNaira = (amount: number) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  })
    .format(amount)
    .replace('NGN', '₦');

export const AccountBalance: React.FC<AccountBalanceProps> = ({ onToast, isChief, refreshKey = 0 }) => {
  const [data, setData] = useState<{
    balance: number;
    textbookValue: number;
    withdrawals: number;
    livePocketFi: number | null;
    userWallets: number;
    recent: AccountEntry[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [revenue, setRevenue] = useState<{ revenue: number; paidBooks: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [acc, rev] = await Promise.all([
        accountApi.get(),
        repApi.getRevenue(),
      ]);
      setData(acc);
      setRevenue(rev);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load account balance');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-3xl p-4 sm:p-5 border border-slate-200 dark:border-neutral-700 shadow-sm space-y-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 text-left cursor-pointer group"
      >
        <Wallet className="w-4 h-4 text-emerald-600 shrink-0 group-hover:text-emerald-500 transition-colors" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-base">
              Collections & Spending
            </h3>
            {data && (
              <span className="font-mono font-black text-sm text-emerald-600 dark:text-emerald-400">
                {formatNaira(data.balance)} left
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
            Track what students paid, what you have spent on books, and what should be left in the bank.
          </p>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
      <div className="max-h-[70vh] overflow-y-auto space-y-4 pr-1">

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          <span className="text-xs font-semibold">Loading balance…</span>
        </div>
      ) : data ? (
        <>
          {/* Total Money for Textbooks in PocketFi */}
          <div className="bg-slate-900 text-white rounded-2xl p-5 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  Total Money for Textbooks in PocketFi
                </p>
                <p className="text-2xl sm:text-3xl font-black font-mono mt-1">
                  {formatNaira(data.balance)}
                </p>
                <p className="text-[10px] text-slate-400 mt-1">
                  Textbook purchases − withdrawals
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5 max-w-xs">
                  Money students have actually spent on textbooks. Unspent points in students&apos; wallets aren&apos;t counted yet.
                </p>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                <Scale className="w-5 h-5" />
              </div>
            </div>
            {isChief && data.livePocketFi != null && (
              <span className="self-end px-2 py-0.5 rounded-full bg-emerald-500/80 text-white text-[10px] font-bold">
                Live PocketFi: {formatNaira(data.livePocketFi)}
              </span>
            )}
            {isChief && (
              <span className="self-end px-2 py-0.5 rounded-full bg-rose-500/80 text-white text-[10px] font-bold">
                Users' Unspent: {formatNaira(data.userWallets ?? 0)}
              </span>
            )}
          </div>

          {/* Your revenue from your own books (PocketFi charge excluded) */}
          {revenue && (
            <div className="bg-emerald-50/60 dark:bg-emerald-950/40 rounded-2xl p-3.5 border border-emerald-200/70 dark:border-emerald-800/70">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                {isChief ? 'Total Revenue' : 'Your Revenue'}
              </p>
              <p className="text-lg font-black font-mono text-emerald-700 dark:text-emerald-300 mt-1">
                {formatNaira(revenue.revenue)}
              </p>
              <p className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 mt-0.5">
                From your {revenue.paidBooks} paid book{revenue.paidBooks === 1 ? '' : 's'}
              </p>
            </div>
          )}

        </>
      ) : null}
      </div>
      )}
    </div>
  );
};
