self.addEventListener('install', (e) => {
    self.skipWaiting(); // Заставляем браузер немедленно применить этот файл
});

self.addEventListener('activate', (e) => {
    // Удаляем вообще все кэши, которые есть на сайте
    e.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => caches.delete(key)));
        }).then(() => {
            // Удаляем сам Service Worker, чтобы он не мешал
            return self.registration.unregister();
        })
    );
});

self.addEventListener('fetch', (e) => {
    // Теперь браузер будет всегда качать файлы напрямую с сервера GitHub
    e.respondWith(fetch(e.request));
});
