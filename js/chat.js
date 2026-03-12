const Chat = (() => {
    let _cid = null;
    let _pid = null;
    let _pdata = null;
    let _unsub = null;
    let _typeTo = null;
    let _typing = false;

    const cid = () => _cid;

    const open = async (chatId, peerId, peerData) => {
        _cid = chatId;
        _pid = peerId;
        _pdata = peerData;

        document.getElementById('mob-fab')?.classList.add('hide');

        const name = peerData.name || 'User';
        const ini = name[0].toUpperCase();
        const bg = UI.avatarBg(name);

        const avatarEl = document.getElementById('chat-peer-avatar');
        const nameEl = document.getElementById('chat-peer-name');
        const statusEl = document.getElementById('chat-peer-status');
        const typingAv = document.getElementById('typing-avatar');

        if (avatarEl) { avatarEl.textContent = ini; avatarEl.style.background = bg; }
        if (nameEl) nameEl.textContent = name;
        if (statusEl) statusEl.textContent = 'в сети';
        if (typingAv) { typingAv.textContent = ini; typingAv.style.background = bg; }

        const msgs = document.getElementById('msgs');
        if (msgs) msgs.innerHTML = '';

        const inp = document.getElementById('msg-input');
        if (inp) {
            inp.value = '';
            inp.style.height = 'auto';
            inp.placeholder = 'Напишите сообщение...';
        }
        UI.updateSend();

        try { await setupE2E(chatId, peerId); } catch (e) { console.warn('E2E:', e); }

        listenMessages(chatId);
        watchStatus(peerId);
        watchTyping(chatId, peerId);
        markRead(chatId);
    };

    const setupE2E = async (chatId, peerId) => {
        const pdoc = await db.collection('users').doc(peerId).get();
        if (!pdoc.exists || !pdoc.data().publicKey) throw new Error('No peer key');
        await Crypto.getSharedKey(chatId, Auth.keyPair().privateKey, pdoc.data().publicKey);
    };

    const send = async (text, type = 'text', meta = {}) => {
        if (!_cid || !text.trim()) return;
        const me = Auth.user()?.uid;
        if (!me) return;

        // Мгновенно очищаем инпут
        const inp = document.getElementById('msg-input');
        if (inp) {
            inp.value = '';
            inp.style.height = 'auto';
            inp.placeholder = 'Напишите сообщение...';
        }
        UI.updateSend();

        try {
            let ct = text;
            let enc = false;

            try {
                const pdoc = await db.collection('users').doc(_pid).get();
                if (pdoc.exists && pdoc.data().publicKey) {
                    const key = await Crypto.getSharedKey(
                        _cid, Auth.keyPair().privateKey, pdoc.data().publicKey
                    );
                    ct = await Crypto.encrypt(text, key);
                    enc = true;
                }
            } catch (e) { console.warn('Encrypt failed:', e); }

            await db.collection('chats').doc(_cid)
                .collection('messages').add({
                    senderId: me,
                    text: ct,
                    type,
                    encrypted: enc,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    status: 'sent',
                    ...meta
                });

            // Превью — показываем реальный текст, не "зашифровано"
            const preview = type === 'image' ? '📷 Фото'
                : type === 'file' ? `📄 ${meta.fileName || 'Файл'}`
                : text.length > 60 ? text.substring(0, 60) + '...'
                : text;

            await db.collection('chats').doc(_cid).update({
                lastMessage: preview,
                lastMessageTime: firebase.firestore.FieldValue.serverTimestamp(),
                lastSenderId: me,
                [`unread_${_pid}`]: firebase.firestore.FieldValue.increment(1)
            });

            setTyping(false);

        } catch (e) {
            console.error('Send error:', e);
            UI.toast('❌ Ошибка отправки');
        }
    };

    const sendFile = async file => {
        if (!_cid || !file) return;
        if (file.size > 10 * 1024 * 1024) { UI.toast('❌ Макс. 10 МБ'); return; }
        UI.toast('📤 Загрузка...');
        try {
            const me = Auth.user()?.uid;
            if (!me) return;
            const ext = file.name.split('.').pop();
            const path = `chats/${_cid}/${Date.now()}.${ext}`;
            const ab = await file.arrayBuffer();
            let uploadData = ab, fenc = false;
            try {
                const pdoc = await db.collection('users').doc(_pid).get();
                if (pdoc.exists && pdoc.data().publicKey) {
                    const key = await Crypto.getSharedKey(_cid, Auth.keyPair().privateKey, pdoc.data().publicKey);
                    uploadData = await Crypto.encryptFile(ab, key);
                    fenc = true;
                }
            } catch (e) { console.warn('File encrypt failed:', e); }
            const ref = storage.ref(path);
            const snap = await ref.put(new Blob([uploadData]));
            const url = await snap.ref.getDownloadURL();
            const isImg = file.type.startsWith('image/');
            await send(isImg ? '📷 Фото' : `📄 ${file.name}`, isImg ? 'image' : 'file', {
                fileURL: url, fileName: file.name,
                fileSize: file.size, fileType: file.type, fileEncrypted: fenc
            });
            UI.toast('✅ Отправлено');
        } catch (e) {
            console.error('File error:', e);
            UI.toast('❌ Ошибка загрузки');
        }
    };

    const listenMessages = chatId => {
        if (_unsub) { _unsub(); _unsub = null; }
        const msgsEl = document.getElementById('msgs');
        const scroll = document.getElementById('msgs-scroll');
        let lastDateStr = null;

        _unsub = db.collection('chats').doc(chatId)
            .collection('messages')
            .orderBy('timestamp', 'asc')
            .onSnapshot(snap => {
                snap.docChanges().forEach(async change => {
                    if (change.type === 'added') {
                        const m = change.doc.data();
                        const id = change.doc.id;

                        if (m.timestamp) {
                            const d = m.timestamp.toDate ? m.timestamp.toDate() : new Date();
                            const ds = d.toDateString();
                            if (ds !== lastDateStr) {
                                lastDateStr = ds;
                                const sep = document.createElement('div');
                                sep.className = 'date-sep';
                                sep.innerHTML = `<span>${UI.fmtSep(m.timestamp)}</span>`;
                                msgsEl?.appendChild(sep);
                            }
                        }

                        let txt = m.text;
                        if (m.encrypted && _pid) {
                            try {
                                const pdoc = await db.collection('users').doc(_pid).get();
                                if (pdoc.exists && pdoc.data().publicKey) {
                                    const key = await Crypto.getSharedKey(
                                        chatId, Auth.keyPair().privateKey, pdoc.data().publicKey
                                    );
                                    txt = await Crypto.decrypt(m.text, key);
                                }
                            } catch (e) { txt = '[не удалось расшифровать]'; }
                        }

                        const el = makeMsgEl(id, m, txt);
                        msgsEl?.appendChild(el);

                        requestAnimationFrame(() => {
                            if (scroll) scroll.scrollTop = scroll.scrollHeight;
                        });

                        const me = Auth.user()?.uid;
                        if (m.senderId !== me) markMsgRead(chatId, id);
                    }

                    if (change.type === 'modified') {
                        const el = document.querySelector(`[data-mid="${change.doc.id}"] .msg-status`);
                        if (el) setStatus(el, change.doc.data().status);
                    }

                    if (change.type === 'removed') {
                        document.querySelector(`[data-mid="${change.doc.id}"]`)?.remove();
                    }
                });
            });
    };

    const makeMsgEl = (id, m, txt) => {
        const me = Auth.user()?.uid;
        const mine = m.senderId === me;

        const wrap = document.createElement('div');
        wrap.className = `msg ${mine ? 'out' : 'in'}`;
        wrap.dataset.mid = id;

        let content = '';
        if (m.type === 'image' && m.fileURL) {
            content = `<img class="msg-img" src="${m.fileURL}" alt="Фото" loading="lazy">`;
        } else if (m.type === 'file' && m.fileURL) {
            content = `
                <a class="msg-file" href="${m.fileURL}" target="_blank" rel="noopener">
                    <span class="msg-file-ic">📄</span>
                    <div>
                        <div class="msg-fn">${UI.esc(m.fileName || 'Файл')}</div>
                        <div class="msg-fs">${fmtSize(m.fileSize)}</div>
                    </div>
                </a>`;
        } else {
            content = `<span class="msg-text">${linkify(UI.esc(txt))}</span>`;
        }

        const time = UI.fmtTime(m.timestamp);

        // Статус и время — в одну строку справа внутри баббла
        const statusHtml = mine
            ? `<span class="msg-status ${statusClass(m.status)}">${statusIcon(m.status)}</span>`
            : '';

        wrap.innerHTML = `
            <div class="msg-bub">
                ${content}
                <div class="msg-footer">
                    <span class="msg-time">${time}</span>
                    ${statusHtml}
                </div>
            </div>`;

        // Long press
        let pressTimer;
        wrap.addEventListener('touchstart', e => {
            pressTimer = setTimeout(() => {
                UI.haptic('medium');
                UI.showCtx(e.touches[0].clientX, e.touches[0].clientY,
                    { id, text: txt, senderId: m.senderId });
            }, 500);
        }, { passive: true });
        wrap.addEventListener('touchend', () => clearTimeout(pressTimer));
        wrap.addEventListener('touchmove', () => clearTimeout(pressTimer));
        wrap.addEventListener('contextmenu', e => {
            e.preventDefault();
            UI.showCtx(e.clientX, e.clientY, { id, text: txt, senderId: m.senderId });
        });

        const img = wrap.querySelector('.msg-img');
        if (img) img.addEventListener('click', () => UI.openLightbox(img.src));

        return wrap;
    };

    const statusClass = s => s === 'read' ? 's3' : s === 'delivered' ? 's2' : 's1';
    const statusIcon = s => s === 'read' || s === 'delivered' ? '✓✓' : '✓';
    const setStatus = (el, s) => { el.className = `msg-status ${statusClass(s)}`; el.textContent = statusIcon(s); };

    const linkify = text => text.replace(
        /(https?:\/\/[^\s<]+)/g,
        '<a href="$1" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline;word-break:break-all;">$1</a>'
    );

    const fmtSize = b => {
        if (!b) return '';
        if (b < 1024) return b + ' B';
        if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
        return (b / 1048576).toFixed(1) + ' MB';
    };

    const markRead = cid => {
        if (!cid) return;
        const me = Auth.user()?.uid;
        if (!me) return;
        db.collection('chats').doc(cid).update({ [`unread_${me}`]: 0 }).catch(() => {});
    };

    const markMsgRead = (cid, mid) => {
        db.collection('chats').doc(cid).collection('messages').doc(mid)
            .update({ status: 'read' }).catch(() => {});
    };

    const setTyping = val => {
        if (!_cid) return;
        const me = Auth.user()?.uid;
        if (!me) return;
        db.collection('chats').doc(_cid).update({ [`typing_${me}`]: val }).catch(() => {});
    };

    const handleTyping = () => {
        if (!_typing) { _typing = true; setTyping(true); }
        clearTimeout(_typeTo);
        _typeTo = setTimeout(() => { _typing = false; setTyping(false); }, 2000);
    };

    const watchTyping = (chatId, peerId) => {
        db.collection('chats').doc(chatId).onSnapshot(doc => {
            if (!doc.exists) return;
            const bar = document.getElementById('typing-row');
            if (bar) bar.classList.toggle('hidden', !doc.data()[`typing_${peerId}`]);
        });
    };

    const watchStatus = peerId => {
        db.collection('users').doc(peerId).onSnapshot(doc => {
            if (!doc.exists) return;
            const data = doc.data();
            const statusEl = document.getElementById('chat-peer-status');
            const metaEl = document.getElementById('chat-peer-meta');
            if (!statusEl) return;
            if (data.online) {
                statusEl.textContent = 'в сети';
                metaEl?.classList.remove('offline');
            } else {
                statusEl.textContent = data.lastSeen ? `был(а) ${UI.fmtDate(data.lastSeen)}` : 'не в сети';
                metaEl?.classList.add('offline');
            }
        });
    };

    const del = async mid => {
        if (!_cid || !mid) return;
        const ok = await UI.modal('Удалить сообщение?', '<p>Это нельзя отменить</p>', 'Удалить', 'Отмена', true);
        if (!ok) return;
        try {
            await db.collection('chats').doc(_cid).collection('messages').doc(mid).delete();
            UI.toast('Удалено');
        } catch (e) { UI.toast('❌ Ошибка'); }
    };

    const copy = txt => {
        navigator.clipboard.writeText(txt)
            .then(() => UI.toast('📋 Скопировано'))
            .catch(() => UI.toast('❌ Не удалось'));
    };

    const close = () => {
        if (_unsub) { _unsub(); _unsub = null; }
        if (_cid && _typing) setTyping(false);
        document.getElementById('mob-fab')?.classList.remove('hide');
        _cid = null; _pid = null; _pdata = null;
        _typing = false;
        clearTimeout(_typeTo);
    };

    return { cid, open, send, sendFile, del, copy, handleTyping, markRead, close };
})();
