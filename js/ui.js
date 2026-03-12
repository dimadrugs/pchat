const UI = (() => {
    const $ = id => document.getElementById(id);

    const toast = (msg, ms = 3000) => {
        const el = $('toast');
        if (!el) return;
        el.textContent = msg;
        el.classList.add('on');
        setTimeout(() => el.classList.remove('on'), ms);
    };

    const modal = (title, html, yesText = 'OK', noText = 'Отмена') => new Promise(ok => {
        const m = $('mini-modal');
        const t = $('mm-title');
        const b = $('mm-body');
        const y = $('mm-yes');
        const n = $('mm-no');
        if (!m) return ok(false);

        t.textContent = title; b.innerHTML = html;
        y.textContent = yesText; n.textContent = noText;
        m.classList.remove('hidden');

        y.onclick = () => { m.classList.add('hidden'); ok(true); };
        n.onclick = () => { m.classList.add('hidden'); ok(false); };
    });

    const prompt = (title, ph = '', def = '') => new Promise(ok => {
        const m = $('mini-modal');
        const t = $('mm-title');
        const b = $('mm-body');
        const y = $('mm-yes');
        if (!m) return ok(null);

        t.textContent = title;
        b.innerHTML = `<input id="mminp" style="width:100%;padding:10px;background:#222235;color:#fff;border:none;border-radius:8px;" placeholder="${ph}" value="${def}">`;
        m.classList.remove('hidden');

        y.onclick = () => { m.classList.add('hidden'); ok($('mminp').value.trim()); };
    });

    const showChat = () => {
        const cv = $('chat-view');
        const ws = $('welcome-screen');
        if (!cv) return;

        cv.classList.remove('hidden');
        if (window.innerWidth <= 768) {
            setTimeout(() => cv.classList.add('slide-in'), 10);
        } else {
            if (ws) ws.style.display = 'none'; // Скрываем Welcome на ПК
        }
    };

    const hideChat = () => {
        const cv = $('chat-view');
        const ws = $('welcome-screen');
        if (!cv) return;

        if (window.innerWidth <= 768) {
            cv.classList.remove('slide-in');
            setTimeout(() => cv.classList.add('hidden'), 300);
        } else {
            cv.classList.add('hidden');
            if (ws) ws.style.display = 'flex'; // Возвращаем Welcome на ПК
        }
    };

    const avatarBg = name => {
        const grads = ['#818cf8', '#ec4899', '#38bdf8', '#4ade80', '#fb923c'];
        let h = 0; const str = name || 'X';
        for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
        return grads[Math.abs(h) % grads.length];
    };

    const fmtTime = ts => {
        if (!ts) return '';
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    };

    const fmtDate = ts => {
        if (!ts) return '';
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    };

    const esc = s => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };

    return { toast, modal, prompt, showChat, hideChat, avatarBg, fmtTime, fmtDate, esc, fmtSep: fmtDate };
})();
