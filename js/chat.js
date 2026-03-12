/* ================================================
   PCHAT — Chat Module (E2E encrypted messaging)
   ================================================ */
const Chat = (() => {
    let _cid = null, _pid = null, _pdata = null;
    let _unsub = null, _typeTo = null, _typing = false;

    const cid = () => _cid;

    /* ---- Open chat ---- */
    const open = async (chatId, peerId, peerData) => {
        _cid = chatId; _pid = peerId; _pdata = peerData;

        const ini = (peerData.name || peerData.email || 'U')[0].toUpperCase();
        document.getElementById('peer-avatar').textContent = ini;
        document.getElementById('peer-avatar').style.background = UI.avatarBg(peerData.name || peerData.email);
        document.getElementById('peer-name').textContent = peerData.name || 'User';
        document.getElementById('messages').innerHTML = '';
        document.getElementById('msg-input').value = '';
        UI.updateSend();

        try { await setupE2E(chatId, peerId) } catch (e) { console.warn('E2E setup fail:', e) }
        listen(chatId);
        watchStatus(peerId);
        watchTyping(chatId, peerId);
        markRead(chatId);
    };

    /* ---- E2E ---- */
    const setupE2E = async (chatId, peerId) => {
        const pdoc = await db.collection('users').doc(peerId).get();
        if (!pdoc.exists || !pdoc.data().publicKey) throw new Error('No peer key');
        await Crypto.getSharedKey(chatId, Auth.keyPair().privateKey, pdoc.data().publicKey);
    };

    /* ---- Send message ---- */
    const send = async (text, type = 'text', meta = {}) => {
        if (!_cid || !text.trim()) return;
        const me = Auth.user().uid;
        try {
            let ct = text, enc = false;
            try {
                const pdoc = await db.collection('users').doc(_pid).get();
                const key = await Crypto.getSharedKey(_cid, Auth.keyPair().privateKey, pdoc.data().publicKey);
                ct = await Crypto.encrypt(text, key);
                enc = true;
            } catch (e) { console.warn('Encrypt fail:', e) }

            await db.collection('chats').doc(_cid).collection('messages').add({
                senderId: me, text: ct, type, encrypted: enc,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'sent', ...meta
            });

            await db.collection('chats').doc(_cid).update({
                lastMessage: enc ? '🔒 Зашифровано' : text.substring(0, 50),
                lastMessageTime: firebase.firestore.FieldValue.serverTimestamp(),
                lastSenderId: me,
                [`unread_${_pid}`]: firebase.firestore.FieldValue.increment(1)
            });

            document.getElementById('msg-input').value = '';
            document.getElementById('msg-input').style.height = 'auto';
            UI.updateSend();
            setTyping(false);
        } catch (e) { console.error('Send:', e); UI.toast('Ошибка отправки') }
    };

    /* ---- Send file ---- */
    const sendFile = async file => {
        if (!_cid || !file) return;
        if (file.size > 10 * 1024 * 1024) { UI.toast('Макс. 10 МБ'); return }
        UI.toast('📤 Загрузка...');
        try {
            const me = Auth.user().uid;
            const path = `chats/${_cid}/${Date.now()}_${file.name}`;
            const ab = await file.arrayBuffer();
            let data = ab, fenc = false;
            try {
                const pdoc = await db.collection('users').doc(_pid).get();
                const key = await Crypto.getSharedKey(_cid, Auth.keyPair().privateKey, pdoc.data().publicKey);
                data = await Crypto.encryptFile(ab, key);
                fenc = true;
            } catch (e) {}
            const ref = storage.ref(path);
            const snap = await ref.put(new Blob([data]));
            const url = await snap.ref.getDownloadURL();
            const isImg = file.type.startsWith('image/');
            await send(isImg ? '📷 Фото' : `📄 ${file.name}`, isImg ? 'image' : 'file', {
                fileURL: url, fileName: file.name, fileSize: file.size, fileType: file.type, fileEncrypted: fenc
            });
            UI.toast('✅ Отправлено');
        } catch (e) { console.error('File:', e); UI.toast('Ошибка загрузки') }
    };

    /* ---- Listen ---- */
    const listen = chatId => {
        if (_unsub) _unsub();
        const el = document.getElementById('messages');
        const scroll = document.getElementById('messages-scroll');
        let lastD = null;

        _unsub = db.collection('chats').doc(chatId).collection('messages')
            .orderBy('timestamp', 'asc')
            .onSnapshot(snap => {
                snap.docChanges().forEach(async ch => {
                    if (ch.type === 'added') {
                        const m = ch.doc.data(), id = ch.doc.id;
                        if (m.timestamp) {
                            const ds = (m.timestamp.toDate ? m.timestamp.toDate() : new Date()).toDateString();
                            if (ds !== lastD) {
                                lastD = ds;
                                const sep = document.createElement('div');
                                sep.className = 'date-sep';
                                sep.innerHTML = `<span>${UI.fmtDateSep(m.timestamp)}</span>`;
                                el.appendChild(sep);
                            }
                        }
                        let txt = m.text;
                        if (m.encrypted) {
                            try {
                                const pdoc = await db.collection('users').doc(_pid).get();
                                const key = await Crypto.getSharedKey(chatId, Auth.keyPair().privateKey, pdoc.data().publicKey);
                                txt = await Crypto.decrypt(m.text, key);
                            } catch { txt = '🔒 Не удалось расшифровать' }
                        }
                        el.appendChild(makeMsgEl(id, m, txt));
                        requestAnimationFrame(() => scroll.scrollTop = scroll.scrollHeight);
                        if (m.senderId !== Auth.user().uid) markMsgRead(chatId, id);
                    }
                    if (ch.type === 'modified') {
                        const se = document.querySelector(`[data-mid="${ch.doc.id}"] .msg-check`);
                        if (se) setCheck(se, ch.doc.data().status);
                    }
                    if (ch.type === 'removed') {
                        document.querySelector(`[data-mid="${ch.doc.id}"]`)?.remove();
                    }
                });
            });
    };

    /* ---- Build message element ---- */
    const makeMsgEl = (id, m, txt) => {
        const me = Auth.user().uid;
        const mine = m.senderId === me;
        const div = document.createElement('div');
        div.className = `msg ${mine ? 'out' : 'in'}`;
        div.dataset.mid = id;

        let html = '';
        if (m.replyTo) {
            html += `<div class="msg-reply"><div class="msg-reply-name">${UI.esc(m.replyToName || '')}</div><div class="msg-reply-text">${UI.esc(m.replyToText || '')}</div></div>`;
        }
        if (m.type === 'image' && m.fileURL) {
            html += `<img class="msg-img" src="${m.fileURL}" alt="img" loading="lazy">`;
        } else if (m.type === 'file' && m.fileURL) {
            html += `<a class="msg-file" href="${m.fileURL}" target="_blank" rel="noopener"><span class="msg-file-icon">📄</span><div><div class="msg-file-name">${UI.esc(m.fileName || 'file')}</div><div class="msg-file-size">${fmtSize(m.fileSize)}</div></div></a>`;
        } else {
            html += `<span class="msg-text">${linkify(UI.esc(txt))}</span>`;
        }

        const time = UI.fmtTime(m.timestamp);
        const lock = m.encrypted ? '<span class="msg-lock">🔒</span>' : '';
        const check = mine ? `<span class="msg-check ${chkClass(m.status)}">${chkIcon(m.status)}</span>` : '';

        div.innerHTML = `<div class="msg-bubble">${html}<div class="msg-meta">${lock}<span class="msg-time">${time}</span>${check}</div></div>`;

        // Long press / right click
        let pt;
        div.addEventListener('touchstart', e => { pt = setTimeout(() => { UI.haptic('medium'); UI.showCtx(e.touches[0].clientX, e.touches[0].clientY, { id, text: txt, senderId: m.senderId }) }, 500) });
        div.addEventListener('touchend', () => clearTimeout(pt));
        div.addEventListener('touchmove', () => clearTimeout(pt));
        div.addEventListener('contextmenu', e => { e.preventDefault(); UI.showCtx(e.clientX, e.clientY, { id, text: txt, senderId: m.senderId }) });

        const img = div.querySelector('.msg-img');
        if (img) img.onclick = () => UI.openLightbox(img.src);

        return div;
    };

    const chkClass = s => s === 'read' ? 'c3' : s === 'delivered' ? 'c2' : 'c1';
    const chkIcon = s => s === 'read' || s === 'delivered' ? '✓✓' : '✓';
    const setCheck = (el, s) => { el.className = `msg-check ${chkClass(s)}`; el.textContent = chkIcon(s) };
    const linkify = s => s.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline">$1</a>');
    const fmtSize = b => b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(1) + ' MB';

    /* ---- Read ---- */
    const markRead = cid => { if (cid) db.collection('chats').doc(cid).update({ [`unread_${Auth.user().uid}`]: 0 }).catch(() => {}) };
    const markMsgRead = (cid, mid) => db.collection('chats').doc(cid).collection('messages').doc(mid).update({ status: 'read' }).catch(() => {});

    /* ---- Typing ---- */
    const setTyping = v => { if (_cid) db.collection('chats').doc(_cid).update({ [`typing_${Auth.user().uid}`]: v }).catch(() => {}) };
    const handleTyping = () => {
        if (!_typing) { _typing = true; setTyping(true) }
        clearTimeout(_typeTo);
        _typeTo = setTimeout(() => { _typing = false; setTyping(false) }, 2000);
    };
    const watchTyping = (cid, pid) => {
        db.collection('chats').doc(cid).onSnapshot(doc => {
            if (doc.exists) document.getElementById('typing-bar').classList.toggle('hidden', !doc.data()[`typing_${pid}`]);
        });
    };

    /* ---- Peer status ---- */
    const watchStatus = pid => {
        db.collection('users').doc(pid).onSnapshot(doc => {
            if (!doc.exists) return;
            const d = doc.data(), el = document.getElementById('peer-status');
            if (d.online) { el.textContent = 'в сети'; el.className = 'peer-status' }
            else { el.textContent = d.lastSeen ? `был(а) ${UI.fmtDate(d.lastSeen)}` : 'не в сети'; el.className = 'peer-status off' }
        });
    };

    /* ---- Delete ---- */
    const del = async mid => {
        if (!_cid) return;
        if (await UI.modal('Удалить сообщение?', '<p>Это действие нельзя отменить</p>', 'Удалить')) {
            try { await db.collection('chats').doc(_cid).collection('messages').doc(mid).delete(); UI.toast('Удалено') }
            catch { UI.toast('Ошибка') }
        }
    };

    const copy = txt => navigator.clipboard.writeText(txt).then(() => UI.toast('Скопировано')).catch(() => UI.toast('Ошибка'));

    const close = () => {
        if (_unsub) { _unsub(); _unsub = null }
        if (_cid) setTyping(false);
        _cid = _pid = _pdata = null;
    };

    return { cid, open, send, sendFile, del, copy, handleTyping, close, markRead };
})();