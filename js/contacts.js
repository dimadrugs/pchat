const Contacts = (() => {
    let _searchTimeout = null;

    const init = () => {
        const inp = $('user-search-input');
        if (!inp) return;
        inp.addEventListener('input', e => {
            clearTimeout(_searchTimeout);
            _searchTimeout = setTimeout(() => search(e.target.value.trim()), 350);
        });
    };

    const $ = id => document.getElementById(id);

    const search = async q => {
        const box = $('user-search-results');
        if (!box) return;

        if (!q || q.length < 2) {
            box.innerHTML = `
                <div class="search-hint">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" 
                         stroke="currentColor" stroke-width="1.5" opacity="0.3">
                        <circle cx="11" cy="11" r="8"/>
                        <path d="m21 21-4.35-4.35"/>
                    </svg>
                    <p>Введите @юзернейм или email</p>
                </div>`;
            return;
        }

        box.innerHTML = `<div class="search-hint"><p>🔍 Поиск...</p></div>`;

        try {
            const results = new Map();
            const me = Auth.user()?.uid;
            if (!me) return;

            const clean = q.startsWith('@') ? q.slice(1) : q;

            // Поиск по username
            if (clean.length >= 2) {
                const unSnap = await db.collection('users')
                    .where('username', '>=', clean.toLowerCase())
                    .where('username', '<=', clean.toLowerCase() + '\uf8ff')
                    .limit(10)
                    .get();
                unSnap.forEach(d => {
                    if (d.id !== me) results.set(d.id, d.data());
                });
            }

            // Поиск по email
            if (q.includes('@') && !q.startsWith('@') && q.includes('.')) {
                const emSnap = await db.collection('users')
                    .where('email', '>=', q.toLowerCase())
                    .where('email', '<=', q.toLowerCase() + '\uf8ff')
                    .limit(5)
                    .get();
                emSnap.forEach(d => {
                    if (d.id !== me) results.set(d.id, d.data());
                });
            }

            box.innerHTML = '';

            if (results.size === 0) {
                box.innerHTML = `
                    <div class="search-hint">
                        <p>😕 Пользователь не найден</p>
                        <span>Проверьте юзернейм и попробуйте снова</span>
                    </div>`;
                return;
            }

            results.forEach((data, uid) => {
                box.appendChild(makeItem(uid, data));
            });

        } catch (e) {
            console.error('Search error:', e);
            box.innerHTML = `<div class="search-hint"><p>❌ Ошибка поиска</p></div>`;
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
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" 
                     stroke="currentColor" stroke-width="2">
                    <polyline points="9 18 15 12 9 6"/>
                </svg>
            </div>`;

        el.onclick = () => startChat(uid, data);
        return el;
    };

    const startChat = async (uid, data) => {
        const me = Auth.user()?.uid;
        if (!me) return;

        // Показываем загрузку
        const box = $('user-search-results');
        if (box) box.innerHTML = `<div class="search-hint"><p>⏳ Открытие чата...</p></div>`;

        try {
            const chatId = [me, uid].sort().join('_');

            // Проверяем существует ли чат
            const chatDoc = await db.collection('chats').doc(chatId).get();

            if (!chatDoc.exists) {
                // Создаём новый чат
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

            // Закрываем модалку
            const modal = $('new-chat-modal');
            if (modal) modal.classList.add('hidden');

            // Очищаем поиск
            const inp = $('user-search-input');
            if (inp) inp.value = '';
            if (box) box.innerHTML = '';

            // Открываем чат
            Chat.open(chatId, uid, data);
            UI.showChat();

            // На мобиле закрываем сайдбар
            if (window.innerWidth <= 768) {
                UI.closeSidebar();
            }

        } catch (e) {
            console.error('Start chat error:', e);
            UI.toast('❌ Ошибка создания чата: ' + e.message);
            if (box) box.innerHTML = `<div class="search-hint"><p>❌ Ошибка</p></div>`;
        }
    };

    return { init, startChat };
})();
