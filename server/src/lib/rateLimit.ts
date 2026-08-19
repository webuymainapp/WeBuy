import type { Request, Response, NextFunction } from 'express';
import { HttpError } from './http';

interface Bucket {
  count: number;
  resetAt: number;
}

// In-memory fixed-window limiter. Fine for a single instance; swap for a
// Redis-backed store if the API is ever scaled horizontally.
const buckets = new Map<string, Bucket>();

function clientKey(req: Request): string {
  // Use the RIGHTMOST X-Forwarded-For entry. A client can spoof entries at the
  // start of the header, but a trusted reverse proxy (Render/Vercel) appends
  // the real client IP last, so the final entry is the one that can't be
  // forged per request. Reading the leftmost entry let an attacker rotate it
  // on every request and walk straight past the limiter.
  let ip = '';
  const forwarded = req.headers['x-forwarded-for'];
  if (Array.isArray(forwarded)) {
    ip = forwarded[forwarded.length - 1]?.trim() ?? '';
  } else if (typeof forwarded === 'string' && forwarded.trim()) {
    const parts = forwarded
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    ip = parts[parts.length - 1] ?? '';
  }
  ip = ip || req.socket.remoteAddress || 'unknown';
  return `${ip}:${req.path}`;
}

export function rateLimit(opts: { windowMs: number; max: number }) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const key = clientKey(req);
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
      next();
      return;
    }

    bucket.count += 1;
    if (bucket.count > opts.max) {
      next(new HttpError(429, 'Too many requests, slow down'));
      return;
    }
    next();
  };
}

// Periodically drop expired buckets so the map doesn't grow forever.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 60_000).unref();
