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

            // 1. Точное совпадение username
            try {
                const exactSnap = await db.collection('users')
                    .where('username', '==', clean)
                    .limit(1)
                    .get();
                exactSnap.forEach(d => {
                    if (d.id !== me) results.set(d.id, d.data());
                });
            } catch (e) { console.warn('Exact search failed:', e); }

            // 2. Поиск по prefix username
            if (clean.length >= 2) {
                try {
                    const prefixSnap = await db.collection('users')
                        .where('username', '>=', clean)
                        .where('username', '<=', clean + '\uf8ff')
                        .limit(10)
                        .get();
                    prefixSnap.forEach(d => {
                        if (d.id !== me) results.set(d.id, d.data());
                    });
                } catch (e) { console.warn('Prefix search failed:', e); }
            }

            // 3. Поиск по email (если содержит @ и точку)
            if (q.includes('@') && q.includes('.') && !q.startsWith('@')) {
                try {
                    const emailSnap = await db.collection('users')
                        .where('email', '>=', q.toLowerCase())
                        .where('email', '<=', q.toLowerCase() + '\uf8ff')
                        .limit(5)
                        .get();
                    emailSnap.forEach(d => {
                        if (d.id !== me) results.set(d.id, d.data());
                    });
                } catch (e) { console.warn('Email search failed:', e); }
            }

            // 4. Поиск по имени
            if (!q.startsWith('@') && clean.length >= 2) {
                try {
                    const nameSnap = await db.collection('users')
                        .where('name', '>=', q)
                        .where('name', '<=', q + '\uf8ff')
                        .limit(5)
                        .get();
                    nameSnap.forEach(d => {
                        if (d.id !== me) results.set(d.id, d.data());
                    });
                } catch (e) { console.warn('Name search failed:', e); }
            }

            box.innerHTML = '';

            if (results.size === 0) {
                box.innerHTML = '<div class="search-hint"><p>😕 Никого не найдено</p><span>Проверьте юзернейм и попробуйте снова</span></div>';
                return;
            }

            results.forEach((data, uid) => {
                box.appendChild(makeItem(uid, data));
            });

        } catch (e) {
            console.error('Search error:', e);
            box.innerHTML = '<div class="search-hint"><p>❌ Ошибка поиска</p></div>';
        }
    };

    const makeItem = (uid, data) => {
        const el = document.createElement('div');
        el.className = 'search-result-item';
        const ini = (data.name || data.email || 'U')[0].toUpperCase();
        const un = data.username ? `@${data.username}` : data.email || '';
        const bg = UI.avatarBg(data.name || data.email || '');
        el.innerHTML = `
            <div class="sri-avatar" style="background:${bg}">${ini}</div>
            <div class="sri-info">
                <div class="sri-name">${UI.esc(data.name || 'User')}</div>
                <div class="sri-un">${UI.esc(un)}</div>
            </div>
            <div class="sri-arrow">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
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
                await db.collection('chats').doc(chatId).set({
                    participants: [me, uid],
                    names: {
                        [me]: Auth.profile()?.name || 'User',
                        [uid]: data.name || 'User'
                    },
                    usernames: {
                        [me]: Auth.profile()?.username || '',
                        [uid]: data.username || ''
                    },
                    emails: {
                        [me]: Auth.profile()?.email || '',
                        [uid]: data.email || ''
                    },
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastMessage: '',
                    lastMessageTime: firebase.firestore.FieldValue.serverTimestamp(),
                    [`unread_${me}`]: 0,
                    [`unread_${uid}`]: 0
                });
            }
            $('new-chat-modal')?.classList.add('hidden');
            const inp = $('user-search-input');
            if (inp) inp.value = '';
            if (box) box.innerHTML = '';
            Chat.open(chatId, uid, data);
            UI.showChat();
            if (window.innerWidth <= 768) UI.closeSidebar();
        } catch (e) {
            console.error('Start chat error:', e);
            UI.toast('❌ Ошибка: ' + e.message);
        }
    };

    return { init, startChat };
})();
