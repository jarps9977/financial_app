// Bump on every deploy so old shells are dropped
const VERSION = 'ngern-v50';

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icons/app_icon.png',
  'css/tokens.css',
  'css/layout.css',
  'css/components.css',
  'js/theme-init.js',
  'js/app.js',
  'js/api.js',
  'js/router.js',
  'js/selectors.js',
  'js/settings.js',
  'js/store.js',
  'js/session.js',
  'js/utils/dom.js',
  'js/utils/format.js',
  'js/utils/slip-parser.js',
  'js/utils/group-look.js',
  'js/services/ocr.js',
  'js/layout/shell.js',
  'js/components/progress.js',
  'js/components/alert.js',
  'js/components/bottom-sheet.js',
  'js/components/button.js',
  'js/components/card.js',
  'js/components/chart.js',
  'js/components/icon.js',
  'js/components/input.js',
  'js/components/lazy-list.js',
  'js/components/misc.js',
  'js/components/pull-refresh.js',
  'js/components/states.js',
  'js/pages/home.js',
  'js/pages/groups.js',
  'js/pages/group.js',
  'js/pages/group-form.js',
  'js/pages/item-form.js',
  'js/pages/report.js',
  'js/pages/bills.js',
  'js/pages/import.js',
  'js/pages/login.js',
  'js/pages/pin.js',
  'js/pages/settings.js',
];

const SHELL_URLS = new Set(SHELL.map((p) => new URL(p, self.location).href));

// Versioned third-party assets (fonts, icons) never change, so cache first
const CDN_ORIGINS = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (CDN_ORIGINS.includes(url.origin)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok || res.type === 'opaque') {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
      }
      return res;
    })));
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Shell assets come from this version's cache: install fetched them together (cache: 'reload'),
  // so CSS and JS always match and opening the app needs no per-file round trips.
  // Any shell change must bump VERSION, which reinstalls the whole set.
  if (req.mode !== 'navigate' && SHELL_URLS.has(url.href)) {
    e.respondWith(caches.open(VERSION).then((c) => c.match(req))
      .then((hit) => hit || fetch(req, { cache: 'no-cache' })));
    return;
  }

  // Pages and anything outside the shell: network first, revalidated past GitHub Pages' 10 min HTTP cache
  e.respondWith(fetch(req, { cache: 'no-cache' }).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(req, copy));
    }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true })
    .then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
