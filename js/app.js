/* ================================================
   PCHAT — Main App Controller
   ================================================ */
(async () => {
    'use strict';

    const splash = document.getElementById('splash-screen');
    const authScr = document.getElementById('auth-screen');
    const appEl = document.getElementById('app');

    /* ---- Init ---- */
    const logged = await Auth.init();
    setTimeout(() => {
        splash.classList.add('out');
        setTimeout(() => { splash.classList.add('hidden'); logged ? runApp() : runAuth() }, 600);
    }, 1400);

    function runAuth() { authScr.classList.remove('hidden'); appEl.classList.add('hidden') }
    function runApp() { authScr.classList.add('hidden'); appEl.classList.remove('hidden'); refreshUI(); loadChats(); Notif.init(); Contacts.init(); UI.initEmojiTabs() }

    /* ---- Auth UI ---- */
    document.getElementById('to-register').onclick = e => { e.preventDefault(); document.getElementById('login-form').classList.add('hidden'); document.getElementById('register-form').classList.remove('hidden') };
    document.getElementById('to-login').onclick = e => { e.preventDefault(); document.getElementById('register-form').classList.add('hidden'); document.getElementById('login-form').classList.remove('hidden') };

    // Toggle pw visibility
    document.querySelectorAll('.field-toggle').forEach(b => {
        b.onclick = () => {
            const inp = document.getElementById(b.dataset.target);
            inp.type = inp.type === 'password' ? 'text' : 'password';
        };
    });

    // PW strength
    document.getElementById('reg-password').addEventListener('input', e => UI.pwStrength(e.target.value));

    // Login
    document.getElementById('login-btn').onclick = async () => {
        const email = document.getElementById('login-email').value.trim();
        const pw = document.getElementById('login-password').value;
        if (!email || !pw) return UI.toast('Заполните все поля');
        const btn = document.getElementById('login-btn');
        setLoading(btn, true);
        try { await Auth.login(email, pw); runApp() }
        catch (e) { UI.toast(Auth.errMsg(e)) }
        finally { setLoading(btn, false) }
    };

    // Register
    document.getElementById('register-btn').onclick = async () => {
        const name = document.getElementById('reg-name').value.trim();
        const email = document.getElementById('reg-email').value.trim();
        const pw = document.getElementById('reg-password').value;
        const conf = document.getElementById('reg-confirm').value;
        if (!name || !email || !pw) return UI.toast('Заполните все поля');
        if (pw.length < 8) return UI.toast('Пароль мин. 8 символов');
        if (pw !== conf) return UI.toast('Пароли не совпадают');
        const btn = document.getElementById('register-btn');
        setLoading(btn, true);
        try { await Auth.register(email, pw, name); runApp() }
        catch (e) { UI.toast(Auth.errMsg(e)) }
        finally { setLoading(btn, false) }
    };

    // Google
    document.getElementById('google-btn').onclick = async () => {
        try { await Auth.google(); runApp() }
        catch (e) { UI.toast(Auth.errMsg(e)) }
    };

    function setLoading(btn, on) {
        btn.disabled = on;
        btn.querySelector('.btn-text').classList.toggle('hidden', on);
        btn.querySelector('.btn-loader').classList.toggle('hidden', !on);
    }

    /* ---- Refresh sidebar / settings ---- */
    function refreshUI() {
        const p = Auth.profile(); if (!p) return;
        const ini = (p.name || 'P')[0].toUpperCase();
        document.getElementById('drawer-avatar').textContent = ini;
        document.getElementById('drawer-name').textContent = p.name || 'User';
        document.getElementById('drawer-email').textContent = p.email || '';
        document.getElementById('settings-avatar-char').textContent = ini;
        document.getElementById('settings-user-name').textContent = p.name || 'User';
        document.getElementById('settings-user-email').textContent = p.email || '';
        document.getElementById('sv-name').textContent = p.name || '—';
        document.getElementById('sv-bio').textContent = p.bio || 'Не указано';
        if (Auth.pubKey()) Crypto.fingerprint(Auth.pubKey()).then(f => document.getElementById('sv-fingerprint').textContent = f);
    }

    /* ---- Chat list ---- */
    let _chatUnsub = null;
    function loadChats() {
        const me = Auth.user().uid;
        const list = document.getElementById('chat-list');
        const empty = document.getElementById('empty-chats');
        if (_chatUnsub) _chatUnsub();

        _chatUnsub = db.collection('chats')
            .where('participants', 'array-contains', me)
            .orderBy('lastMessageTime', 'desc')
            .onSnapshot(snap => {
                list.innerHTML = '';
                if (snap.empty) { list.appendChild(empty); empty.classList.remove('hidden'); return }
                empty.classList.add('hidden');
                snap.forEach(doc => {
                    const c = doc.data(), cid = doc.id;
                    const pid = c.participants.find(p => p !== me);
                    const pname = c.names?.[pid] || 'User';
                    const pemail = c.emails?.[pid] || '';
                    const unread = c[`unread_${me}`] || 0;
                    list.appendChild(makeChatRow(cid, pid, pname, pemail, c, unread));
                });
            });
    }

    function makeChatRow(cid, pid, name, email, chat, unread) {
        const el = document.createElement('div');
        el.className = 'chat-row'; el.dataset.chatId = cid;
        const ini = (name || 'U')[0].toUpperCase();
        const bg = UI.avatarBg(name);
        const msg = chat.lastMessage || 'Начните диалог';
        const time = chat.lastMessageTime ? UI.fmtDate(chat.lastMessageTime) : '';
        const badge = unread > 0 ? `<span class="chat-row-badge">${unread > 99 ? '99+' : unread}</span>` : '';

        el.innerHTML = `
            <div class="peer-avatar" style="background:${bg}">${ini}</div>
            <div class="chat-row-body">
                <div class="chat-row-top">
                    <span class="chat-row-name">${UI.esc(name)}</span>
                    <span class="chat-row-time">${time}</span>
                </div>
                <div class="chat-row-bottom">
                    <span class="chat-row-msg">${UI.esc(msg)}</span>
                    ${badge}
                </div>
            </div>`;

        el.onclick = async () => {
            UI.haptic('light');
            const pdoc = await db.collection('users').doc(pid).get();
            Chat.open(cid, pid, pdoc.exists ? pdoc.data() : { name, email });
            UI.show('chat-screen');
        };

        if (unread > 0 && !document.hasFocus()) { Notif.show(name, msg); Notif.sound() }
        return el;
    }

    /* ---- Navigation ---- */
    document.getElementById('menu-btn').onclick = () => { UI.haptic('light'); UI.openDrawer() };
    document.getElementById('drawer-overlay').onclick = UI.closeDrawer;
    document.getElementById('fab').onclick = () => UI.show('contacts-screen');
    document.getElementById('back-btn').onclick = () => { Chat.close(); UI.show('chat-list-screen') };
    document.getElementById('contacts-back').onclick = () => UI.show('chat-list-screen');
    document.getElementById('settings-back').onclick = () => UI.show('chat-list-screen');
    document.getElementById('dr-contacts').onclick = () => { UI.closeDrawer(); UI.show('contacts-screen') };
    document.getElementById('dr-settings').onclick = () => { UI.closeDrawer(); refreshUI(); UI.show('settings-screen') };
    document.getElementById('dr-invite').onclick = () => {
        UI.closeDrawer();
        if (navigator.share) navigator.share({ title: 'PCHAT', text: 'Присоединяйся к PCHAT — приватный мессенджер!', url: location.href });
        else { navigator.clipboard.writeText(location.href); UI.toast('Ссылка скопирована') }
    };

    // Search toggle
    document.getElementById('search-btn').onclick = () => {
        const p = document.getElementById('search-panel');
        p.classList.toggle('collapsed'); p.classList.toggle('expanded');
        if (p.classList.contains('expanded')) document.getElementById('search-input').focus();
    };
    document.getElementById('search-clear').onclick = () => {
        document.getElementById('search-input').value = '';
        document.getElementById('search-panel').classList.add('collapsed');
        document.getElementById('search-panel').classList.remove('expanded');
        document.querySelectorAll('.chat-row').forEach(r => r.style.display = '');
    };
    document.getElementById('search-input').addEventListener('input', e => {
        const q = e.target.value.toLowerCase();
        document.querySelectorAll('.chat-row').forEach(r => {
            const n = r.querySelector('.chat-row-name')?.textContent.toLowerCase() || '';
            const m = r.querySelector('.chat-row-msg')?.textContent.toLowerCase() || '';
            r.style.display = (n.includes(q) || m.includes(q)) ? '' : 'none';
        });
    });

    /* ---- Message input ---- */
    const inp = document.getElementById('msg-input');
    inp.addEventListener('input', () => { UI.autoResize(inp); UI.updateSend(); Chat.handleTyping() });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (inp.value.trim()) Chat.send(inp.value.trim()) } });
    document.getElementById('send-btn').onclick = () => { if (inp.value.trim()) { UI.haptic('light'); Chat.send(inp.value.trim()) } };

    /* ---- Emoji ---- */
    document.getElementById('emoji-btn').onclick = () => {
        const p = document.getElementById('emoji-panel');
        p.classList.toggle('hidden');
        if (!p.classList.contains('hidden')) { UI.renderEmojis(Object.keys(UI.__test_emojis || {})[0] || '😊'); document.getElementById('attach-popup').classList.add('hidden') }
    };
    // Fix: expose emojis reference for renderEmojis initial load
    // The renderEmojis uses the EMOJIS inside UI module, so it works fine.

    /* ---- Attach ---- */
    document.getElementById('attach-btn').onclick = () => {
        document.getElementById('attach-popup').classList.toggle('hidden');
        document.getElementById('emoji-panel').classList.add('hidden');
    };
    document.querySelectorAll('.attach-opt').forEach(b => {
        b.onclick = () => {
            document.getElementById('attach-popup').classList.add('hidden');
            const t = b.dataset.type;
            if (t === 'photo') document.getElementById('photo-pick').click();
            else if (t === 'file') document.getElementById('file-pick').click();
            else if (t === 'location') sendLoc();
        };
    });
    document.getElementById('photo-pick').onchange = e => { if (e.target.files[0]) { Chat.sendFile(e.target.files[0]); e.target.value = '' } };
    document.getElementById('file-pick').onchange = e => { if (e.target.files[0]) { Chat.sendFile(e.target.files[0]); e.target.value = '' } };

    function sendLoc() {
        if (!navigator.geolocation) return UI.toast('Геолокация не поддерживается');
        UI.toast('📍 Получение...');
        navigator.geolocation.getCurrentPosition(
            p => Chat.send(`📍 https://maps.google.com/maps?q=${p.coords.latitude},${p.coords.longitude}`),
            () => UI.toast('Не удалось получить'),
            { enableHighAccuracy: true }
        );
    }

    /* ---- Context menu ---- */
    document.querySelectorAll('.ctx-item').forEach(b => {
        b.onclick = () => {
            const m = document.getElementById('ctx-menu');
            const a = b.dataset.action, mid = m.dataset.msgId, txt = m.dataset.msgText;
            UI.hideCtx();
            if (a === 'copy') Chat.copy(txt);
            else if (a === 'delete') Chat.del(mid);
            else if (a === 'reply') { inp.placeholder = `↩ ${txt.substring(0, 30)}...`; inp.focus() }
        };
    });
    document.addEventListener('click', e => {
        if (!e.target.closest('.ctx-menu') && !e.target.closest('.msg')) UI.hideCtx();
        if (!e.target.closest('.attach-popup') && !e.target.closest('#attach-btn')) document.getElementById('attach-popup').classList.add('hidden');
    });

    /* ---- Lightbox ---- */
    document.querySelector('.lightbox-close').onclick = UI.closeLightbox;
    document.getElementById('lightbox').onclick = e => { if (e.target === e.currentTarget) UI.closeLightbox() };

    /* ---- Settings ---- */
    document.getElementById('set-name').onclick = async () => {
        const v = await UI.prompt('Изменить имя', 'Новое имя', Auth.profile().name);
        if (v) { await Auth.update({ name: v }); refreshUI(); UI.toast('Сохранено') }
    };
    document.getElementById('set-bio').onclick = async () => {
        const v = await UI.prompt('О себе', 'Расскажите о себе', Auth.profile().bio || '');
        if (v !== null) { await Auth.update({ bio: v }); refreshUI(); UI.toast('Сохранено') }
    };
    document.getElementById('set-regen-keys').onclick = async () => {
        if (await UI.modal('Пересоздать ключи?', '<p>Старые зашифрованные сообщения могут стать недоступны.</p>', 'Пересоздать')) {
            await Auth.regenKeys(); refreshUI();
        }
    };

    // Theme
    const themeT = document.getElementById('tog-theme');
    const saved = localStorage.getItem('pchat-theme') || 'dark';
    document.documentElement.dataset.theme = saved;
    themeT.checked = saved === 'dark';
    themeT.onchange = () => {
        const t = themeT.checked ? 'dark' : 'light';
        document.documentElement.dataset.theme = t;
        localStorage.setItem('pchat-theme', t);
    };

    // Sound toggle
    document.getElementById('tog-sound').onchange = e => localStorage.setItem('pchat-sound', e.target.checked);

    // Logout
    document.getElementById('logout-btn').onclick = async () => {
        if (await UI.modal('Выйти из PCHAT?', '', 'Выйти')) { await Auth.logout(); runAuth() }
    };

    // Delete account
    document.getElementById('set-delete-account').onclick = async () => {
        if (await UI.modal('⚠️ Удалить аккаунт?', '<p style="color:var(--red)">Все данные будут удалены навсегда!</p>', 'Удалить навсегда')) {
            try {
                await db.collection('users').doc(Auth.user().uid).delete();
                await Auth.user().delete();
                runAuth(); UI.toast('Аккаунт удалён');
            } catch (e) { UI.toast('Ошибка: ' + e.message) }
        }
    };

    /* ---- Mobile back ---- */
    window.addEventListener('popstate', () => {
        if (!document.getElementById('chat-screen').classList.contains('hidden')) { Chat.close(); UI.show('chat-list-screen') }
        else if (!document.getElementById('contacts-screen').classList.contains('hidden')) UI.show('chat-list-screen');
        else if (!document.getElementById('settings-screen').classList.contains('hidden')) UI.show('chat-list-screen');
    });

    /* ---- Keyboard scroll fix ---- */
    if ('visualViewport' in window) {
        window.visualViewport.addEventListener('resize', () => {
            const s = document.getElementById('messages-scroll');
            if (s) s.scrollTop = s.scrollHeight;
        });
    }

    /* ---- SW ---- */
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

    console.log('%c🔒 PCHAT Ready', 'color:#667eea;font-weight:bold;font-size:14px');
})();
