const UI = (() => {
    const $ = id => document.getElementById(id);

    /* ========== TOAST ========== */
    let _tt;
    const toast = (msg, ms = 3000) => {
        const el = $('toast');
        if (!el) return;
        clearTimeout(_tt);
        el.textContent = msg;
        el.classList.add('on');
        _tt = setTimeout(() => el.classList.remove('on'), ms);
    };

    /* ========== MODAL ========== */
    const modal = (title, html, yesText = 'OK', noText = 'Отмена', dangerYes = false) => new Promise(ok => {
        const m = $('mini-modal'), t = $('mm-title'), b = $('mm-body'), y = $('mm-yes'), n = $('mm-no');
        if (!m || !t || !b || !y || !n) return ok(false);
        t.textContent = title;
        b.innerHTML = html;
        y.textContent = yesText;
        n.textContent = noText;
        y.className = 'mm-btn yes' + (dangerYes ? ' danger' : '');
        m.classList.remove('hidden');
        const done = v => {
            m.classList.add('hidden');
            y.onclick = null; n.onclick = null; m.onclick = null;
            ok(v);
        };
        y.onclick = () => done(true);
        n.onclick = () => done(false);
        m.onclick = e => { if (e.target === m) done(false); };
    });

    const prompt = (title, ph = '', def = '') => new Promise(ok => {
        const m = $('mini-modal'), t = $('mm-title'), b = $('mm-body'), y = $('mm-yes'), n = $('mm-no');
        if (!m || !t || !b || !y || !n) return ok(null);
        t.textContent = title;
        b.innerHTML = `<input id="mminp" placeholder="${ph}" value="${esc(def)}">`;
        y.textContent = 'Сохранить';
        n.textContent = 'Отмена';
        y.className = 'mm-btn yes';
        m.classList.remove('hidden');
        const inp = $('mminp');
        if (inp) setTimeout(() => inp.focus(), 100);
        const done = v => {
            m.classList.add('hidden');
            y.onclick = null; n.onclick = null; m.onclick = null;
            ok(v);
        };
        y.onclick = () => done(inp ? inp.value.trim() : null);
        n.onclick = () => done(null);
        m.onclick = e => { if (e.target === m) done(null); };
        if (inp) inp.onkeydown = e => { if (e.key === 'Enter') done(inp.value.trim()); };
    });

    /* ========== CHAT VIEW ========== */
    const showChat = () => {
        const cv = $('chat-view');
        const ws = $('welcome-screen');
        if (!cv) return;

        if (window.innerWidth <= 768) {
            // Мобилка: убираем hidden, добавляем slide-in
            // Важно: на мобилке hidden = transform+visibility, не display:none
            cv.classList.remove('hidden');

            // Два rAF — браузеру нужно время применить removal of hidden
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    cv.classList.add('slide-in');
                });
            });
        } else {
            // ПК: показываем нормально
            cv.classList.remove('hidden');
            if (ws) ws.classList.add('hidden');
        }
    };

    const hideChat = () => {
        const cv = $('chat-view');
        const ws = $('welcome-screen');
        if (!cv) return;

        if (window.innerWidth <= 768) {
            // Мобилка: убираем slide-in, добавляем hidden
            cv.classList.remove('slide-in');
            // Небольшая задержка чтобы transition отработал
            setTimeout(() => {
                cv.classList.add('hidden');
            }, 320);
        } else {
            // ПК: скрываем через display:none
            cv.classList.add('hidden');
            cv.classList.remove('slide-in');
            if (ws) ws.classList.remove('hidden');
        }
    };

    const openSidebar = () => {};
    const closeSidebar = () => {};

    /* ========== LIGHTBOX ========== */
    const openLightbox = src => {
        const img = $('lb-img'), lb = $('lightbox');
        if (img) img.src = src;
        if (lb) lb.classList.remove('hidden');
    };
    const closeLightbox = () => $('lightbox')?.classList.add('hidden');

    /* ========== CONTEXT MENU ========== */
    const showCtx = (x, y, data) => {
        const m = $('ctx');
        if (!m) return;
        m.classList.remove('hidden');
        m.style.left = Math.min(x, window.innerWidth - 190) + 'px';
        m.style.top = Math.min(y, window.innerHeight - 120) + 'px';
        m.dataset.mid = data.id || '';
        m.dataset.txt = data.text || '';
        m.dataset.sid = data.senderId || '';
    };
    const hideCtx = () => $('ctx')?.classList.add('hidden');

    /* ========== EMOJI ========== */
    const EMOJIS = {
        '😀': ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐','😕','😟','🙁','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠','💩','🤡','👹','👺','👻','👽','👾','🤖'],
        '❤️': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','♥️','💌','💋','👋','🤚','🖐','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','✍️','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','👀','👁','👅','👄'],
        '🐶': ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🦟','🦗','🕷','🦂','🐢','🐍','🦎','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊','🐅','🐆','🦓','🦍','🐘','🦛','🦏','🐪','🐫','🦒','🦘','🦬','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦙','🐐','🦌','🐕','🐩','🦮','🐈','🐈‍⬛','🐓','🦃','🦤','🦚','🦜','🦢','🦩','🕊','🐇','🦝','🦨','🦡','🦫','🦦','🦥','🐁','🐀','🐿','🦔'],
        '🍎': ['🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶','🫑','🌽','🥕','🧄','🧅','🥔','🍠','🥐','🥯','🍞','🥖','🥨','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🌮','🌯','🥗','🥘','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🍤','🍙','🍚','🍘','🍥','🥮','🍢','🍡','🍧','🍨','🍦','🥧','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🌰','🥜','🍯','🥛','🍼','🫖','☕','🍵','🧃','🥤','🧋','🍶','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🧉','🍾'],
        '⚽': ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🏓','🏸','🥊','🥋','🎽','🛹','🛼','🛷','⛸','🥌','🎿','⛷','🏂','🪂','🏋️','🤼','🤸','🤺','⛹️','🏇','🧘','🏄','🏊','🤽','🚣','🧗','🚵','🚴','🏆','🥇','🥈','🥉','🏅','🎖','🎪','🎭','🎨','🎬','🎤','🎧','🎼','🎹','🥁','🎷','🎺','🎸','🪕','🎻','🎲','♟','🎯','🎳','🎮','🎰','🧩'],
        '🏠': ['🏠','🏡','🏘','🏚','🏗','🏭','🏢','🏬','🏣','🏤','🏥','🏦','🏨','🏪','🏫','🏛','⛪','🕌','🛕','🕍','⛩','🕋','⛲','⛺','🌁','🌃','🏙','🌄','🌅','🌆','🌇','🌉','🎠','🎡','🎢','🚂','🚃','🚄','🚅','🚆','🚇','🚈','🚉','🚊','🚝','🚞','🚋','🚌','🚍','🚎','🚐','🚑','🚒','🚓','🚔','🚕','🚖','🚗','🚘','🚙','🛻','🚚','🚛','🚜','🏎','🏍','🛵','🚲','🛴','🛹','🛼','✈','🛩','🛫','🛬','🪂','💺','🚁','🚀','🛸','🚢','⛵','🛶','🚤','🛳','⛴','🛥'],
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
                if (inp) { inp.value += e; inp.focus(); autoResize(inp); updateSend(); }
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
        Object.keys(EMOJIS).forEach((k, i) => {
            const b = document.createElement('button');
            b.textContent = k;
            b.dataset.cat = k;
            if (i === 0) b.classList.add('on');
            b.onclick = () => renderEmojis(k);
            tabs.appendChild(b);
        });
        renderEmojis(Object.keys(EMOJIS)[0]);
    };

    /* ========== TEXTAREA ========== */
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

    /* ========== PASSWORD STRENGTH ========== */
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
        const colors = ['', '#f87171', '#facc15', '#4ade80', '#22d3ae'];
        const labels = ['', 'Слабый', 'Средний', 'Хороший', 'Отличный'];
        const idx = s < 30 ? 1 : s < 60 ? 2 : s < 80 ? 3 : 4;
        fill.style.width = s + '%';
        fill.style.background = colors[idx];
        if (label) { label.textContent = labels[idx]; label.style.color = colors[idx]; }
    };

    /* ========== AVATAR ========== */
    const avatarBg = name => {
        const grads = [
            'linear-gradient(135deg,#22d3ae,#38bdf8)',
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

    /* ========== TIME ========== */
    const fmtTime = ts => {
        if (!ts) return '';
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    };

    const fmtTimeNow = () => {
        return new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
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

    /* ========== MISC ========== */
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
        fmtTime, fmtTimeNow, fmtDate, fmtSep,
        haptic, esc
    };
})();
