// Tiny in-memory TTL cache. Server-side only — the browser is never involved.
// Use for slow-changing read responses (e.g. a rep dashboard) so a burst of
// requests doesn't rerun expensive queries every time. Data lives in the single
// process's memory, so it's lost on restart — fine for short TTLs.

interface Entry<T> {
  value: T;
  expiresAt: number;
}

export function createTtlCache<T>(ttlMs: number) {
  const store = new Map<string, Entry<T>>();

  function get(key: string): T | undefined {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  function set(key: string, value: T): void {
    store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  function del(key: string): void {
    store.delete(key);
  }

  // Evict expired entries periodically so the map doesn't grow without bound.
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.expiresAt) store.delete(key);
    }
  }, Math.min(ttlMs, 60_000));
  timer.unref?.();

  return { get, set, del, size: () => store.size };
}
