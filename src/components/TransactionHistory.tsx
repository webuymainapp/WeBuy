import React, { useMemo, useState } from 'react';
import { PaymentTransaction, TransactionCategory } from '../types';
import {
  BookOpen,
  Wallet,
  RotateCcw,
  Search,
  Download,
  ReceiptText,
} from 'lucide-react';
import { soundEffects } from '../utils/audio';

type HistoryFilter = 'all' | TransactionCategory | 'issues';

interface TransactionHistoryProps {
  transactions: PaymentTransaction[];
  loading?: boolean;
}

const CATEGORY_META: Record<
  TransactionCategory,
  { label: string; icon: typeof BookOpen; tile: string; iconCls: string }
> = {
  purchase: {
    label: 'Purchase',
    icon: BookOpen,
    tile: 'bg-indigo-50 dark:bg-indigo-950/40',
    iconCls: 'text-indigo-600 dark:text-indigo-400',
  },
  topup: {
    label: 'Points',
    icon: Wallet,
    tile: 'bg-emerald-50 dark:bg-emerald-950/40',
    iconCls: 'text-emerald-600 dark:text-emerald-400',
  },
  refund: {
    label: 'Refund',
    icon: RotateCcw,
    tile: 'bg-amber-50 dark:bg-amber-950/40',
    iconCls: 'text-amber-600 dark:text-amber-400',
  },
};

const STATUS_META: Record<
  PaymentTransaction['status'],
  { label: string; cls: string }
> = {
  successful: {
    label: 'Completed',
    cls: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300',
  },
  pending: {
    label: 'Pending',
    cls: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300',
  },
  failed: {
    label: 'Failed',
    cls: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300',
  },
};

const normalizeStatus = (s: string): PaymentTransaction['status'] =>
  s === 'success' ? 'successful' : s === 'successful' || s === 'pending' || s === 'failed' ? s : 'failed';

const formatNaira = (amount: number) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  })
    .format(amount)
    .replace('NGN', '₦');

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-NG', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
};

/** The product a student paid for = "COURSE CODE - course title". Falls back to
 *  the stored book title when a course title isn't available. */
const productLabel = (t: PaymentTransaction) => {
  const code = t.courseCode !== 'COURSE' ? t.courseCode : (t.books?.[0]?.courseCode ?? '');
  const title = t.courseTitle || t.books?.[0]?.courseTitle || '';
  if (!title) return t.books?.[0]?.bookTitle ?? t.note ?? t.bookTitle;
  return code ? `${code} - ${title}` : title;
};

export const TransactionHistory: React.FC<TransactionHistoryProps> = ({
  transactions,
  loading = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<HistoryFilter>('all');

  const counts = useMemo(() => {
    const c = { all: transactions.length, purchase: 0, topup: 0, refund: 0, issues: 0 };
    for (const t of transactions) {
      if (t.category === 'purchase') c.purchase += 1;
      if (t.category === 'topup') c.topup += 1;
      if (t.category === 'refund') c.refund += 1;
      if (normalizeStatus(t.status) !== 'successful') c.issues += 1;
    }
    return c;
  }, [transactions]);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return transactions.filter((t) => {
      if (filter === 'issues') {
        if (normalizeStatus(t.status) === 'successful') return false;
      } else if (filter !== 'all' && t.category !== filter) {
        return false;
      }
      if (!q) return true;
      const books = t.books?.length
        ? t.books.map((b) => `${b.bookTitle} ${b.courseTitle ?? ''} ${b.courseCode}`).join(' ')
        : `${t.bookTitle} ${t.courseTitle ?? ''} ${t.courseCode}`;
      return (
        books.toLowerCase().includes(q) ||
        (t.reference ?? '').toLowerCase().includes(q) ||
        (t.note ?? '').toLowerCase().includes(q)
      );
    });
  }, [transactions, filter, searchTerm]);

  const groups = useMemo(() => {
    const map = new Map<string, PaymentTransaction[]>();
    for (const t of filtered) {
      const key = new Date(t.date).toISOString().slice(0, 7);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  const monthLabel = (key: string) => {
    const d = new Date(`${key}-01T00:00:00`);
    return d.toLocaleString('en-NG', { month: 'long', year: 'numeric' }).toUpperCase();
  };

  const monthTotals = (list: PaymentTransaction[]) =>
    list.reduce(
      (acc, t) => {
        const status = normalizeStatus(t.status);
        if (status === 'failed') return acc;
        if (t.direction === 'in') acc.received += t.total;
        else acc.spent += t.total;
        return acc;
      },
      { spent: 0, received: 0 },
    );

  const handleExportCSV = () => {
    soundEffects.playTap();
    const headers = ['Reference', 'Category', 'Book / Note', 'Amount (₦)', 'Date', 'Status'];
    const rows = filtered.map((t) => {
      const status = normalizeStatus(t.status);
      const books = t.books?.length
        ? t.books.map((b) => `"${b.courseCode} - ${b.courseTitle || b.bookTitle}"`).join('; ')
        : `"${t.note ?? t.bookTitle}"`;
      return [
        t.reference,
        t.category,
        books,
        `${t.direction === 'in' ? '+' : '-'}${t.total}`,
        new Date(t.date).toLocaleString('en-NG'),
        status.toUpperCase(),
      ];
    });
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Webuy_Transactions_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderSkeleton = () => (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-xs overflow-hidden">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-4">
          <div className="w-10 h-10 rounded-2xl bg-slate-200 dark:bg-slate-700 animate-pulse shrink-0" />
          <div className="flex-1 space-y-2 min-w-0">
            <div className="h-3 w-2/5 rounded-md bg-slate-200 dark:bg-slate-700 animate-pulse" />
            <div className="h-2.5 w-3/5 rounded-md bg-slate-200 dark:bg-slate-700 animate-pulse" />
          </div>
          <div className="h-3.5 w-16 rounded-md bg-slate-200 dark:bg-slate-700 animate-pulse shrink-0" />
        </div>
      ))}
    </div>
  );

  const renderEmpty = (title: string, body: string) => (
    <div className="text-center py-14 bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-200 dark:border-slate-700 px-6">
      <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3">
        <ReceiptText className="w-7 h-7 text-slate-400 dark:text-slate-500" />
      </div>
      <h3 className="font-bold text-slate-800 dark:text-slate-200 text-base">{title}</h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs mx-auto">{body}</p>
    </div>
  );

  const filterPills: { key: HistoryFilter; label: string; active: string; idle: string }[] = [
    {
      key: 'all',
      label: 'All',
      active: 'bg-slate-900 text-white shadow-xs',
      idle: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700',
    },
    {
      key: 'purchase',
      label: 'Purchases',
      active: 'bg-indigo-600 text-white shadow-xs',
      idle: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-950/70',
    },
    {
      key: 'topup',
      label: 'Wallet',
      active: 'bg-emerald-600 text-white shadow-xs',
      idle: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/70',
    },
    {
      key: 'refund',
      label: 'Refunds',
      active: 'bg-amber-500 text-white shadow-xs',
      idle: 'bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-950/70',
    },
    {
      key: 'issues',
      label: 'Issues',
      active: 'bg-rose-600 text-white shadow-xs',
      idle: 'bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-950/70',
    },
  ];

  return (
    <section className="space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
            Transactions
          </h2>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Payments, points &amp; refunds
          </p>
        </div>
        <button
          onClick={handleExportCSV}
          disabled={filtered.length === 0}
          className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-300 hover:border-indigo-200 disabled:opacity-50 disabled:hover:text-slate-600 dark:disabled:hover:text-slate-300 disabled:cursor-not-allowed text-xs font-bold transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Export CSV</span>
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search books, courses, or references..."
          className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-indigo-600 shadow-xs"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-1.5">
        {filterPills.map((p) => {
          const active = filter === p.key;
          return (
            <button
              key={p.key}
              onClick={() => {
                soundEffects.playTap();
                setFilter(p.key);
              }}
              className={`px-3.5 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all text-xs ${
                active ? p.active : p.idle
              }`}
            >
              {p.label} <span className="opacity-70 font-semibold">({counts[p.key]})</span>
            </button>
          );
        })}
      </div>

      {/* Loading skeleton */}
      {loading && renderSkeleton()}

      {/* Empty states */}
      {!loading && transactions.length === 0 &&
        renderEmpty(
          'No transactions yet',
          'Your textbook purchases, wallet top-ups and refunds will appear here.',
        )}

      {!loading && transactions.length > 0 && filtered.length === 0 &&
        renderEmpty(
          'Nothing matches',
          'Try a different search or filter — no transactions fit that combination.',
        )}

      {/* Grouped list */}
      {!loading && filtered.length > 0 && (
        <div className="space-y-4">
          {groups.map(([key, list]) => {
            const { spent, received } = monthTotals(list);
            return (
              <div key={key}>
                <div className="flex items-center justify-between gap-3 px-1 mb-1.5">
                  <h3 className="text-[11px] font-extrabold tracking-[0.15em] text-slate-400 dark:text-slate-500 uppercase">
                    {monthLabel(key)}
                  </h3>
                  <div className="flex items-center gap-3">
                    {spent > 0 && (
                      <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                        Spent{' '}
                        <span className="text-slate-900 dark:text-slate-100 font-mono font-bold">
                          {formatNaira(spent)}
                        </span>
                      </span>
                    )}
                    {received > 0 && (
                      <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                        Received{' '}
                        <span className="font-mono font-bold">{formatNaira(received)}</span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-xs overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
                  {list.map((t) => {
                    const status = normalizeStatus(t.status);
                    const meta = CATEGORY_META[t.category] ?? CATEGORY_META.purchase;
                    const Icon = meta.icon;
                    const incoming = t.direction === 'in';
                    const dateStr = formatDateTime(t.date);
                    const isMulti =
                      t.category === 'purchase' && (t.books?.length ?? 0) > 1;
                    const title =
                      t.category === 'topup'
                        ? 'Wallet Top-up'
                        : t.category === 'refund'
                          ? 'Book Refund'
                          : isMulti
                            ? `${t.books!.length} textbooks`
                            : productLabel(t);
                    const sub =
                      t.category === 'topup'
                        ? dateStr
                        : `${isMulti ? `${t.books!.length} items` : meta.label} · ${dateStr}`;
                    const statusMeta = STATUS_META[status];

                    return (
                      <div
                        key={t.id}
                        className="flex items-center gap-3 px-4 py-3.5"
                      >
                        <span
                          className={`shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center ${meta.tile}`}
                        >
                          <Icon className={`w-[18px] h-[18px] ${meta.iconCls}`} />
                        </span>

                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-bold text-slate-900 dark:text-slate-100 truncate">
                            {title}
                          </p>
                          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            {sub}
                          </p>
                        </div>

                        <div className="shrink-0 text-right">
                          <p
                            className={`font-mono font-extrabold text-sm ${
                              status === 'failed'
                                ? 'text-slate-400 dark:text-slate-500'
                                : incoming
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-slate-900 dark:text-slate-100'
                            }`}
                          >
                            {incoming ? '+' : '−'}
                            {formatNaira(t.total)}
                          </p>
                          <span
                            className={`mt-1 inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold ${statusMeta.cls}`}
                          >
                            {statusMeta.label}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};