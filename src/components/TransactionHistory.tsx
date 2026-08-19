import React, { useState } from 'react';
import { PaymentTransaction } from '../types';
import {
  Wallet,
  Building2,
  CreditCard,
  CheckCircle2,
  Search,
  Download,
  ShieldCheck,
  Calendar,
  PlusCircle,
  MinusCircle,
} from 'lucide-react';
import { soundEffects } from '../utils/audio';

interface TransactionHistoryProps {
  transactions: PaymentTransaction[];
}

export const TransactionHistory: React.FC<TransactionHistoryProps> = ({
  transactions,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = transactions.filter(
    (t) =>
      t.bookTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.courseCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.reference.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.note ?? '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const isPoints = (t: PaymentTransaction) => t.method === 'wallet' && !!t.note;

  const formatNaira = (amount: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      maximumFractionDigits: 0,
    }).format(amount).replace('NGN', '₦');
  };

  const getMethodIcon = (m: string, isPointsTx: boolean) => {
    if (isPointsTx) return <Wallet className="w-4 h-4 text-indigo-600" />;
    switch (m) {
      case 'wallet':
        return <Wallet className="w-4 h-4 text-indigo-600" />;
      case 'bank_transfer':
        return <Building2 className="w-4 h-4 text-emerald-600" />;
      case 'card':
        return <CreditCard className="w-4 h-4 text-amber-600" />;
      default:
        return <Wallet className="w-4 h-4 text-indigo-600" />;
    }
  };

  const formatMethod = (m: string, isPointsTx: boolean) => {
    if (isPointsTx) return 'Webuy Points';
    if (m === 'card') return 'Card';
    if (m === 'wallet') return 'Points';
    return m
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const handleExportCSV = () => {
    soundEffects.playTap();
    const headers = ['Reference', 'Course Code', 'Book Title / Note', 'Amount', 'Date', 'Status'];
    const rows = filtered.flatMap((tx) => {
      const unit = isPoints(tx) ? 'pts' : '₦';
      const books = tx.books?.length ? tx.books : [];
      if (books.length === 0) {
        return [[
          tx.reference,
          '',
          `"${tx.note ?? tx.bookTitle}"`,
          `${unit}${tx.total.toLocaleString()}`,
          new Date(tx.date).toLocaleString('en-NG'),
          tx.status.toUpperCase(),
        ]];
      }
      return books.map((b) => [
        tx.reference,
        b.courseCode,
        `"${b.bookTitle}"`,
        `${unit}${b.amount.toLocaleString()}`,
        new Date(tx.date).toLocaleString('en-NG'),
        tx.status.toUpperCase(),
      ]);
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

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-slate-100">
            Transaction History
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Payments and Webuy Points activity
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by course or ref..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold bg-slate-50 dark:bg-slate-800 dark:text-slate-100 focus:outline-indigo-600"
            />
          </div>
          <button
            onClick={handleExportCSV}
            title="Export payments as CSV"
            className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
          <ShieldCheck className="w-8 h-8 text-slate-400 dark:text-slate-500 mx-auto mb-2" />
          <p className="font-bold text-slate-700 dark:text-slate-300 text-sm">No transactions found</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Your payments and points activity will appear here.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((tx) => {
            const pointsTx = isPoints(tx);
            const books = tx.books?.length
              ? tx.books
              : pointsTx
                ? []
                : [{ courseCode: tx.courseCode, bookTitle: tx.bookTitle, amount: tx.amount }];
            return (
              <div
                key={tx.id}
                className="p-4 rounded-2xl bg-slate-50/80 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 hover:bg-slate-100/80 dark:hover:bg-slate-700 transition-all"
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80 shadow-xs shrink-0">
                      {getMethodIcon(tx.method, pointsTx)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-slate-400 dark:text-slate-500 truncate block min-w-0">
                          {tx.reference}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-medium flex-wrap">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                          {new Date(tx.date).toLocaleDateString('en-NG', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </span>
                        <span className="uppercase tracking-wider font-semibold text-[10px] bg-slate-200 dark:bg-slate-700 px-1.5 py-0.2 rounded">
                          {formatMethod(tx.method, pointsTx)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.2 rounded border border-emerald-100 dark:border-emerald-800 shrink-0">
                    {pointsTx ? (
                      tx.amount >= 0
                        ? <PlusCircle className="w-3 h-3 text-emerald-600" />
                        : <MinusCircle className="w-3 h-3 text-indigo-600" />
                    ) : (
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    )}
                    {pointsTx ? 'POINTS' : 'SUCCESSFUL'}
                  </span>
                </div>

                {pointsTx ? (
                  /* Single points-activity line (deposit / purchase / refund) */
                  <div className="mt-3 pl-11 flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-700 dark:text-slate-200 font-medium line-clamp-1">
                      {tx.note}
                    </span>
                    <span
                      className={`font-mono font-bold text-sm shrink-0 ${
                        tx.amount >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-indigo-700 dark:text-indigo-300'
                      }`}
                    >
                      {tx.amount >= 0 ? '+' : ''}{tx.total.toLocaleString()} pts
                    </span>
                  </div>
                ) : (
                  <>
                    {/* Per-book breakdown */}
                    <div className="mt-3 space-y-1.5">
                      {books.map((b, i) => (
                        <div
                          key={`${tx.id}-${i}`}
                          className="flex items-center justify-between gap-2 pl-11"
                        >
                          <div className="min-w-0">
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-mono mr-1.5">
                              {b.courseCode}
                            </span>
                            <span className="text-xs text-slate-700 dark:text-slate-200 font-medium line-clamp-1">
                              {b.bookTitle}
                            </span>
                          </div>
                          <span className="font-mono font-bold text-xs text-slate-900 dark:text-slate-100 shrink-0">
                            {formatNaira(b.amount)}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Total */}
                    <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between pl-11">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {books.length > 1 ? 'Total Paid' : 'Amount Paid'}
                      </span>
                      <span className="text-sm font-extrabold text-slate-900 dark:text-slate-100 font-mono">
                        {formatNaira(tx.total)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
