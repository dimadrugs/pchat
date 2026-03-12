const Notif = (() => {
    // Предзагружаем звук, чтобы он играл без задержек
    const audio = new Audio('./notification.mp3');

    const init = () => {
        // Проверяем, поддерживает ли браузер уведомления
        if (!('Notification' in window)) return;

        // Если еще не спрашивали - показываем кнопку в интерфейсе (или запрашиваем при первом клике)
        if (Notification.permission === 'default') {
            const requestBtn = document.createElement('button');
            requestBtn.textContent = '🔔 Включить уведомления';
            requestBtn.style.cssText = 'position:fixed; top:20px; left:50%; transform:translateX(-50%); z-index:9999; padding:10px 20px; background:var(--accent); color:#fff; border:none; border-radius:20px; font-weight:bold; cursor:pointer; box-shadow:var(--shadow2);';
            
            document.body.appendChild(requestBtn);

            requestBtn.onclick = async () => {
                const p = await Notification.requestPermission();
                if (p === 'granted') {
                    UI.toast('Уведомления включены');
                }
                requestBtn.remove();
            };
        }
    };

    const show = (title, body) => {
        // Если вкладка активна (ты прямо сейчас в чате) - пуш не нужен, просто играем звук
        if (document.hasFocus()) {
            sound();
            return;
        }

        // Показываем Push, если разрешено
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
            audio.currentTime = 0; // Перематываем в начало
            audio.play().catch(e => {
                console.warn('Автоплей звука заблокирован браузером', e);
            });
        } catch (e) {}
    };

    return { init, show, sound };
})();
