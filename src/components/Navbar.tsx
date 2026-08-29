import React, { useState } from 'react';
import { NotificationItem } from '../types';
import { BookOpen, ShieldCheck, User, ArrowLeft, Bell, CheckCheck, RefreshCw } from 'lucide-react';

interface NavbarProps {
  activeRole: 'student' | 'class_rep';
  isRep: boolean;
  onRoleChange: (role: 'student' | 'class_rep') => void;
  onSelectTab: (tab: 'dashboard' | 'history' | 'class_rep' | 'settings') => void;
  activeTab: string;
  notifications: NotificationItem[];
  onMarkAllRead: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeRole,
  isRep,
  onRoleChange,
  onSelectTab,
  activeTab,
  notifications,
  onMarkAllRead,
}) => {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <header className="sticky top-0 z-30 bg-slate-100 dark:bg-black">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-12 flex items-center justify-between gap-3">
        {/* Brand & Identity */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center text-left group focus:outline-none">
            <img src="/icons/logo.png" alt="WeBuy" className="w-8 h-8 rounded-lg object-cover" />
            <span className="text-lg font-semibold text-slate-900 dark:text-slate-100">eBuy</span>
        </div>
        </div>

        {/* Center Mode Selector Pill — only for class reps */}
        {isRep && (
          <div className="hidden md:flex items-center p-1 bg-slate-100 dark:bg-neutral-800 rounded-xl border border-slate-200/80 dark:border-neutral-700">
            {activeRole === 'class_rep' ? (
              <button
                onClick={() => {
                  onRoleChange('student');
                  onSelectTab('dashboard');
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-white dark:bg-neutral-900 text-indigo-700 dark:text-indigo-300 shadow-xs"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                Back to Dashboard
              </button>
            ) : (
              <>
                <button
                  onClick={() => {
                    onRoleChange('student');
                    if (activeTab === 'class_rep') onSelectTab('dashboard');
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    activeRole === 'student'
                      ? 'bg-white dark:bg-neutral-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  <User className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  Student
                </button>
                <button
                  onClick={() => {
                    onRoleChange('class_rep');
                    onSelectTab('class_rep');
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    activeRole === 'class_rep'
                      ? 'bg-white dark:bg-neutral-900 text-indigo-700 dark:text-indigo-300 shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  Rep Portal
                </button>
              </>
            )}
          </div>
        )}

        {/* Right Actions & Profile */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Role Toggle Button for Mobile — only for class reps */}
          {isRep && (
            <button
              onClick={() => {
                const newRole = activeRole === 'student' ? 'class_rep' : 'student';
                onRoleChange(newRole);
                if (newRole === 'class_rep') onSelectTab('class_rep');
                if (newRole === 'student') onSelectTab('dashboard');
              }}
              className="md:hidden text-xs font-bold px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-neutral-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-neutral-700 flex items-center gap-1 shrink-0"
            >
              {activeRole === 'student' ? (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Rep Mode</span>
                </>
              ) : (
                <>
                  <ArrowLeft className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span className="hidden sm:inline">Back to Dashboard</span>
                  <span className="sm:hidden">Back</span>
                </>
              )}
            </button>
          )}

          {/* Refresh (hard reload) button */}
          <button
            onClick={() => window.location.reload()}
            className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-neutral-800 transition-colors"
            aria-label="Refresh data"
            title="Refresh data"
          >
            <RefreshCw className="w-4.5 h-4.5" />
          </button>

          {/* Notifications Button */}
          <div className="relative">
            <button
              onClick={() => setNotificationsOpen(!notificationsOpen)}
              className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-neutral-800 transition-colors relative"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-indigo-600 ring-2 ring-white"></span>
              )}
            </button>

            {notificationsOpen && (
              <div className="absolute right-0 mt-2 w-64 max-w-[calc(100vw-1.5rem)] bg-white dark:bg-neutral-900 rounded-2xl shadow-xl border border-slate-200 dark:border-neutral-700 p-3 z-50 text-xs">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-neutral-700 pb-2 mb-2">
                  <span className="font-bold text-slate-900 dark:text-slate-100">Notifications</span>
                  <button
                    onClick={onMarkAllRead}
                    className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold cursor-pointer flex items-center gap-1"
                  >
                    <CheckCheck className="w-3 h-3" />
                    Mark read
                  </button>
                </div>
                {notifications.length === 0 ? (
                  <p className="text-slate-400 dark:text-slate-500 text-[11px] py-3 text-center">
                    No notifications yet.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {notifications.map((n) => (
                      <div
                        key={n.id}
                        className={`p-2.5 rounded-xl border ${
                          n.read
                            ? 'bg-slate-50 dark:bg-neutral-800 border-slate-100 dark:border-neutral-700'
                            : 'bg-indigo-50/60 dark:bg-indigo-950/40 border-indigo-100/80'
                        }`}
                      >
                        <p className="font-semibold text-indigo-900 dark:text-indigo-300">{n.title}</p>
                        {n.body && (
                          <p className="text-slate-600 dark:text-slate-300 text-[11px] mt-0.5">{n.body}</p>
                        )}
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 block">
                          {new Date(n.createdAt).toLocaleString('en-NG', {
                            day: 'numeric',
                            month: 'short',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
