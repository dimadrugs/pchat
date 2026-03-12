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
        b.innerHTML = `<input id="mminp" style="width:100%;padding:10px;background:#222235;color:#fff;border:none;border-radius:8px;outline:none;" placeholder="${ph}" value="${def}">`;
        m.classList.remove('hidden');
        setTimeout(() => $('mminp')?.focus(), 100);

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
            if (ws) ws.classList.add('hidden');
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
            if (ws) ws.classList.remove('hidden');
        }
    };

    const openSidebar = () => {};
    const closeSidebar = () => {};

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

    const pwStrength = pw => {
        let s = 0;
        if (pw.length >= 8) s += 25;
        if (pw.length >= 12) s += 15;
        if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s += 20;
        if (/\d/.test(pw)) s += 20;

        const fill = $('pw-fill');
        const label = $('pw-label');
        if (!fill) return;

        const colors = ['', '#f87171', '#facc15', '#4ade80', '#818cf8'];
        const labels = ['', 'Слабый', 'Средний', 'Хороший', 'Отличный'];
        const idx = s < 30 ? 1 : s < 60 ? 2 : s < 80 ? 3 : 4;

        fill.style.width = s + '%';
        fill.style.background = colors[idx];
        if (label) { label.textContent = labels[idx]; label.style.color = colors[idx]; }
    };

    const autoResize = ta => {
        if (!ta) return;
        ta.style.height = 'auto';
        ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
    };

    const updateSend = () => {
        const inp = $('msg-input');
        const btn = $('send-btn');
        if (btn) btn.disabled = !(inp && inp.value.trim());
    };

    const initEmojiTabs = () => {};
    const renderEmojis = () => {};

    const openLightbox = src => { const img = $('lb-img'); const lb = $('lightbox'); if (img) img.src = src; if (lb) lb.classList.remove('hidden'); };
    const closeLightbox = () => { const lb = $('lightbox'); if (lb) lb.classList.add('hidden'); };

    const showCtx = (x, y, data) => {
        const m = $('ctx');
        if (!m) return;
        m.classList.remove('hidden');
        m.style.left = Math.min(x, window.innerWidth - 200) + 'px';
        m.style.top = Math.min(y, window.innerHeight - 150) + 'px';
        m.dataset.mid = data.id || '';
        m.dataset.txt = data.text || '';
    };

    const hideCtx = () => { const m = $('ctx'); if (m) m.classList.add('hidden'); };
    const haptic = () => {};

    return { toast, modal, prompt, showChat, hideChat, avatarBg, fmtTime, fmtDate, esc, fmtSep: fmtDate, pwStrength, autoResize, updateSend, initEmojiTabs, renderEmojis, openLightbox, closeLightbox, showCtx, hideCtx, haptic, openSidebar, closeSidebar };
})();
