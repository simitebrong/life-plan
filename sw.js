// Life Plan service worker: offline shell + push reminders
const CACHE = 'life-plan-v11';
const SHELL = ['/', '/index.html', '/styles.css', '/js/app.js', '/js/fields.js', '/js/config.js', '/js/goals-seed.js', '/js/library.js',
  '/manifest.webmanifest', '/icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Network first for our own files (so updates arrive), cache fallback when offline.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const own = url.origin === self.location.origin;
  const fonts = url.host.includes('fonts.g') || url.host.includes('jsdelivr');
  if (!own && !fonts) return;
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request).then((r) => r || (e.request.mode === 'navigate' ? caches.match('/index.html') : undefined)))
  );
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data.json(); } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Life Plan', {
    body: d.body || 'Time for your check-in.',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    tag: d.tag || 'life-plan',
    data: { url: d.url || '/' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) { c.navigate(url); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
