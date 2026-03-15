const Chat = (() => {
    let _cid = null;
    let _pid = null;
    let _pdata = null;
    let _unsub = null;
    let _typeTo = null;
    let _typing = false;
    let _pendingIds = new Set(); // отслеживаем сообщения которые мы добавили оптимистично

    const cid = () => _cid;

    const open = async (chatId, peerId, peerData) => {
        _cid = chatId;
        _pid = peerId;
        _pdata = peerData;
        _pendingIds.clear();

        document.getElementById('mob-fab')?.classList.add('hide');

        const name = peerData.name || 'User';
        const ini = name[0].toUpperCase();
        const bg = UI.avatarBg(name);

        const avatarEl = document.getElementById('chat-peer-avatar');
        const nameEl = document.getElementById('chat-peer-name');
        const statusEl = document.getElementById('chat-peer-status');

        if (avatarEl) { avatarEl.textContent = ini; avatarEl.style.background = bg; }
        if (nameEl) nameEl.textContent = name;
        if (statusEl) statusEl.textContent = 'в сети';

        const msgs = document.getElementById('msgs');
        if (msgs) msgs.innerHTML = '';

        const inp = document.getElementById('msg-input');
        if (inp) {
            inp.value = '';
            inp.style.height = 'auto';
            inp.placeholder = 'Напишите сообщение...';
        }
        UI.updateSend();

        listenMessages(chatId);
        watchStatus(peerId);
        watchTyping(chatId, peerId);
        markRead(chatId);
    };

    const send = async (text, type = 'text', meta = {}) => {
        if (!_cid || !text.trim()) return;
        const me = Auth.user()?.uid;
        if (!me) return;

        const inp = document.getElementById('msg-input');
        if (inp) {
            inp.value = '';
            inp.style.height = 'auto';
            inp.placeholder = 'Напишите сообщение...';
        }
        UI.updateSend();

        // Оптимистичное добавление — показываем сообщение СРАЗУ
        const tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        const nowTime = new Date();
        const tempMsg = {
            senderId: me,
            text: text,
            type,
            status: 'sent',
            timestamp: null, // нет серверного времени пока
            ...meta
        };

        const msgsEl = document.getElementById('msgs');
        const scroll = document.getElementById('msgs-scroll');
        const el = makeMsgEl(tempId, tempMsg, text);
        msgsEl?.appendChild(el);
        _pendingIds.add(tempId);

        requestAnimationFrame(() => {
            if (scroll) scroll.scrollTop = scroll.scrollHeight;
        });

        try {
            const docRef = await db.collection('chats').doc(_cid)
                .collection('messages').add({
                    senderId: me,
                    text: text,
                    type,
                    encrypted: false,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    status: 'sent',
                    ...meta
                });

            // Убираем временный элемент — реальный придёт через onSnapshot
            const tempEl = document.querySelector(`[data-mid="${tempId}"]`);
            if (tempEl) tempEl.remove();
            _pendingIds.delete(tempId);

            const preview = type === 'image' ? '📷 Фото'
                : type === 'file' ? `📎 ${meta.fileName || 'Файл'}`
                : type === 'voice' ? '🎤 Голосовое'
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
            // Помечаем временное сообщение ошибкой
            const tempEl = document.querySelector(`[data-mid="${tempId}"]`);
            if (tempEl) {
                tempEl.style.opacity = '0.5';
            }
        }
    };

    const sendFile = async file => {
        if (!_cid || !file) return;
        if (file.size > 25 * 1024 * 1024) { UI.toast('⚠ Макс. 25 МБ'); return; }
        UI.toast('📤 Загрузка...');
        try {
            const me = Auth.user()?.uid;
            if (!me) return;
            const ext = file.name.split('.').pop();
            const path = `chats/${_cid}/${Date.now()}.${ext}`;

            const ref = storage.ref(path);
            const snap = await ref.put(file);
            const url = await snap.ref.getDownloadURL();

            const isImg = file.type.startsWith('image/');
            const isVideo = file.type.startsWith('video/');

            let msgType = 'file';
            let msgText = `📎 ${file.name}`;
            if (isImg) { msgType = 'image'; msgText = '📷 Фото'; }
            else if (isVideo) { msgType = 'video'; msgText = '🎬 Видео'; }

            await send(msgText, msgType, {
                fileURL: url, fileName: file.name,
                fileSize: file.size, fileType: file.type, fileEncrypted: false
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
        let isInitialLoad = true;

        _unsub = db.collection('chats').doc(chatId)
            .collection('messages')
            .orderBy('timestamp', 'asc')
            .onSnapshot(snap => {
                snap.docChanges().forEach(change => {
                    if (change.type === 'added') {
                        const m = change.doc.data();
                        const id = change.doc.id;

                        // Если это сообщение уже показано оптимистично — пропускаем дублирование
                        // Нет, мы уже удаляем tempEl в send(). Но на всякий случай:
                        // Проверяем нет ли уже элемента с этим id
                        if (document.querySelector(`[data-mid="${id}"]`)) return;

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

                        const el = makeMsgEl(id, m, m.text);
                        msgsEl?.appendChild(el);

                        requestAnimationFrame(() => {
                            if (scroll) scroll.scrollTop = scroll.scrollHeight;
                        });

                        const me = Auth.user()?.uid;
                        if (m.senderId !== me) {
                            markMsgRead(chatId, id);

                            if (!isInitialLoad) {
                                let notifText = m.text || 'Новое сообщение';
                                if (m.type === 'voice') notifText = '🎤 Голосовое сообщение';
                                else if (m.type === 'image') notifText = '📷 Фотография';
                                else if (m.type === 'file') notifText = '📎 Файл';

                                Notif.show(_pdata?.name || 'PCHAT', notifText);
                            }
                        }
                    }

                    if (change.type === 'modified') {
                        const el = document.querySelector(`[data-mid="${change.doc.id}"] .msg-status`);
                        if (el) setStatus(el, change.doc.data().status);
                    }

                    if (change.type === 'removed') {
                        document.querySelector(`[data-mid="${change.doc.id}"]`)?.remove();
                    }
                });

                isInitialLoad = false;
            });
    };

    const makeMsgEl = (id, m, txt) => {
        const me = Auth.user()?.uid;
        const mine = m.senderId === me;

        const wrap = document.createElement('div');
        wrap.className = `msg ${mine ? 'out' : 'in'}`;
        wrap.dataset.mid = id;

        // Время: если нет серверного timestamp — показываем текущее
        const time = m.timestamp ? UI.fmtTime(m.timestamp) : UI.fmtTimeNow();
        const statusHtml = mine
            ? `<span class="msg-status ${statusClass(m.status)}">${statusIcon(m.status)}</span>`
            : '';

        let content = '';
        let isImgOnly = false;

        if (m.type === 'voice' && m.fileURL) {
            const bub = document.createElement('div');
            bub.className = 'msg-bub';
            const voiceEl = Voice.makeVoiceEl(m);
            bub.appendChild(voiceEl);
            const footer = document.createElement('div');
            footer.className = 'msg-footer';
            footer.innerHTML = `<span class="msg-time">${time}</span>${statusHtml}`;
            bub.appendChild(footer);
            wrap.appendChild(bub);
            addLongPress(wrap, id, '🎤 Голосовое', m.senderId);
            return wrap;
        }
        else if (m.type === 'video' && m.fileURL) {
            content = `<video class="msg-video" src="${m.fileURL}" controls preload="metadata" playsinline></video>`;
        }
        else if (m.type === 'image' && m.fileURL) {
            content = `<img class="msg-img" src="${m.fileURL}" alt="Фото" loading="lazy">`;
            isImgOnly = true;
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

        wrap.innerHTML = `
        <div class="msg-bub${isImgOnly ? ' img-only' : ''}">
            ${content}
            <div class="msg-footer">
                <span class="msg-time">${time}</span>
                ${statusHtml}
            </div>
        </div>`;

        addLongPress(wrap, id, txt, m.senderId);

        const img = wrap.querySelector('.msg-img');
        if (img) img.addEventListener('click', () => UI.openLightbox(img.src));

        return wrap;
    };

    const addLongPress = (wrap, id, txt, senderId) => {
        let pressTimer;
        wrap.addEventListener('touchstart', e => {
            pressTimer = setTimeout(() => {
                UI.haptic('medium');
                UI.showCtx(e.touches[0].clientX, e.touches[0].clientY,
                    { id, text: txt, senderId });
            }, 500);
        }, { passive: true });
        wrap.addEventListener('touchend', () => clearTimeout(pressTimer));
        wrap.addEventListener('touchmove', () => clearTimeout(pressTimer));
        wrap.addEventListener('contextmenu', e => {
            e.preventDefault();
            UI.showCtx(e.clientX, e.clientY, { id, text: txt, senderId });
        });
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
        if (!_cid) return;
        if (!_typing) {
            _typing = true;
            setTyping(true);
        }
        clearTimeout(_typeTo);
        _typeTo = setTimeout(() => {
            _typing = false;
            setTyping(false);
        }, 2000);
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
        if (mid.startsWith('temp_')) {
            document.querySelector(`[data-mid="${mid}"]`)?.remove();
            return;
        }
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
        _pendingIds.clear();
        clearTimeout(_typeTo);
    };

    return { cid, open, send, sendFile, del, copy, markRead, close, handleTyping };
})();
