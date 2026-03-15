(async () => {
'use strict';

const $ = id => document.getElementById(id);
const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
const onclick = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };

let _chatUnsub = null;
let activeChatId = null;
let _currentPeerId = null;
let _currentPeerData = null;

/* BOOT */
const splash = $('splash');
let logged = false;
try {
    logged = await Promise.race([
        Auth.init(),
        new Promise((_, rej) => setTimeout(() => rej('timeout'), 10000))
    ]);
} catch (e) { logged = false; }

await new Promise(r => setTimeout(r, 1200));
splash?.classList.add('hide');
await new Promise(r => setTimeout(r, 500));
splash?.classList.add('hidden');

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
    $('chat-view')?.classList.add('hidden');
}

function showOnboarding() {
    $('onboarding')?.classList.remove('hidden');
    $('auth')?.classList.add('hidden');
    $('app')?.classList.add('hidden');
    const p = Auth.profile();
    if (p?.name) { const el = $('ob-name'); if (el) el.value = p.name; }
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
    renderQuickEmojiSetting();
    const uid = Auth.user()?.uid;
    if (uid) Calls.init(uid);
}

/* ONBOARDING */
let _obTimer;
on('ob-username', 'input', async e => {
    const val = e.target.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
    e.target.value = val;
    const check = $('ob-username-check');
    if (!check) return;
    clearTimeout(_obTimer);
    if (val.length < 3) { check.textContent = 'Минимум 3 символа'; check.className = 'field-check err'; return; }
    check.textContent = '...'; check.className = 'field-check';
    _obTimer = setTimeout(async () => {
        const ok = await Auth.checkUsername(val).catch(() => false);
        check.textContent = ok ? '✓ Доступен' : '✗ Занят';
        check.className = 'field-check ' + (ok ? 'ok' : 'err');
    }, 500);
});

onclick('ob-save', async () => {
    const name = $('ob-name')?.value.trim();
    const username = $('ob-username')?.value.trim().toLowerCase();
    if (!name) return UI.toast('Введите имя');
    if (!username || username.length < 3) return UI.toast('Юзернейм минимум 3 символа');
    if (!/^[a-z0-9_]+$/.test(username)) return UI.toast('Только буквы, цифры и _');
    if (!(await Auth.checkUsername(username))) return UI.toast('Этот юзернейм занят');
    const btn = $('ob-save');
    if (btn) { btn.disabled = true; btn.textContent = 'Сохранение...'; }
    try { await Auth.saveOnboarding(name, username); startApp(); }
    catch (e) { UI.toast('Ошибка: ' + e.message); if (btn) { btn.disabled = false; btn.textContent = 'Сохранить и войти'; } }
});

/* AUTH */
onclick('to-reg', e => { e?.preventDefault(); $('form-login')?.classList.add('hidden'); $('form-reg')?.classList.remove('hidden'); });
onclick('to-li', e => { e?.preventDefault(); $('form-reg')?.classList.add('hidden'); $('form-login')?.classList.remove('hidden'); });
document.querySelectorAll('.pw-eye').forEach(b => {
    b.onclick = () => { const inp = $(b.dataset.t); if (inp) inp.type = inp.type === 'password' ? 'text' : 'password'; };
});
on('re-pw', 'input', e => UI.pwStrength(e.target.value));

let _regTimer;
on('re-username', 'input', async e => {
    const val = e.target.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
    e.target.value = val;
    const check = $('re-username-check');
    if (!check) return;
    clearTimeout(_regTimer);
    if (val.length < 3) { check.textContent = 'Минимум 3 символа'; check.className = 'field-check err'; return; }
    check.textContent = '...'; check.className = 'field-check';
    _regTimer = setTimeout(async () => {
        const ok = await Auth.checkUsername(val).catch(() => false);
        check.textContent = ok ? '✓ Доступен' : '✗ Занят';
        check.className = 'field-check ' + (ok ? 'ok' : 'err');
    }, 500);
});

onclick('li-btn', async () => {
    const email = $('li-email')?.value.trim();
    const pw = $('li-pw')?.value;
    if (!email || !pw) return UI.toast('Заполните все поля');
    const btn = $('li-btn'); setLoad(btn, true);
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
    if (!(await Auth.checkUsername(username))) return UI.toast('Юзернейм занят');
    const btn = $('re-btn'); setLoad(btn, true);
    try { await Auth.register(email, pw, name, username); startApp(); }
    catch (e) { UI.toast(Auth.errMsg(e)); }
    finally { setLoad(btn, false); }
});

onclick('li-google', async () => {
    try { await Auth.google(); if (Auth.needsOnboarding()) showOnboarding(); else startApp(); }
    catch (e) { UI.toast(Auth.errMsg(e)); }
});

function setLoad(btn, on) {
    if (!btn) return;
    btn.disabled = on;
    btn.querySelector('span')?.classList.toggle('hidden', on);
    btn.querySelector('.btn-spin')?.classList.toggle('hidden', !on);
}

/* SIDEBAR */
function refreshSidebar() {
    const p = Auth.profile();
    if (!p) return;
    const ini = (p.name || 'P')[0].toUpperCase();
    const bg = UI.avatarBg(p.name || '');
    const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };

    const sfAv = $('sf-avatar');
    if (sfAv) {
        if (p.avatarURL) {
            sfAv.innerHTML = `<img src="${p.avatarURL}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
        } else {
            sfAv.textContent = ini;
            sfAv.style.background = bg;
        }
    }

    set('sf-name', p.name || 'User');
    set('sf-username', p.username ? '@' + p.username : p.email || '');

    const sa = $('settings-avatar');
    if (sa) {
        if (p.avatarURL) {
            sa.innerHTML = `<img src="${p.avatarURL}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
        } else {
            sa.textContent = ini;
            sa.style.background = bg;
        }
    }

    set('set-name-val', p.name || 'User');
    set('set-un-val', p.username ? '@' + p.username : '—');
    set('set-email-val', p.email || '');
    set('set-name-v', p.name || '—');
    set('set-un-v', p.username ? '@' + p.username : '—');
    set('set-bio-v', p.bio || 'Не указано');
}

/* CHAT LIST */
function loadChats() {
    const me = Auth.user()?.uid;
    if (!me) return;
    const list = $('chat-list');
    const empty = $('empty-chats');
    if (!list) return;
    if (_chatUnsub) { _chatUnsub(); _chatUnsub = null; }

    _chatUnsub = db.collection('chats')
        .where('participants', 'array-contains', me)
        .orderBy('lastMessageTime', 'desc')
        .onSnapshot(snap => {
            list.innerHTML = '';
            if (snap.empty) {
                if (empty) { list.appendChild(empty); empty.classList.remove('hidden'); }
                return;
            }
            empty?.classList.add('hidden');
            snap.forEach(doc => {
                const row = makeChatRow(doc.id, doc.data());
                if (row) list.appendChild(row);
            });
        }, err => {
            console.error('Chat list:', err);
            if (err.code === 'failed-precondition') UI.toast('⏳ Создаётся индекс...');
        });
}

function makeChatRow(cid, c) {
    const me = Auth.user()?.uid;
    if (!me || !c.participants) return null;
    const pid = c.participants.find(p => p !== me);
    if (!pid) return null;

    const contactName = c.contactNames?.[me]?.[pid];
    const name = contactName || c.names?.[pid] || 'User';
    const unread = c[`unread_${me}`] || 0;
    const msg = c.lastMessage || '';
    const time = c.lastMessageTime ? UI.fmtDate(c.lastMessageTime) : '';
    const ini = (name || 'U')[0].toUpperCase();
    const avatarURL = c.avatars?.[pid] || null;
    const badge = unread > 0 ? `<span class="chat-row-badge">${unread > 99 ? '99+' : unread}</span>` : '';

    const el = document.createElement('div');
    el.className = 'chat-row' + (cid === activeChatId ? ' active' : '');

    const avContent = avatarURL
        ? `<img src="${avatarURL}" alt="" style="width:100%;height:100%;object-fit:cover">`
        : ini;

    el.innerHTML = `
        <div class="chat-row-av" style="${avatarURL ? '' : 'background:' + UI.avatarBg(name)}">${avContent}</div>
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
            if (contactName) pdata._displayName = contactName;
            _currentPeerId = pid;
            _currentPeerData = pdata;
            Chat.open(cid, pid, pdata);
            UI.showChat();
        } catch (e) {
            console.error('Open chat:', e);
            UI.toast('Ошибка открытия чата');
        }
    };
    return el;
}

/* NAV */
onclick('mob-fab', () => { $('new-chat-modal')?.classList.remove('hidden'); setTimeout(() => $('user-search-input')?.focus(), 300); });
onclick('new-chat-btn', () => { $('new-chat-modal')?.classList.remove('hidden'); setTimeout(() => $('user-search-input')?.focus(), 300); });
onclick('new-chat-close', () => {
    $('new-chat-modal')?.classList.add('hidden');
    const inp = $('user-search-input'); if (inp) inp.value = '';
    const box = $('user-search-results');
    if (box) box.innerHTML = '<div class="search-hint"><p>Введите @юзернейм для поиска</p></div>';
});
$('new-chat-modal')?.addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden'); });
onclick('mobile-back', () => {
    Chat.close(); UI.hideChat(); activeChatId = null;
    _currentPeerId = null; _currentPeerData = null;
    document.querySelectorAll('.chat-row').forEach(r => r.classList.remove('active'));
});

onclick('sf-settings-btn', () => { refreshSidebar(); renderQuickEmojiSetting(); $('settings-modal')?.classList.remove('hidden'); });
onclick('sf-user-btn', () => { refreshSidebar(); renderQuickEmojiSetting(); $('settings-modal')?.classList.remove('hidden'); });
onclick('settings-close', () => $('settings-modal')?.classList.add('hidden'));
$('settings-modal')?.addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden'); });

/* SEARCH */
on('chat-search', 'input', e => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('.chat-row').forEach(r => {
        const n = r.querySelector('.chat-row-name')?.textContent.toLowerCase() || '';
        r.style.display = n.includes(q) ? '' : 'none';
    });
});

/* MSG INPUT */
const msgInp = $('msg-input');
if (msgInp) {
    msgInp.addEventListener('input', () => { UI.autoResize(msgInp); UI.updateSend(); Chat.handleTyping(); });
    msgInp.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey && window.innerWidth > 768) {
            e.preventDefault();
            if (msgInp.value.trim()) Chat.send(msgInp.value.trim());
        }
    });
}
onclick('send-btn', () => { if (msgInp?.value.trim()) { UI.haptic('light'); Chat.send(msgInp.value.trim()); } });

/* EMOJI */
onclick('emoji-btn', () => { $('emoji-panel')?.classList.toggle('hidden'); $('attach-panel')?.classList.add('hidden'); });

/* ATTACH — исправленная версия */
onclick('attach-btn', () => { $('attach-panel')?.classList.toggle('hidden'); $('emoji-panel')?.classList.add('hidden'); });

// Используем делегирование на стабильный родитель
document.addEventListener('click', e => {
    const item = e.target.closest('.attach-item');
    if (item) {
        $('attach-panel')?.classList.add('hidden');
        const t = item.dataset.type;
        if (t === 'photo') $('photo-pick')?.click();
        else if (t === 'video') $('video-pick')?.click();
        else if (t === 'file') $('file-pick')?.click();
        return;
    }
    if (!e.target.closest('.ctx') && !e.target.closest('.msg-bub')) UI.hideCtx();
    if (!e.target.closest('.attach-panel') && !e.target.closest('#attach-btn')) $('attach-panel')?.classList.add('hidden');
    if (!e.target.closest('.emoji-panel') && !e.target.closest('#emoji-btn')) $('emoji-panel')?.classList.add('hidden');
    if (!e.target.closest('.reaction-picker')) document.querySelectorAll('.reaction-picker').forEach(p => p.remove());
});

$('photo-pick').onchange = e => { if (e.target.files?.[0]) { Chat.sendFile(e.target.files[0]); e.target.value = ''; } };
$('video-pick').onchange = e => { if (e.target.files?.[0]) { Chat.sendFile(e.target.files[0]); e.target.value = ''; } };
$('file-pick').onchange = e => { if (e.target.files?.[0]) { Chat.sendFile(e.target.files[0]); e.target.value = ''; } };

/* VOICE */
onclick('voice-btn', () => { if (!Voice.isRecording()) Voice.start(); });
onclick('voice-cancel', () => Voice.cancel());
onclick('voice-send', () => Voice.sendVoice());

/* CALLS */
onclick('btn-audio-call', () => {
    const pid = Chat.getPid();
    if (!pid) return UI.toast('Сначала откройте чат');
    Calls.callUser(pid, $('chat-peer-name')?.textContent || 'User', false);
});
onclick('btn-video-call', () => {
    const pid = Chat.getPid();
    if (!pid) return UI.toast('Сначала откройте чат');
    Calls.callUser(pid, $('chat-peer-name')?.textContent || 'User', true);
});
onclick('call-end-btn', () => Calls.end());
onclick('call-accept-btn', () => Calls.accept());
onclick('call-reject-btn', () => Calls.reject());
onclick('call-mute-btn', () => Calls.toggleMute());
onclick('call-cam-btn', () => Calls.toggleCam());

/* CTX */
document.querySelectorAll('.ctx-btn').forEach(b => {
    b.onclick = () => {
        const m = $('ctx'); if (!m) return;
        const action = b.dataset.a;
        const mid = m.dataset.mid;
        const txt = m.dataset.txt;
        const sid = m.dataset.sid;
        UI.hideCtx();
        if (action === 'copy') Chat.copy(txt);
        else if (action === 'delete') Chat.del(mid);
        else if (action === 'reply') {
            const senderName = sid === Auth.user()?.uid
                ? (Auth.profile()?.name || 'Вы')
                : ($('chat-peer-name')?.textContent || 'User');
            Chat.setReply(mid, txt, senderName);
        }
    };
});

/* LIGHTBOX */
onclick('lb-close', () => UI.closeLightbox());
$('lightbox')?.addEventListener('click', e => { if (e.target === e.currentTarget) UI.closeLightbox(); });

/* PROFILE */
onclick('chat-info-btn', async () => {
    if (!_currentPeerId) return;
    await showProfile(_currentPeerId);
});

onclick('chat-peer-info', async () => {
    if (!_currentPeerId) return;
    await showProfile(_currentPeerId);
});

async function showProfile(uid) {
    try {
        const doc = await db.collection('users').doc(uid).get();
        if (!doc.exists) { UI.toast('Пользователь не найден'); return; }
        const d = doc.data();
        const name = d.name || 'User';
        const ini = name[0].toUpperCase();

        const avatarEl = $('profile-avatar');
        if (avatarEl) {
            if (d.avatarURL) {
                avatarEl.innerHTML = `<img src="${d.avatarURL}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
            } else {
                avatarEl.textContent = ini;
                avatarEl.style.background = UI.avatarBg(name);
            }
        }

        const n = $('profile-name'); if (n) n.textContent = name;
        const u = $('profile-username'); if (u) u.textContent = d.username ? '@' + d.username : '';
        const b = $('profile-bio'); if (b) b.textContent = d.bio || '';

        const statusRow = $('profile-status-row');
        if (statusRow) {
            statusRow.textContent = d.online ? '🟢 В сети' : d.lastSeen ? `Был(а) ${UI.fmtDate(d.lastSeen)}` : 'Не в сети';
        }

        $('profile-modal')?.classList.remove('hidden');
    } catch (e) {
        console.error('showProfile:', e);
        UI.toast('Ошибка загрузки профиля');
    }
}

onclick('profile-close', () => $('profile-modal')?.classList.add('hidden'));
$('profile-modal')?.addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden'); });

onclick('profile-msg-btn', () => {
    $('profile-modal')?.classList.add('hidden');
    $('msg-input')?.focus();
});

onclick('profile-call-btn', () => {
    $('profile-modal')?.classList.add('hidden');
    if (!_currentPeerId) return;
    Calls.callUser(_currentPeerId, $('chat-peer-name')?.textContent || 'User', false);
});

/* ПЕРЕИМЕНОВАТЬ КОНТАКТ */
onclick('profile-rename-btn', async () => {
    if (!_currentPeerId || !activeChatId) return;
    const me = Auth.user()?.uid;
    const current = $('chat-peer-name')?.textContent || '';
    const newName = await UI.prompt('Переименовать контакт', 'Имя контакта', current);
    if (!newName || newName.trim() === current) return;

    try {
        await db.collection('chats').doc(activeChatId).update({
            [`contactNames.${me}.${_currentPeerId}`]: newName.trim()
        });
        const nameEl = $('chat-peer-name');
        if (nameEl) nameEl.textContent = newName.trim();
        $('profile-modal')?.classList.add('hidden');
        UI.toast('✅ Контакт переименован');
    } catch (e) {
        UI.toast('❌ ' + e.message);
    }
});

/* AVATAR */
onclick('edit-avatar-btn', () => $('avatar-pick')?.click());
onclick('settings-avatar', () => $('avatar-pick')?.click());

const avatarPick = $('avatar-pick');
if (avatarPick) {
    avatarPick.onchange = async e => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) { UI.toast('⚠ Выберите изображение'); return; }
        if (file.size > 5 * 1024 * 1024) { UI.toast('⚠ Макс 5МБ'); return; }

        UI.toast('📤 Загрузка аватарки...');
        try {
            const result = await Storage.upload(file, pct => { if (pct > 0 && pct < 100) UI.toast(`📤 ${pct}%`); });
            await Auth.update({ avatarURL: result.url });
            refreshSidebar();

            // Обновляем во всех чатах
            const me = Auth.user()?.uid;
            if (me) {
                const chats = await db.collection('chats').where('participants', 'array-contains', me).get();
                const batch = db.batch();
                chats.docs.forEach(doc => batch.update(doc.ref, { [`avatars.${me}`]: result.url }));
                await batch.commit().catch(() => {});
            }
            UI.toast('✅ Аватарка обновлена');
        } catch (e) { UI.toast('❌ ' + e.message); }
        e.target.value = '';
    };
}

/* SETTINGS */
onclick('edit-name-btn', async () => {
    const v = await UI.prompt('Изменить имя', 'Новое имя', Auth.profile()?.name || '');
    if (!v) return;
    await Auth.update({ name: v });
    const me = Auth.user()?.uid;
    if (me) {
        const chats = await db.collection('chats').where('participants', 'array-contains', me).get();
        const batch = db.batch();
        chats.docs.forEach(doc => batch.update(doc.ref, { [`names.${me}`]: v }));
        await batch.commit().catch(() => {});
    }
    refreshSidebar();
    UI.toast('✅ Имя обновлено');
});

onclick('edit-username-btn', async () => {
    const current = Auth.profile()?.username || '';
    const v = await UI.prompt('Изменить юзернейм', 'username', current);
    if (!v) return;
    const clean = v.replace(/^@/, '').toLowerCase();
    if (clean.length < 3) return UI.toast('Минимум 3 символа');
    if (!/^[a-z0-9_]+$/.test(clean)) return UI.toast('Только буквы, цифры и _');
    if (clean !== current && !(await Auth.checkUsername(clean))) return UI.toast('Юзернейм занят');
    await Auth.update({ username: clean });
    await db.collection('usernames').doc(clean).set({ uid: Auth.user().uid });
    refreshSidebar();
    UI.toast('✅ Юзернейм обновлён');
});

onclick('edit-bio-btn', async () => {
    const v = await UI.prompt('О себе', 'Расскажите о себе', Auth.profile()?.bio || '');
    if (v !== null) { await Auth.update({ bio: v }); refreshSidebar(); UI.toast('✅ Сохранено'); }
});

/* БЫСТРАЯ РЕАКЦИЯ */
function renderQuickEmojiSetting() {
    const container = $('quick-emoji-setting');
    if (!container) return;
    const current = Chat.getQuickEmoji();
    container.innerHTML = '';
    Chat.QUICK_REACTIONS.forEach(emoji => {
        const btn = document.createElement('button');
        btn.className = 'quick-reaction-opt' + (emoji === current ? ' selected' : '');
        btn.textContent = emoji;
        btn.title = emoji;
        btn.onclick = () => {
            Chat.setQuickEmoji(emoji);
            renderQuickEmojiSetting();
            UI.toast(`${emoji} — быстрая реакция`);
        };
        container.appendChild(btn);
    });
}

/* ТЕМА */
const themeTog = $('theme-tog');
if (themeTog) {
    const saved = localStorage.getItem('pchat-theme') || 'dark';
    document.documentElement.dataset.theme = saved;
    themeTog.checked = saved === 'dark';
    themeTog.addEventListener('change', e => {
        const t = e.target.checked ? 'dark' : 'light';
        document.documentElement.dataset.theme = t;
        localStorage.setItem('pchat-theme', t);
    });
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

/* BACK */
window.addEventListener('popstate', () => {
    const cv = $('chat-view');
    if (cv && !cv.classList.contains('hidden') && window.innerWidth <= 768) {
        Chat.close(); UI.hideChat(); activeChatId = null;
        _currentPeerId = null; _currentPeerData = null;
        document.querySelectorAll('.chat-row').forEach(r => r.classList.remove('active'));
    }
});

if ('visualViewport' in window) {
    window.visualViewport.addEventListener('resize', () => {
        const s = $('msgs-scroll');
        if (s) s.scrollTop = s.scrollHeight;
    });
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

console.log('%c PCHAT Ready ✓', 'color:#22d3ae;font-weight:800;font-size:16px');
})();
