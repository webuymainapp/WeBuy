const CACHE = 'webuy-v2';
const SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/sw-assets.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

async function openCache() {
  return caches.open(CACHE);
}

async function precacheAssets() {
  try {
    const cache = await openCache();
    const res = await fetch('/sw-assets.json', { cache: 'no-store' });
    if (!res.ok) return;
    const assets = await res.json();
    if (!Array.isArray(assets)) return;
    await Promise.allSettled(
      assets
        .filter((url) => typeof url === 'string' && url.startsWith('/'))
        .map(async (url) => {
          if (!(await cache.match(url))) await cache.add(url);
        }),
    );
  } catch {
    return;
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await openCache();
      await cache.addAll(SHELL);
      await precacheAssets();
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      await precacheAssets();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await openCache();
        const cached = await cache.match('/index.html');
        const network = fetch(event.request)
          .then((res) => {
            if (res.ok) cache.put('/index.html', res.clone());
            return res;
          })
          .catch(() => null);

        if (cached) {
          event.waitUntil(network);
          return cached;
        }
        const fresh = await network;
        if (fresh) return fresh;
        return new Response('Offline', { status: 503 });
      })(),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(
      (hit) =>
        hit ||
        fetch(event.request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            openCache().then((cache) => cache.put(event.request, copy));
          }
          return res;
        }),
    ),
  );
});
