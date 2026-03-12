const UI = (() => {
    let _tt;
    const toast = (msg, ms = 3000) => {
        const el = document.getElementById('toast');
        clearTimeout(_tt);
        el.textContent = msg;
        el.classList.add('on');
        _tt = setTimeout(() => el.classList.remove('on'), ms);
    };

    const modal = (title, html, yesText = 'OK', noText = 'Отмена', dangerYes = false) => new Promise(ok => {
        const m = document.getElementById('mini-modal');
        document.getElementById('mm-title').textContent = title;
        document.getElementById('mm-body').innerHTML = html;
        const y = document.getElementById('mm-yes');
        const n = document.getElementById('mm-no');
        y.textContent = yesText; n.textContent = noText;
        y.className = 'mm-btn yes' + (dangerYes ? ' danger' : '');
        m.classList.remove('hidden');
        const done = v => { m.classList.add('hidden'); y.onclick = n.onclick = null; ok(v) };
        y.onclick = () => done(true);
        n.onclick = () => done(false);
        m.onclick = e => { if (e.target === m) done(false) };
    });

    const prompt = (title, ph = '', def = '') => new Promise(ok => {
        const m = document.getElementById('mini-modal');
        document.getElementById('mm-title').textContent = title;
        document.getElementById('mm-body').innerHTML = `<input id="mminp" placeholder="${ph}" value="${def}">`;
        m.classList.remove('hidden');
        const inp = document.getElementById('mminp');
        const y = document.getElementById('mm-yes');
        const n = document.getElementById('mm-no');
        y.textContent = 'Сохранить'; n.textContent = 'Отмена';
        setTimeout(() => inp.focus(), 100);
        const done = v => { m.classList.add('hidden'); y.onclick = n.onclick = null; ok(v) };
        y.onclick = () => done(inp.value.trim());
        n.onclick = () => done(null);
        inp.onkeydown = e => { if (e.key === 'Enter') done(inp.value.trim()) };
        m.onclick = e => { if (e.target === m) done(null) };
    });

    // Screens
    const showChat = () => {
        if (window.innerWidth <= 768) {
            const cv = document.getElementById('chat-view');
            cv.classList.remove('hidden');
            requestAnimationFrame(() => cv.classList.add('slide-in'));
        } else {
            document.getElementById('chat-view').classList.remove('hidden');
            document.getElementById('welcome-screen').classList.add('hidden');
        }
    };

    const hideChat = () => {
        const cv = document.getElementById('chat-view');
        if (window.innerWidth <= 768) {
            cv.classList.remove('slide-in');
            setTimeout(() => cv.classList.add('hidden'), 300);
        } else {
            cv.classList.add('hidden');
            document.getElementById('welcome-screen').classList.remove('hidden');
        }
    };

    const openSidebar = () => {
        document.getElementById('sidebar').classList.add('open');
        document.getElementById('mob-overlay').classList.remove('hidden');
    };
    const closeSidebar = () => {
        document.getElementById('sidebar').classList.remove('open');
        document.getElementById('mob-overlay').classList.add('hidden');
    };

    // Lightbox
    const openLightbox = src => { document.getElementById('lb-img').src = src; document.getElementById('lightbox').classList.remove('hidden') };
    const closeLightbox = () => document.getElementById('lightbox').classList.add('hidden');

    // Context menu
    const showCtx = (x, y, data) => {
        const m = document.getElementById('ctx');
        m.classList.remove('hidden');
        const r = m.getBoundingClientRect();
        m.style.left = Math.min(x, window.innerWidth - 200) + 'px';
        m.style.top = Math.min(y, window.innerHeight - 150) + 'px';
        m.dataset.mid = data.id; m.dataset.txt = data.text || ''; m.dataset.sid = data.senderId || '';
    };
    const hideCtx = () => document.getElementById('ctx').classList.add('hidden');

    // Emojis
    const EMOJIS = {
        '😊': ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','😉','😍','🥰','😘','😋','😛','😜','🤪','😎','🥳','😴','🤔','🤫','🤭','😶','😏','😒','🙄','😬','😤','😡','🤬','😈','👿','💀','🤡','👻','👽','🤖','💩'],
        '👋': ['👋','🤚','🖐','✋','👌','🤌','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','👍','👎','✊','👊','👏','🙌','🤲','🤝','🙏','💪','🫶','❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','💕','💞','💓','💗','💖'],
        '🐱': ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧','🐦','🦆','🦅','🦉','🐺','🐴','🦄','🦋','🐌','🐞','🐢','🐍','🦎','🐙','🦑','🐠','🐟','🐬','🐳','🦈','🐊','🦒','🦓','🐘','🦏'],
        '🍕': ['🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍒','🍑','🥭','🥥','🍅','🥑','🥦','🌶','🌽','🥕','🍠','🥐','🥖','🍞','🧀','🥚','🍳','🥞','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🌮','🌯','🥗','🍝','🍜','🍲','🍣','🍤','🧁','🍰','🎂','🍫','🍬','🍭','☕','🍵','🧋','🍺','🍻','🥂','🍷'],
        '⚽': ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🎱','🏓','🏸','🥊','🛹','🎿','⛷','🏂','🏋️','🤸','🧘','🏄','🏊','🚴','🏆','🥇','🥈','🥉','🎖','🎪','🎭','🎨','🎬','🎤','🎧','🎼','🎹','🥁','🎷','🎺','🎸','🎻','🎲','🎯','🎳','🎮','🕹','🧩'],
        '❤️': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','✅','❌','⭕','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🔺','🔻','💠','⚠️','♻️','🔒','🔓','🔔','🔕','💡','🔍','❗','❓','‼️','💯','🔥','✨','⭐','🌟','💫'],
    };

    const renderEmojis = cat => {
        const grid = document.getElementById('emoji-grid');
        grid.innerHTML = '';
        (EMOJIS[cat] || []).forEach(e => {
            const b = document.createElement('button');
            b.textContent = e;
            b.onclick = () => {
                const i = document.getElementById('msg-input');
                i.value += e; i.focus();
                autoResize(i); updateSend();
            };
            grid.appendChild(b);
        });
        document.querySelectorAll('.emoji-tab-row button').forEach(b => b.classList.toggle('on', b.dataset.cat === cat));
    };

    const initEmojiTabs = () => {
        const tabs = document.getElementById('emoji-tabs');
        tabs.innerHTML = '';
        Object.keys(EMOJIS).forEach((k, i) => {
            const b = document.createElement('button');
            b.textContent = k; b.dataset.cat = k;
            if (i === 0) b.classList.add('on');
            b.onclick = () => renderEmojis(k);
            tabs.appendChild(b);
        });
        renderEmojis(Object.keys(EMOJIS)[0]);
    };

    const autoResize = ta => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px' };
    const updateSend = () => { document.getElementById('send-btn').disabled = !document.getElementById('msg-input').value.trim() };

    const pwStrength = pw => {
        let s = 0;
        if (pw.length >= 8) s += 25;
        if (pw.length >= 12) s += 15;
        if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s += 20;
        if (/\d/.test(pw)) s += 20;
        if (/[^a-zA-Z\d]/.test(pw)) s += 20;
        const fill = document.getElementById('pw-fill');
        const label = document.getElementById('pw-label');
        if (!fill) return;
        const colors = ['','#f87171','#facc15','#4ade80','#818cf8'];
        const labels = ['','Слабый','Средний','Хороший','Отличный'];
        const idx = s < 30 ? 1 : s < 60 ? 2 : s < 80 ? 3 : 4;
        fill.style.width = s + '%';
        fill.style.background = colors[idx];
        if (label) { label.textContent = labels[idx]; label.style.color = colors[idx] }
    };

    const avatarBg = name => {
        const grads = ['linear-gradient(135deg,#818cf8,#a855f7)','linear-gradient(135deg,#f472b6,#ec4899)','linear-gradient(135deg,#38bdf8,#0ea5e9)','linear-gradient(135deg,#4ade80,#16a34a)','linear-gradient(135deg,#fb923c,#ea580c)','linear-gradient(135deg,#a78bfa,#7c3aed)','linear-gradient(135deg,#f9a8d4,#db2777)','linear-gradient(135deg,#6ee7b7,#059669)'];
        let h = 0; for (let i = 0; i < (name || '').length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
        return grads[Math.abs(h) % grads.length];
    };

    const fmtTime = ts => { if (!ts) return ''; const d = ts.toDate ? ts.toDate() : new Date(ts); return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) };
    const fmtDate = ts => {
        if (!ts) return '';
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        const now = new Date(); const diff = now - d;
        if (diff < 864e5 && d.getDate() === now.getDate()) return fmtTime(ts);
        if (diff < 2 * 864e5) return 'Вчера';
        if (diff < 7 * 864e5) return d.toLocaleDateString('ru-RU', { weekday: 'short' });
        return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    };
    const fmtSep = ts => {
        if (!ts) return '';
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        const now = new Date(); const diff = now - d;
        if (diff < 864e5 && d.getDate() === now.getDate()) return 'Сегодня';
        if (diff < 2 * 864e5) return 'Вчера';
        return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    };

    const haptic = t => { if (navigator.vibrate) navigator.vibrate(t === 'light' ? 10 : 25) };
    const esc = s => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML };

    return { toast, modal, prompt, showChat, hideChat, openSidebar, closeSidebar, openLightbox, closeLightbox, showCtx, hideCtx, renderEmojis, initEmojiTabs, autoResize, updateSend, pwStrength, avatarBg, fmtTime, fmtDate, fmtSep, haptic, esc };
})();
