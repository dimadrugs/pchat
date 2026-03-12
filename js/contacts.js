const Contacts = (() => {
    let _to;

    const init = () => {
        const inp = document.getElementById('user-search-input');
        inp.addEventListener('input', e => {
            clearTimeout(_to);
            _to = setTimeout(() => search(e.target.value.trim()), 350);
        });
    };

    const search = async q => {
        const box = document.getElementById('user-search-results');
        if (!q || q.length < 2) {
            box.innerHTML = `<div class="search-hint"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg><p>Введите @юзернейм или email</p></div>`;
            return;
        }
        box.innerHTML = `<div class="search-hint"><p>Поиск...</p></div>`;
        try {
            const results = new Map();
            const clean = q.startsWith('@') ? q.slice(1) : q;

            // Search by username
            const unSnap = await db.collection('users')
                .where('username', '>=', clean.toLowerCase())
                .where('username', '<=', clean.toLowerCase() + '\uf8ff')
                .limit(10).get();
            unSnap.forEach(d => { if (d.id !== Auth.user().uid) results.set(d.id, d.data()) });

            // Search by email (only if looks like email)
            if (q.includes('@') && !q.startsWith('@')) {
                const emSnap = await db.collection('users')
                    .where('email', '>=', q.toLowerCase())
                    .where('email', '<=', q.toLowerCase() + '\uf8ff')
                    .limit(5).get();
                emSnap.forEach(d => { if (d.id !== Auth.user().uid) results.set(d.id, d.data()) });
            }

            box.innerHTML = '';
            if (results.size === 0) {
                box.innerHTML = `<div class="search-hint"><p>Пользователь не найден</p></div>`;
                return;
            }
            results.forEach((data, uid) => box.appendChild(makeUserItem(uid, data)));
        } catch (e) {
            console.error(e);
            box.innerHTML = `<div class="search-hint"><p>Ошибка поиска</p></div>`;
        }
    };

    const makeUserItem = (uid, data) => {
        const el = document.createElement('div');
        el.className = 'search-result-item';
        const ini = (data.name || 'U')[0].toUpperCase();
        const un = data.username ? `@${data.username}` : data.email;
        el.innerHTML = `
            <div class="sri-avatar" style="background:${UI.avatarBg(data.name || data.email)}">${ini}</div>
            <div class="sri-info">
                <div class="sri-name">${UI.esc(data.name || 'User')}</div>
                <div class="sri-un">${UI.esc(un)}</div>
            </div>`;
        el.onclick = () => startChat(uid, data);
        return el;
    };

    const startChat = async (uid, data) => {
        const me = Auth.user().uid;
        const chatId = [me, uid].sort().join('_');
        const doc = await db.collection('chats').doc(chatId).get();
        if (!doc.exists) {
            await db.collection('chats').doc(chatId).set({
                participants: [me, uid],
                names: { [me]: Auth.profile().name, [uid]: data.name || 'User' },
                usernames: { [me]: Auth.profile().username || '', [uid]: data.username || '' },
                emails: { [me]: Auth.profile().email, [uid]: data.email },
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastMessage: null,
                lastMessageTime: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        // Close modal
        document.getElementById('new-chat-modal').classList.add('hidden');
        document.getElementById('user-search-input').value = '';
        document.getElementById('user-search-results').innerHTML = '';

        Chat.open(chatId, uid, data);
        // On mobile: slide in
        document.getElementById('chat-view').classList.remove('hidden');
        document.getElementById('chat-view').classList.add('slide-in');
    };

    return { init, startChat };
})();
