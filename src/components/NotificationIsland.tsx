import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, BellRing, CheckCircle2, Sparkles, X } from 'lucide-react';
import type { NotificationItem } from '../types';

interface NotificationIslandProps {
  notification: NotificationItem | null;
  onDismiss: () => void;
  durationMs?: number;
}

const ICONS: Record<string, React.ReactNode> = {
  payment: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
  payout: <BellRing className="w-4 h-4 text-amber-400" />,
  info: <Bell className="w-4 h-4 text-sky-400" />,
  default: <Sparkles className="w-4 h-4 text-indigo-400" />,
};

export const NotificationIsland: React.FC<NotificationIslandProps> = ({
  notification,
  onDismiss,
  durationMs = 5000,
}) => {
  useEffect(() => {
    if (!notification) return;
    const t = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(t);
  }, [notification, onDismiss, durationMs]);

  return (
    <div className="fixed top-3 left-0 right-0 z-[90] flex justify-center px-4 pointer-events-none">
      <AnimatePresence mode="wait">
        {notification && (
          <motion.div
            key={notification.id}
            initial={{ y: -60, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -60, opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            className="pointer-events-auto w-full max-w-md flex items-start gap-3 px-4 py-3 rounded-3xl bg-slate-900/95 dark:bg-neutral-800/95 backdrop-blur-xl text-white shadow-2xl border border-white/10"
          >
            <div className="w-9 h-9 shrink-0 rounded-2xl bg-white/10 flex items-center justify-center">
              {ICONS[notification.type] ?? ICONS.default}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-white truncate">
                {notification.title}
              </p>
              {notification.body && (
                <p className="text-[11px] text-slate-300 dark:text-slate-200 mt-0.5 line-clamp-2 leading-snug">
                  {notification.body}
                </p>
              )}
            </div>
            <button
              onClick={onDismiss}
              aria-label="Dismiss notification"
              className="shrink-0 p-1 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
