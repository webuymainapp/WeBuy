import React, { useState } from 'react';
import { StudentProfile, NotificationItem } from '../types';
import { BookOpen, ShieldCheck, User, LogOut, ChevronDown, Bell, ArrowLeft, CheckCheck } from 'lucide-react';

interface NavbarProps {
  profile: StudentProfile;
  activeRole: 'student' | 'class_rep';
  isRep: boolean;
  onRoleChange: (role: 'student' | 'class_rep') => void;
  onSignOut: () => void;
  onSelectTab: (tab: 'dashboard' | 'history' | 'class_rep' | 'settings') => void;
  activeTab: string;
  notifications: NotificationItem[];
  onMarkAllRead: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  profile,
  activeRole,
  isRep,
  onRoleChange,
  onSignOut,
  onSelectTab,
  activeTab,
  notifications,
  onMarkAllRead,
}) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <header className="sticky top-0 z-30 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-neutral-700 shadow-xs">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        {/* Brand & Identity */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => onSelectTab('dashboard')}
            className="flex items-center gap-2.5 text-left group focus:outline-none"
          >
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-black text-lg shadow-sm shadow-indigo-200 group-hover:scale-105 transition-transform">
              W
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-slate-900 dark:text-slate-100 tracking-tight text-lg leading-tight">
                  Webuy
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-100 uppercase tracking-wider hidden sm:inline-block">
                  UniPass
                </span>
              </div>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 hidden sm:block truncate">
                {profile.faculty}
              </p>
            </div>
          </button>
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
                  Student View
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
                  Class Rep Portal
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

          {/* User Profile Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center gap-2 p-1 sm:px-2.5 sm:py-1 rounded-xl bg-slate-100 dark:bg-neutral-800 hover:bg-slate-200/80 dark:hover:bg-neutral-700 transition-colors border border-slate-200/80 dark:border-neutral-700"
            >
              <img
                src={profile.avatarUrl}
                alt={profile.fullName}
                className="w-7 h-7 rounded-lg object-cover ring-1 ring-slate-300 dark:ring-slate-600"
                referrerPolicy="no-referrer"
              />
              <div className="text-left hidden sm:block">
                <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate max-w-[110px]">
                  {profile.fullName.split(' ')[0]}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                  {profile.regNo}
                </p>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
            </button>

            {showDropdown && (
              <div className="absolute right-0 mt-2 w-64 max-w-[calc(100vw-1.5rem)] bg-white dark:bg-neutral-900 rounded-2xl shadow-xl border border-slate-200 dark:border-neutral-700 p-3 z-50 text-xs space-y-2">
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-neutral-800 border border-slate-100 dark:border-neutral-700">
                  <p className="font-bold text-slate-900 dark:text-slate-100">{profile.fullName}</p>
                  <p className="text-[11px] font-mono text-indigo-600 dark:text-indigo-400 font-semibold">{profile.regNo}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-white dark:bg-neutral-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-neutral-700">
                      {profile.level}
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-100">
                      {profile.department}
                    </span>
                  </div>
                </div>

                <div className="space-y-1">
                  <button
                    onClick={() => {
                      setShowDropdown(false);
                      onSignOut();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors text-left"
                  >
                    <LogOut className="w-4 h-4 text-red-500 dark:text-red-400" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
