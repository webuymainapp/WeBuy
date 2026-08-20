import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ShoppingCart } from 'lucide-react';

const POS_KEY = 'webuy_cart_position';

interface FloatingCartProps {
  count: number;
  onOpen: () => void;
}

interface Pos {
  x: number;
  y: number;
}

function loadPos(): Pos | null {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Pos;
    if (typeof p.x !== 'number' || typeof p.y !== 'number') return null;
    return p;
  } catch {
    return null;
  }
}

export const FloatingCart: React.FC<FloatingCartProps> = ({ count, onOpen }) => {
  const [pos, setPos] = useState<Pos>(() => {
    const saved = loadPos();
    if (saved) return saved;
    // Default: bottom-right, clear of the bottom nav / padding.
    return { x: window.innerWidth - 68, y: window.innerHeight - 120 };
  });
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState<Pos>({ x: 0, y: 0 });
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(POS_KEY, JSON.stringify(pos));
    } catch {
      // ignore
    }
  }, [pos]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      setDragging(true);
      setOffset({ x: e.clientX - r.left, y: e.clientY - r.top });
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!dragging) return;
      const size = ref.current?.getBoundingClientRect()?.width ?? 56;
      const x = Math.min(
        Math.max(8, e.clientX - offset.x),
        window.innerWidth - size - 8,
      );
      const y = Math.min(
        Math.max(8, e.clientY - offset.y),
        window.innerHeight - size - 8,
      );
      setPos({ x, y });
    },
    [dragging, offset],
  );

  const endDrag = useCallback(() => setDragging(false), []);

  return (
    <button
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClick={() => {
        if (!dragging) onOpen();
      }}
      className="fixed z-40 flex items-center justify-center w-14 h-14 rounded-full bg-white dark:bg-neutral-900 shadow-2xl shadow-slate-900/20 dark:shadow-black/50 border border-slate-200 dark:border-neutral-700 transition-shadow hover:shadow-lg active:scale-95 cursor-grab touch-none"
      style={{ left: pos.x, top: pos.y, cursor: dragging ? 'grabbing' : 'grab' }}
      aria-label="Open cart"
    >
      <ShoppingCart className="w-6 h-6 text-sky-600 dark:text-sky-400" />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center ring-2 ring-white dark:ring-slate-900 shadow-sm">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
};
