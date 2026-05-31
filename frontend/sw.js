/* Service worker — installable PWA + offline shell.
   Strategy: NETWORK-FIRST for the shell so code changes always show when online;
   falls back to cache only when offline. API calls (/api/*) always hit the network. */
const CACHE = 'ridemate-v3';
const SHELL = ['./', './index.html', './styles.css', './app.js', './icon.svg', './manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/api/')) return; // never touch API responses
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // Refresh the cached copy of the shell on every successful fetch.
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request)) // offline fallback
  );
});
