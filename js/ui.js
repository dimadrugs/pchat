/* ================================================
   PCHAT — UI Utilities
   ================================================ */
const UI = (() => {
    /* ---- Toast ---- */
    let _tt;
    const toast = (msg, ms = 3000) => {
        const el = document.getElementById('toast');
        clearTimeout(_tt);
        el.textContent = msg;
        el.classList.add('on');
        _tt = setTimeout(() => el.classList.remove('on'), ms);
    };

    /* ---- Modal ---- */
    const modal = (title, html, yesText = 'OK', noText = 'Отмена') => new Promise(ok => {
        const m = document.getElementById('modal');
        const t = document.getElementById('modal-title');
        const b = document.getElementById('modal-body');
        const y = document.getElementById('modal-yes');
        const n = document.getElementById('modal-no');
        t.textContent = title; b.innerHTML = html;
        y.textContent = yesText; n.textContent = noText;
        m.classList.remove('hidden');
        const done = v => { m.classList.add('hidden'); y.onclick = n.onclick = null; ok(v) };
        y.onclick = () => done(true);
        n.onclick = () => done(false);
    });

    const prompt = (title, placeholder = '', def = '') => new Promise(ok => {
        const html = `<input id="mp-input" placeholder="${placeholder}" value="${def}">`;
        const m = document.getElementById('modal');
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-body').innerHTML = html;
        m.classList.remove('hidden');
        const inp = document.getElementById('mp-input');
        setTimeout(() => inp.focus(), 100);
        const done = v => { m.classList.add('hidden'); y.onclick = n.onclick = null; ok(v) };
        const y = document.getElementById('modal-yes');
        const n = document.getElementById('modal-no');
        y.onclick = () => done(inp.value.trim());
        n.onclick = () => done(null);
        inp.onkeydown = e => { if (e.key === 'Enter') done(inp.value.trim()) };
    });

    /* ---- Screen nav ---- */
    const show = id => {
        const all = ['chat-list-screen', 'chat-screen', 'contacts-screen', 'settings-screen'];
        if (window.innerWidth < 769) {
            all.forEach(s => document.getElementById(s).classList.toggle('hidden', s !== id));
        } else {
            if (id === 'chat-screen') {
                document.getElementById('chat-screen').classList.remove('hidden');
                document.getElementById('contacts-screen').classList.add('hidden');
                document.getElementById('settings-screen').classList.add('hidden');
            } else if (id === 'contacts-screen') {
                document.getElementById('contacts-screen').classList.remove('hidden');
                document.getElementById('settings-screen').classList.add('hidden');
            } else if (id === 'settings-screen') {
                document.getElementById('settings-screen').classList.remove('hidden');
                document.getElementById('contacts-screen').classList.add('hidden');
            } else {
                document.getElementById('contacts-screen').classList.add('hidden');
                document.getElementById('settings-screen').classList.add('hidden');
            }
        }
    };

    /* ---- Drawer ---- */
    const openDrawer = () => { document.getElementById('drawer').classList.add('open'); document.getElementById('drawer-overlay').classList.remove('hidden') };
    const closeDrawer = () => { document.getElementById('drawer').classList.remove('open'); document.getElementById('drawer-overlay').classList.add('hidden') };

    /* ---- Lightbox ---- */
    const openLightbox = src => { document.getElementById('lightbox-img').src = src; document.getElementById('lightbox').classList.remove('hidden') };
    const closeLightbox = () => document.getElementById('lightbox').classList.add('hidden');

    /* ---- Context menu ---- */
    const showCtx = (x, y, data) => {
        const m = document.getElementById('ctx-menu');
        m.classList.remove('hidden');
        const r = m.getBoundingClientRect();
        m.style.left = Math.min(x, window.innerWidth - r.width - 8) + 'px';
        m.style.top = Math.min(y, window.innerHeight - r.height - 8) + 'px';
        m.dataset.msgId = data.id; m.dataset.msgText = data.text || ''; m.dataset.senderId = data.senderId || '';
    };
    const hideCtx = () => document.getElementById('ctx-menu').classList.add('hidden');

    /* ---- Emoji ---- */
    const EMOJIS = {
        '😊': ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','😮‍💨','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐','😕','😟','🙁','☹️','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖'],
        '👋': ['👋','🤚','🖐','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','💪','🦾','🦿','🦵','🦶','👂','👃','🧠','👀','👁','👅','👄','💋','❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝'],
        '🐱': ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🪲','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐠','🐟','🐬','🐳','🐋','🦈','🐊','🐅','🐆','🦓','🦍','🐘','🦛','🦏','🐪','🐫','🦒','🦘','🦬','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦙','🐐','🦌','🐕','🐩','🦮','🐕‍🦺','🐈','🐈‍⬛','🪶','🐓','🦃','🦤','🦚','🦜','🦢','🦩','🕊','🐇','🦝','🦨','🦡','🦫','🦦','🦥','🐁','🐀','🐿','🦔'],
        '🍕': ['🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶','🫑','🌽','🥕','🧄','🧅','🥔','🍠','🥐','🥖','🍞','🥨','🧀','🥚','🍳','🥞','🧇','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🥪','🥙','🧆','🌮','🌯','🥗','🥘','🥫','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🍤','🍙','🍚','🍘','🍥','🥠','🍢','🍡','🍧','🍨','🍦','🥧','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','☕','🍵','🧃','🥤','🧋','🍶','🍺','🍻','🥂','🍷','🍸','🍹','🧉','🍾'],
        '⚽': ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🏓','🏸','🏒','🏑','🥍','🏏','🪃','🥅','⛳','🏹','🎣','🥊','🥋','🛹','🛼','🛷','⛸','🥌','🎿','⛷','🏂','🪂','🏋️','🤸','🤺','⛹️','🤾','🏌️','🏇','🧘','🏄','🏊','🤽','🚣','🧗','🚵','🚴','🏆','🥇','🥈','🥉','🏅','🎖','🏵','🎗','🎫','🎪','🎭','🎨','🎬','🎤','🎧','🎼','🎹','🥁','🎷','🎺','🎸','🪕','🎻','🎲','♟','🎯','🎳','🎮','🕹','🧩'],
        '❤️': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','☯️','✡️','🔯','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','⛎','💯','🔅','🔆','⚠️','♻️','✅','❌','⭕','❗','❓','‼️','⁉️','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤','🔺','🔻','💠','🔘','🏁','🚩','🎌','🏴','🏳️','🏳️‍🌈','🏳️‍⚧️'],
    };

    const renderEmojis = (catKey) => {
        const grid = document.getElementById('emoji-grid');
        grid.innerHTML = '';
        const list = EMOJIS[catKey] || [];
        list.forEach(e => {
            const b = document.createElement('button');
            b.textContent = e;
            b.onclick = () => {
                const inp = document.getElementById('msg-input');
                inp.value += e; inp.focus();
                autoResize(inp); updateSend();
            };
            grid.appendChild(b);
        });
        document.querySelectorAll('#emoji-tabs button').forEach(b => b.classList.toggle('on', b.dataset.cat === catKey));
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
    };

    /* ---- Textarea auto ---- */
    const autoResize = ta => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px' };
    const updateSend = () => { document.getElementById('send-btn').disabled = !document.getElementById('msg-input').value.trim() };

    /* ---- PW strength ---- */
    const pwStrength = pw => {
        let s = 0;
        if (pw.length >= 8) s += 25;
        if (pw.length >= 12) s += 15;
        if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s += 20;
        if (/\d/.test(pw)) s += 20;
        if (/[^a-zA-Z\d]/.test(pw)) s += 20;
        const fill = document.querySelector('.pw-bar-fill');
        const label = document.querySelector('.pw-label');
        if (!fill) return;
        let color, text;
        if (s < 30) { color = '#ef4444'; text = 'Слабый' }
        else if (s < 60) { color = '#eab308'; text = 'Средний' }
        else if (s < 80) { color = '#22c55e'; text = 'Хороший' }
        else { color = '#3b82f6'; text = 'Отличный' }
        fill.style.width = s + '%'; fill.style.background = color;
        label.textContent = text; label.style.color = color;
    };

    /* ---- Avatar ---- */
    const colors = [
        'linear-gradient(135deg,#667eea,#764ba2)',
        'linear-gradient(135deg,#f093fb,#f5576c)',
        'linear-gradient(135deg,#4facfe,#00f2fe)',
        'linear-gradient(135deg,#43e97b,#38f9d7)',
        'linear-gradient(135deg,#fa709a,#fee140)',
        'linear-gradient(135deg,#a18cd1,#fbc2eb)',
        'linear-gradient(135deg,#fccb90,#d57eeb)',
        'linear-gradient(135deg,#e0c3fc,#8ec5fc)',
    ];
    const avatarBg = name => { let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h); return colors[Math.abs(h) % colors.length] };

    /* ---- Time ---- */
    const fmtTime = ts => {
        if (!ts) return '';
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    };
    const fmtDate = ts => {
        if (!ts) return '';
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        const now = new Date(); const diff = now - d;
        if (diff < 864e5 && d.getDate() === now.getDate()) return fmtTime(ts);
        if (diff < 2 * 864e5) return 'Вчера';
        if (diff < 7 * 864e5) return d.toLocaleDateString('ru-RU', { weekday: 'short' });
        return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    };
    const fmtDateSep = ts => {
        if (!ts) return '';
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        const now = new Date(); const diff = now - d;
        if (diff < 864e5 && d.getDate() === now.getDate()) return 'Сегодня';
        if (diff < 2 * 864e5) return 'Вчера';
        return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    };

    /* ---- Haptic ---- */
    const haptic = (t = 'light') => { if (navigator.vibrate) navigator.vibrate(t === 'light' ? 10 : t === 'medium' ? 20 : 40) };

    /* ---- Escape HTML ---- */
    const esc = s => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML };

    return {
        toast, modal, prompt, show,
        openDrawer, closeDrawer,
        openLightbox, closeLightbox,
        showCtx, hideCtx,
        renderEmojis, initEmojiTabs,
        autoResize, updateSend,
        pwStrength, avatarBg,
        fmtTime, fmtDate, fmtDateSep,
        haptic, esc
    };
})();