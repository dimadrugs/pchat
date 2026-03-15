const Notif = (() => {
    const audio = new Audio('./notification.mp3');

    const init = () => {
        if (!('Notification' in window)) return;
        // Тихо запрашиваем без кнопки
        if (Notification.permission === 'default') {
            Notification.requestPermission().catch(() => {});
        }
    };

    const show = (title, body) => {
        if (document.hasFocus()) {
            sound();
            return;
        }

        if ('Notification' in window && Notification.permission === 'granted') {
            const n = new Notification(title, {
                body,
                icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="%2322d3ae"/></svg>',
                badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="%2322d3ae"/></svg>',
            });

            n.onclick = () => {
                window.focus();
                n.close();
            };

            sound();
        }
    };

    const sound = () => {
        try {
            audio.currentTime = 0;
            audio.play().catch(() => {});
        } catch (e) {}
    };

    return { init, show, sound };
})();
