/* Al Mokhtar - Service Worker (fast repeat visits)
   - Pages (HTML): network first but with a 3 s timeout, then the cached copy -> never "hangs" on a slow network.
   - CSS / JS / images / icons / manifest: stale-while-revalidate (open instantly from cache, refresh in the background).
   - Fonts + Firebase SDK (gstatic, googleapis): stale-while-revalidate.
   - Everything else (Firebase database, UltraMsg, Telegram...) is NOT touched.
   Bump VERSION on every release so the new files replace the cached ones. */
const VERSION = 'mokhtar-v7';
const SHELL = ['./', 'index.html', 'admin.html', 'studenti.html', 'shared.css', 'shared.js', 'firebase.js', 'manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) =>
      Promise.all(SHELL.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => null)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function put(request, res) {
  if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(request, copy)); }
  return res;
}

function networkFirstWithTimeout(request, ms) {
  return new Promise((resolve) => {
    let settled = false;
    const fallback = () => caches.match(request).then((hit) => hit || caches.match('index.html'));
    const timer = setTimeout(() => {
      fallback().then((hit) => { if (hit && !settled) { settled = true; resolve(hit); } });
    }, ms);
    fetch(request).then((res) => {
      clearTimeout(timer);
      if (!settled) { settled = true; resolve(put(request, res)); } else { put(request, res); }
    }).catch(() => {
      clearTimeout(timer);
      if (!settled) fallback().then((hit) => { settled = true; resolve(hit || Response.error()); });
    });
  });
}

function staleWhileRevalidate(request) {
  return caches.match(request).then((hit) => {
    const net = fetch(request).then((res) => put(request, res)).catch(() => hit);
    return hit || net;
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate' || /\.html?$/i.test(url.pathname) || url.pathname.endsWith('/')) {
      event.respondWith(networkFirstWithTimeout(req, 3000));
    } else {
      event.respondWith(staleWhileRevalidate(req));
    }
    return;
  }
  if (/(^|\.)(fonts\.googleapis\.com|fonts\.gstatic\.com|www\.gstatic\.com)$/.test(url.hostname)) {
    event.respondWith(staleWhileRevalidate(req));
  }
});
