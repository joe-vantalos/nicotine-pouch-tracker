// ---- Offline support ----------------------------------------------------------
// Keeps a copy of the app on the device so it opens with no signal.
// - The page itself: fetched fresh when online (waiting at most 2 seconds), so a
//   new release shows straight away; the stored copy is used offline.
// - Scripts, styles, icons, font: stored copy first. Their file names carry a
//   version (ui.js?v=8), so a release that changes a file must bump its ?v=.
const CACHE = 'pouch-tracker-v1';
const PAGE = './';
const SHELL = [
  PAGE,
  'styles.css?v=7',
  'store.js?v=8',
  'model.js?v=7',
  'learn.js?v=2',
  'ui.js?v=12',
  'manifest.webmanifest?v=2',
  'icons/logo.svg?v=2',
  'icons/favicon-32.png?v=2',
  'icons/apple-touch-icon-v2.png',
  'icons/icon-192.png?v=2',
  'icons/icon-512.png?v=2'
];
// The font is the only file from another site. It is stored too, so the app
// looks the same offline.
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const PAGE_TIMEOUT = 2000;

self.addEventListener('install', e => {
  // cache: 'reload' skips the browser's own cache, so the stored copy is current.
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

// Removes old caches, and files from older releases (ui.js?v=4 once v=5 ships).
self.addEventListener('activate', e => {
  const keep = new Set(SHELL.map(u => new URL(u, location).href));
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('pouch-tracker-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => caches.open(CACHE))
    .then(cache => cache.keys().then(reqs => Promise.all(reqs
      .filter(r => new URL(r.url).origin === location.origin && !keep.has(r.url))
      .map(r => cache.delete(r)))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (e.request.mode === 'navigate') { e.respondWith(page()); return; }
  if (url.origin === location.origin || FONT_HOSTS.includes(url.hostname)) e.respondWith(stored(e.request));
});

async function page() {
  const cache = await caches.open(CACHE);
  const fresh = fetch(PAGE, { cache: 'no-cache' }).then(res => {
    if (res.ok) cache.put(PAGE, res.clone());
    return res;
  }).catch(() => null);
  const timeout = new Promise(r => setTimeout(() => r(null), PAGE_TIMEOUT));
  return (await Promise.race([fresh, timeout])) || (await cache.match(PAGE)) || (await fresh) || offline();
}

async function stored(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
    return res;
  } catch (e) {
    return offline();
  }
}

function offline() { return new Response('Offline, and this file is not stored yet.', { status: 503 }); }
