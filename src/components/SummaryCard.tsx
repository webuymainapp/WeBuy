import React, { useState } from 'react';
import { StudentProfile, Textbook } from '../types';
import { Eye, EyeOff, CreditCard, ArrowRight, Banknote, Copy, Check, RefreshCw } from 'lucide-react';

interface SummaryCardProps {
  profile: StudentProfile;
  textbooks: Textbook[];
  onPayAll: () => void;
  onFilterChange: (filter: 'all' | 'unpaid' | 'paid' | 'collected') => void;
  activeFilter: string;
  points: number;
  accountNumber: string;
  bankName: string;
  accountName: string;
  onCopyAccount: () => void;
  onVerify: () => void;
  verifying: boolean;
}

export const SummaryCard: React.FC<SummaryCardProps> = ({
  profile,
  textbooks,
  onPayAll,
  points,
  accountNumber,
  bankName,
  accountName,
  onCopyAccount,
  onVerify,
  verifying,
}) => {
  const [showBalance, setShowBalance] = useState(true);
  const [copied, setCopied] = useState(false);

  // Calculate totals
  const unpaidBooks = textbooks.filter((b) => b.status === 'unpaid');
  const paidBooks = textbooks.filter((b) => b.status === 'paid' || b.status === 'collected');

  const totalAssigned = textbooks.length;
  const booksAllPaid = totalAssigned > 0 && unpaidBooks.length === 0;
  const completionPercentage = totalAssigned > 0 ? Math.round((paidBooks.length / totalAssigned) * 100) : 0;

  return (
    <div className="bg-slate-900 text-white rounded-2xl px-4 py-3 border border-slate-800 flex flex-col gap-2.5">
      {/* Top Row: Session + Pay All */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
          <span className="text-[11px] font-semibold text-slate-300 tracking-wide uppercase truncate">
            {profile.academicSession}
          </span>
        </div>

        {unpaidBooks.length > 0 && (
          <button
            onClick={onPayAll}
            className="shrink-0 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] text-white font-bold text-[11px] flex items-center gap-1.5 shadow-md shadow-indigo-600/30 transition-all"
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Pay All ({unpaidBooks.length} due)</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Points balance row */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
        <div className="flex items-baseline gap-2 shrink-0">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Webuy Points
          </span>
          <span className="text-xl font-extrabold tracking-tight text-white font-mono">
            {showBalance ? points.toLocaleString() : '••••••'}
          </span>
          <button
            onClick={() => setShowBalance(!showBalance)}
            className="text-slate-400 hover:text-white transition-colors p-1 rounded-md hover:bg-slate-800"
            aria-label="Toggle points visibility"
          >
            {showBalance ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
          {unpaidBooks.length > 0 && (
            <span className="text-[11px] font-semibold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-md border border-amber-400/20 shrink-0">
              {unpaidBooks.length} Unpaid
            </span>
          )}
          {unpaidBooks.length === 0 && booksAllPaid && (
            <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-md border border-emerald-400/20 shrink-0">
              Fully Paid 🎉
            </span>
          )}
        </div>

        <div className="flex-1 flex items-center gap-2.5 min-w-0">
          <span className="text-[10px] font-semibold text-slate-400 whitespace-nowrap">
            {paidBooks.length}/{totalAssigned} collected & ready
          </span>
          <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 rounded-full transition-all duration-500"
              style={{ width: `${completionPercentage}%` }}
            />
          </div>
          <span className="text-[10px] font-mono font-bold text-emerald-400 shrink-0">
            {completionPercentage}%
          </span>
        </div>
      </div>

      {/* Virtual account sub-card — where students fund their points */}
      {accountNumber ? (
        <div className="rounded-xl bg-slate-800/70 border border-slate-700/60 px-3 py-2.5 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
              <Banknote className="w-3 h-3 text-emerald-400" />
              Fund your points — transfer to
            </p>
            <p className="text-xs font-bold text-slate-200 truncate">{accountName || profile.fullName}</p>
            <p className="text-sm font-mono font-bold text-emerald-300 tracking-wide truncate">
              {accountNumber}
            </p>
            <p className="text-[10px] text-slate-400 truncate">via {bankName || 'PocketFi'}</p>
          </div>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard?.writeText(accountNumber);
              } catch {
                /* ignore */
              }
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="shrink-0 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-950 text-emerald-300 font-bold text-[10px] flex items-center gap-1 border border-slate-700 transition-colors"
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            onClick={onVerify}
            disabled={verifying}
            className="shrink-0 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold text-[10px] flex items-center gap-1 border border-emerald-500/50 transition-colors cursor-pointer"
            title="Check for money that landed in this account and add it to your points"
          >
            <RefreshCw className={`w-3 h-3 ${verifying ? 'animate-spin' : ''}`} />
            {verifying ? 'Checking…' : 'Verify'}
          </button>
        </div>
      ) : (
        <p className="text-[10px] text-slate-500">Funding account unavailable.</p>
      )}
    </div>
  );
};
