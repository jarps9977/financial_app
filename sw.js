// Bump on every deploy so old shells are dropped
const VERSION = 'ngern-v14';

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icons/app_icon.png',
  'icons/background_blue.png',
  'icons/background_pink.png',
  'icons/background_purple.png',
  'icons/background_teal.png',
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
  'js/pages/import.js',
  'js/pages/login.js',
  'js/pages/settings.js',
];

// Versioned third-party assets (fonts, icons) never change, so cache first
const CDN_ORIGINS = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
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

  // Network first keeps deploys fresh; cache is the offline fallback
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(req, copy));
    }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true })
    .then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
