const CACHE = 'pchat-v2';
const ASSETS = [
    '/pchat/',
    '/pchat/index.html',
    '/pchat/css/styles.css',
    '/pchat/js/firebase-config.js',
    '/pchat/js/crypto.js',
    '/pchat/js/ui.js',
    '/pchat/js/auth.js',
    '/pchat/js/contacts.js',
    '/pchat/js/chat.js',
    '/pchat/js/notifications.js',
    '/pchat/js/voice.js',
    '/pchat/js/app.js'
];

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
});

self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;
    if (e.request.url.includes('firebase') || e.request.url.includes('googleapis') || e.request.url.includes('gstatic')) return;
    e.respondWith(
        fetch(e.request)
            .then(r => { caches.open(CACHE).then(c => c.put(e.request, r.clone())); return r; })
            .catch(() => caches.match(e.request))
    );
});

self.addEventListener('push', e => {
    const d = e.data?.json() || {};
    e.waitUntil(self.registration.showNotification(d.title || 'PCHAT', {
        body: d.body || 'Новое сообщение'
    }));
});

self.addEventListener('notificationclick', e => {
    e.notification.close();
    e.waitUntil(clients.openWindow('/pchat/'));
});