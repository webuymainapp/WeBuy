import React from 'react';
import { Textbook } from '../types';
import { CheckCircle2, Clock, MapPin, User, ShieldCheck, QrCode, ShoppingCart, Check } from 'lucide-react';

interface TextbookCardProps {
  textbook: Textbook;
  onAddToCart: (textbook: Textbook) => void;
  onRemoveFromCart: (textbook: Textbook) => void;
  isInCart: (id: string) => boolean;
  onViewPass?: (textbook: Textbook) => void;
}

/** Cover palettes — a book's cover color is picked deterministically from its
 *  course code, so it looks "random" per book but never flickers on re-render. */
const COVER_GRADIENTS = [
  'from-indigo-600 via-indigo-500 to-violet-600',
  'from-emerald-600 via-emerald-500 to-teal-600',
  'from-rose-600 via-rose-500 to-pink-600',
  'from-amber-600 via-amber-500 to-orange-600',
  'from-sky-600 via-sky-500 to-blue-600',
  'from-fuchsia-600 via-fuchsia-500 to-purple-600',
  'from-cyan-600 via-cyan-500 to-sky-600',
  'from-orange-600 via-amber-500 to-yellow-600',
  'from-violet-600 via-purple-500 to-indigo-600',
  'from-teal-600 via-teal-500 to-cyan-600',
];

function coverGradient(courseCode: string): string {
  let h = 0;
  for (let i = 0; i < courseCode.length; i++) {
    h = (h * 31 + courseCode.charCodeAt(i)) >>> 0;
  }
  return COVER_GRADIENTS[h % COVER_GRADIENTS.length];
}

export const TextbookCard: React.FC<TextbookCardProps> = ({
  textbook,
  onAddToCart,
  onRemoveFromCart,
  isInCart,
  onViewPass,
}) => {
  const formatNaira = (amount: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      maximumFractionDigits: 0,
    }).format(amount).replace('NGN', '₦');
  };

  // The product name the rep entered when adding the book — the rep's add form
  // collects course code + course title, so that's what a cover should show.
  const coverTitle = textbook.courseTitle?.trim() || textbook.bookTitle;
  const gradient = coverGradient(textbook.courseCode);

  return (
    <>
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200/90 dark:border-slate-700 shadow-xs hover:shadow-md transition-all flex flex-col sm:flex-row gap-4 sm:gap-5 relative group">
        {/* CSS Textbook Cover */}
        <div
          className={`relative w-full sm:w-28 h-36 sm:h-36 shrink-0 rounded-xl overflow-hidden bg-gradient-to-br ${gradient} flex flex-col justify-between p-2.5 select-none shadow-sm`}
        >
          {/* spine highlight */}
          <div className="absolute inset-y-0 left-0 w-1.5 bg-black/20" />
          <div className="absolute inset-y-0 left-1.5 w-px bg-white/20" />

          {/* Top row: brand + level */}
          <div className="relative flex items-center justify-between">
            <span className="text-[8px] font-black tracking-[0.22em] text-white/85 uppercase">
              Webuy
            </span>
            <span className="text-[8px] font-bold text-white/70 font-mono">
              {textbook.level}
            </span>
          </div>

          {/* Center: course code + product title */}
          <div className="relative text-center px-0.5">
            <p className="text-white font-black text-base sm:text-lg font-mono tracking-tight drop-shadow-sm leading-none">
              {textbook.courseCode}
            </p>
            <p className="text-[9px] font-bold text-white/95 mt-1.5 line-clamp-2 leading-tight">
              {coverTitle}
            </p>
          </div>

          {/* Bottom: price */}
          <div className="relative flex items-end justify-between">
            <span className="text-[10px] font-extrabold text-white font-mono drop-shadow-sm">
              {formatNaira(textbook.price)}
            </span>
            <span className="text-[6px] font-bold text-white/60 uppercase tracking-[0.18em]">
              UniPass
            </span>
          </div>

          {/* Status Overlay Badge on Cover */}
          <div className="absolute top-2 left-2">
            {textbook.status === 'unpaid' && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-500 text-white shadow-xs">
                Compulsory
              </span>
            )}
            {textbook.status === 'paid' && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-600 text-white shadow-xs flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Paid
              </span>
            )}
            {textbook.status === 'collected' && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-700 text-white shadow-xs flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Collected
              </span>
            )}
          </div>
        </div>

        {/* Content Info */}
        <div className="flex-1 flex flex-col justify-between">
          <div>
            {/* Top Row: Course Code & Price */}
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-100 font-mono tracking-tight">
                  {textbook.courseCode}
                </span>
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  {textbook.level}
                </span>
              </div>
              <span className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-slate-100 font-mono">
                {formatNaira(textbook.price)}
              </span>
            </div>

            {/* Book Title */}
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 line-clamp-2 leading-snug">
              {textbook.bookTitle}
            </h3>

            {/* Author & Edition */}
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 font-medium">
              By {textbook.author}
            </p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
              {textbook.edition} • <span className="font-mono">{textbook.isbn}</span>
            </p>

            {/* Venue / Distribution Info */}
            <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-700 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                <span className="truncate max-w-[220px]">{textbook.pickupLocation}</span>
              </div>
              <div className="flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                <span>{textbook.classRepName}</span>
              </div>
            </div>
          </div>

          {/* Action Row */}
          <div className="mt-4 flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-700 flex-wrap">
            <div>
              {textbook.status === 'unpaid' && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 px-2.5 py-1 rounded-lg border border-rose-100">
                  <Clock className="w-3 h-3 text-rose-500 dark:text-rose-400" />
                  Unpaid
                </span>
              )}
              {textbook.status === 'paid' && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-lg border border-emerald-100">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  Paid • Ready for Pickup
                </span>
              )}
              {textbook.status === 'collected' && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 px-2.5 py-1 rounded-lg border border-indigo-100">
                  <ShieldCheck className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                  Verified & Collected
                </span>
              )}
            </div>

            {/* Action Buttons */}
            <div>
              {textbook.status === 'unpaid' &&
                (isInCart(textbook.id) ? (
                  <button
                    onClick={() => onRemoveFromCart(textbook)}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm shadow-emerald-200 transition-all"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Remove from Cart</span>
                  </button>
                ) : (
                  <button
                    onClick={() => onAddToCart(textbook)}
                    className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 active:scale-95 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm shadow-sky-200 transition-all"
                  >
                    <ShoppingCart className="w-3.5 h-3.5" />
                    <span>Add to Cart</span>
                  </button>
                ))}

              {textbook.status === 'paid' && onViewPass && (
                <button
                  onClick={() => onViewPass(textbook)}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm shadow-emerald-200 transition-all"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>View QR Pass</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
