const CACHE = 'pchat-v1';
const ASSETS = ['/', '/index.html', '/css/styles.css', '/js/firebase-config.js', '/js/crypto.js', '/js/ui.js', '/js/auth.js', '/js/contacts.js', '/js/chat.js', '/js/notifications.js', '/js/app.js', '/manifest.json'];

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))); self.skipWaiting() });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim() });
self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;
    if (e.request.url.includes('firebase') || e.request.url.includes('googleapis') || e.request.url.includes('gstatic')) return;
    e.respondWith(fetch(e.request).then(r => { caches.open(CACHE).then(c => c.put(e.request, r.clone())); return r }).catch(() => caches.match(e.request)));
});
self.addEventListener('push', e => {
    const d = e.data?.json() || {};
    e.waitUntil(self.registration.showNotification(d.title || 'PCHAT', { body: d.body || 'Новое сообщение', icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="%23667eea"/><text x="50" y="65" font-size="36" text-anchor="middle" fill="white" font-weight="bold">PC</text></svg>', vibrate: [100, 50, 100], tag: 'pchat', renotify: true }));
});
self.addEventListener('notificationclick', e => { e.notification.close(); e.waitUntil(clients.openWindow('/')) });