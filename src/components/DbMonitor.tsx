import React, { useCallback, useEffect, useState } from 'react';
import {
  Database,
  HardDrive,
  Users,
  BookOpen,
  Wallet,
  MessageSquareWarning,
  Bell,
  Loader2,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Layers,
  Receipt,
  Trash2,
  Clock,
  ChevronRight,
  X,
} from 'lucide-react';
import { dbApi, ApiError, type DbMonitorData } from '../lib/api';

interface DbMonitorProps {
  onToast: (msg: string) => void;
}

const formatBytes = (b: number) => {
  if (b >= 1024 * 1024 * 1024) return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.round(b / 1024)} KB`;
};

export const DbMonitor: React.FC<DbMonitorProps> = ({ onToast }) => {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<DbMonitorData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await dbApi.monitor());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load database stats');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load once on mount so the trigger card can show a health summary.
  useEffect(() => {
    load();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      setData(await dbApi.monitor());
      onToast('Database stats refreshed.');
    } catch (err) {
      onToast(err instanceof ApiError ? err.message : 'Could not refresh database stats');
    } finally {
      setRefreshing(false);
    }
  };

  const card = 'bg-white dark:bg-neutral-900 p-4 rounded-3xl border border-slate-200 dark:border-neutral-700 shadow-sm';
  const label = 'text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400';

  // Compact health summary for the trigger card
  const summary = data
    ? { size: data.db.size, students: data.counts.students, txns: data.counts.wallet_txns }
    : null;

  return (
    <>
      {/* Trigger card — opens the modal */}
      <div className="bg-white dark:bg-neutral-900 rounded-3xl p-5 border border-slate-200 dark:border-neutral-700 shadow-sm">
        <button
          onClick={() => {
            setOpen(true);
            if (!data) load();
          }}
          className="w-full flex items-center gap-3 text-left cursor-pointer group min-w-0"
        >
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900 flex items-center justify-center shrink-0">
            <Database className="w-5 h-5 text-emerald-600 dark:text-emerald-300" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
              Database Monitor
              {summary && (
                <span className="text-[10px] font-extrabold font-mono px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                  {summary.size}
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
              {summary
                ? `${summary.students} students · ${summary.txns} wallet transactions`
                : 'Open to view DB health, sizes and cleanup recommendations'}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 group-hover:text-emerald-500 transition-colors" />
        </button>
      </div>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setOpen(false)}
          />
          <div className="relative w-full max-w-2xl bg-slate-100 dark:bg-black rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-neutral-800 overflow-hidden max-h-[90dvh] flex flex-col">
            {/* Modal header */}
            <div className="p-4 sm:p-5 bg-slate-900 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
                  <Database className="w-5 h-5 text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-base text-white leading-tight">Database Monitor</h3>
                  <p className="text-[11px] text-slate-400 truncate">
                    {data ? `${data.db.name} · ${data.db.size} · ${data.db.connections} connections` : 'Chief admin · read-only'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={refresh}
                  disabled={refreshing}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5">
              {loading ? (
                <div className={card}>
                  <div className="flex items-center justify-center gap-2 py-8 text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-xs font-semibold">Reading database stats…</span>
                  </div>
                </div>
              ) : error || !data ? (
                <div className={card}>
                  <div className="flex items-start gap-2 p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error || 'Could not load database stats'}</span>
                  </div>
                </div>
              ) : (
                <DbMonitorContent data={data} label={label} card={card} />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

function DbMonitorContent({
  data,
  label,
  card,
}: {
  data: DbMonitorData;
  label: string;
  card: string;
}) {
  const n = data.counts;
  const totalBytes = data.tables.reduce((s, t) => s + t.sizeBytes, 0);
  const cleanupNeeded =
    n.textbooks_deleted > 0 ||
    data.notifications.expired_verification_tokens > 0 ||
    data.notifications.expired_password_resets > 0 ||
    data.notifications.stale_signups > 0;

  return (
    <div className="space-y-3">
      {/* Overview metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={card}>
          <div className="flex items-center justify-between">
            <span className={label}>Total Size</span>
            <HardDrive className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="mt-2 text-2xl font-black text-emerald-700 dark:text-emerald-300 font-mono">
            {data.db.size}
          </p>
          <p className="text-[10px] text-slate-500 font-semibold mt-0.5">
            {formatBytes(totalBytes)} in tables
          </p>
        </div>
        <div className={card}>
          <div className="flex items-center justify-between">
            <span className={label}>Students</span>
            <Users className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="mt-2 text-2xl font-black text-slate-900 dark:text-slate-100 font-mono">{n.students}</p>
          <p className="text-[10px] text-slate-500 font-semibold mt-0.5">{n.classes} classes</p>
        </div>
        <div className={card}>
          <div className="flex items-center justify-between">
            <span className={label}>Active Books</span>
            <BookOpen className="w-4 h-4 text-amber-600" />
          </div>
          <p className="mt-2 text-2xl font-black text-slate-900 dark:text-slate-100 font-mono">
            {n.textbooks_active}
          </p>
          <p className="text-[10px] text-slate-500 font-semibold mt-0.5">
            {n.textbooks_deleted} soft-deleted
          </p>
        </div>
        <div className={card}>
          <div className="flex items-center justify-between">
            <span className={label}>Wallet TXNs</span>
            <Wallet className="w-4 h-4 text-purple-600" />
          </div>
          <p className="mt-2 text-2xl font-black text-slate-900 dark:text-slate-100 font-mono">{n.wallet_txns}</p>
          <p className="text-[10px] text-slate-500 font-semibold mt-0.5">{n.assignments} assignments</p>
        </div>
      </div>

      {/* Cleanup alert */}
      <div
        className={`flex items-start gap-3 rounded-2xl p-4 border text-xs font-semibold ${
          cleanupNeeded
            ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300'
            : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
        }`}
      >
        {cleanupNeeded ? (
          <MessageSquareWarning className="w-4 h-4 shrink-0 mt-0.5" />
        ) : (
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
        )}
        <div>
          {cleanupNeeded ? (
            <>
              <p className="mb-1">Cleanup recommended:</p>
              <ul className="space-y-0.5 text-slate-600 dark:text-slate-300 font-medium">
                {n.textbooks_deleted > 0 && <li>· {n.textbooks_deleted} soft-deleted textbooks pending 24h purge</li>}
                {data.notifications.expired_verification_tokens > 0 && (
                  <li>· {data.notifications.expired_verification_tokens} expired verification tokens</li>
                )}
                {data.notifications.expired_password_resets > 0 && (
                  <li>· {data.notifications.expired_password_resets} expired password resets</li>
                )}
                {data.notifications.stale_signups > 0 && (
                  <li>· {data.notifications.stale_signups} stale/unverified signups</li>
                )}
              </ul>
            </>
          ) : (
            <p>Database is healthy — no cleanup needed right now.</p>
          )}
        </div>
      </div>

      {/* Table sizes */}
      <div className={card}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-600" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
              Table Sizes
            </span>
          </div>
          <span className="text-[10px] font-semibold text-slate-400">largest first</span>
        </div>
        <div className="space-y-2">
          {data.tables.map((t) => {
            const pct = totalBytes > 0 ? Math.round((t.sizeBytes / totalBytes) * 100) : 0;
            return (
              <div key={t.tableName} className="flex items-center gap-3">
                <div className="w-32 sm:w-40 truncate text-xs font-bold text-slate-700 dark:text-slate-300 font-mono">
                  {t.tableName}
                </div>
                <div className="flex-1 h-2.5 bg-slate-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-indigo-500"
                    style={{ width: `${Math.max(pct, 2)}%` }}
                  />
                </div>
                <div className="w-16 text-right text-[11px] font-mono font-semibold text-slate-500 dark:text-slate-400">
                  {t.size}
                </div>
                <div className="w-20 text-right text-[10px] text-slate-400 dark:text-slate-500">
                  {t.approxRows.toLocaleString()} rows
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Transaction breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className={card}>
          <div className="flex items-center gap-2 mb-3">
            <Receipt className="w-4 h-4 text-purple-600" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
              Wallet Ledger
            </span>
          </div>
          <div className="space-y-2">
            {data.transactions.map((t) => (
              <div key={t.kind} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                      t.kind === 'deposit'
                        ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                        : t.kind === 'purchase'
                          ? 'bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
                          : 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
                    }`}
                  >
                    {t.kind}
                  </span>
                  <span className="text-[11px] font-mono font-semibold text-slate-500">{t.n} txns</span>
                </div>
                <div className="text-[11px] font-mono font-semibold text-slate-600 dark:text-slate-300">
                  {t.credits.toLocaleString()} in · {t.debits.toLocaleString()} out
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-3">
            Financial ledger — always kept for audit.
          </p>
        </div>

        {/* Cleanup candidates */}
        <div className={card}>
          <div className="flex items-center gap-2 mb-3">
            <Trash2 className="w-4 h-4 text-amber-600" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
              Cleanup Candidates
            </span>
          </div>
          <div className="space-y-2">
            {[
              { label: 'Read notifications', n: data.notifications.read_notifications, icon: Bell },
              { label: 'Unread notifications', n: data.notifications.unread_notifications, icon: Bell },
              { label: 'Expired verification tokens', n: data.notifications.expired_verification_tokens, icon: Clock },
              { label: 'Expired password resets', n: data.notifications.expired_password_resets, icon: Clock },
              { label: 'Stale signups', n: data.notifications.stale_signups, icon: Users },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between">
                <span className="text-xs text-slate-600 dark:text-slate-300">{row.label}</span>
                <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-200">{row.n}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-3">
            Safe to purge periodically — see the cleanup job.
          </p>
        </div>
      </div>

      <p className="text-[10px] text-slate-400 dark:text-slate-500 px-1">
        Generated {new Date(data.db.generatedAt).toLocaleString()} · chief admin only · read-only view
      </p>
    </div>
  );
}
