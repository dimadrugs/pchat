const Chat = (() => {
    let _cid = null;
    let _pid = null;
    let _pdata = null;
    let _unsub = null;
    let _typeTo = null;
    let _typing = false;
    let _replyTo = null;

    const cid = () => _cid;
    const getPid = () => _pid;

    const QUICK_REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🔥', '👏', '🎉'];

    const getQuickEmoji = () => localStorage.getItem('pchat-quick-emoji') || '❤️';
    const setQuickEmoji = emoji => localStorage.setItem('pchat-quick-emoji', emoji);

    const open = async (chatId, peerId, peerData) => {
        if (_unsub) { _unsub(); _unsub = null; }
        _cid = chatId; _pid = peerId; _pdata = peerData;
        _replyTo = null;
        _hideReplyBar();

        document.getElementById('mob-fab')?.classList.add('hide');

        const name = peerData._displayName || peerData.name || 'User';
        const ini = name[0].toUpperCase();
        const bg = UI.avatarBg(name);

        const avatarEl = document.getElementById('chat-peer-avatar');
        const nameEl = document.getElementById('chat-peer-name');
        const statusEl = document.getElementById('chat-peer-status');
        const metaEl = document.getElementById('chat-peer-meta');

        if (avatarEl) {
            if (peerData.avatarURL) {
                avatarEl.innerHTML = `<img src="${peerData.avatarURL}" alt="">`;
            } else {
                avatarEl.textContent = ini;
                avatarEl.style.background = bg;
            }
        }
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

    // DRAG & DROP
    const _onDragOver = e => { e.preventDefault(); document.getElementById('chat-view')?.classList.add('drag-over'); };
    const _onDragLeave = e => { e.preventDefault(); if (!document.getElementById('chat-view')?.contains(e.relatedTarget)) document.getElementById('chat-view')?.classList.remove('drag-over'); };
    const _onDrop = async e => {
        e.preventDefault();
        document.getElementById('chat-view')?.classList.remove('drag-over');
        const files = Array.from(e.dataTransfer?.files || []);
        for (const f of files) await sendFile(f);
    };
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

    // REPLY
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
            const ca = document.querySelector('.composer-area');
            if (ca) ca.insertBefore(bar, ca.firstChild);
        }
        bar.innerHTML = `
            <div class="reply-bar-body">
                <div class="reply-bar-name">${UI.esc(_replyTo.senderName)}</div>
                <div class="reply-bar-text">${UI.esc(_replyTo.text)}</div>
            </div>
            <button class="reply-bar-close" id="reply-close-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>`;
        document.getElementById('reply-close-btn').onclick = clearReply;
        document.getElementById('msg-input')?.focus();
    };
    const _hideReplyBar = () => { document.getElementById('reply-bar')?.remove(); };

    // SEND
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

        if (_replyTo) {
            meta.replyTo = _replyTo.id;
            meta.replyText = _replyTo.text;
            meta.replyName = _replyTo.senderName;
        }
        clearReply();

        try {
            await db.collection('chats').doc(_cid).collection('messages').add({
                senderId: me,
                text: type === 'text' ? t : text,
                type,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'sent',
                reactions: {},
                ...meta
            });

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

    // SEND FILE
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
                fileSize: file.size, fileType: file.type, isBase64: result.isBase64 || false
            });
            UI.toast('✅ Отправлено');
        } catch (e) {
            console.error('sendFile:', e);
            UI.toast('❌ ' + e.message);
        }
    };

    // REACTIONS
    const addReaction = async (msgId, emoji) => {
        if (!_cid || !msgId) return;
        const me = Auth.user()?.uid;
        if (!me) return;
        const myName = Auth.profile()?.name || 'Вы';

        const ref = db.collection('chats').doc(_cid).collection('messages').doc(msgId);
        const doc = await ref.get();
        if (!doc.exists) return;

        const reactions = doc.data().reactions || {};
        if (!reactions[emoji]) reactions[emoji] = {};

        if (reactions[emoji][me]) {
            // Убираем реакцию
            delete reactions[emoji][me];
            if (Object.keys(reactions[emoji]).length === 0) delete reactions[emoji];
        } else {
            // Добавляем
            reactions[emoji][me] = myName;
        }

        await ref.update({ reactions });
    };

    const _showReactionPicker = (msgEl, msgId, quickOnly = false) => {
        document.querySelectorAll('.reaction-picker').forEach(p => p.remove());

        const picker = document.createElement('div');
        picker.className = 'reaction-picker';

        const quickEmoji = getQuickEmoji();
        const emojis = quickOnly ? [quickEmoji] : QUICK_REACTIONS;

        emojis.forEach(emoji => {
            const btn = document.createElement('button');
            btn.textContent = emoji;
            if (emoji === quickEmoji) btn.classList.add('quick-emoji');
            btn.title = emoji === quickEmoji ? 'Быстрая реакция' : emoji;
            btn.onclick = e => {
                e.stopPropagation();
                addReaction(msgId, emoji);
                picker.remove();
                UI.haptic('light');
            };
            picker.appendChild(btn);
        });

        // Позиционируем над сообщением
        const bub = msgEl.querySelector('.msg-bub');
        if (bub) {
            bub.style.position = 'relative';
            bub.appendChild(picker);
        }

        setTimeout(() => {
            const close = e => {
                if (!picker.contains(e.target)) {
                    picker.remove();
                    document.removeEventListener('click', close);
                    document.removeEventListener('touchstart', close);
                }
            };
            document.addEventListener('click', close);
            document.addEventListener('touchstart', close, { passive: true });
        }, 50);
    };

    // LISTEN MESSAGES
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
                        const statusEl = document.querySelector(`[data-mid="${id}"] .msg-status`);
                        if (statusEl) setStatusEl(statusEl, m.status);
                        _updateReactions(id, m.reactions || {});
                    }

                    if (change.type === 'removed') {
                        document.querySelector(`[data-mid="${change.doc.id}"]`)?.remove();
                    }
                });
                isFirst = false;
            }, err => console.error('Messages:', err));
    };

    // Обновляем реакции при изменении
    const _updateReactions = (msgId, reactions) => {
        const el = document.querySelector(`[data-mid="${msgId}"]`);
        if (!el) return;
        let container = el.querySelector('.msg-reactions');
        if (!container) {
            container = document.createElement('div');
            container.className = 'msg-reactions';
            el.querySelector('.msg-bub')?.appendChild(container);
        }
        _renderReactions(container, msgId, reactions);
    };

    const _renderReactions = (container, msgId, reactions) => {
        const me = Auth.user()?.uid;
        container.innerHTML = '';

        Object.entries(reactions).forEach(([emoji, users]) => {
            if (!users || typeof users !== 'object') return;
            const userEntries = Object.entries(users);
            if (!userEntries.length) return;

            const isMy = !!users[me];
            const count = userEntries.length;
            const names = userEntries.map(([, name]) => name).join(', ');

            const btn = document.createElement('button');
            btn.className = 'msg-reaction' + (isMy ? ' my' : '');
            btn.dataset.emoji = emoji;
            btn.innerHTML = `${emoji}<span class="msg-reaction-count">${count}</span>`;
            btn.title = names;

            // Показываем tooltip при наведении
            btn.addEventListener('mouseenter', () => {
                const tooltip = document.createElement('div');
                tooltip.className = 'msg-reaction-tooltip';
                tooltip.textContent = names;
                btn.appendChild(tooltip);
            });
            btn.addEventListener('mouseleave', () => {
                btn.querySelector('.msg-reaction-tooltip')?.remove();
            });

            btn.onclick = e => {
                e.stopPropagation();
                addReaction(msgId, emoji);
                UI.haptic('light');
            };

            container.appendChild(btn);
        });
    };

    // MAKE MSG EL
    const makeMsgEl = (id, m) => {
        const me = Auth.user()?.uid;
        const mine = m.senderId === me;

        const wrap = document.createElement('div');
        wrap.className = `msg ${mine ? 'out' : 'in'}`;
        wrap.dataset.mid = id;

        const time = m.timestamp ? UI.fmtTime(m.timestamp) : UI.fmtTimeNow();
        const statusHtml = mine ? `<span class="msg-status ${statusCls(m.status)}">${statusIcon(m.status)}</span>` : '';
        const footer = `<div class="msg-footer"><span class="msg-time">${time}</span>${statusHtml}</div>`;

        const replyHtml = m.replyTo && m.replyText ? `
            <div class="msg-reply" data-reply-to="${m.replyTo}">
                <div>
                    <div class="msg-reply-name">${UI.esc(m.replyName || 'User')}</div>
                    <div class="msg-reply-text">${UI.esc(m.replyText)}</div>
                </div>
            </div>` : '';

        // Создаём контент
        if (m.type === 'voice' && m.fileURL) {
            const bub = document.createElement('div');
            bub.className = 'msg-bub';
            if (replyHtml) bub.insertAdjacentHTML('afterbegin', replyHtml);
            bub.appendChild(Voice.makeVoiceEl(m));
            bub.insertAdjacentHTML('beforeend', footer);
            wrap.appendChild(bub);
        } else if (m.type === 'image' && m.fileURL) {
            wrap.innerHTML = `<div class="msg-bub img-only">${replyHtml}<img class="msg-img" src="${m.fileURL}" loading="lazy" alt="Фото">${footer}</div>`;
            wrap.querySelector('.msg-img')?.addEventListener('click', () => UI.openLightbox(m.fileURL));
        } else if (m.type === 'video' && m.fileURL) {
            wrap.innerHTML = `<div class="msg-bub">${replyHtml}<video class="msg-video" src="${m.fileURL}" controls preload="metadata" playsinline></video>${footer}</div>`;
        } else if (m.type === 'file' && m.fileURL) {
            wrap.innerHTML = `<div class="msg-bub">${replyHtml}<a class="msg-file" href="${m.fileURL}" target="_blank" rel="noopener" download="${UI.esc(m.fileName || 'file')}"><span class="msg-file-ic">${_fileIcon(m.fileType || '')}</span><div><div class="msg-fn">${UI.esc(m.fileName || 'Файл')}</div><div class="msg-fs">${fmtSize(m.fileSize)}</div></div></a>${footer}</div>`;
        } else {
            wrap.innerHTML = `<div class="msg-bub">${replyHtml}<span class="msg-text">${linkify(UI.esc(m.text || ''))}</span>${footer}</div>`;
        }

        // Реакции
        if (m.reactions && Object.keys(m.reactions).length > 0) {
            const reactContainer = document.createElement('div');
            reactContainer.className = 'msg-reactions';
            _renderReactions(reactContainer, id, m.reactions);
            wrap.querySelector('.msg-bub')?.appendChild(reactContainer);
        }

        // Reply клик
        const replyEl = wrap.querySelector('.msg-reply');
        if (replyEl) {
            replyEl.addEventListener('click', () => {
                const target = document.querySelector(`[data-mid="${replyEl.dataset.replyTo}"]`);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    const bub = target.querySelector('.msg-bub');
                    if (bub) {
                        bub.style.transition = 'background .3s';
                        bub.style.background = 'rgba(34,211,174,0.2)';
                        setTimeout(() => { bub.style.background = ''; }, 1000);
                    }
                }
            });
        }

        _addInteractions(wrap, id, m.text || '', m.senderId);
        return wrap;
    };

    const _addInteractions = (wrap, id, txt, senderId) => {
        // Двойной тап — быстрая реакция (своя из настроек)
        let lastTap = 0;
        let longTimer;
        let swipeStartX = 0;
        let swipeStartY = 0;
        let swiping = false;
        const SWIPE_THRESHOLD = 55;

        // СВАЙП ПО ВСЕЙ СТРОКЕ
        wrap.addEventListener('touchstart', e => {
            swipeStartX = e.touches[0].clientX;
            swipeStartY = e.touches[0].clientY;
            swiping = true;

            longTimer = setTimeout(() => {
                swiping = false;
                UI.haptic('medium');
                _showReactionPicker(wrap, id);
            }, 550);
        }, { passive: true });

        wrap.addEventListener('touchmove', e => {
            if (!swiping) return;
            const dx = swipeStartX - e.touches[0].clientX;
            const dy = Math.abs(swipeStartY - e.touches[0].clientY);

            // Если вертикальный скролл — отменяем свайп
            if (dy > 20) { clearTimeout(longTimer); swiping = false; return; }

            if (dx > 15) {
                clearTimeout(longTimer);
                const offset = Math.min(dx, 80);
                wrap.style.transform = `translateX(-${offset}px)`;
                wrap.style.transition = 'none';
            }
        }, { passive: true });

        wrap.addEventListener('touchend', e => {
            clearTimeout(longTimer);
            if (!swiping) return;

            const dx = swipeStartX - e.changedTouches[0].clientX;
            wrap.style.transform = '';
            wrap.style.transition = 'transform .2s ease';
            setTimeout(() => { wrap.style.transition = ''; }, 200);

            if (dx > SWIPE_THRESHOLD) {
                // Свайп = reply
                swiping = false;
                UI.haptic('light');
                const senderName = senderId === Auth.user()?.uid
                    ? (Auth.profile()?.name || 'Вы')
                    : (_pdata?.name || 'User');
                setReply(id, txt, senderName);
                return;
            }

            // Двойной тап
            swiping = false;
            const now = Date.now();
            if (now - lastTap < 300) {
                lastTap = 0;
                addReaction(id, getQuickEmoji());
                UI.haptic('light');
            } else {
                lastTap = now;
            }
        });

        // ПК: правая кнопка мыши
        wrap.addEventListener('contextmenu', e => {
            e.preventDefault();
            UI.showCtx(e.clientX, e.clientY, { id, text: txt, senderId });
        });

        // ПК: двойной клик = picker
        wrap.addEventListener('dblclick', e => {
            e.preventDefault();
            _showReactionPicker(wrap, id);
        });
    };

    const _fileIcon = type => {
        if (type.includes('pdf')) return '📄';
        if (type.includes('word') || type.includes('doc')) return '📝';
        if (type.includes('zip') || type.includes('rar')) return '🗜';
        if (type.includes('audio')) return '🎵';
        if (type.includes('video')) return '🎬';
        return '📎';
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

    const watchStatus = peerId => {
        db.collection('users').doc(peerId).onSnapshot(doc => {
            if (!doc.exists) return;
            const d = doc.data();
            const se = document.getElementById('chat-peer-status');
            const me2 = document.getElementById('chat-peer-meta');
            if (!se) return;
            if (d.online) { se.textContent = 'в сети'; me2?.classList.remove('offline'); }
            else { se.textContent = d.lastSeen ? `был(а) ${UI.fmtDate(d.lastSeen)}` : 'не в сети'; me2?.classList.add('offline'); }

            // Обновляем аватарку если изменилась
            if (d.avatarURL) {
                const avatarEl = document.getElementById('chat-peer-avatar');
                if (avatarEl && !avatarEl.querySelector('img')) {
                    avatarEl.innerHTML = `<img src="${d.avatarURL}" alt="">`;
                }
            }
        });
    };

    const del = async mid => {
        if (!_cid || !mid) return;
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
        _hideReplyBar();
        document.getElementById('mob-fab')?.classList.remove('hide');
        const cv = document.getElementById('chat-view');
        if (cv) { cv.removeEventListener('dragover', _onDragOver); cv.removeEventListener('dragleave', _onDragLeave); cv.removeEventListener('drop', _onDrop); cv.classList.remove('drag-over'); }
        _cid = null; _pid = null; _pdata = null; _typing = false;
    };

    return { cid, getPid, open, send, sendFile, del, copy, markRead, close, handleTyping, setReply, clearReply, addReaction, getQuickEmoji, setQuickEmoji, QUICK_REACTIONS };
})();
