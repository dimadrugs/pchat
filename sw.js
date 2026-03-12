const CACHE = 'pchat-v4';
const ASSETS = [
    './',
    './index.html',
    './css/styles.css',
    './js/firebase-config.js',
    './js/crypto.js',
    './js/ui.js',
    './js/auth.js',
    './js/contacts.js',
    './js/chat.js',
    './js/notifications.js',
    './js/voice.js',
    './js/app.js'
];

self.addEventListener('install', e => {
    self.skipWaiting();
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(ks => Promise.all(ks.map(k => {
            if (k !== CACHE) return caches.delete(k);
        })))
    );
    return self.clients.claim();
});

self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;
    if (e.request.url.includes('firebase') || e.request.url.includes('googleapis') || e.request.url.includes('gstatic')) return;
    
    e.respondWith(
        fetch(e.request).then(response => {
            // Клонируем ответ ДО того, как положить его в кэш
            const responseToCache = response.clone();
            caches.open(CACHE).then(cache => {
                cache.put(e.request, responseToCache);
            });
            return response;
        }).catch(() => {
            // Если нет интернета, достаем из кэша
            return caches.match(e.request);
        })
    );
});

self.addEventListener('push', e => {
    const d = e.data?.json() || {};
    e.waitUntil(self.registration.showNotification(d.title || 'PCHAT', { body: d.body || 'Новое сообщение' }));
});

self.addEventListener('notificationclick', e => {
    e.notification.close();
    e.waitUntil(clients.openWindow('./'));
});
