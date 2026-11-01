// Service worker: lets the app install and open quickly. Network first, so updates always win;
// the cache is only a fallback when the internet is down. It never touches other websites.
const CACHE = 'lcrm-v7';
const SHELL = ['index.html', 'control.html', 'cam.html', 'tv.html', 'control.css', 'control.js', 'cam.js', 'signal.js', 'config.js', 'books.js', 'tv.js', 'frame.js', 'logos/logo-left.png', 'logos/logo-right.png', 'data/hymns-en.json', 'data/hymns-yo.json', 'pwa.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(r, { cache: 'no-store' }).then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)); } return res; }).catch(() => caches.match(r, { ignoreSearch: true })));
});
