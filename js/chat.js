const Chat = (() => {
    let _cid = null;
    let _pid = null;
    let _pdata = null;
    let _unsub = null;
    let _typeTo = null;
    let _typing = false;

    const cid = () => _cid;
    const getPid = () => _pid;

    const open = async (chatId, peerId, peerData) => {
        if (_unsub) { _unsub(); _unsub = null; }

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
        const metaEl = document.getElementById('chat-peer-meta');

        if (avatarEl) { avatarEl.textContent = ini; avatarEl.style.background = bg; }
        if (nameEl) nameEl.textContent = name;
        if (statusEl) statusEl.textContent = 'загрузка...';
        if (metaEl) metaEl.classList.remove('offline');

        const msgs = document.getElementById('msgs');
        if (msgs) msgs.innerHTML = '';

        const inp = document.getElementById('msg-input');
        if (inp) { inp.value = ''; inp.style.height = 'auto'; inp.placeholder = 'Напишите сообщение...'; }
        UI.updateSend();

        listenMessages(chatId);
        watchStatus(peerId);
        watchTyping(chatId, peerId);
        markRead(chatId);
    };

    const send = async (text, type = 'text', meta = {}) => {
        if (!_cid) return;
        const t = typeof text === 'string' ? text.trim() : '';
        if (type === 'text' && !t) return;

        const me = Auth.user()?.uid;
        if (!me) return;

        const inp = document.getElementById('msg-input');
        if (inp && type === 'text') {
            inp.value = '';
            inp.style.height = 'auto';
        }
        UI.updateSend();
        setTyping(false);

        // Оптимистичный рендер — показываем сразу
        const tempId = 'tmp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        const msgsEl = document.getElementById('msgs');
        const scroll = document.getElementById('msgs-scroll');

        const tempMsgData = {
            senderId: me,
            text: type === 'text' ? t : text,
            type,
            status: 'sent',
            timestamp: null,
            ...meta
        };
        const tempEl = makeMsgEl(tempId, tempMsgData);
        if (msgsEl) msgsEl.appendChild(tempEl);
        requestAnimationFrame(() => { if (scroll) scroll.scrollTop = scroll.scrollHeight; });

        try {
            await db.collection('chats').doc(_cid).collection('messages').add({
                senderId: me,
                text: type === 'text' ? t : text,
                type,
                encrypted: false,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'sent',
                ...meta
            });

            // Убираем временный — придёт через onSnapshot
            tempEl.remove();

            const preview = type === 'image' ? '📷 Фото'
                : type === 'video' ? '🎬 Видео'
                : type === 'file' ? `📎 ${meta.fileName || 'Файл'}`
                : type === 'voice' ? '🎤 Голосовое'
                : t.length > 60 ? t.slice(0, 60) + '...' : t;

            await db.collection('chats').doc(_cid).update({
                lastMessage: preview,
                lastMessageTime: firebase.firestore.FieldValue.serverTimestamp(),
                lastSenderId: me,
                [`unread_${_pid}`]: firebase.firestore.FieldValue.increment(1)
            });
        } catch (e) {
            console.error('Send error:', e);
            UI.toast('❌ Ошибка отправки');
            tempEl.style.opacity = '0.4';
        }
    };

    const sendFile = async (file) => {
        if (!_cid || !file) return;
        const maxMB = 100;
        if (file.size > maxMB * 1024 * 1024) { UI.toast(`⚠ Макс. ${maxMB} МБ`); return; }

        UI.toast('📤 Загрузка...');
        try {
            const me = Auth.user()?.uid;
            if (!me) return;

            const ext = file.name.split('.').pop().toLowerCase();
            const path = `chats/${_cid}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
            const ref = storage.ref(path);

            // Прогресс загрузки
            const uploadTask = ref.put(file);
            await new Promise((resolve, reject) => {
                uploadTask.on('state_changed',
                    snap => {
                        const pct = Math.round(snap.bytesTransferred / snap.totalBytes * 100);
                        UI.toast(`📤 Загрузка ${pct}%`);
                    },
                    reject,
                    resolve
                );
            });

            const url = await ref.getDownloadURL();

            const isImg = file.type.startsWith('image/');
            const isVid = file.type.startsWith('video/');

            let msgType = 'file';
            let msgText = `📎 ${file.name}`;
            if (isImg) { msgType = 'image'; msgText = '📷 Фото'; }
            else if (isVid) { msgType = 'video'; msgText = '🎬 Видео'; }

            await send(msgText, msgType, {
                fileURL: url,
                fileName: file.name,
                fileSize: file.size,
                fileType: file.type
            });
            UI.toast('✅ Отправлено');
        } catch (e) {
            console.error('File upload error:', e);
            UI.toast('❌ Ошибка загрузки: ' + e.message);
        }
    };

    const listenMessages = (chatId) => {
        if (_unsub) { _unsub(); _unsub = null; }
        const msgsEl = document.getElementById('msgs');
        const scroll = document.getElementById('msgs-scroll');
        let lastDateStr = null;
        let isFirst = true;

        _unsub = db.collection('chats').doc(chatId)
            .collection('messages')
            .orderBy('timestamp', 'asc')
            .onSnapshot(snap => {
                snap.docChanges().forEach(change => {
                    if (change.type === 'added') {
                        const m = change.doc.data();
                        const id = change.doc.id;

                        // Не дублируем если уже есть
                        if (document.querySelector(`[data-mid="${id}"]`)) return;

                        // Дата-разделитель
                        if (m.timestamp) {
                            const d = m.timestamp.toDate();
                            const ds = d.toDateString();
                            if (ds !== lastDateStr) {
                                lastDateStr = ds;
                                const sep = document.createElement('div');
                                sep.className = 'date-sep';
                                sep.innerHTML = `<span>${UI.fmtSep(m.timestamp)}</span>`;
                                msgsEl?.appendChild(sep);
                            }
                        }

                        const el = makeMsgEl(id, m);
                        msgsEl?.appendChild(el);
                        requestAnimationFrame(() => { if (scroll) scroll.scrollTop = scroll.scrollHeight; });

                        const me = Auth.user()?.uid;
                        if (m.senderId !== me) {
                            markMsgRead(chatId, id);
                            if (!isFirst) {
                                let txt = m.text || 'Новое сообщение';
                                if (m.type === 'voice') txt = '🎤 Голосовое';
                                else if (m.type === 'image') txt = '📷 Фото';
                                else if (m.type === 'video') txt = '🎬 Видео';
                                else if (m.type === 'file') txt = '📎 Файл';
                                Notif.show(_pdata?.name || 'PCHAT', txt);
                            }
                        }
                    }
                    if (change.type === 'modified') {
                        const el = document.querySelector(`[data-mid="${change.doc.id}"] .msg-status`);
                        if (el) setStatusEl(el, change.doc.data().status);
                    }
                    if (change.type === 'removed') {
                        document.querySelector(`[data-mid="${change.doc.id}"]`)?.remove();
                    }
                });
                isFirst = false;
            }, err => {
                console.error('Messages error:', err);
            });
    };

    const makeMsgEl = (id, m) => {
        const me = Auth.user()?.uid;
        const mine = m.senderId === me;

        const wrap = document.createElement('div');
        wrap.className = `msg ${mine ? 'out' : 'in'}`;
        wrap.dataset.mid = id;

        const time = m.timestamp ? UI.fmtTime(m.timestamp) : UI.fmtTimeNow();
        const statusHtml = mine ? `<span class="msg-status ${statusCls(m.status)}">${statusIcon(m.status)}</span>` : '';

        const footer = `<div class="msg-footer"><span class="msg-time">${time}</span>${statusHtml}</div>`;

        if (m.type === 'voice' && m.fileURL) {
            const bub = document.createElement('div');
            bub.className = 'msg-bub';
            bub.appendChild(Voice.makeVoiceEl(m));
            bub.insertAdjacentHTML('beforeend', footer);
            wrap.appendChild(bub);
            addCtx(wrap, id, '🎤 Голосовое', m.senderId);
            return wrap;
        }

        if (m.type === 'image' && m.fileURL) {
            wrap.innerHTML = `<div class="msg-bub img-only"><img class="msg-img" src="${m.fileURL}" loading="lazy" alt="Фото">${footer}</div>`;
            wrap.querySelector('.msg-img')?.addEventListener('click', () => UI.openLightbox(m.fileURL));
            addCtx(wrap, id, '📷 Фото', m.senderId);
            return wrap;
        }

        if (m.type === 'video' && m.fileURL) {
            wrap.innerHTML = `<div class="msg-bub"><video class="msg-video" src="${m.fileURL}" controls preload="metadata" playsinline></video>${footer}</div>`;
            addCtx(wrap, id, '🎬 Видео', m.senderId);
            return wrap;
        }

        if (m.type === 'file' && m.fileURL) {
            wrap.innerHTML = `<div class="msg-bub"><a class="msg-file" href="${m.fileURL}" target="_blank" rel="noopener"><span class="msg-file-ic">📄</span><div><div class="msg-fn">${UI.esc(m.fileName || 'Файл')}</div><div class="msg-fs">${fmtSize(m.fileSize)}</div></div></a>${footer}</div>`;
            addCtx(wrap, id, m.fileName || 'Файл', m.senderId);
            return wrap;
        }

        // Обычный текст
        const txt = m.text || '';
        wrap.innerHTML = `<div class="msg-bub"><span class="msg-text">${linkify(UI.esc(txt))}</span>${footer}</div>`;
        addCtx(wrap, id, txt, m.senderId);
        return wrap;
    };

    const addCtx = (wrap, id, txt, senderId) => {
        let timer;
        wrap.addEventListener('touchstart', e => {
            timer = setTimeout(() => {
                UI.haptic('medium');
                UI.showCtx(e.touches[0].clientX, e.touches[0].clientY, { id, text: txt, senderId });
            }, 500);
        }, { passive: true });
        wrap.addEventListener('touchend', () => clearTimeout(timer));
        wrap.addEventListener('touchmove', () => clearTimeout(timer));
        wrap.addEventListener('contextmenu', e => {
            e.preventDefault();
            UI.showCtx(e.clientX, e.clientY, { id, text: txt, senderId });
        });
    };

    const statusCls = s => s === 'read' ? 's3' : s === 'delivered' ? 's2' : 's1';
    const statusIcon = s => (s === 'read' || s === 'delivered') ? '✓✓' : '✓';
    const setStatusEl = (el, s) => { el.className = `msg-status ${statusCls(s)}`; el.textContent = statusIcon(s); };

    const linkify = t => t.replace(/(https?:\/\/[^\s<]+)/g,
        '<a href="$1" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline;word-break:break-all">$1</a>');

    const fmtSize = b => {
        if (!b) return '';
        if (b < 1024) return b + ' B';
        if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
        return (b / 1048576).toFixed(1) + ' MB';
    };

    const markRead = cid => {
        const me = Auth.user()?.uid;
        if (!me || !cid) return;
        db.collection('chats').doc(cid).update({ [`unread_${me}`]: 0 }).catch(() => {});
    };

    const markMsgRead = (cid, mid) => {
        db.collection('chats').doc(cid).collection('messages').doc(mid)
            .update({ status: 'read' }).catch(() => {});
    };

    const setTyping = val => {
        const me = Auth.user()?.uid;
        if (!me || !_cid) return;
        db.collection('chats').doc(_cid).update({ [`typing_${me}`]: val }).catch(() => {});
    };

    const handleTyping = () => {
        if (!_cid) return;
        if (!_typing) { _typing = true; setTyping(true); }
        clearTimeout(_typeTo);
        _typeTo = setTimeout(() => { _typing = false; setTyping(false); }, 2000);
    };

    const watchTyping = (chatId, peerId) => {
        db.collection('chats').doc(chatId).onSnapshot(doc => {
            if (!doc.exists) return;
            document.getElementById('typing-row')?.classList.toggle('hidden', !doc.data()[`typing_${peerId}`]);
        });
    };

    const watchStatus = peerId => {
        db.collection('users').doc(peerId).onSnapshot(doc => {
            if (!doc.exists) return;
            const d = doc.data();
            const statusEl = document.getElementById('chat-peer-status');
            const metaEl = document.getElementById('chat-peer-meta');
            if (!statusEl) return;
            if (d.online) {
                statusEl.textContent = 'в сети';
                metaEl?.classList.remove('offline');
            } else {
                statusEl.textContent = d.lastSeen ? `был(а) ${UI.fmtDate(d.lastSeen)}` : 'не в сети';
                metaEl?.classList.add('offline');
            }
        });
    };

    const del = async mid => {
        if (!_cid || !mid) return;
        if (mid.startsWith('tmp_')) { document.querySelector(`[data-mid="${mid}"]`)?.remove(); return; }
        const ok = await UI.modal('Удалить сообщение?', '<p>Это нельзя отменить</p>', 'Удалить', 'Отмена', true);
        if (!ok) return;
        try {
            await db.collection('chats').doc(_cid).collection('messages').doc(mid).delete();
            UI.toast('Удалено');
        } catch (e) { UI.toast('❌ Ошибка'); }
    };

    const copy = txt => {
        navigator.clipboard.writeText(txt).then(() => UI.toast('📋 Скопировано')).catch(() => UI.toast('❌ Не удалось'));
    };

    const close = () => {
        if (_unsub) { _unsub(); _unsub = null; }
        if (_typing) setTyping(false);
        clearTimeout(_typeTo);
        document.getElementById('mob-fab')?.classList.remove('hide');
        _cid = null; _pid = null; _pdata = null; _typing = false;
    };

    return { cid, getPid, open, send, sendFile, del, copy, markRead, close, handleTyping };
})();
