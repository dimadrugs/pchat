(async () => {
    'use strict';

    /* ---- Boot ---- */
    const splash = document.getElementById('splash');
    let logged = false;
    try {
        logged = await Promise.race([
            Auth.init(),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000))
        ]);
    } catch (e) { logged = false }

    await new Promise(r => setTimeout(r, 1400));
    splash.classList.add('hide');
    await new Promise(r => setTimeout(r, 500));
    splash.classList.add('hidden');

    if (logged) {
        if (Auth.needsOnboarding()) {
            showOnboarding();
        } else {
            startApp();
        }
    } else {
        showAuth();
    }

    /* ---- Show states ---- */
    function showAuth() {
        document.getElementById('auth').classList.remove('hidden');
        document.getElementById('app').classList.add('hidden');
        document.getElementById('onboarding').classList.add('hidden');
    }

    function showOnboarding() {
        document.getElementById('onboarding').classList.remove('hidden');
        document.getElementById('auth').classList.add('hidden');
        document.getElementById('app').classList.add('hidden');
        // Pre-fill name if from Google
        const p = Auth.profile();
        if (p?.name) document.getElementById('ob-name').value = p.name;
    }

    function startApp() {
        document.getElementById('auth').classList.add('hidden');
        document.getElementById('onboarding').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        refreshSidebar();
        loadChats();
        Notif.init();
        Contacts.init();
        UI.initEmojiTabs();
    }

    /* ---- ONBOARDING ---- */
    let unCheckTimeout;
    document.getElementById('ob-username').addEventListener('input', async e => {
        const val = e.target.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
        e.target.value = val;
        const check = document.getElementById('ob-username-check');
        clearTimeout(unCheckTimeout);
        if (val.length < 3) { check.textContent = 'Минимум 3 символа'; check.className = 'field-check err'; return }
        check.textContent = 'Проверка...'; check.className = 'field-check';
        unCheckTimeout = setTimeout(async () => {
            const ok = await Auth.checkUsername(val);
            check.textContent = ok ? '✓ Доступен' : '✗ Занят';
            check.className = 'field-check ' + (ok ? 'ok' : 'err');
        }, 500);
    });

    document.getElementById('ob-save').onclick = async () => {
        const name = document.getElementById('ob-name').value.trim();
        const username = document.getElementById('ob-username').value.trim().toLowerCase();
        if (!name) return UI.toast('Введите имя');
        if (username.length < 3) return UI.toast('Юзернейм минимум 3 символа');
        if (!/^[a-z0-9_]+$/.test(username)) return UI.toast('Только буквы, цифры и _');
        const ok = await Auth.checkUsername(username);
        if (!ok) return UI.toast('Этот юзернейм занят');
        const btn = document.getElementById('ob-save');
        btn.disabled = true; btn.textContent = 'Сохранение...';
        try { await Auth.saveOnboarding(name, username); startApp() }
        catch (e) { UI.toast('Ошибка: ' + e.message); btn.disabled = false; btn.textContent = 'Сохранить и войти' }
    };

    /* ---- AUTH FORMS ---- */
    document.getElementById('to-reg').onclick = e => { e.preventDefault(); document.getElementById('form-login').classList.add('hidden'); document.getElementById('form-reg').classList.remove('hidden') };
    document.getElementById('to-li').onclick = e => { e.preventDefault(); document.getElementById('form-reg').classList.add('hidden'); document.getElementById('form-login').classList.remove('hidden') };

    // Password toggles
    document.querySelectorAll('.pw-eye').forEach(b => {
        b.onclick = () => { const i = document.getElementById(b.dataset.t); i.type = i.type === 'password' ? 'text' : 'password' };
    });

    // Password strength
    document.getElementById('re-pw').addEventListener('input', e => UI.pwStrength(e.target.value));

    // Username validation in register
    let regUnTimeout;
    document.getElementById('re-username').addEventListener('input', async e => {
        const val = e.target.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
        e.target.value = val;
        const check = document.getElementById('re-username-check');
        clearTimeout(regUnTimeout);
        if (val.length < 3) { check.textContent = 'Минимум 3 символа'; check.className = 'field-check err'; return }
        check.textContent = 'Проверка...'; check.className = 'field-check';
        regUnTimeout = setTimeout(async () => {
            const ok = await Auth.checkUsername(val);
            check.textContent = ok ? '✓ Доступен' : '✗ Занят';
            check.className = 'field-check ' + (ok ? 'ok' : 'err');
        }, 500);
    });

    // LOGIN
    document.getElementById('li-btn').onclick = async () => {
        const email = document.getElementById('li-email').value.trim();
        const pw = document.getElementById('li-pw').value;
        if (!email || !pw) return UI.toast('Заполните все поля');
        const btn = document.getElementById('li-btn');
        setLoad(btn, true);
        try { await Auth.login(email, pw); startApp() }
        catch (e) { UI.toast(Auth.errMsg(e)) }
        finally { setLoad(btn, false) }
    };

    // REGISTER
    document.getElementById('re-btn').onclick = async () => {
        const name = document.getElementById('re-name').value.trim();
        const username = document.getElementById('re-username').value.trim().toLowerCase();
        const email = document.getElementById('re-email').value.trim();
        const pw = document.getElementById('re-pw').value;
        const pw2 = document.getElementById('re-pw2').value;
        if (!name || !username || !email || !pw) return UI.toast('Заполните все поля');
        if (username.length < 3) return UI.toast('Юзернейм минимум 3 символа');
        if (!/^[a-z0-9_]+$/.test(username)) return UI.toast('Юзернейм: только буквы, цифры и _');
        if (pw.length < 8) return UI.toast('Пароль минимум 8 символов');
        if (pw !== pw2) return UI.toast('Пароли не совпадают');
        const unOk = await Auth.checkUsername(username);
        if (!unOk) return UI.toast('Юзернейм занят');
        const btn = document.getElementById('re-btn');
        setLoad(btn, true);
        try { await Auth.register(email, pw, name, username); startApp() }
        catch (e) { UI.toast(Auth.errMsg(e)) }
        finally { setLoad(btn, false) }
    };

    // GOOGLE
    document.getElementById('li-google').onclick = async () => {
        try {
            await Auth.google();
            if (Auth.needsOnboarding()) showOnboarding();
            else startApp();
        } catch (e) { UI.toast(Auth.errMsg(e)) }
    };

    function setLoad(btn, on) {
        btn.disabled = on;
        btn.querySelector('span').classList.toggle('hidden', on);
        btn.querySelector('.btn-spin').classList.toggle('hidden', !on);
    }

    /* ---- SIDEBAR / UI ---- */
    function refreshSidebar() {
        const p = Auth.profile(); if (!p) return;
        const ini = (p.name || 'P')[0].toUpperCase();
        const bg = UI.avatarBg(p.name || '');
        document.getElementById('sf-avatar').textContent = ini;
        document.getElementById('sf-avatar').style.background = bg;
        document.getElementById('sf-name').textContent = p.name || 'User';
        document.getElementById('sf-username').textContent = p.username ? '@' + p.username : p.email || '';
        // Settings
        const sa = document.getElementById('settings-avatar');
        sa.textContent = ini; sa.style.background = bg;
        document.getElementById('set-name-val').textContent = p.name || 'User';
        document.getElementById('set-un-val').textContent = p.username ? '@' + p.username : '—';
        document.getElementById('set-email-val').textContent = p.email || '';
        document.getElementById('set-name-v').textContent = p.name || '—';
        document.getElementById('set-un-v').textContent = p.username ? '@' + p.username : '—';
        document.getElementById('set-bio-v').textContent = p.bio || 'Не указано';
        if (Auth.pubKey()) Crypto.fingerprint(Auth.pubKey()).then(f => document.getElementById('key-fp').textContent = f);
    }

    /* ---- CHAT LIST ---- */
    let _unsub;
    function loadChats() {
        const me = Auth.user().uid;
        const list = document.getElementById('chat-list');
        const empty = document.getElementById('empty-chats');
        if (_unsub) _unsub();
        _unsub = db.collection('chats')
            .where('participants', 'array-contains', me)
            .orderBy('lastMessageTime', 'desc')
            .onSnapshot(snap => {
                list.innerHTML = '';
                if (snap.empty) { list.appendChild(empty); empty.classList.remove('hidden'); return }
                empty.classList.add('hidden');
                snap.forEach(doc => list.appendChild(makeChatRow(doc.id, doc.data())));
            }, err => {
                if (err.code === 'failed-precondition') UI.toast('⏳ Создаётся индекс БД. Подождите 2 мин.');
            });
    }

    let activeChatId = null;

    function makeChatRow(cid, c) {
        const me = Auth.user().uid;
        const pid = c.participants.find(p => p !== me);
        const name = c.names?.[pid] || 'User';
        const username = c.usernames?.[pid];
        const unread = c[`unread_${me}`] || 0;
        const msg = c.lastMessage || 'Начните диалог';
        const time = c.lastMessageTime ? UI.fmtDate(c.lastMessageTime) : '';

        const el = document.createElement('div');
        el.className = 'chat-row' + (cid === activeChatId ? ' active' : '');
        el.dataset.cid = cid;
        const ini = (name || 'U')[0].toUpperCase();
        const bg = UI.avatarBg(name);
        const badge = unread > 0 ? `<span class="chat-row-badge">${unread > 99 ? '99+' : unread}</span>` : '';

        el.innerHTML = `
            <div class="chat-row-av" style="background:${bg}">
                ${ini}
            </div>
            <div class="chat-row-body">
                <div class="chat-row-top">
                    <span class="chat-row-name">${UI.esc(name)}</span>
                    <span class="chat-row-time">${time}</span>
                </div>
                <div class="chat-row-bottom">
                    <span class="chat-row-preview">${UI.esc(msg)}</span>
                    ${badge}
                </div>
            </div>`;

        el.onclick = async () => {
            UI.haptic('light');
            document.querySelectorAll('.chat-row').forEach(r => r.classList.remove('active'));
            el.classList.add('active');
            activeChatId = cid;

            try {
                const pdoc = await db.collection('users').doc(pid).get();
                const pdata = pdoc.exists ? pdoc.data() : { name, email: c.emails?.[pid] || '' };
                Chat.open(cid, pid, pdata);
                UI.showChat();
                if (window.innerWidth <= 768) UI.closeSidebar();
            } catch (e) { UI.toast('Ошибка открытия чата') }
        };
        return el;
    }

    /* ---- NAVIGATION ---- */
    // Mobile: header burger button (add dynamically)
    const mobileHead = document.createElement('button');
    mobileHead.className = 'icon-btn mobile-only';
    mobileHead.style.cssText = 'position:fixed;top:calc(12px + env(safe-area-inset-top));left:14px;z-index:150;background:var(--bg1);border:1px solid var(--border2);border-radius:10px;';
    mobileHead.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>';
    mobileHead.onclick = UI.openSidebar;
    document.getElementById('app').appendChild(mobileHead);

    document.getElementById('mob-overlay').onclick = UI.closeSidebar;
    document.getElementById('mob-fab').onclick = () => document.getElementById('new-chat-modal').classList.remove('hidden');
    document.getElementById('new-chat-btn').onclick = () => document.getElementById('new-chat-modal').classList.remove('hidden');
    document.getElementById('new-chat-close').onclick = () => document.getElementById('new-chat-modal').classList.add('hidden');
    document.getElementById('new-chat-modal').onclick = e => { if (e.target === e.currentTarget) document.getElementById('new-chat-modal').classList.add('hidden') };

    document.getElementById('mobile-back').onclick = () => {
        Chat.close();
        UI.hideChat();
        activeChatId = null;
        document.querySelectorAll('.chat-row').forEach(r => r.classList.remove('active'));
    };

    document.getElementById('sf-settings-btn').onclick = () => {
        refreshSidebar();
        document.getElementById('settings-modal').classList.remove('hidden');
    };
    document.getElementById('sf-user-btn').onclick = () => {
        refreshSidebar();
        document.getElementById('settings-modal').classList.remove('hidden');
    };
    document.getElementById('settings-close').onclick = () => document.getElementById('settings-modal').classList.add('hidden');
    document.getElementById('settings-modal').onclick = e => { if (e.target === e.currentTarget) document.getElementById('settings-modal').classList.add('hidden') };

    /* ---- CHAT SEARCH ---- */
    document.getElementById('chat-search').addEventListener('input', e => {
        const q = e.target.value.toLowerCase();
        document.querySelectorAll('.chat-row').forEach(r => {
            const n = r.querySelector('.chat-row-name')?.textContent.toLowerCase() || '';
            r.style.display = n.includes(q) ? '' : 'none';
        });
    });

    /* ---- MESSAGE INPUT ---- */
    const msgInp = document.getElementById('msg-input');
    msgInp.addEventListener('input', () => { UI.autoResize(msgInp); UI.updateSend(); Chat.handleTyping() });
    msgInp.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey && window.innerWidth > 768) {
            e.preventDefault();
            if (msgInp.value.trim()) Chat.send(msgInp.value.trim());
        }
    });
    document.getElementById('send-btn').onclick = () => { if (msgInp.value.trim()) { UI.haptic('light'); Chat.send(msgInp.value.trim()) } };

    /* ---- EMOJI ---- */
    document.getElementById('emoji-btn').onclick = () => {
        document.getElementById('emoji-panel').classList.toggle('hidden');
        document.getElementById('attach-panel').classList.add('hidden');
    };

    /* ---- ATTACH ---- */
    document.getElementById('attach-btn').onclick = () => {
        document.getElementById('attach-panel').classList.toggle('hidden');
        document.getElementById('emoji-panel').classList.add('hidden');
    };
    document.querySelectorAll('.attach-item').forEach(b => {
        b.onclick = () => {
            document.getElementById('attach-panel').classList.add('hidden');
            const t = b.dataset.type;
            if (t === 'photo') document.getElementById('photo-pick').click();
            else if (t === 'file') document.getElementById('file-pick').click();
            else if (t === 'location') {
                if (!navigator.geolocation) return UI.toast('Не поддерживается');
                UI.toast('📍 Определение...');
                navigator.geolocation.getCurrentPosition(
                    p => Chat.send(`📍 https://maps.google.com/maps?q=${p.coords.latitude},${p.coords.longitude}`),
                    () => UI.toast('Не удалось')
                );
            }
        };
    });
    document.getElementById('photo-pick').onchange = e => { if (e.target.files[0]) { Chat.sendFile(e.target.files[0]); e.target.value = '' } };
    document.getElementById('file-pick').onchange = e => { if (e.target.files[0]) { Chat.sendFile(e.target.files[0]); e.target.value = '' } };

    /* ---- CONTEXT MENU ---- */
    document.querySelectorAll('.ctx-btn').forEach(b => {
        b.onclick = () => {
            const m = document.getElementById('ctx');
            const a = b.dataset.a, mid = m.dataset.mid, txt = m.dataset.txt;
            UI.hideCtx();
            if (a === 'copy') Chat.copy(txt);
            else if (a === 'delete') Chat.del(mid);
            else if (a === 'reply') { msgInp.placeholder = `↩ ${txt.substring(0, 30)}...`; msgInp.focus() }
        };
    });
    document.addEventListener('click', e => {
        if (!e.target.closest('.ctx') && !e.target.closest('.msg-bub')) UI.hideCtx();
        if (!e.target.closest('.attach-panel') && !e.target.closest('#attach-btn')) document.getElementById('attach-panel').classList.add('hidden');
    });

    /* ---- LIGHTBOX ---- */
    document.getElementById('lb-close').onclick = UI.closeLightbox;
    document.getElementById('lightbox').onclick = e => { if (e.target === e.currentTarget) UI.closeLightbox() };

    /* ---- SETTINGS ---- */
    document.getElementById('edit-name-btn').onclick = async () => {
        const v = await UI.prompt('Изменить имя', 'Новое имя', Auth.profile().name);
        if (v) { await Auth.update({ name: v }); refreshSidebar(); UI.toast('✅ Имя обновлено') }
    };

    document.getElementById('edit-username-btn').onclick = async () => {
        const current = Auth.profile().username || '';
        const v = await UI.prompt('Изменить юзернейм', '@username', current);
        if (!v) return;
        const clean = v.replace(/^@/, '').toLowerCase();
        if (clean.length < 3) return UI.toast('Минимум 3 символа');
        if (!/^[a-z0-9_]+$/.test(clean)) return UI.toast('Только буквы, цифры и _');
        const ok = await Auth.checkUsername(clean);
        if (!ok && clean !== current) return UI.toast('Юзернейм занят');
        await Auth.update({ username: clean });
        await db.collection('usernames').doc(clean).set({ uid: Auth.user().uid });
        refreshSidebar(); UI.toast('✅ Юзернейм обновлён');
    };

    document.getElementById('edit-bio-btn').onclick = async () => {
        const v = await UI.prompt('О себе', 'Расскажите о себе', Auth.profile().bio || '');
        if (v !== null) { await Auth.update({ bio: v }); refreshSidebar(); UI.toast('✅ Сохранено') }
    };

    document.getElementById('theme-tog').onchange = e => {
        const t = e.target.checked ? 'dark' : 'light';
        document.documentElement.dataset.theme = t;
        localStorage.setItem('pchat-theme', t);
    };
    const savedTheme = localStorage.getItem('pchat-theme') || 'dark';
    document.documentElement.dataset.theme = savedTheme;
    document.getElementById('theme-tog').checked = savedTheme === 'dark';

    document.getElementById('logout-btn').onclick = async () => {
        document.getElementById('settings-modal').classList.add('hidden');
        if (await UI.modal('Выйти?', '', 'Выйти', 'Отмена')) {
            await Auth.logout();
            showAuth();
        }
    };

    /* ---- MOBILE BACK (browser) ---- */
    window.addEventListener('popstate', () => {
        if (!document.getElementById('chat-view').classList.contains('hidden')) {
            Chat.close(); UI.hideChat();
        }
    });

    /* ---- KEYBOARD FIX ---- */
    if ('visualViewport' in window) {
        window.visualViewport.addEventListener('resize', () => {
            const s = document.getElementById('msgs-scroll');
            if (s) s.scrollTop = s.scrollHeight;
        });
    }

    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
    console.log('%c🔒 PCHAT 2.0', 'color:#818cf8;font-weight:800;font-size:16px');
})();
