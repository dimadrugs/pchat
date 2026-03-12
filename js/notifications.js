const Notif = (() => {
    // Звук из файла (положи notification.mp3 рядом с index.html)
    const audio = new Audio('./notification.mp3');

    const init = () => {
        if (!('Notification' in window)) return;

        // Кнопка для iOS, чтобы разрешить пуши (появляется только 1 раз)
        if (Notification.permission === 'default') {
            const requestBtn = document.createElement('button');
            requestBtn.innerHTML = '🔔 Разрешить уведомления';
            requestBtn.style.cssText = 'position:fixed; top:20px; left:50%; transform:translateX(-50%); z-index:9999; padding:12px 24px; background:var(--grad); color:#fff; border:none; border-radius:24px; font-weight:bold; cursor:pointer; box-shadow: 0 4px 15px rgba(0,0,0,0.3); font-family:inherit;';
            
            document.body.appendChild(requestBtn);

            requestBtn.onclick = async () => {
                const p = await Notification.requestPermission();
                if (p === 'granted') {
                    UI.toast('✅ Уведомления включены');
                }
                requestBtn.remove();
            };
        }
    };

    const show = (title, body) => {
        // Если ты в чате прямо сейчас - пуш не вылезает, только играет звук
        if (document.hasFocus()) {
            sound();
            return;
        }

        // Если свернуто и пуши разрешены - показываем пуш
        if ('Notification' in window && Notification.permission === 'granted') {
            const n = new Notification(title, { 
                body, 
                icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="%23818cf8"/><text x="50" y="62" text-anchor="middle" font-size="40" font-weight="800" fill="white" font-family="sans-serif">P</text></svg>',
                badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="50" fill="%23fff"/></svg>'
            });
            
            n.onclick = () => { 
                window.focus(); 
                n.close(); 
            };
            
            sound(); // Звук при приходе пуша
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
