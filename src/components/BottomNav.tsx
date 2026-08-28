import React, { useRef } from 'react';
import { BookOpen, History, Settings } from 'lucide-react';

interface BottomNavProps {
  activeTab: 'dashboard' | 'history' | 'class_rep' | 'settings';
  onSelectTab: (tab: 'dashboard' | 'history' | 'class_rep' | 'settings') => void;
  paidPassesCount?: number;
  onSecretMarket?: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onSelectTab,
  onSecretMarket,
}) => {
  // Triple-tap on the Dashboard button opens the secret marketplace — but only
  // if the server says this account has the privilege (checked in App before
  // the callback is wired); the button itself just counts taps.
  const tapTimer = useRef<number | null>(null);
  const tapCount = useRef(0);

  const handleDashboard = () => {
    if (!onSecretMarket) {
      onSelectTab('dashboard');
      return;
    }
    tapCount.current += 1;
    if (tapTimer.current) {
      window.clearTimeout(tapTimer.current);
    }
    tapTimer.current = window.setTimeout(() => {
      tapCount.current = 0;
    }, 500);
    if (tapCount.current >= 3) {
      tapCount.current = 0;
      onSecretMarket();
      return;
    }
    onSelectTab('dashboard');
  };

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40">
      <div className="flex items-center gap-1.5 rounded-full bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md border border-slate-200/90 dark:border-neutral-700 p-1.5 shadow-2xl shadow-slate-900/10 dark:shadow-black/40">
        {/* Dashboard */}
        <button
          onClick={handleDashboard}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full transition-all ${
            activeTab === 'dashboard'
              ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/30'
              : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-neutral-800 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span className="text-[11px]">Dashboard</span>
        </button>

        {/* History */}
        <button
          onClick={() => onSelectTab('history')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full transition-all ${
            activeTab === 'history'
              ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/30'
              : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-neutral-800 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <History className="w-4 h-4" />
          <span className="text-[11px]">History</span>
        </button>

{/* Settings */}
        <button
          onClick={() => onSelectTab('settings')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full transition-all ${
            activeTab === 'settings'
              ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/30'
              : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-neutral-800 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span className="text-[11px]">Settings</span>
        </button>
      </div>
    </div>
  );
};
