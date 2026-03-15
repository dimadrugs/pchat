const Auth = (() => {
    let _u = null, _p = null;

    const user = () => _u;
    const profile = () => _p;

    const init = () => new Promise(ok => {
        // Обрабатываем редирект от Google
        auth.getRedirectResult().then(result => {
            if (result?.user) {
                // Успешный редирект — setup уже вызовется через onAuthStateChanged
            }
        }).catch(e => {
            console.warn('Redirect result error:', e);
        });

        auth.onAuthStateChanged(async u => {
            if (u) {
                _u = u;
                await setup(u);
                ok(true);
            } else {
                _u = null; _p = null;
                ok(false);
            }
        });
    });

    const setup = async u => {
        try {
            const doc = await db.collection('users').doc(u.uid).get();
            if (!doc.exists) {
                _p = {
                    name: u.displayName || u.email.split('@')[0],
                    username: '',
                    email: u.email || '',
                    bio: '',
                    online: true,
                    lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                await db.collection('users').doc(u.uid).set(_p);
            } else {
                _p = doc.data();
                await db.collection('users').doc(u.uid).update({
                    online: true,
                    lastSeen: firebase.firestore.FieldValue.serverTimestamp()
                }).catch(() => {});
            }

            // Генерируем ключи (PChatCrypto не конфликтует с window.crypto)
            try {
                const keys = await PChatCrypto.getOrCreateKeyPair(u.uid);
                await db.collection('users').doc(u.uid).update({
                    publicKey: keys.publicKeyB64
                }).catch(() => {});
            } catch (e) {
                console.warn('Key generation failed:', e);
            }

            presence(u.uid);
        } catch (e) {
            console.error('Setup error:', e);
            // Если не удалось загрузить профиль — создаём минимальный
            if (!_p) {
                _p = {
                    name: u.displayName || u.email?.split('@')[0] || 'User',
                    username: '',
                    email: u.email || '',
                    bio: ''
                };
            }
        }
    };

    const presence = uid => {
        const go = v => db.collection('users').doc(uid).update({
            online: v,
            lastSeen: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(() => {});
        window.addEventListener('beforeunload', () => go(false));
        document.addEventListener('visibilitychange', () => go(!document.hidden));
    };

    const needsOnboarding = () => !_p?.username;

    const register = async (email, pw, name, username) => {
        const c = await auth.createUserWithEmailAndPassword(email, pw);
        await c.user.updateProfile({ displayName: name }).catch(() => {});
        _u = c.user;
        _p = {
            name,
            username: username.toLowerCase(),
            email,
            bio: '',
            online: true,
            lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        await db.collection('users').doc(c.user.uid).set(_p);
        await db.collection('usernames').doc(username.toLowerCase()).set({ uid: c.user.uid });

        try {
            const keys = await PChatCrypto.getOrCreateKeyPair(c.user.uid);
            await db.collection('users').doc(c.user.uid).update({ publicKey: keys.publicKeyB64 });
        } catch (e) { console.warn('Keys failed:', e); }

        presence(c.user.uid);
        return c.user;
    };

    const login = async (email, pw) => {
        const c = await auth.signInWithEmailAndPassword(email, pw);
        _u = c.user;
        await setup(c.user);
        return c.user;
    };

    // Используем redirect вместо popup — избегаем COOP ошибки
    const google = async () => {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        await auth.signInWithRedirect(provider);
        // Страница перезагрузится, результат поймаем в init() через getRedirectResult
    };

    const logout = async () => {
        if (_u) {
            await db.collection('users').doc(_u.uid).update({
                online: false,
                lastSeen: firebase.firestore.FieldValue.serverTimestamp()
            }).catch(() => {});
        }
        PChatCrypto.clearCache();
        await auth.signOut();
        _u = null; _p = null;
    };

    const update = async data => {
        if (!_u) return;
        await db.collection('users').doc(_u.uid).update(data);
        Object.assign(_p, data);
    };

    const saveOnboarding = async (name, username) => {
        const un = username.toLowerCase();
        await db.collection('users').doc(_u.uid).update({ name, username: un });
        await db.collection('usernames').doc(un).set({ uid: _u.uid });
        Object.assign(_p, { name, username: un });
    };

    const checkUsername = async un => {
        if (!un || un.length < 3) return false;
        const doc = await db.collection('usernames').doc(un.toLowerCase()).get();
        return !doc.exists;
    };

    const errMsg = e => ({
        'auth/email-already-in-use': 'Email уже используется',
        'auth/invalid-email': 'Неверный email',
        'auth/user-not-found': 'Пользователь не найден',
        'auth/wrong-password': 'Неверный пароль',
        'auth/invalid-credential': 'Неверный email или пароль',
        'auth/weak-password': 'Слишком простой пароль (мин. 6 символов)',
        'auth/too-many-requests': 'Слишком много попыток. Подождите.',
        'auth/network-request-failed': 'Ошибка сети',
        'auth/popup-closed-by-user': 'Окно закрыто',
        'auth/cancelled-popup-request': 'Отменено',
    }[e.code] || e.message || 'Неизвестная ошибка');

    return {
        init, user, profile, needsOnboarding,
        register, login, google, logout,
        update, saveOnboarding, checkUsername, errMsg
    };
})();
