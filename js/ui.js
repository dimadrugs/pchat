const UI = (() => {
    const $ = id => document.getElementById(id);

    /* ---- Toast ---- */
    let _tt;
    const toast = (msg, ms = 3000) => {
        const el = $('toast');
        if (!el) return;
        clearTimeout(_tt);
        el.textContent = msg;
        el.classList.add('on');
        _tt = setTimeout(() => el.classList.remove('on'), ms);
    };

    /* ---- Modal ---- */
    const modal = (title, html, yesText = 'OK', noText = 'Отмена', dangerYes = false) => new Promise(ok => {
        const m = $('mini-modal');
        const t = $('mm-title');
        const b = $('mm-body');
        const y = $('mm-yes');
        const n = $('mm-no');
        if (!m || !t || !b || !y || !n) return ok(false);

        t.textContent = title;
        b.innerHTML = html;
        y.textContent = yesText;
        n.textContent = noText;
        y.className = 'mm-btn yes' + (dangerYes ? ' danger' : '');
        m.classList.remove('hidden');

        const done = v => {
            m.classList.add('hidden');
            y.onclick = null;
            n.onclick = null;
            m.onclick = null;
            ok(v);
        };

        y.onclick = () => done(true);
        n.onclick = () => done(false);
        m.onclick = e => { if (e.target === m) done(false); };
    });

    const prompt = (title, ph = '', def = '') => new Promise(ok => {
        const m = $('mini-modal');
        const t = $('mm-title');
        const b = $('mm-body');
        const y = $('mm-yes');
        const n = $('mm-no');
        if (!m || !t || !b || !y || !n) return ok(null);

        t.textContent = title;
        b.innerHTML = `<input id="mminp" placeholder="${ph}" value="${def}">`;
        y.textContent = 'Сохранить';
        n.textContent = 'Отмена';
        y.className = 'mm-btn yes';
        m.classList.remove('hidden');

        const inp = $('mminp');
        if (inp) setTimeout(() => inp.focus(), 100);

        const done = v => {
            m.classList.add('hidden');
            y.onclick = null;
            n.onclick = null;
            m.onclick = null;
            ok(v);
        };

        y.onclick = () => done(inp ? inp.value.trim() : null);
        n.onclick = () => done(null);
        m.onclick = e => { if (e.target === m) done(null); };
        if (inp) inp.onkeydown = e => { if (e.key === 'Enter') done(inp.value.trim()); };
    });

    /* ---- Chat view ---- */
    const showChat = () => {
        const cv = $('chat-view');
        const ws = $('welcome-screen');
        if (!cv) return;

        if (window.innerWidth <= 768) {
            cv.classList.remove('hidden');
            setTimeout(() => cv.classList.add('slide-in'), 10);
        } else {
            cv.classList.remove('hidden');
            cv.classList.add('slide-in');
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
            cv.classList.remove('slide-in');
            if (ws) ws.classList.remove('hidden');
        }
    };

    /* Пустышки, чтобы не было ошибок, так как меню больше не выезжает */
    const openSidebar = () => {};
    const closeSidebar = () => {};

    /* ---- Lightbox ---- */
    const openLightbox = src => {
        const img = $('lb-img');
        const lb = $('lightbox');
        if (img) img.src = src;
        if (lb) lb.classList.remove('hidden');
    };

    const closeLightbox = () => {
        const lb = $('lightbox');
        if (lb) lb.classList.add('hidden');
    };

    /* ---- Context menu ---- */
    const showCtx = (x, y, data) => {
        const m = $('ctx');
        if (!m) return;
        m.classList.remove('hidden');
        m.style.left = Math.min(x, window.innerWidth - 200) + 'px';
        m.style.top = Math.min(y, window.innerHeight - 150) + 'px';
        m.dataset.mid = data.id || '';
        m.dataset.txt = data.text || '';
        m.dataset.sid = data.senderId || '';
    };

    const hideCtx = () => {
        const m = $('ctx');
        if (m) m.classList.add('hidden');
    };

    /* ---- Emojis ---- */
    const EMOJIS = {
        '😀': ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐','😕','😟','🙁','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖'],
        '❤️': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','💕','💞','💓','💗','💖','💘','💝','💟','♥️','💋','💌','💐','🌹','🥀','🌺','🌸','🌼','🌻','⭐','🌟','✨','⚡','🔥','💥','🎉','🎊','🎈','🎀','🎁','🏆','🥇','🏅','🎖️','🎯','💎','👑','🔮'],
        '👋': ['👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🧠','🫀','🫁','🦷','🦴','👀','👁️','👅','👄'],
        '🐶': ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤','🐣','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🪲','🪳','🦗','🕷️','🦂','🐢','🐍','🦎','🦀','🦞','🦐','🦑','🐙','🐠','🐟','🐬','🐳','🐋','🦈','🦭','🐊','🐅','🐆','🦓','🦍','🦧','🐘','🦛','🦏'],
        '🍎': ['🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶️','🫑','🌽','🥕','🫒','🧄','🧅','🥔','🍠','🥐','🥯','🍞','🥖','🥨','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🫓','🥪','🥙','🧆','🌮','🌯','🫔','🥗','🥘','🫕','🥫','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🦪','🍤','🍙','🍚','🍘','🍥','🥠','🥮','🍢','🍡','🍧','🍨','🍦','🥧','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🌰','🥜','🍯','🥛','🍼','☕','🫖','🍵','🧃','🥤','🧋','🍶','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🧉','🍾','🫗'],
        '⚽': ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒','🏑','🥍','🏏','🪃','🥅','⛳','🪁','🏹','🎣','🤿','🥊','🥋','🎽','🛹','🛼','🛷','⛸️','🥌','🎿','⛷️','🏂','🪂','🏋️','🤺','🤸','⛹️','🤾','🏌️','🏇','🧘','🏄','🏊','🤽','🚣','🧗','🚵','🚴','🏆','🥇','🥈','🥉','🏅','🎖️','🏵️','🎗️','🎫','🎟️','🎪']
    };

    const renderEmojis = cat => {
        const grid = $('emoji-grid');
        if (!grid) return;
        grid.innerHTML = '';
        (EMOJIS[cat] || []).forEach(e => {
            const b = document.createElement('button');
            b.textContent = e;
            b.onclick = () => {
                const inp = $('msg-input');
                if (inp) {
                    inp.value += e;
                    inp.focus();
                    autoResize(inp);
                    updateSend();
                }
            };
            grid.appendChild(b);
        });
        document.querySelectorAll('.emoji-tab-row button').forEach(b => {
            b.classList.toggle('on', b.dataset.cat === cat);
        });
    };

    const initEmojiTabs = () => {
        const tabs = $('emoji-tabs');
        if (!tabs) return;
        tabs.innerHTML = '';
        const cats = Object.keys(EMOJIS);
        cats.forEach((k, i) => {
            const b = document.createElement('button');
            b.textContent = k;
            b.dataset.cat = k;
            if (i === 0) b.classList.add('on');
            b.onclick = () => renderEmojis(k);
            tabs.appendChild(b);
        });
        if (cats.length > 0) renderEmojis(cats[0]);
    };

    /* ---- Textarea ---- */
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

    /* ---- Password strength ---- */
    const pwStrength = pw => {
        let s = 0;
        if (pw.length >= 8) s += 25;
        if (pw.length >= 12) s += 15;
        if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s += 20;
        if (/\d/.test(pw)) s += 20;
        if (/[^a-zA-Z\d]/.test(pw)) s += 20;

        const fill = $('pw-fill');
        const label = $('pw-label');
        if (!fill) return;

        const colors = ['', '#f87171', '#facc15', '#4ade80', '#818cf8'];
        const labels = ['', 'Слабый', 'Средний', 'Хороший', 'Отличный'];
        const idx = s < 30 ? 1 : s < 60 ? 2 : s < 80 ? 3 : 4;

        fill.style.width = s + '%';
        fill.style.background = colors[idx];
        if (label) {
            label.textContent = labels[idx];
            label.style.color = colors[idx];
        }
    };

    /* ---- Avatar ---- */
    const avatarBg = name => {
        const grads = [
            'linear-gradient(135deg,#818cf8,#a855f7)',
            'linear-gradient(135deg,#f472b6,#ec4899)',
            'linear-gradient(135deg,#38bdf8,#0ea5e9)',
            'linear-gradient(135deg,#4ade80,#16a34a)',
            'linear-gradient(135deg,#fb923c,#ea580c)',
            'linear-gradient(135deg,#a78bfa,#7c3aed)',
            'linear-gradient(135deg,#f9a8d4,#db2777)',
            'linear-gradient(135deg,#6ee7b7,#059669)'
        ];
        let h = 0;
        const str = name || 'X';
        for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
        return grads[Math.abs(h) % grads.length];
    };

    /* ---- Time ---- */
    const fmtTime = ts => {
        if (!ts) return '';
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    };

    const fmtDate = ts => {
        if (!ts) return '';
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        const now = new Date();
        const diff = now - d;
        if (diff < 864e5 && d.getDate() === now.getDate()) return fmtTime(ts);
        if (diff < 2 * 864e5) return 'Вчера';
        if (diff < 7 * 864e5) return d.toLocaleDateString('ru-RU', { weekday: 'short' });
        return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    };

    const fmtSep = ts => {
        if (!ts) return '';
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        const now = new Date();
        const diff = now - d;
        if (diff < 864e5 && d.getDate() === now.getDate()) return 'Сегодня';
        if (diff < 2 * 864e5) return 'Вчера';
        return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    };

    /* ---- Misc ---- */
    const haptic = t => {
        if (navigator.vibrate) navigator.vibrate(t === 'light' ? 10 : 25);
    };

    const esc = s => {
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    };

    return {
        toast, modal, prompt,
        showChat, hideChat,
        openSidebar, closeSidebar,
        openLightbox, closeLightbox,
        showCtx, hideCtx,
        renderEmojis, initEmojiTabs,
        autoResize, updateSend,
        pwStrength, avatarBg,
        fmtTime, fmtDate, fmtSep,
        haptic, esc
    };
})();
