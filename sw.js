const CACHE = 'pchat-v5';
const ASSETS = [
    './',
    './index.html',
    './css/styles.css',
    './js/firebase-config.js',
    './js/storage.js',
    './js/ui.js',
    './js/auth.js',
    './js/contacts.js',
    './js/chat.js',
    './js/voice.js',
    './js/calls.js',
    './js/notifications.js',
    './js/app.js'
];

self.addEventListener('install', e => {
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE).then(c => {
            // Кэшируем по одному, чтобы одна ошибка не сломала всё
            return Promise.allSettled(ASSETS.map(url => c.add(url)));
        })
    );
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.map(k => k !== CACHE ? caches.delete(k) : null))
        )
    );
    return self.clients.claim();
});

self.addEventListener('fetch', e => {
    // Только GET
    if (e.request.method !== 'GET') return;

    const url = new URL(e.request.url);

    // Пропускаем Firebase, googleapis, gstatic, telegra.ph
    if (
        url.hostname.includes('firebase') ||
        url.hostname.includes('googleapis') ||
        url.hostname.includes('gstatic') ||
        url.hostname.includes('telegra.ph') ||
        url.hostname.includes('peerjs') ||
        url.hostname.includes('fonts.g')
    ) return;

    // Пропускаем range requests (видео/аудио стриминг)
    if (e.request.headers.has('range')) return;

    e.respondWith(
        fetch(e.request)
            .then(response => {
                // Кэшируем только полные ответы (status 200, не partial 206)
                if (
                    response.status === 200 &&
                    response.type !== 'opaque' &&
                    !response.headers.get('content-range')
                ) {
                    const clone = response.clone();
                    caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {});
                }
                return response;
            })
            .catch(() => caches.match(e.request))
    );
});

self.addEventListener('push', e => {
    const d = e.data?.json() || {};
    e.waitUntil(
        self.registration.showNotification(d.title || 'PCHAT', {
            body: d.body || 'Новое сообщение',
            icon: './icon.png'
        })
    );
});

self.addEventListener('notificationclick', e => {
    e.notification.close();
    e.waitUntil(clients.openWindow('./'));
});
