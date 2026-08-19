import React from 'react';
import { BookOpen, History, Settings } from 'lucide-react';

interface BottomNavProps {
  activeTab: 'dashboard' | 'history' | 'class_rep';
  onSelectTab: (tab: 'dashboard' | 'history' | 'class_rep') => void;
  onOpenSettings: () => void;
  paidPassesCount?: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onSelectTab,
  onOpenSettings,
}) => {
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 md:hidden">
      <div className="flex items-center gap-1.5 rounded-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200/90 dark:border-slate-700 p-1.5 shadow-2xl shadow-slate-900/10 dark:shadow-black/40">
        {/* Dashboard */}
        <button
          onClick={() => onSelectTab('dashboard')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full transition-all ${
            activeTab === 'dashboard'
              ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/30'
              : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200'
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
              : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <History className="w-4 h-4" />
          <span className="text-[11px]">History</span>
        </button>

        {/* Settings */}
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-full transition-all text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200"
        >
          <Settings className="w-4 h-4" />
          <span className="text-[11px]">Settings</span>
        </button>
      </div>
    </div>
  );
};
