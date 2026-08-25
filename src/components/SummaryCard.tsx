import React, { useState } from 'react';
import { StudentProfile, Textbook } from '../types';
import { Eye, EyeOff, CreditCard, ArrowRight, Copy, Check, RefreshCw } from 'lucide-react';

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

  const unpaidBooks = textbooks.filter((b) => b.status === 'unpaid');
  const paidBooks = textbooks.filter((b) => b.status === 'paid' || b.status === 'collected');

  const totalAssigned = textbooks.length;
  const booksAllPaid = totalAssigned > 0 && unpaidBooks.length === 0;
  const completionPercentage = totalAssigned > 0 ? Math.round((paidBooks.length / totalAssigned) * 100) : 0;

  return (
    <div className="rounded-xl p-3 border border-slate-200 dark:border-[#2A2A2A] flex flex-col gap-2.5 relative bg-slate-200 dark:bg-[#161616]">
      {/* Profile row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <img
            src={profile.avatarUrl}
            alt={profile.fullName}
            className="w-9 h-9 rounded-full object-cover shrink-0"
            referrerPolicy="no-referrer"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-sm text-slate-900 dark:text-white truncate">{profile.fullName}</h2>
              {accountNumber && (
                <button
                  onClick={async () => {
                    try { await navigator.clipboard?.writeText(accountNumber); } catch { /* ignore */ }
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                  className="text-slate-400 dark:text-gray-400 hover:text-slate-700 dark:hover:text-white transition-colors"
                  aria-label="Copy account number"
                >
                  {copied ? <Check className="w-3 h-3 text-indigo-600 dark:text-indigo-400" /> : <Copy className="w-3 h-3" />}
                </button>
              )}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-gray-400 flex items-center gap-1">
              {accountNumber && <><span className="font-mono">{accountNumber}</span><span className="text-slate-300 dark:text-gray-600">•</span></>}
              <span className="text-indigo-600 dark:text-indigo-400">via {bankName || 'PocketFi'}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-0.5 shrink-0">
          <button
            onClick={onVerify}
            disabled={verifying}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white px-2 py-0.5 rounded-md text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3 h-3 ${verifying ? 'animate-spin' : ''}`} />
            Verify
          </button>
          <span className="text-[9px] text-slate-500 dark:text-gray-400 text-right leading-tight">
            Press verify to see funds
          </span>
        </div>
      </div>

      {/* Points row */}
      <div className="flex items-end justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-slate-500 dark:text-gray-400 text-[11px]">Available Points</span>
          <div className="flex items-center gap-2">
            <span className="text-indigo-600 dark:text-indigo-400 text-xl font-extrabold font-mono tracking-tight">
              {showBalance ? points.toLocaleString() : '••••••'}
            </span>
            <button
              onClick={() => setShowBalance(!showBalance)}
              className="text-slate-400 dark:text-gray-500 hover:text-slate-700 dark:hover:text-white transition-colors"
              aria-label="Toggle points visibility"
            >
              {showBalance ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-6 h-6 shrink-0">
            <svg className="w-6 h-6 -rotate-90" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15" fill="none" stroke="#E2E8F0" className="dark:stroke-[#2A2A2A]" strokeWidth="3" />
              <circle
                cx="18" cy="18" r="15" fill="none"
                stroke="#5D21D1"
                strokeWidth="3"
                strokeDasharray={`${completionPercentage} ${100 - completionPercentage}`}
                strokeDashoffset="25"
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[8px] font-mono font-bold text-slate-700 dark:text-white">
              {completionPercentage}
            </span>
          </div>
          <span className="text-[11px] text-slate-500 dark:text-gray-400">
            {paidBooks.length}/{totalAssigned} collected
          </span>
        </div>
      </div>

      {/* Pay All button */}
      {unpaidBooks.length > 0 && (
        <button
          onClick={onPayAll}
          className="self-start flex items-center gap-1.5 px-2.5 py-1.5 rounded-full transition-all bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-md shadow-indigo-600/30 cursor-pointer"
        >
          <CreditCard className="w-3.5 h-3.5" />
          <span className="text-[10px]">Pay All ({unpaidBooks.length} due)</span>
          <ArrowRight className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};
