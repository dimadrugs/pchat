const Chat = (() => {
    let _cid = null;
    let _pid = null;
    let _pdata = null;
    let _unsub = null;
    let _typeTo = null;
    let _typing = false;
    let _replyTo = null; // { id, text, senderName }
    let _sentIds = new Set(); // ID отправленных — для предотвращения дубликата

    const cid = () => _cid;
    const getPid = () => _pid;

    const QUICK_REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🔥'];

    const open = async (chatId, peerId, peerData) => {
        if (_unsub) { _unsub(); _unsub = null; }
        _cid = chatId; _pid = peerId; _pdata = peerData;
        _replyTo = null;
        _sentIds.clear();
        _hideReplyBar();

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
        if (statusEl) statusEl.textContent = '';
        if (metaEl) metaEl.classList.remove('offline');

        const msgs = document.getElementById('msgs');
        if (msgs) msgs.innerHTML = '';

        const inp = document.getElementById('msg-input');
        if (inp) { inp.value = ''; inp.style.height = 'auto'; inp.placeholder = 'Напишите сообщение...'; }
        UI.updateSend();

        _initDragDrop();
        listenMessages(chatId);
        watchStatus(peerId);
        watchTyping(chatId, peerId);
        markRead(chatId);
    };

    // ==================== DRAG & DROP ====================
    const _onDragOver = e => { e.preventDefault(); document.getElementById('chat-view')?.classList.add('drag-over'); };
    const _onDragLeave = e => { e.preventDefault(); if (!document.getElementById('chat-view')?.contains(e.relatedTarget)) document.getElementById('chat-view')?.classList.remove('drag-over'); };
    const _onDrop = async e => { e.preventDefault(); document.getElementById('chat-view')?.classList.remove('drag-over'); const files = Array.from(e.dataTransfer?.files || []); for (const f of files) await sendFile(f); };

    const _initDragDrop = () => {
        const cv = document.getElementById('chat-view');
        if (!cv) return;
        cv.removeEventListener('dragover', _onDragOver);
        cv.removeEventListener('dragleave', _onDragLeave);
        cv.removeEventListener('drop', _onDrop);
        cv.addEventListener('dragover', _onDragOver);
        cv.addEventListener('dragleave', _onDragLeave);
        cv.addEventListener('drop', _onDrop);
    };

    // ==================== REPLY ====================
    const setReply = (id, text, senderName) => {
        _replyTo = { id, text: (text || '').substring(0, 100), senderName: senderName || 'User' };
        _showReplyBar();
    };

    const clearReply = () => { _replyTo = null; _hideReplyBar(); };

    const _showReplyBar = () => {
        if (!_replyTo) return;
        let bar = document.getElementById('reply-bar');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'reply-bar';
            bar.className = 'reply-bar';
            const composer = document.querySelector('.composer-area');
            if (composer) composer.insertBefore(bar, composer.firstChild);
        }
        bar.innerHTML = `
            <div class="reply-bar-body">
                <div class="reply-bar-name">${UI.esc(_replyTo.senderName)}</div>
                <div class="reply-bar-text">${UI.esc(_replyTo.text)}</div>
            </div>
            <button class="reply-bar-close" id="reply-close-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>`;
        bar.classList.remove('hidden');
        document.getElementById('reply-close-btn').onclick = clearReply;
        document.getElementById('msg-input')?.focus();
    };

    const _hideReplyBar = () => {
        const bar = document.getElementById('reply-bar');
        if (bar) bar.remove();
    };

    // ==================== SEND ====================
    const send = async (text, type = 'text', meta = {}) => {
        if (!_cid) return;
        const t = typeof text === 'string' ? text.trim() : '';
        if (type === 'text' && !t) return;

        const me = Auth.user()?.uid;
        if (!me) return;

        const inp = document.getElementById('msg-input');
        if (inp && type === 'text') { inp.value = ''; inp.style.height = 'auto'; }
        UI.updateSend();
        setTyping(false);

        // Добавляем reply если есть
        if (_replyTo) {
            meta.replyTo = _replyTo.id;
            meta.replyText = _replyTo.text;
            meta.replyName = _replyTo.senderName;
        }
        clearReply();

        try {
            const docRef = await db.collection('chats').doc(_cid).collection('messages').add({
                senderId: me,
                text: type === 'text' ? t : text,
                type,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'sent',
                reactions: {},
                ...meta
            });

            // Запоминаем ID чтобы не дублировать в onSnapshot
            _sentIds.add(docRef.id);

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
        }
    };

    // ==================== SEND FILE ====================
    const sendFile = async file => {
        if (!_cid || !file) return;
        const sizeMB = file.size / 1024 / 1024;
        if (sizeMB > 40) { UI.toast(`⚠ Макс 40МБ. Ваш: ${sizeMB.toFixed(1)}МБ`); return; }

        const isImg = file.type.startsWith('image/');
        const isVid = file.type.startsWith('video/');
        const isAud = file.type.startsWith('audio/');

        UI.toast(`📤 ${file.name}...`);

        try {
            const result = await Storage.upload(file, pct => {
                if (pct > 0 && pct < 100) UI.toast(`📤 ${pct}%`);
            });

            let msgType = 'file', msgText = `📎 ${file.name}`;
            if (isImg) { msgType = 'image'; msgText = '📷 Фото'; }
            else if (isVid) { msgType = 'video'; msgText = '🎬 Видео'; }
            else if (isAud) { msgType = 'voice'; msgText = '🎤 Аудио'; }

            await send(msgText, msgType, {
                fileURL: result.url, fileName: file.name,
                fileSize: file.size, fileType: file.type,
                isBase64: result.isBase64 || false
            });
            UI.toast('✅ Отправлено');
        } catch (e) {
            console.error('sendFile:', e);
            UI.toast('❌ ' + e.message);
        }
    };

    // ==================== REACTIONS ====================
    const addReaction = async (msgId, emoji) => {
        if (!_cid || !msgId) return;
        const me = Auth.user()?.uid;
        if (!me) return;

        const ref = db.collection('chats').doc(_cid).collection('messages').doc(msgId);
        const doc = await ref.get();
        if (!doc.exists) return;

        const reactions = doc.data().reactions || {};
        const key = emoji;

        if (!reactions[key]) reactions[key] = [];

        const idx = reactions[key].indexOf(me);
        if (idx >= 0) {
            reactions[key].splice(idx, 1);
            if (reactions[key].length === 0) delete reactions[key];
        } else {
            reactions[key].push(me);
        }

        await ref.update({ reactions });
    };

    const _showReactionPicker = (msgEl, msgId) => {
        // Убираем старый picker
        document.querySelectorAll('.reaction-picker').forEach(p => p.remove());

        const picker = document.createElement('div');
        picker.className = 'reaction-picker';
        QUICK_REACTIONS.forEach(emoji => {
            const btn = document.createElement('button');
            btn.textContent = emoji;
            btn.onclick = e => {
                e.stopPropagation();
                addReaction(msgId, emoji);
                picker.remove();
            };
            picker.appendChild(btn);
        });

        const bub = msgEl.querySelector('.msg-bub');
        if (bub) {
            bub.style.position = 'relative';
            bub.appendChild(picker);
        }

        // Закрыть при клике вне
        setTimeout(() => {
            const close = e => {
                if (!picker.contains(e.target)) { picker.remove(); document.removeEventListener('click', close); }
            };
            document.addEventListener('click', close);
        }, 50);
    };

    // ==================== LISTEN MESSAGES ====================
    const listenMessages = chatId => {
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

                        if (document.querySelector(`[data-mid="${id}"]`)) return;

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
                                Notif.show(_pdata?.name || 'PCHAT', txt);
                            }
                        }
                    }

                    if (change.type === 'modified') {
                        const m = change.doc.data();
                        const id = change.doc.id;

                        // Обновляем статус
                        const statusEl = document.querySelector(`[data-mid="${id}"] .msg-status`);
                        if (statusEl) setStatusEl(statusEl, m.status);

                        // Обновляем реакции
                        _updateReactions(id, m.reactions || {});
                    }

                    if (change.type === 'removed') {
                        document.querySelector(`[data-mid="${id}"]`)?.remove();
                    }
                });
                isFirst = false;
            }, err => console.error('Messages:', err));
    };

    const _updateReactions = (msgId, reactions) => {
        const el = document.querySelector(`[data-mid="${msgId}"]`);
        if (!el) return;
        let container = el.querySelector('.msg-reactions');
        if (!container) {
            container = document.createElement('div');
            container.className = 'msg-reactions';
            el.querySelector('.msg-bub')?.appendChild(container);
        }
        const me = Auth.user()?.uid;
        container.innerHTML = '';
        Object.entries(reactions).forEach(([emoji, users]) => {
            if (!users?.length) return;
            const btn = document.createElement('button');
            btn.className = 'msg-reaction' + (users.includes(me) ? ' my' : '');
            btn.innerHTML = `${emoji}<span class="msg-reaction-count">${users.length > 1 ? users.length : ''}</span>`;
            btn.onclick = () => addReaction(msgId, emoji);
            container.appendChild(btn);
        });
    };

    // ==================== MAKE MSG ELEMENT ====================
    const makeMsgEl = (id, m) => {
        const me = Auth.user()?.uid;
        const mine = m.senderId === me;

        const wrap = document.createElement('div');
        wrap.className = `msg ${mine ? 'out' : 'in'}`;
        wrap.dataset.mid = id;

        const time = m.timestamp ? UI.fmtTime(m.timestamp) : UI.fmtTimeNow();
        const statusHtml = mine ? `<span class="msg-status ${statusCls(m.status)}">${statusIcon(m.status)}</span>` : '';
        const footer = `<div class="msg-footer"><span class="msg-time">${time}</span>${statusHtml}</div>`;

        // Reply block
        let replyHtml = '';
        if (m.replyTo && m.replyText) {
            replyHtml = `<div class="msg-reply" data-reply-to="${m.replyTo}">
                <div>
                    <div class="msg-reply-name">${UI.esc(m.replyName || 'User')}</div>
                    <div class="msg-reply-text">${UI.esc(m.replyText)}</div>
                </div>
            </div>`;
        }

        // Reactions
        let reactionsHtml = '';
        if (m.reactions && Object.keys(m.reactions).length > 0) {
            const items = Object.entries(m.reactions)
                .filter(([, users]) => users?.length > 0)
                .map(([emoji, users]) => {
                    const isMy = users.includes(me);
                    return `<button class="msg-reaction${isMy ? ' my' : ''}" data-emoji="${emoji}">${emoji}<span class="msg-reaction-count">${users.length > 1 ? users.length : ''}</span></button>`;
                }).join('');
            if (items) reactionsHtml = `<div class="msg-reactions">${items}</div>`;
        }

        if (m.type === 'voice' && m.fileURL) {
            const bub = document.createElement('div');
            bub.className = 'msg-bub';
            if (replyHtml) bub.insertAdjacentHTML('afterbegin', replyHtml);
            bub.appendChild(Voice.makeVoiceEl(m));
            bub.insertAdjacentHTML('beforeend', footer);
            if (reactionsHtml) bub.insertAdjacentHTML('beforeend', reactionsHtml);
            wrap.appendChild(bub);
            _addInteractions(wrap, id, '🎤 Голосовое', m.senderId);
            return wrap;
        }

        if (m.type === 'image' && m.fileURL) {
            wrap.innerHTML = `<div class="msg-bub img-only">${replyHtml}<img class="msg-img" src="${m.fileURL}" loading="lazy" alt="Фото">${footer}${reactionsHtml}</div>`;
            wrap.querySelector('.msg-img')?.addEventListener('click', () => UI.openLightbox(m.fileURL));
            _addInteractions(wrap, id, '📷 Фото', m.senderId);
            return wrap;
        }

        if (m.type === 'video' && m.fileURL) {
            wrap.innerHTML = `<div class="msg-bub">${replyHtml}<video class="msg-video" src="${m.fileURL}" controls preload="metadata" playsinline></video>${footer}${reactionsHtml}</div>`;
            _addInteractions(wrap, id, '🎬 Видео', m.senderId);
            return wrap;
        }

        if (m.type === 'file' && m.fileURL) {
            wrap.innerHTML = `<div class="msg-bub">${replyHtml}<a class="msg-file" href="${m.fileURL}" target="_blank" rel="noopener" download="${UI.esc(m.fileName || 'file')}"><span class="msg-file-ic">${_fileIcon(m.fileType || '')}</span><div><div class="msg-fn">${UI.esc(m.fileName || 'Файл')}</div><div class="msg-fs">${fmtSize(m.fileSize)}</div></div></a>${footer}${reactionsHtml}</div>`;
            _addInteractions(wrap, id, m.fileName || 'Файл', m.senderId);
            return wrap;
        }

        const txt = m.text || '';
        wrap.innerHTML = `<div class="msg-bub">${replyHtml}<span class="msg-text">${linkify(UI.esc(txt))}</span>${footer}${reactionsHtml}</div>`;
        _addInteractions(wrap, id, txt, m.senderId);

        // Привязываем клики по реакциям
        wrap.querySelectorAll('.msg-reaction').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                addReaction(id, btn.dataset.emoji);
            });
        });

        // Клик по reply — прокрутить к сообщению
        const replyEl = wrap.querySelector('.msg-reply');
        if (replyEl) {
            replyEl.addEventListener('click', () => {
                const target = document.querySelector(`[data-mid="${replyEl.dataset.replyTo}"]`);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    target.style.background = 'rgba(34,211,174,0.15)';
                    setTimeout(() => target.style.background = '', 1500);
                }
            });
        }

        return wrap;
    };

    const _fileIcon = type => {
        if (type.includes('pdf')) return '📄';
        if (type.includes('word') || type.includes('doc')) return '📝';
        if (type.includes('zip') || type.includes('rar')) return '🗜';
        if (type.includes('audio')) return '🎵';
        if (type.includes('video')) return '🎬';
        return '📎';
    };

    // ==================== INTERACTIONS ====================
    const _addInteractions = (wrap, id, txt, senderId) => {
        let longTimer;
        let tapCount = 0;
        let tapTimer;

        // Двойной тап → реакция
        const handleTap = e => {
            tapCount++;
            if (tapCount === 1) {
                tapTimer = setTimeout(() => { tapCount = 0; }, 300);
            } else if (tapCount === 2) {
                clearTimeout(tapTimer);
                tapCount = 0;
                _showReactionPicker(wrap, id);
            }
        };

        // Долгое нажатие → контекст
        wrap.addEventListener('touchstart', e => {
            longTimer = setTimeout(() => {
                UI.haptic('medium');
                UI.showCtx(e.touches[0].clientX, e.touches[0].clientY, { id, text: txt, senderId });
            }, 500);
        }, { passive: true });
        wrap.addEventListener('touchend', e => {
            clearTimeout(longTimer);
            handleTap(e);
        });
        wrap.addEventListener('touchmove', () => clearTimeout(longTimer));

        // ПКМ → контекст
        wrap.addEventListener('contextmenu', e => {
            e.preventDefault();
            UI.showCtx(e.clientX, e.clientY, { id, text: txt, senderId });
        });

        // Двойной клик на ПК → реакция
        wrap.addEventListener('dblclick', e => {
            e.preventDefault();
            _showReactionPicker(wrap, id);
        });

        // Свайп влево → reply (мобилка)
        if ('ontouchstart' in window) {
            _addSwipeReply(wrap, id, txt, senderId);
        }
    };

    // Свайп влево → ответить
    const _addSwipeReply = (wrap, id, txt, senderId) => {
        let startX = 0, currentX = 0, swiping = false;
        const threshold = 60;

        wrap.addEventListener('touchstart', e => {
            startX = e.touches[0].clientX;
            swiping = true;
        }, { passive: true });

        wrap.addEventListener('touchmove', e => {
            if (!swiping) return;
            currentX = e.touches[0].clientX;
            const dx = startX - currentX; // свайп влево = положительный

            if (dx > 10) {
                const offset = Math.min(dx, 80);
                wrap.style.transform = `translateX(-${offset}px)`;
                wrap.classList.add('swiping');

                if (dx > threshold) {
                    UI.haptic('light');
                }
            }
        }, { passive: true });

        wrap.addEventListener('touchend', () => {
            if (!swiping) return;
            swiping = false;
            const dx = startX - currentX;

            wrap.style.transform = '';
            wrap.classList.remove('swiping');

            if (dx > threshold) {
                const senderName = senderId === Auth.user()?.uid
                    ? (Auth.profile()?.name || 'Вы')
                    : (_pdata?.name || 'User');
                setReply(id, txt, senderName);
            }
        });
    };

    const statusCls = s => s === 'read' ? 's3' : s === 'delivered' ? 's2' : 's1';
    const statusIcon = s => (s === 'read' || s === 'delivered') ? '✓✓' : '✓';
    const setStatusEl = (el, s) => { el.className = `msg-status ${statusCls(s)}`; el.textContent = statusIcon(s); };
    const linkify = t => t.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline;word-break:break-all">$1</a>');
    const fmtSize = b => { if (!b) return ''; if (b < 1024) return b + ' B'; if (b < 1048576) return (b / 1024).toFixed(1) + ' KB'; return (b / 1048576).toFixed(1) + ' MB'; };

    const markRead = cid => { const me = Auth.user()?.uid; if (!me || !cid) return; db.collection('chats').doc(cid).update({ [`unread_${me}`]: 0 }).catch(() => {}); };
    const markMsgRead = (cid, mid) => { db.collection('chats').doc(cid).collection('messages').doc(mid).update({ status: 'read' }).catch(() => {}); };
    const setTyping = val => { const me = Auth.user()?.uid; if (!me || !_cid) return; db.collection('chats').doc(_cid).update({ [`typing_${me}`]: val }).catch(() => {}); };
    const handleTyping = () => { if (!_cid) return; if (!_typing) { _typing = true; setTyping(true); } clearTimeout(_typeTo); _typeTo = setTimeout(() => { _typing = false; setTyping(false); }, 2000); };
    const watchTyping = (chatId, peerId) => { db.collection('chats').doc(chatId).onSnapshot(doc => { if (!doc.exists) return; document.getElementById('typing-row')?.classList.toggle('hidden', !doc.data()[`typing_${peerId}`]); }); };
    const watchStatus = peerId => { db.collection('users').doc(peerId).onSnapshot(doc => { if (!doc.exists) return; const d = doc.data(); const se = document.getElementById('chat-peer-status'); const me2 = document.getElementById('chat-peer-meta'); if (!se) return; if (d.online) { se.textContent = 'в сети'; me2?.classList.remove('offline'); } else { se.textContent = d.lastSeen ? `был(а) ${UI.fmtDate(d.lastSeen)}` : 'не в сети'; me2?.classList.add('offline'); } }); };

    const del = async mid => {
        if (!_cid || !mid) return;
        if (mid.startsWith('tmp_')) { document.querySelector(`[data-mid="${mid}"]`)?.remove(); return; }
        const ok = await UI.modal('Удалить?', '<p>Это нельзя отменить</p>', 'Удалить', 'Отмена', true);
        if (!ok) return;
        try { await db.collection('chats').doc(_cid).collection('messages').doc(mid).delete(); UI.toast('Удалено'); }
        catch (e) { UI.toast('❌ Ошибка'); }
    };

    const copy = txt => { navigator.clipboard.writeText(txt).then(() => UI.toast('📋 Скопировано')).catch(() => UI.toast('❌ Не удалось')); };

    const close = () => {
        if (_unsub) { _unsub(); _unsub = null; }
        if (_typing) setTyping(false);
        clearTimeout(_typeTo);
        _replyTo = null;
        _sentIds.clear();
        _hideReplyBar();
        document.getElementById('mob-fab')?.classList.remove('hide');
        const cv = document.getElementById('chat-view');
        if (cv) { cv.removeEventListener('dragover', _onDragOver); cv.removeEventListener('dragleave', _onDragLeave); cv.removeEventListener('drop', _onDrop); cv.classList.remove('drag-over'); }
        _cid = null; _pid = null; _pdata = null; _typing = false;
    };

    return { cid, getPid, open, send, sendFile, del, copy, markRead, close, handleTyping, setReply, clearReply, addReaction };
})();
