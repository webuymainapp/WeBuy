import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Users, ShieldCheck, UserX, Search, Loader2, AlertCircle, Shield, X, UserPlus } from 'lucide-react';
import { repApi, ApiError } from '../lib/api';
import type { PortalUser } from '../types';
import { soundEffects } from '../utils/audio';

interface UsersManagementProps {
  currentUserRegNo: string;
  onToast: (msg: string) => void;
}

export const UsersManagement: React.FC<UsersManagementProps> = ({
  currentUserRegNo,
  onToast,
}) => {
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await repApi.getUsers());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const toggleRole = async (u: PortalUser) => {
    if (busyId) return;
    const nextRole = u.role === 'class_rep' ? 'student' : 'class_rep';
    setBusyId(u.id);
    try {
      await repApi.setUserRole(u.id, nextRole);
      soundEffects.playSuccessChime();
      onToast(
        nextRole === 'class_rep'
          ? `Rep panel granted to ${u.fullName}.`
          : `Rep panel removed from ${u.fullName}.`,
      );
      await load();
    } catch (err) {
      soundEffects.playError();
      onToast(err instanceof ApiError ? err.message : 'Could not update role');
    } finally {
      setBusyId(null);
    }
  };

  const filtered = users.filter((u) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      u.fullName.toLowerCase().includes(q) ||
      u.regNo.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)
    );
  });

  const repCount = users.filter((u) => u.role !== 'student').length;

  return (
    <>
      {/* Trigger card — opens the users modal */}
      <div className="bg-white dark:bg-neutral-900 rounded-3xl p-4 sm:p-5 border border-slate-200 dark:border-neutral-700 shadow-sm">
        <button
          onClick={() => {
            soundEffects.playTap();
            setOpen(true);
          }}
          className="w-full flex items-center gap-2 text-left cursor-pointer group min-w-0"
        >
          <Shield className="w-4 h-4 text-emerald-600 shrink-0" />
          <div className="min-w-0 flex-1">
            <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
              Manage Rep Access
              <span className="text-[10px] font-extrabold font-mono px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                {repCount} rep{repCount === 1 ? '' : 's'}
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
              See every account and decide who gets the Class Rep panel.
            </p>
          </div>
          <UserPlus className="w-4 h-4 text-slate-400 shrink-0 group-hover:text-indigo-500 transition-colors" />
        </button>
      </div>

      {/* Users modal */}
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center">
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
              className="relative w-full max-w-md bg-white dark:bg-neutral-900 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-neutral-700 overflow-hidden max-h-[85dvh] flex flex-col"
            >
              {/* Header */}
              <div className="p-4 sm:p-5 bg-slate-900 dark:bg-neutral-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-base text-white leading-tight">
                      Manage Rep Access
                    </h3>
                    <p className="text-[11px] text-slate-400 truncate">
                      {users.length} accounts • {repCount} rep{repCount === 1 ? '' : 's'}
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

              {/* Search */}
              <div className="p-4 sm:p-5 pb-0">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search name, Reg No or email..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-neutral-700 text-xs font-semibold bg-slate-50 dark:bg-neutral-800 dark:text-slate-100 focus:outline-indigo-600"
                  />
                </div>
              </div>

              {/* Users list */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-2">
                {error && (
                  <div className="flex items-start gap-2 p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                {loading ? (
                  <div className="flex items-center justify-center py-10 text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    <span className="text-xs font-semibold">Loading accounts…</span>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-10 bg-slate-50 dark:bg-neutral-800 rounded-2xl border border-dashed border-slate-200 dark:border-neutral-700 p-4">
                    <Users className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-1" />
                    <p className="font-bold text-slate-700 dark:text-slate-300 text-sm">No accounts found</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">Try a different search.</p>
                  </div>
                ) : (
                  filtered.map((u) => {
                    const isRep = u.role !== 'student';
                    const isChief = u.role === 'chief_admin';
                    const isSelf = u.regNo === currentUserRegNo;
                    return (
                      <div
                        key={u.id}
                        className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                          isRep
                            ? 'bg-emerald-50/40 dark:bg-emerald-950/40 border-emerald-200/80 dark:border-emerald-800/80'
                            : 'bg-slate-50/50 dark:bg-neutral-800/50 border-slate-200 dark:border-neutral-700'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm shrink-0 ${
                              isRep ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-neutral-700 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            {u.fullName
                              .split(' ')
                              .map((n) => n[0])
                              .slice(0, 2)
                              .join('')
                              .toUpperCase()}
                          </div>
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">{u.fullName}</h4>
                              {isSelf && (
                                <span className="text-[9px] bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-extrabold px-1.5 py-0.2 rounded uppercase">
                                  You
                                </span>
                              )}
                              {isRep && (
                                <span className="text-[9px] bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-extrabold px-1.5 py-0.2 rounded uppercase flex items-center gap-1">
                                  <ShieldCheck className="w-3 h-3" />
                                  {isChief ? 'Chief Admin' : 'Rep'}
                                </span>
                              )}
                            </div>
                            <p className="text-xs font-mono font-semibold text-slate-600 dark:text-slate-400 truncate">
                              {u.regNo} • <span className="font-sans">{u.department}</span>
                            </p>
                            <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                              {u.email} • {u.level}
                            </p>
                          </div>
                        </div>

                        {!isSelf && (
                          <button
                            onClick={() => toggleRole(u)}
                            disabled={busyId === u.id}
                            className={`shrink-0 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-60 ${
                              isRep
                                ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900/40'
                                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm shadow-emerald-200'
                            }`}
                          >
                            {busyId === u.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : isRep ? (
                              <>
                                <UserX className="w-3.5 h-3.5" />
                                Revoke Rep
                              </>
                            ) : (
                              <>
                                <ShieldCheck className="w-3.5 h-3.5" />
                                Grant Rep
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
