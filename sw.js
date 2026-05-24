// Practice Tracker — service worker (mirrors workout-tracker strategy).
//   - App shell (HTML/CSS/JS/manifest/icons): cache-first, refreshed in background.
//   - Supabase REST GET: network-first, fall back to cache, fall back to empty array.
//   - CDN scripts (supabase-js, chart.js, fonts): network-first then cache.
//   - Anything else: passthrough.

const VERSION = 'practice-tracker-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

const SHELL_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
];

const SUPABASE_REST_HINT = '/rest/v1/';
const SUPABASE_AUTH_HINT = '/auth/v1/';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      Promise.all(
        SHELL_ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] Failed to cache shell asset', url, err);
          }),
        ),
      ),
    ),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function isShellRequest(url) {
  if (url.origin !== self.location.origin) return false;
  return url.pathname.startsWith(self.registration.scope.replace(self.location.origin, ''));
}

function isSupabaseRest(url) {
  return url.pathname.includes(SUPABASE_REST_HINT);
}

function isSupabaseAuth(url) {
  return url.pathname.includes(SUPABASE_AUTH_HINT);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method.toUpperCase() !== 'GET') return;
  const url = new URL(request.url);

  // Never cache auth — login/session always live.
  if (isSupabaseAuth(url)) return;

  if (isSupabaseRest(url)) {
    event.respondWith(handleSupabaseGet(request));
    return;
  }

  if (isShellRequest(url)) {
    event.respondWith(handleShell(request));
    return;
  }
});

async function handleShell(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request, { ignoreSearch: false });
  if (cached) {
    fetch(request)
      .then((res) => {
        if (res && res.ok) cache.put(request, res.clone());
      })
      .catch(() => {});
    return cached;
  }
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    if (request.mode === 'navigate') {
      const fallback = await cache.match('./index.html');
      if (fallback) return fallback;
    }
    throw err;
  }
}

async function handleSupabaseGet(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response('[]', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
