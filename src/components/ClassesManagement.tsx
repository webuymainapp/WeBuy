import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  School,
  KeyRound,
  Plus,
  Loader2,
  AlertCircle,
  X,
  Pencil,
  Check,
  Users,
  ShieldCheck,
} from 'lucide-react';
import { classesApi, repApi, ApiError, type ClassInfo } from '../lib/api';
import type { PortalUser } from '../types';
import { soundEffects } from '../utils/audio';

interface ClassesManagementProps {
  isChief: boolean;
  currentUserId: string;
  onToast: (msg: string) => void;
}

export const ClassesManagement: React.FC<ClassesManagementProps> = ({
  isChief,
  currentUserId,
  onToast,
}) => {
  const [open, setOpen] = useState(false);
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create-class form (platform admin only).
  const [showCreate, setShowCreate] = useState(false);
  const [cName, setCName] = useState('');
  const [cDept, setCDept] = useState('');
  const [cLevel, setCLevel] = useState('100');
  const [cCode, setCCode] = useState('');
  const [cAdminId, setCAdminId] = useState('');
  const [creating, setCreating] = useState(false);

  // Change-invite-code editing (the class's own chief / platform admin).
  const [editId, setEditId] = useState<string | null>(null);
  const [editCode, setEditCode] = useState('');
  const [savingCode, setSavingCode] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setClasses(await classesApi.list());
      if (isChief) setUsers(await repApi.getUsers());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load classes');
    } finally {
      setLoading(false);
    }
  }, [isChief]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setShowCreate(false);
        setEditId(null);
      }
    };
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const createClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await classesApi.create({
        name: cName.trim(),
        department: cDept.trim(),
        level: cLevel.trim(),
        inviteCode: cCode.trim() || undefined,
        adminId: cAdminId || undefined,
      });
      soundEffects.playSuccessChime();
      const code = cCode.trim() || res.class.invite_code;
      onToast(`Class created. Invite code: ${code}. Share it with your students.`);
      setShowCreate(false);
      setCName('');
      setCDept('');
      setCLevel('100');
      setCCode('');
      setCAdminId('');
      await load();
    } catch (err) {
      soundEffects.playError();
      setError(err instanceof ApiError ? err.message : 'Could not create class');
    } finally {
      setCreating(false);
    }
  };

  const saveCode = async () => {
    if (!editId || !editCode.trim()) return;
    setSavingCode(true);
    setError(null);
    try {
      await classesApi.changeCode(editId, editCode.trim());
      soundEffects.playSuccessChime();
      onToast('Invite code updated.');
      setEditId(null);
      setEditCode('');
      await load();
    } catch (err) {
      soundEffects.playError();
      setError(err instanceof ApiError ? err.message : 'Could not update the code');
    } finally {
      setSavingCode(false);
    }
  };

  const startEdit = (c: ClassInfo) => {
    setEditId(c.id);
    setEditCode(c.inviteCode ?? '');
  };

  const myClass = classes.find((c) => c.isMine);

  return (
    <>
      {/* Trigger card — opens the classes modal */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
        <button
          onClick={() => {
            soundEffects.playTap();
            setOpen(true);
          }}
          className="w-full flex items-center gap-2 text-left cursor-pointer group min-w-0"
        >
          <School className="w-4 h-4 text-indigo-600 shrink-0" />
          <div className="min-w-0 flex-1">
            <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
              Classes &amp; Invite Codes
              <span className="text-[10px] font-extrabold font-mono px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300">
                {classes.length} class{classes.length === 1 ? '' : 'es'}
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
              {myClass && !isChief
                ? `Your class: ${myClass.name} — code ${myClass.inviteCode ?? 'hidden'}`
                : 'Create classes and set the invite codes students use to sign up.'}
            </p>
          </div>
          <KeyRound className="w-4 h-4 text-slate-400 shrink-0 group-hover:text-indigo-500 transition-colors" />
        </button>
      </div>

      {/* Classes modal */}
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
              className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden max-h-[85dvh] flex flex-col"
            >
              {/* Header */}
              <div className="p-4 sm:p-5 bg-slate-900 dark:bg-slate-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-indigo-500/20 flex items-center justify-center shrink-0">
                    <School className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-base text-white leading-tight">Classes</h3>
                    <p className="text-[11px] text-slate-400 truncate">
                      Students join a class with its invite code
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

              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
                {error && (
                  <div className="flex items-start gap-2 p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                {loading ? (
                  <div className="flex items-center justify-center py-10 text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    <span className="text-xs font-semibold">Loading classes…</span>
                  </div>
                ) : (
                  <>
                    {/* Create-class form — platform admin only */}
                    {isChief && (
                      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 p-3.5 space-y-3">
                        {!showCreate ? (
                          <button
                            onClick={() => {
                              soundEffects.playTap();
                              setShowCreate(true);
                            }}
                            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all cursor-pointer"
                          >
                            <Plus className="w-4 h-4" />
                            Create a Class
                          </button>
                        ) : (
                          <form onSubmit={createClass} className="space-y-2.5">
                            <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                              New class — pick a chief admin and set the invite code
                            </p>
                            <input
                              type="text"
                              required
                              placeholder="Class name (e.g. Civil Engineering 300)"
                              value={cName}
                              onChange={(e) => setCName(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold bg-white dark:bg-slate-900 dark:text-slate-100 focus:outline-indigo-600"
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="text"
                                required
                                placeholder="Department"
                                value={cDept}
                                onChange={(e) => setCDept(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold bg-white dark:bg-slate-900 dark:text-slate-100 focus:outline-indigo-600"
                              />
                              <input
                                type="text"
                                required
                                placeholder="Level (e.g. 300)"
                                value={cLevel}
                                onChange={(e) => setCLevel(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold bg-white dark:bg-slate-900 dark:text-slate-100 focus:outline-indigo-600"
                              />
                            </div>
                            <input
                              type="text"
                              placeholder="Invite code (blank = auto-generated)"
                              value={cCode}
                              onChange={(e) => setCCode(e.target.value.toUpperCase())}
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold bg-white dark:bg-slate-900 dark:text-slate-100 focus:outline-indigo-600 uppercase"
                            />
                            <select
                              value={cAdminId}
                              onChange={(e) => setCAdminId(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold bg-white dark:bg-slate-900 dark:text-slate-100 focus:outline-indigo-600 cursor-pointer"
                            >
                              <option value="">No chief yet (pick later)</option>
                              {users
                                .filter((u) => u.id !== currentUserId || isChief)
                                .map((u) => (
                                  <option key={u.id} value={u.id}>
                                    {u.fullName} — {u.regNo}
                                  </option>
                                ))}
                            </select>
                            <div className="flex gap-2">
                              <button
                                type="submit"
                                disabled={creating}
                                className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                              >
                                {creating ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Check className="w-3.5 h-3.5" />
                                )}
                                Create Class
                              </button>
                              <button
                                type="button"
                                onClick={() => setShowCreate(false)}
                                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-500 dark:text-slate-400 transition-colors cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          </form>
                        )}
                      </div>
                    )}

                    {/* Classes list */}
                    {classes.length === 0 ? (
                      <div className="text-center py-10 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 p-4">
                        <School className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-1" />
                        <p className="font-bold text-slate-700 dark:text-slate-300 text-sm">No classes yet</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">Create one so students have somewhere to sign up.</p>
                      </div>
                    ) : (
                      classes.map((c) => {
                        const canEdit = c.isMine || isChief;
                        const editing = editId === c.id;
                        return (
                          <div
                            key={c.id}
                            className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 space-y-2"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 space-y-0.5">
                                <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">
                                  {c.name}
                                </h4>
                                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 truncate">
                                  {c.department} · Level {c.level}
                                </p>
                                <p className="text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-1 truncate">
                                  <Users className="w-3 h-3 shrink-0" />
                                  {c.studentCount} student{c.studentCount === 1 ? '' : 's'}
                                  {c.admin && (
                                    <span className="flex items-center gap-1 ml-1">
                                      <ShieldCheck className="w-3 h-3 text-emerald-500 shrink-0" />
                                      {c.admin.fullName} {c.isMine && '(you)'}
                                    </span>
                                  )}
                                </p>
                              </div>
                              {c.inviteCode ? (
                                editing ? (
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="text"
                                      value={editCode}
                                      onChange={(e) => setEditCode(e.target.value.toUpperCase())}
                                      className="w-28 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold bg-white dark:bg-slate-900 dark:text-slate-100 focus:outline-indigo-600 uppercase"
                                    />
                                    <button
                                      onClick={saveCode}
                                      disabled={savingCode || !editCode.trim()}
                                      className="p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white transition-all cursor-pointer"
                                    >
                                      {savingCode ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      ) : (
                                        <Check className="w-3.5 h-3.5" />
                                      )}
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-800/60 text-indigo-700 dark:text-indigo-300 font-mono font-extrabold text-xs">
                                      {c.inviteCode}
                                    </span>
                                    {canEdit && (
                                      <button
                                        onClick={() => startEdit(c)}
                                        className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                        title="Change invite code"
                                      >
                                        <Pencil className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                )
                              ) : (
                                <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 shrink-0">
                                  code hidden
                                </span>
                              )}
                            </div>
                            {!c.inviteCode && c.isMine && (
                              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                                Ask the platform admin to show your class code.
                              </p>
                            )}
                          </div>
                        );
                      })
                    )}
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};