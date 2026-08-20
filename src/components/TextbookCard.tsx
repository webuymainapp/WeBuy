import React, { useState } from 'react';
import { Textbook } from '../types';
import { CheckCircle2, Clock, MapPin, QrCode, ShoppingCart, Check, Info, X } from 'lucide-react';

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

const formatNaira = (amount: number) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  })
    .format(amount)
    .replace('NGN', '₦');

/** A small vertical CSS book — the "cover". Renders the rep-added course code,
 *  course title and price inside the book, on a stable random gradient. */
const BookCover: React.FC<{ textbook: Textbook; size?: 'mini' | 'full' }> = ({
  textbook,
  size = 'mini',
}) => {
  const gradient = coverGradient(textbook.courseCode);
  const title = textbook.courseTitle?.trim() || textbook.bookTitle;

  if (size === 'full') {
    return (
      <div
        className={`relative w-32 h-44 rounded-2xl overflow-hidden bg-gradient-to-br ${gradient} flex flex-col justify-between p-3 select-none shadow-lg`}
      >
        <div className="absolute inset-y-0 left-0 w-1.5 bg-black/20" />
        <div className="absolute inset-y-0 left-1.5 w-px bg-white/20" />
        <div className="relative flex items-center justify-between">
          <span className="text-[9px] font-black tracking-[0.22em] text-white/85 uppercase">Webuy</span>
          <span className="text-[9px] font-bold text-white/70 font-mono">{textbook.level}</span>
        </div>
        <div className="relative text-center px-0.5">
          <p className="text-white font-black text-xl font-mono tracking-tight drop-shadow-sm leading-none">
            {textbook.courseCode}
          </p>
          <p className="text-[10px] font-bold text-white/95 mt-2 line-clamp-3 leading-snug">
            {title}
          </p>
        </div>
        <div className="relative flex items-end justify-between">
          <span className="text-xs font-extrabold text-white font-mono drop-shadow-sm">
            {formatNaira(textbook.price)}
          </span>
          <span className="text-[7px] font-bold text-white/60 uppercase tracking-[0.18em]">UniPass</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative w-14 h-20 rounded-lg overflow-hidden bg-gradient-to-br ${gradient} flex flex-col justify-between p-1.5 select-none shadow-sm`}
    >
      <div className="absolute inset-y-0 left-0 w-1 bg-black/20" />
      <div className="absolute inset-y-0 left-1 w-px bg-white/20" />
      <div className="relative text-center">
        <p className="text-white font-black text-[9px] font-mono tracking-tight leading-none drop-shadow-sm">
          {textbook.courseCode}
        </p>
      </div>
      <div className="relative text-center px-0.5">
        <p className="text-[6.5px] font-bold text-white/95 leading-tight line-clamp-2">{title}</p>
      </div>
      <div className="relative text-center">
        <p className="text-[8px] font-extrabold text-white font-mono leading-none drop-shadow-sm">
          {formatNaira(textbook.price)}
        </p>
      </div>
    </div>
  );
};

export const TextbookCard: React.FC<TextbookCardProps> = ({
  textbook,
  onAddToCart,
  onRemoveFromCart,
  isInCart,
  onViewPass,
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const title = textbook.courseTitle?.trim() || textbook.bookTitle;

  const statusBadge = (large = false) => {
    const base = large
      ? 'text-[11px] px-2.5 py-1 rounded-lg inline-flex items-center gap-1 font-bold'
      : 'text-[10px] px-2 py-0.5 rounded-md inline-flex items-center gap-1 font-bold';
    if (textbook.status === 'paid') {
      return (
        <span className={`${base} bg-emerald-600 text-white shadow-xs`}>
          <CheckCircle2 className="w-3 h-3" />
          Paid
        </span>
      );
    }
    if (textbook.status === 'collected') {
      return (
        <span className={`${base} bg-indigo-700 text-white shadow-xs`}>
          <CheckCircle2 className="w-3 h-3" />
          Collected
        </span>
      );
    }
    return (
      <span className={`${base} bg-rose-500 text-white shadow-xs`}>
        <Clock className="w-3 h-3" />
        Unpaid
      </span>
    );
  };

  const primaryAction = () => {
    if (textbook.status === 'paid' && onViewPass) {
      return (
        <button
          onClick={() => onViewPass(textbook)}
          className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-[11px] font-bold flex items-center gap-1.5 shadow-sm shadow-emerald-200 whitespace-nowrap transition-all"
        >
          <QrCode className="w-3.5 h-3.5" />
          QR Pass
        </button>
      );
    }
    if (textbook.status === 'unpaid') {
      if (isInCart(textbook.id)) {
        return (
          <button
            onClick={() => onRemoveFromCart(textbook)}
            className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-[11px] font-bold flex items-center gap-1.5 shadow-sm shadow-emerald-200 whitespace-nowrap transition-all"
          >
            <Check className="w-3.5 h-3.5" />
            In Cart
          </button>
        );
      }
      return (
        <button
          onClick={() => onAddToCart(textbook)}
          className="px-2.5 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-600 active:scale-95 text-white text-[11px] font-bold flex items-center gap-1.5 shadow-sm shadow-sky-200 whitespace-nowrap transition-all"
        >
          <ShoppingCart className="w-3.5 h-3.5" />
          Add to Cart
        </button>
      );
    }
    return null;
  };

  const details = [
    { label: 'Course', value: `${textbook.courseCode} — ${title}` },
    { label: 'Price', value: formatNaira(textbook.price) },
    { label: 'Author', value: textbook.author || '—' },
    { label: 'Edition', value: textbook.edition || '—' },
    { label: 'ISBN', value: textbook.isbn || '—' },
    { label: 'Level', value: textbook.level },
    { label: 'Department', value: textbook.department },
    { label: 'Pickup Location', value: textbook.pickupLocation },
    { label: 'Class Rep', value: textbook.classRepName || '—' },
    { label: 'Status', value: textbook.status },
  ];

  return (
    <>
      <div className="bg-white dark:bg-neutral-900 rounded-2xl p-3 border border-slate-200/90 dark:border-neutral-700 shadow-xs hover:shadow-sm transition-all flex items-center gap-3 relative group">
        {/* Mini vertical book cover */}
        <BookCover textbook={textbook} size="mini" />

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-100 font-mono tracking-tight">
              {textbook.courseCode}
            </span>
            <span className="text-sm font-extrabold text-slate-900 dark:text-slate-100 font-mono">
              {formatNaira(textbook.price)}
            </span>
          </div>

          <h3 className="text-[13px] font-bold text-slate-900 dark:text-slate-100 line-clamp-2 leading-snug mt-1">
            {title}
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1 truncate">
            <MapPin className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0" />
            <span className="truncate">{textbook.pickupLocation}</span>
          </p>

          {/* Status + actions — all on one horizontal row, never stacking */}
          <div className="mt-2 flex items-center justify-between gap-1.5">
            {statusBadge()}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setShowDetails(true)}
                className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-neutral-800 hover:bg-slate-200 dark:hover:bg-neutral-700 text-slate-700 dark:text-slate-300 text-[11px] font-bold flex items-center gap-1.5 whitespace-nowrap transition-colors"
              >
                <Info className="w-3.5 h-3.5" />
                Details
              </button>
              {primaryAction()}
            </div>
          </div>
        </div>
      </div>

      {/* Details Modal */}
      {showDetails && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setShowDetails(false)}
        >
          <div
            className="w-full sm:max-w-md bg-white dark:bg-neutral-900 rounded-t-3xl sm:rounded-3xl overflow-hidden p-5 sm:p-6 max-h-[92dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                Textbook Details
              </h3>
              <button
                onClick={() => setShowDetails(false)}
                className="p-2 rounded-full bg-slate-100 dark:bg-neutral-800 hover:bg-slate-200 dark:hover:bg-neutral-700 text-slate-600 dark:text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex justify-center mb-4">
              <BookCover textbook={textbook} size="full" />
            </div>

            <dl className="space-y-2.5 text-xs">
              {details.map((d) => (
                <div
                  key={d.label}
                  className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-neutral-800 pb-2 last:border-0"
                >
                  <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 shrink-0 w-28">
                    {d.label}
                  </dt>
                  <dd className="text-slate-800 dark:text-slate-200 font-semibold text-right">
                    {d.value}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="mt-5 pt-3 border-t border-slate-200 dark:border-neutral-700 flex items-center justify-between gap-2">
              {statusBadge(true)}
              <div className="flex items-center gap-2">
                {primaryAction()}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};