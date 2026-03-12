/* ================================================
   PCHAT — Contacts Module
   ================================================ */
const Contacts = (() => {
    let _to;

    const init = () => {
        document.getElementById('contacts-search').addEventListener('input', e => {
            clearTimeout(_to);
            _to = setTimeout(() => search(e.target.value.trim()), 300);
        });
    };

    const search = async q => {
        const list = document.getElementById('contacts-list');
        const empty = document.getElementById('empty-contacts');
        if (!q || q.length < 3) { list.innerHTML = ''; list.appendChild(empty); empty.classList.remove('hidden'); return }
        try {
            const snap = await db.collection('users')
                .where('email', '>=', q.toLowerCase())
                .where('email', '<=', q.toLowerCase() + '\uf8ff')
                .limit(20).get();
            list.innerHTML = '';
            if (snap.empty) {
                list.innerHTML = '<div class="empty-view"><div class="empty-img">🤷</div><h3>Не найдено</h3><p>Попробуйте другой email</p></div>';
                return;
            }
            snap.forEach(doc => {
                if (doc.id === Auth.user().uid) return;
                const d = doc.data();
                const el = document.createElement('div');
                el.className = 'contact-row';
                const ini = (d.name || d.email || 'U')[0].toUpperCase();
                el.innerHTML = `
                    <div class="peer-avatar" style="background:${UI.avatarBg(d.name || d.email)}">${ini}</div>
                    <div class="contact-row-info">
                        <div class="contact-row-name">${UI.esc(d.name || 'User')}</div>
                        <div class="contact-row-email">${UI.esc(d.email)}</div>
                    </div>`;
                el.onclick = () => startChat(doc.id, d);
                list.appendChild(el);
            });
        } catch (e) { UI.toast('Ошибка поиска') }
    };

    const startChat = async (uid, data) => {
        const me = Auth.user().uid;
        const chatId = [me, uid].sort().join('_');
        const doc = await db.collection('chats').doc(chatId).get();
        if (!doc.exists) {
            await db.collection('chats').doc(chatId).set({
                participants: [me, uid],
                names: { [me]: Auth.profile().name, [uid]: data.name || 'User' },
                emails: { [me]: Auth.profile().email, [uid]: data.email },
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastMessage: null,
                lastMessageTime: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        Chat.open(chatId, uid, data);
        UI.show('chat-screen');
    };

    return { init, startChat };
})();