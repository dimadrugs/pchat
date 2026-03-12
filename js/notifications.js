/* ================================================
   PCHAT — Notifications
   ================================================ */
const Notif = (() => {
    const init = () => {
        if ('Notification' in window && Notification.permission === 'default') {
            document.addEventListener('click', () => Notification.requestPermission(), { once: true });
        }
    };

    const show = (title, body) => {
        if (!('Notification' in window) || Notification.permission !== 'granted' || document.hasFocus()) return;
        const n = new Notification(title, { body, icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="%23667eea"/><text x="50" y="65" font-size="40" text-anchor="middle" fill="white" font-weight="bold">PC</text></svg>', vibrate: [100, 50, 100], tag: 'pchat', renotify: true });
        n.onclick = () => { window.focus(); n.close() };
        setTimeout(() => n.close(), 5000);
    };

    const sound = () => {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.frequency.value = 800; gain.gain.value = 0.1;
            osc.start(); osc.stop(ctx.currentTime + 0.15);
        } catch {}
    };

    return { init, show, sound };
})();