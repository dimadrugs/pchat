/* ================================================
   PCHAT — Main App Controller
   ================================================ */
(async () => {
    'use strict';

    const splash = document.getElementById('splash-screen');
    const authScr = document.getElementById('auth-screen');
    const appEl = document.getElementById('app');

    /* ---- Init with timeout ---- */
    let logged = false;
    try {
        logged = await Promise.race([
            Auth.init(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000))
        ]);
    } catch (e) {
        console.error('Auth init failed:', e);
        logged = false;
    }

    // Hide splash
    setTimeout(() => {
        splash.classList.add('out');
        setTimeout(() => {
            splash.classList.add('hidden');
            if (logged) {
                runApp();
            } else {
                runAuth();
            }
        }, 600);
    }, 1400);

    function runAuth() {
        authScr.classList.remove('hidden');
        appEl.classList.add('hidden');
    }

    function runApp() {
        authScr.classList.add('hidden');
        appEl.classList.remove('hidden');
        refreshUI();
        loadChats();
        Notif.init();
        Contacts.init();
        UI.initEmojiTabs();
    }

    /* ======== AUTH UI ======== */

    // Toggle forms
    document.getElementById('to-register').onclick = e => {
        e.preventDefault();
        document.getElementById('login-form').classList.add('hidden');
        document.getElementById('register-form').classList.remove('hidden');
    };

    document.getElementById('to-login').onclick = e => {
        e.preventDefault();
        document.getElementById('register-form').classList.add('hidden');
        document.getElementById('login-form').classList.remove('hidden');
    };

    // Toggle password visibility
    document.querySelectorAll('.field-toggle').forEach(b => {
        b.onclick = () => {
            const inp = document.getElementById(b.dataset.target);
            inp.type = inp.type === 'password' ? 'text' : 'password';
        };
    });

    // Password strength
    const regPwInput = document.getElementById('reg-password');
    if (regPwInput) {
        regPwInput.addEventListener('input', e => UI.pwStrength(e.target.value));
    }

    // Login
    document.getElementById('login-btn').onclick = async () => {
        const email = document.getElementById('login-email').value.trim();
        const pw = document.getElementById('login-password').value;
        if (!email || !pw) return UI.toast('Заполните все поля');

        const btn = document.getElementById('login-btn');
        setLoading(btn, true);
        try {
            await Auth.login(email, pw);
            runApp();
        } catch (e) {
            UI.toast(Auth.errMsg(e));
        } finally {
            setLoading(btn, false);
        }
    };

    // Register
    document.getElementById('register-btn').onclick = async () => {
        const name = document.getElementById('reg-name').value.trim();
        const email = document.getElementById('reg-email').value.trim();
        const pw = document.getElementById('reg-password').value;
        const conf = document.getElementById('reg-confirm').value;

        if (!name || !email || !pw) return UI.toast('Заполните все поля');
        if (pw.length < 8) return UI.toast('Пароль минимум 8 символов');
        if (pw !== conf) return UI.toast('Пароли не совпадают');

        const btn = document.getElementById('register-btn');
        setLoading(btn, true);
        try {
            await Auth.register(email, pw, name);
            runApp();
        } catch (e) {
            UI.toast(Auth.errMsg(e));
        } finally {
            setLoading(btn, false);
        }
    };

    // Google login
    document.getElementById('google-btn').onclick = async () => {
        try {
            await Auth.google();
            runApp();
        } catch (e) {
            UI.toast(Auth.errMsg(e));
        }
    };

    function setLoading(btn, on) {
        btn.disabled = on;
        const text = btn.querySelector('.btn-text');
        const loader = btn.querySelector('.btn-loader');
        if (text) text.classList.toggle('hidden', on);
        if (loader) loader.classList.toggle('hidden', !on);
    }

    /* ======== USER UI ======== */

    function refreshUI() {
        const p = Auth.profile();
        if (!p) return;
        const ini = (p.name || 'P')[0].toUpperCase();

        // Drawer
        document.getElementById('drawer-avatar').textContent = ini;
        document.getElementById('drawer-name').textContent = p.name || 'User';
        document.getElementById('drawer-email').textContent = p.email || '';

        // Settings
        document.getElementById('settings-avatar-char').textContent = ini;
        document.getElementById('settings-user-name').textContent = p.name || 'User';
        document.getElementById('settings-user-email').textContent = p.email || '';
        document.getElementById('sv-name').textContent = p.name || '—';
        document.getElementById('sv-bio').textContent = p.bio || 'Не указано';

        // Key fingerprint
        if (Auth.pubKey()) {
            Crypto.fingerprint(Auth.pubKey()).then(f => {
                document.getElementById('sv-fingerprint').textContent = f;
            });
        }
    }

    /* ======== CHAT LIST ======== */

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
                // Clear list but keep empty element
                list.innerHTML = '';

                if (snap.empty) {
                    list.appendChild(empty);
                    empty.classList.remove('hidden');
                    return;
                }

                empty.classList.add('hidden');

                snap.forEach(doc => {
                    const c = doc.data();
                    const cid = doc.id;
                    const pid = c.participants.find(p => p !== me);
                    const pname = c.names?.[pid] || 'User';
                    const pemail = c.emails?.[pid] || '';
                    const unread = c[`unread_${me}`] || 0;
                    list.appendChild(makeChatRow(cid, pid, pname, pemail, c, unread));
                });
            }, error => {
                console.error('Chat list error:', error);
                // If index not ready, show message
                if (error.code === 'failed-precondition') {
                    UI.toast('Создаётся индекс базы данных. Подождите 2-3 минуты и обновите страницу.');
                }
            });
    }

    function makeChatRow(cid, pid, name, email, chat, unread) {
        const el = document.createElement('div');
        el.className = 'chat-row';
        el.dataset.chatId = cid;
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
            try {
                const pdoc = await db.collection('users').doc(pid).get();
                Chat.open(cid, pid, pdoc.exists ? pdoc.data() : { name, email });
                UI.show('chat-screen');
            } catch (e) {
                console.error('Open chat error:', e);
                UI.toast('Ошибка открытия чата');
            }
        };

        if (unread > 0 && !document.hasFocus()) {
            Notif.show(name, msg);
            Notif.sound();
        }
        return el;
    }

    /* ======== NAVIGATION ======== */

    // Menu / Drawer
    document.getElementById('menu-btn').onclick = () => {
        UI.haptic('light');
        UI.openDrawer();
    };
    document.getElementById('drawer-overlay').onclick = UI.closeDrawer;

    // New chat
    document.getElementById('fab').onclick = () => UI.show('contacts-screen');

    // Back buttons
    document.getElementById('back-btn').onclick = () => {
        Chat.close();
        UI.show('chat-list-screen');
    };
    document.getElementById('contacts-back').onclick = () => UI.show('chat-list-screen');
    document.getElementById('settings-back').onclick = () => UI.show('chat-list-screen');

    // Drawer items
    document.getElementById('dr-contacts').onclick = () => {
        UI.closeDrawer();
        UI.show('contacts-screen');
    };
    document.getElementById('dr-settings').onclick = () => {
        UI.closeDrawer();
        refreshUI();
        UI.show('settings-screen');
    };
    document.getElementById('dr-invite').onclick = () => {
        UI.closeDrawer();
        if (navigator.share) {
            navigator.share({
                title: 'PCHAT',
                text: 'Присоединяйся к PCHAT — приватный мессенджер с шифрованием!',
                url: location.href
            });
        } else {
            navigator.clipboard.writeText(location.href);
            UI.toast('Ссылка скопирована');
        }
    };

    // Search
    document.getElementById('search-btn').onclick = () => {
        const p = document.getElementById('search-panel');
        p.classList.toggle('collapsed');
        p.classList.toggle('expanded');
        if (p.classList.contains('expanded')) {
            document.getElementById('search-input').focus();
        }
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

    /* ======== MESSAGE INPUT ======== */

    const msgInput = document.getElementById('msg-input');

    msgInput.addEventListener('input', () => {
        UI.autoResize(msgInput);
        UI.updateSend();
        Chat.handleTyping();
    });

    msgInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (msgInput.value.trim()) {
                Chat.send(msgInput.value.trim());
            }
        }
    });

    document.getElementById('send-btn').onclick = () => {
        if (msgInput.value.trim()) {
            UI.haptic('light');
            Chat.send(msgInput.value.trim());
        }
    };

    /* ======== EMOJI ======== */

    document.getElementById('emoji-btn').onclick = () => {
        const p = document.getElementById('emoji-panel');
        p.classList.toggle('hidden');
        if (!p.classList.contains('hidden')) {
            UI.renderEmojis('😊');
            document.getElementById('attach-popup').classList.add('hidden');
        }
    };

    /* ======== ATTACHMENTS ======== */

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
            else if (t === 'location') sendLocation();
        };
    });

    document.getElementById('photo-pick').onchange = e => {
        if (e.target.files[0]) {
            Chat.sendFile(e.target.files[0]);
            e.target.value = '';
        }
    };

    document.getElementById('file-pick').onchange = e => {
        if (e.target.files[0]) {
            Chat.sendFile(e.target.files[0]);
            e.target.value = '';
        }
    };

    function sendLocation() {
        if (!navigator.geolocation) return UI.toast('Геолокация не поддерживается');
        UI.toast('📍 Получение геопозиции...');
        navigator.geolocation.getCurrentPosition(
            p => Chat.send(`📍 https://maps.google.com/maps?q=${p.coords.latitude},${p.coords.longitude}`),
            () => UI.toast('Не удалось получить геопозицию'),
            { enableHighAccuracy: true }
        );
    }

    /* ======== CONTEXT MENU ======== */

    document.querySelectorAll('.ctx-item').forEach(b => {
        b.onclick = () => {
            const m = document.getElementById('ctx-menu');
            const action = b.dataset.action;
            const mid = m.dataset.msgId;
            const txt = m.dataset.msgText;
            UI.hideCtx();

            switch (action) {
                case 'copy':
                    Chat.copy(txt);
                    break;
                case 'delete':
                    Chat.del(mid);
                    break;
                case 'reply':
                    msgInput.placeholder = `↩ ${txt.substring(0, 30)}...`;
                    msgInput.focus();
                    break;
            }
        };
    });

    // Close context menu and attach popup on outside click
    document.addEventListener('click', e => {
        if (!e.target.closest('.ctx-menu') && !e.target.closest('.msg')) {
            UI.hideCtx();
        }
        if (!e.target.closest('.attach-popup') && !e.target.closest('#attach-btn')) {
            document.getElementById('attach-popup').classList.add('hidden');
        }
    });

    /* ======== LIGHTBOX ======== */

    document.querySelector('.lightbox-close').onclick = UI.closeLightbox;
    document.getElementById('lightbox').onclick = e => {
        if (e.target === e.currentTarget) UI.closeLightbox();
    };

    /* ======== SETTINGS ======== */

    // Edit name
    document.getElementById('set-name').onclick = async () => {
        const v = await UI.prompt('Изменить имя', 'Новое имя', Auth.profile().name);
        if (v) {
            await Auth.update({ name: v });
            refreshUI();
            UI.toast('✅ Имя обновлено');
        }
    };

    // Edit bio
    document.getElementById('set-bio').onclick = async () => {
        const v = await UI.prompt('О себе', 'Расскажите о себе', Auth.profile().bio || '');
        if (v !== null) {
            await Auth.update({ bio: v });
            refreshUI();
            UI.toast('✅ Сохранено');
        }
    };

    // Regenerate keys
    document.getElementById('set-regen-keys').onclick = async () => {
        const ok = await UI.modal(
            'Пересоздать ключи?',
            '<p>Старые зашифрованные сообщения могут стать недоступны.</p>',
            'Пересоздать'
        );
        if (ok) {
            await Auth.regenKeys();
            refreshUI();
        }
    };

    // Theme toggle
    const themeToggle = document.getElementById('tog-theme');
    const savedTheme = localStorage.getItem('pchat-theme') || 'dark';
    document.documentElement.dataset.theme = savedTheme;
    themeToggle.checked = savedTheme === 'dark';

    themeToggle.onchange = () => {
        const theme = themeToggle.checked ? 'dark' : 'light';
        document.documentElement.dataset.theme = theme;
        localStorage.setItem('pchat-theme', theme);
    };

    // Sound toggle
    document.getElementById('tog-sound').onchange = e => {
        localStorage.setItem('pchat-sound', e.target.checked);
    };

    // Logout
    document.getElementById('logout-btn').onclick = async () => {
        const ok = await UI.modal('Выйти из PCHAT?', '', 'Выйти');
        if (ok) {
            await Auth.logout();
            runAuth();
        }
    };

    // Delete account
    document.getElementById('set-delete-account').onclick = async () => {
        const ok = await UI.modal(
            '⚠️ Удалить аккаунт?',
            '<p style="color:var(--red)">Все данные будут удалены навсегда. Это нельзя отменить!</p>',
            'Удалить навсегда'
        );
        if (ok) {
            try {
                const uid = Auth.user().uid;
                await db.collection('users').doc(uid).delete();
                await Auth.user().delete();
                runAuth();
                UI.toast('Аккаунт удалён');
            } catch (e) {
                UI.toast('Ошибка: ' + e.message);
            }
        }
    };

    /* ======== MOBILE BACK BUTTON ======== */

    window.addEventListener('popstate', () => {
        const chatScreen = document.getElementById('chat-screen');
        const contactsScreen = document.getElementById('contacts-screen');
        const settingsScreen = document.getElementById('settings-screen');

        if (!chatScreen.classList.contains('hidden')) {
            Chat.close();
            UI.show('chat-list-screen');
        } else if (!contactsScreen.classList.contains('hidden')) {
            UI.show('chat-list-screen');
        } else if (!settingsScreen.classList.contains('hidden')) {
            UI.show('chat-list-screen');
        }
    });

    /* ======== KEYBOARD FIX ======== */

    if ('visualViewport' in window) {
        window.visualViewport.addEventListener('resize', () => {
            const s = document.getElementById('messages-scroll');
            if (s) s.scrollTop = s.scrollHeight;
        });
    }

    /* ======== SERVICE WORKER ======== */

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(err => {
            console.log('SW registration skipped:', err);
        });
    }

    console.log('%c🔒 PCHAT Ready', 'color:#667eea;font-weight:bold;font-size:14px');
})();
