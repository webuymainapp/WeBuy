import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Textbook } from '../types';
import {
  X,
  Trash2,
  ShoppingCart,
  Lock,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import { soundEffects } from '../utils/audio';

interface CartModalProps {
  isOpen: boolean;
  items: Textbook[];
  onClose: () => void;
  onRemove: (textbook: Textbook) => void;
  onClear: () => void;
  onCheckout: () => void;
}

export const CartModal: React.FC<CartModalProps> = ({
  isOpen,
  items,
  onClose,
  onRemove,
  onClear,
  onCheckout,
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const formatNaira = (amount: number) =>
    new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      maximumFractionDigits: 0,
    })
      .format(amount)
      .replace('NGN', '₦');

  const subtotal = items.reduce((sum, b) => sum + b.price, 0);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
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
            <div className="p-4 sm:p-5 bg-slate-900 dark:bg-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-sky-500/20 flex items-center justify-center">
                  <ShoppingCart className="w-5 h-5 text-sky-400" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white leading-tight">Your Cart</h3>
                  <p className="text-[11px] text-slate-400">
                    {items.length === 0
                      ? 'No items yet'
                      : `${items.length} textbook${items.length === 1 ? '' : 's'} selected`}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
              {items.length === 0 ? (
                <div className="text-center py-12">
                  <ShoppingCart className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                  <p className="font-bold text-slate-700 dark:text-slate-300 text-sm">
                    Your cart is empty
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Browse the catalogue and tap "Add to Cart" on books you want to buy.
                  </p>
                </div>
              ) : (
                items.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  >
                    <div className="w-12 h-14 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-700 shrink-0">
                      <img
                        src={b.coverUrl}
                        alt={b.bookTitle}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 font-mono">
                        {b.courseCode}
                      </span>
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 line-clamp-2 mt-0.5">
                        {b.bookTitle}
                      </p>
                      <span className="text-xs font-mono font-bold text-slate-900 dark:text-slate-100">
                        {formatNaira(b.price)}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        soundEffects.playTap();
                        onRemove(b);
                      }}
                      className="p-2 rounded-full text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors shrink-0 cursor-pointer"
                      aria-label={`Remove ${b.bookTitle} from cart`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            {items.length > 0 && (
              <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Total Points
                  </span>
                  <span className="font-mono font-extrabold text-slate-900 dark:text-slate-100">
                    {subtotal.toLocaleString()} pts
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      soundEffects.playTap();
                      onClear();
                    }}
                    className="px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Clear Cart
                  </button>
                  <button
                    onClick={() => {
                      soundEffects.playTap();
                      onCheckout();
                    }}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-sky-500/25 transition-all cursor-pointer"
                  >
                    <Lock className="w-4 h-4" />
                    Checkout ({subtotal.toLocaleString()} pts)
                  </button>
                </div>
                <p className="text-[10px] text-center text-slate-400 dark:text-slate-500 flex items-center justify-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  Pay with Webuy Points — instant QR pass issued
                </p>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
