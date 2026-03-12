(async () => {
    'use strict';

    const $ = id => document.getElementById(id);
    const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
    const onclick = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };

    let _chatUnsub = null;
    let activeChatId = null;

    /* ---- Boot ---- */
    const splash = $('splash');
    let logged = false;
    try {
        logged = await Promise.race([
            Auth.init(),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000))
        ]);
    } catch (e) {
        console.warn('Auth init:', e);
        logged = false;
    }

    await new Promise(r => setTimeout(r, 1400));
    if (splash) { splash.classList.add('hide'); }
    await new Promise(r => setTimeout(r, 500));
    if (splash) { splash.classList.add('hidden'); }

    if (logged) {
        if (Auth.needsOnboarding()) showOnboarding();
        else startApp();
    } else {
        showAuth();
    }

    function showAuth() {
        $('auth')?.classList.remove('hidden');
        $('app')?.classList.add('hidden');
        $('onboarding')?.classList.add('hidden');
    }

    function showOnboarding() {
        $('onboarding')?.classList.remove('hidden');
        $('auth')?.classList.add('hidden');
        $('app')?.classList.add('hidden');
        const p = Auth.profile();
        if (p?.name) {
            const el = $('ob-name');
            if (el) el.value = p.name;
        }
    }

    function startApp() {
        $('auth')?.classList.add('hidden');
        $('onboarding')?.classList.add('hidden');
        $('app')?.classList.remove('hidden');
        refreshSidebar();
        loadChats();
        Notif.init();
        Contacts.init();
        UI.initEmojiTabs();
    }

    /* ======== ONBOARDING ======== */
    let obUnTimeout;
    on('ob-username', 'input', async e => {
        const val = e.target.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
        e.target.value = val;
        const check = $('ob-username-check');
        if (!check) return;
        clearTimeout(obUnTimeout);
        if (val.length < 3) {
            check.textContent = 'Минимум 3 символа';
            check.className = 'field-check err';
            return;
        }
        check.textContent = 'Проверка...';
        check.className = 'field-check';
        obUnTimeout = setTimeout(async () => {
            try {
                const ok = await Auth.checkUsername(val);
                check.textContent = ok ? '✅ Доступен' : '❌ Занят';
                check.className = 'field-check ' + (ok ? 'ok' : 'err');
            } catch (err) {
                check.textContent = 'Ошибка проверки';
                check.className = 'field-check err';
            }
        }, 500);
    });

    onclick('ob-save', async () => {
        const name = $('ob-name')?.value.trim();
        const username = $('ob-username')?.value.trim().toLowerCase();
        if (!name) return UI.toast('Введите имя');
        if (!username || username.length < 3) return UI.toast('Юзернейм минимум 3 символа');
        if (!/^[a-z0-9_]+$/.test(username)) return UI.toast('Только буквы, цифры и _');
        const ok = await Auth.checkUsername(username);
        if (!ok) return UI.toast('Этот юзернейм занят');
        const btn = $('ob-save');
        if (btn) { btn.disabled = true; btn.textContent = 'Сохранение...'; }
        try {
            await Auth.saveOnboarding(name, username);
            startApp();
        } catch (e) {
            UI.toast('Ошибка: ' + e.message);
            if (btn) { btn.disabled = false; btn.textContent = 'Сохранить и войти'; }
        }
    });

    /* ======== AUTH FORMS ======== */
    onclick('to-reg', e => {
        if (e) e.preventDefault();
        $('form-login')?.classList.add('hidden');
        $('form-reg')?.classList.remove('hidden');
    });

    onclick('to-li', e => {
        if (e) e.preventDefault();
        $('form-reg')?.classList.add('hidden');
        $('form-login')?.classList.remove('hidden');
    });

    document.querySelectorAll('.pw-eye').forEach(b => {
        b.onclick = () => {
            const inp = $(b.dataset.t);
            if (inp) inp.type = inp.type === 'password' ? 'text' : 'password';
        };
    });

    on('re-pw', 'input', e => UI.pwStrength(e.target.value));

    let regUnTimeout;
    on('re-username', 'input', async e => {
        const val = e.target.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
        e.target.value = val;
        const check = $('re-username-check');
        if (!check) return;
        clearTimeout(regUnTimeout);
        if (val.length < 3) {
            check.textContent = 'Минимум 3 символа';
            check.className = 'field-check err';
            return;
        }
        check.textContent = 'Проверка...';
        check.className = 'field-check';
        regUnTimeout = setTimeout(async () => {
            try {
                const ok = await Auth.checkUsername(val);
                check.textContent = ok ? '✅ Доступен' : '❌ Занят';
                check.className = 'field-check ' + (ok ? 'ok' : 'err');
            } catch (err) {
                check.textContent = 'Ошибка';
                check.className = 'field-check err';
            }
        }, 500);
    });

    onclick('li-btn', async () => {
        const email = $('li-email')?.value.trim();
        const pw = $('li-pw')?.value;
        if (!email || !pw) return UI.toast('Заполните все поля');
        const btn = $('li-btn');
        setLoad(btn, true);
        try { await Auth.login(email, pw); startApp(); }
        catch (e) { UI.toast(Auth.errMsg(e)); }
        finally { setLoad(btn, false); }
    });

    onclick('re-btn', async () => {
        const name = $('re-name')?.value.trim();
        const username = $('re-username')?.value.trim().toLowerCase();
        const email = $('re-email')?.value.trim();
        const pw = $('re-pw')?.value;
        const pw2 = $('re-pw2')?.value;
        if (!name || !username || !email || !pw) return UI.toast('Заполните все поля');
        if (username.length < 3) return UI.toast('Юзернейм минимум 3 символа');
        if (!/^[a-z0-9_]+$/.test(username)) return UI.toast('Только буквы, цифры и _');
        if (pw.length < 8) return UI.toast('Пароль минимум 8 символов');
        if (pw !== pw2) return UI.toast('Пароли не совпадают');
        const unOk = await Auth.checkUsername(username);
        if (!unOk) return UI.toast('Юзернейм занят');
        const btn = $('re-btn');
        setLoad(btn, true);
        try { await Auth.register(email, pw, name, username); startApp(); }
        catch (e) { UI.toast(Auth.errMsg(e)); }
        finally { setLoad(btn, false); }
    });

    onclick('li-google', async () => {
        try {
            await Auth.google();
            if (Auth.needsOnboarding()) showOnboarding();
            else startApp();
        } catch (e) { UI.toast(Auth.errMsg(e)); }
    });

    function setLoad(btn, on) {
        if (!btn) return;
        btn.disabled = on;
        btn.querySelector('span')?.classList.toggle('hidden', on);
        btn.querySelector('.btn-spin')?.classList.toggle('hidden', !on);
    }

    /* ======== SIDEBAR ======== */
    function refreshSidebar() {
        const p = Auth.profile();
        if (!p) return;
        const ini = (p.name || 'P')[0].toUpperCase();
        const bg = UI.avatarBg(p.name || '');
        const set = (id, val) => { const el = $(id); if (el) el.textContent = val; };
        const setBg = (id, val) => { const el = $(id); if (el) el.style.background = val; };
        set('sf-avatar', ini); setBg('sf-avatar', bg);
        set('sf-name', p.name || 'User');
        set('sf-username', p.username ? '@' + p.username : p.email || '');
        const sa = $('settings-avatar');
        if (sa) { sa.textContent = ini; sa.style.background = bg; }
        set('set-name-val', p.name || 'User');
        set('set-un-val', p.username ? '@' + p.username : '—');
        set('set-email-val', p.email || '');
        set('set-name-v', p.name || '—');
        set('set-un-v', p.username ? '@' + p.username : '—');
        set('set-bio-v', p.bio || 'Не указано');
        if (Auth.pubKey()) {
            Crypto.fingerprint(Auth.pubKey()).then(f => set('key-fp', f));
        }
    }

    /* ======== CHAT LIST ======== */
    function loadChats() {
        const me = Auth.user()?.uid;
        if (!me) return;
        const list = $('chat-list');
        const empty = $('empty-chats');
        if (!list) return;

        if (_chatUnsub) {
            _chatUnsub();
            _chatUnsub = null;
        }

        _chatUnsub = db.collection('chats')
            .where('participants', 'array-contains', me)
            .orderBy('lastMessageTime', 'desc')
            .onSnapshot(snap => {
                list.innerHTML = '';
                if (snap.empty) {
                    if (empty) {
                        list.appendChild(empty);
                        empty.classList.remove('hidden');
                    }
                    return;
                }
                if (empty) empty.classList.add('hidden');
                snap.forEach(doc => {
                    const row = makeChatRow(doc.id, doc.data());
                    if (row) list.appendChild(row);
                });
            }, err => {
                console.error('Chat list error:', err);
                if (err.code === 'failed-precondition') {
                    UI.toast('⏳ Индекс создаётся. Подождите 2-3 мин.');
                }
            });
    }

    function makeChatRow(cid, c) {
        const me = Auth.user()?.uid;
        if (!me || !c.participants) return null;
        const pid = c.participants.find(p => p !== me);
        if (!pid) return null;
        const name = c.names?.[pid] || 'User';
        const unread = c[`unread_${me}`] || 0;
        const msg = c.lastMessage || 'Начните диалог';
        const time = c.lastMessageTime ? UI.fmtDate(c.lastMessageTime) : '';

        const el = document.createElement('div');
        el.className = 'chat-row' + (cid === activeChatId ? ' active' : '');
        const ini = (name || 'U')[0].toUpperCase();
        const badge = unread > 0 ? `<span class="chat-row-badge">${unread > 99 ? '99+' : unread}</span>` : '';
        el.innerHTML = `
            <div class="chat-row-av" style="background:${UI.avatarBg(name)}">${ini}</div>
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
            } catch (e) {
                console.error('Open chat:', e);
                UI.toast('Ошибка открытия чата');
            }
        };
        return el;
    }

    /* ======== MOBILE BURGER ======== */
    if (window.innerWidth <= 768) {
        const burger = document.createElement('button');
        burger.className = 'icon-btn';
        burger.style.cssText = 'position:fixed;top:calc(12px + env(safe-area-inset-top));left:14px;z-index:150;background:var(--bg1);border:1px solid var(--border);border-radius:var(--r12);width:40px;height:40px;box-shadow:var(--shadow1);';
        burger.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>';
        burger.onclick = () => UI.openSidebar();
        $('app')?.appendChild(burger);
    }

    /* ======== NAVIGATION ======== */
    onclick('mob-overlay', () => UI.closeSidebar());

    onclick('mob-fab', () => {
        $('new-chat-modal')?.classList.remove('hidden');
        setTimeout(() => $('user-search-input')?.focus(), 300);
    });

    onclick('new-chat-btn', () => {
        $('new-chat-modal')?.classList.remove('hidden');
        setTimeout(() => $('user-search-input')?.focus(), 300);
    });

    onclick('new-chat-close', () => {
        $('new-chat-modal')?.classList.add('hidden');
        const inp = $('user-search-input');
        if (inp) inp.value = '';
        const box = $('user-search-results');
        if (box) box.innerHTML = '<div class="search-hint"><p>Введите @юзернейм или email</p></div>';
    });

    $('new-chat-modal')?.addEventListener('click', e => {
        if (e.target === e.currentTarget) {
            e.currentTarget.classList.add('hidden');
            const inp = $('user-search-input');
            if (inp) inp.value = '';
        }
    });

    onclick('mobile-back', () => {
        Chat.close();
        UI.hideChat();
        activeChatId = null;
        document.querySelectorAll('.chat-row').forEach(r => r.classList.remove('active'));
    });

    onclick('sf-settings-btn', () => {
        refreshSidebar();
        $('settings-modal')?.classList.remove('hidden');
    });

    onclick('sf-user-btn', () => {
        refreshSidebar();
        $('settings-modal')?.classList.remove('hidden');
    });

    onclick('settings-close', () => $('settings-modal')?.classList.add('hidden'));

    $('settings-modal')?.addEventListener('click', e => {
        if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
    });

    /* ======== CHAT SEARCH ======== */
    on('chat-search', 'input', e => {
        const q = e.target.value.toLowerCase();
        document.querySelectorAll('.chat-row').forEach(r => {
            const n = r.querySelector('.chat-row-name')?.textContent.toLowerCase() || '';
            r.style.display = n.includes(q) ? '' : 'none';
        });
    });

    /* ======== MESSAGE INPUT ======== */
    const msgInp = $('msg-input');
    if (msgInp) {
        msgInp.addEventListener('input', () => {
            UI.autoResize(msgInp);
            UI.updateSend();
            Chat.handleTyping();
        });
        msgInp.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey && window.innerWidth > 768) {
                e.preventDefault();
                if (msgInp.value.trim()) Chat.send(msgInp.value.trim());
            }
        });
    }

    onclick('send-btn', () => {
        if (msgInp?.value.trim()) {
            UI.haptic('light');
            Chat.send(msgInp.value.trim());
        }
    });

    /* ======== EMOJI ======== */
    onclick('emoji-btn', () => {
        $('emoji-panel')?.classList.toggle('hidden');
        $('attach-panel')?.classList.add('hidden');
    });

    /* ======== ATTACH ======== */
    onclick('attach-btn', () => {
        $('attach-panel')?.classList.toggle('hidden');
        $('emoji-panel')?.classList.add('hidden');
    });

    document.querySelectorAll('.attach-item').forEach(b => {
        b.onclick = () => {
            $('attach-panel')?.classList.add('hidden');
            const t = b.dataset.type;
            if (t === 'photo') $('photo-pick')?.click();
            else if (t === 'file') $('file-pick')?.click();
            else if (t === 'location') {
                if (!navigator.geolocation) return UI.toast('Не поддерживается');
                UI.toast('📍 Определение...');
                navigator.geolocation.getCurrentPosition(
                    pos => Chat.send(`📍 https://maps.google.com/maps?q=${pos.coords.latitude},${pos.coords.longitude}`),
                    () => UI.toast('Не удалось получить')
                );
            }
        };
    });

    const photoPick = $('photo-pick');
    const filePick = $('file-pick');
    if (photoPick) photoPick.onchange = e => { if (e.target.files[0]) { Chat.sendFile(e.target.files[0]); e.target.value = ''; } };
    if (filePick) filePick.onchange = e => { if (e.target.files[0]) { Chat.sendFile(e.target.files[0]); e.target.value = ''; } };

    /* ======== VOICE ======== */
    onclick('voice-btn', () => {
        if (Voice.isRecording()) return;
        Voice.start();
    });

    onclick('voice-cancel', () => {
        Voice.cancel();
    });

    onclick('voice-send', () => {
        Voice.sendVoice();
    });

    /* ======== CONTEXT MENU ======== */
    document.querySelectorAll('.ctx-btn').forEach(b => {
        b.onclick = () => {
            const m = $('ctx');
            if (!m) return;
            const action = b.dataset.a;
            const mid = m.dataset.mid;
            const txt = m.dataset.txt;
            UI.hideCtx();
            if (action === 'copy') Chat.copy(txt);
            else if (action === 'delete') Chat.del(mid);
            else if (action === 'reply' && msgInp) {
                msgInp.placeholder = `↩ ${txt.substring(0, 30)}...`;
                msgInp.focus();
            }
        };
    });

    document.addEventListener('click', e => {
        if (!e.target.closest('.ctx') && !e.target.closest('.msg-bub')) UI.hideCtx();
        if (!e.target.closest('.attach-panel') && !e.target.closest('#attach-btn')) $('attach-panel')?.classList.add('hidden');
        if (!e.target.closest('.emoji-panel') && !e.target.closest('#emoji-btn')) $('emoji-panel')?.classList.add('hidden');
    });

    /* ======== LIGHTBOX ======== */
    onclick('lb-close', () => UI.closeLightbox());
    $('lightbox')?.addEventListener('click', e => { if (e.target === e.currentTarget) UI.closeLightbox(); });

    /* ======== SETTINGS ======== */
    onclick('edit-name-btn', async () => {
        const v = await UI.prompt('Изменить имя', 'Новое имя', Auth.profile()?.name || '');
        if (v) { await Auth.update({ name: v }); refreshSidebar(); UI.toast('✅ Имя обновлено'); }
    });

    onclick('edit-username-btn', async () => {
        const current = Auth.profile()?.username || '';
        const v = await UI.prompt('Изменить юзернейм', 'username', current);
        if (!v) return;
        const clean = v.replace(/^@/, '').toLowerCase();
        if (clean.length < 3) return UI.toast('Минимум 3 символа');
        if (!/^[a-z0-9_]+$/.test(clean)) return UI.toast('Только буквы, цифры и _');
        if (clean !== current) {
            const ok = await Auth.checkUsername(clean);
            if (!ok) return UI.toast('Юзернейм занят');
        }
        await Auth.update({ username: clean });
        await db.collection('usernames').doc(clean).set({ uid: Auth.user().uid });
        refreshSidebar();
        UI.toast('✅ Юзернейм обновлён');
    });

    onclick('edit-bio-btn', async () => {
        const v = await UI.prompt('О себе', 'Расскажите о себе', Auth.profile()?.bio || '');
        if (v !== null) { await Auth.update({ bio: v }); refreshSidebar(); UI.toast('✅ Сохранено'); }
    });

    const themeTog = $('theme-tog');
    if (themeTog) {
        const saved = localStorage.getItem('pchat-theme') || 'dark';
        document.documentElement.dataset.theme = saved;
        themeTog.checked = saved === 'dark';
        themeTog.onchange = e => {
            const t = e.target.checked ? 'dark' : 'light';
            document.documentElement.dataset.theme = t;
            localStorage.setItem('pchat-theme', t);
        };
    }

    onclick('logout-btn', async () => {
        $('settings-modal')?.classList.add('hidden');
        const ok = await UI.modal('Выйти из PCHAT?', '', 'Выйти', 'Отмена');
        if (ok) {
            if (_chatUnsub) { _chatUnsub(); _chatUnsub = null; }
            Chat.close();
            await Auth.logout();
            showAuth();
        }
    });

    /* ======== BACK ======== */
    window.addEventListener('popstate', () => {
        if (!$('chat-view')?.classList.contains('hidden')) {
            Chat.close();
            UI.hideChat();
            activeChatId = null;
        }
    });

    if ('visualViewport' in window) {
        window.visualViewport.addEventListener('resize', () => {
            const s = $('msgs-scroll');
            if (s) s.scrollTop = s.scrollHeight;
        });
    }

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    }

    console.log('%c⚡ PCHAT 2.0 Ready', 'color:#818cf8;font-weight:800;font-size:16px');
})();