const Contacts = (() => {
    let _searchTimeout = null;
    const $ = id => document.getElementById(id);

    const init = () => {
        const inp = $('user-search-input');
        if (!inp) return;
        inp.addEventListener('input', e => {
            clearTimeout(_searchTimeout);
            _searchTimeout = setTimeout(() => search(e.target.value.trim()), 350);
        });
    };

    const search = async q => {
        const box = $('user-search-results');
        if (!box) return;

        if (!q || q.length < 2) {
            box.innerHTML = '<div class="search-hint"><p>Введите @юзернейм или email</p></div>';
            return;
        }

        box.innerHTML = '<div class="search-hint"><p>🔍 Поиск...</p></div>';

        try {
            const results = new Map();
            const me = Auth.user()?.uid;
            if (!me) return;

            const clean = q.startsWith('@') ? q.slice(1).toLowerCase() : q.toLowerCase();

            // Точный поиск по username
            try {
                const snap = await db.collection('users').where('username', '==', clean).limit(5).get();
                snap.forEach(d => { if (d.id !== me) results.set(d.id, d.data()); });
            } catch (e) {}

            // Префиксный поиск
            if (clean.length >= 2) {
                try {
                    const snap = await db.collection('users')
                        .where('username', '>=', clean)
                        .where('username', '<=', clean + '\uf8ff')
                        .limit(5).get();
                    snap.forEach(d => { if (d.id !== me) results.set(d.id, d.data()); });
                } catch (e) {}
            }

            // Поиск по email
            if (q.includes('@') && q.includes('.') && !q.startsWith('@')) {
                try {
                    const snap = await db.collection('users')
                        .where('email', '>=', q.toLowerCase())
                        .where('email', '<=', q.toLowerCase() + '\uf8ff')
                        .limit(5).get();
                    snap.forEach(d => { if (d.id !== me) results.set(d.id, d.data()); });
                } catch (e) {}
            }

            // Поиск по имени
            if (!q.startsWith('@') && clean.length >= 2) {
                try {
                    const snap = await db.collection('users')
                        .where('name', '>=', q)
                        .where('name', '<=', q + '\uf8ff')
                        .limit(5).get();
                    snap.forEach(d => { if (d.id !== me) results.set(d.id, d.data()); });
                } catch (e) {}
            }

            box.innerHTML = '';

            if (results.size === 0) {
                box.innerHTML = '<div class="search-hint"><p>Никого не найдено</p></div>';
                return;
            }

            results.forEach((data, uid) => {
                box.appendChild(makeItem(uid, data));
            });

        } catch (e) {
            console.error('Search error:', e);
            box.innerHTML = '<div class="search-hint"><p>Ошибка поиска</p></div>';
        }
    };

    const makeItem = (uid, data) => {
        const el = document.createElement('div');
        el.className = 'search-result-item';
        const ini = (data.name || data.email || 'U')[0].toUpperCase();
        const un = data.username ? `@${data.username}` : data.email || '';
        const bg = UI.avatarBg(data.name || data.email || '');
        const hasAvatar = !!data.avatarURL;

        el.innerHTML = `
            <div class="sri-avatar" style="${hasAvatar ? '' : 'background:' + bg}">
                ${hasAvatar ? `<img src="${data.avatarURL}" alt="">` : ini}
            </div>
            <div class="sri-info">
                <div class="sri-name">${UI.esc(data.name || 'User')}</div>
                <div class="sri-un">${UI.esc(un)}</div>
            </div>`;

        el.onclick = () => startChat(uid, data);
        return el;
    };

    const startChat = async (uid, data) => {
        const me = Auth.user()?.uid;
        if (!me) return;
        const box = $('user-search-results');
        if (box) box.innerHTML = '<div class="search-hint"><p>⏳ Открытие чата...</p></div>';

        try {
            const chatId = [me, uid].sort().join('_');
            const chatDoc = await db.collection('chats').doc(chatId).get();

            if (!chatDoc.exists) {
                const myProfile = Auth.profile();
                await db.collection('chats').doc(chatId).set({
                    participants: [me, uid],
                    names: {
                        [me]: myProfile?.name || 'User',
                        [uid]: data.name || 'User'
                    },
                    usernames: {
                        [me]: myProfile?.username || '',
                        [uid]: data.username || ''
                    },
                    emails: {
                        [me]: myProfile?.email || '',
                        [uid]: data.email || ''
                    },
                    avatars: {
                        [me]: myProfile?.avatarURL || '',
                        [uid]: data.avatarURL || ''
                    },
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastMessage: '',
                    lastMessageTime: firebase.firestore.FieldValue.serverTimestamp(),
                    [`unread_${me}`]: 0,
                    [`unread_${uid}`]: 0
                });
            }

            $('new-chat-modal')?.classList.add('hidden');
            const inp = $('user-search-input'); if (inp) inp.value = '';
            if (box) box.innerHTML = '';

            Chat.open(chatId, uid, data);
            UI.showChat();

        } catch (e) {
            console.error('Start chat error:', e);
            UI.toast('❌ ' + e.message);
        }
    };

    return { init, startChat };
})();
