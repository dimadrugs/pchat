const Auth = (() => {
    let _u = null, _p = null, _kp = null, _pub = null;
    const user = () => _u;
    const profile = () => _p;
    const keyPair = () => _kp;
    const pubKey = () => _pub;

    const init = () => new Promise(ok => {
        auth.onAuthStateChanged(async u => {
            if (u) { _u = u; await setup(u); ok(true) }
            else { _u = _p = _kp = _pub = null; ok(false) }
        });
    });

    const setup = async u => {
        const doc = await db.collection('users').doc(u.uid).get();
        if (!doc.exists) {
            _p = {
                name: u.displayName || u.email.split('@')[0],
                username: '',
                email: u.email,
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
            });
        }
        const keys = await Crypto.getOrCreateKeyPair(u.uid);
        _kp = keys.keyPair; _pub = keys.publicKeyB64;
        await db.collection('users').doc(u.uid).update({ publicKey: _pub });
        presence(u.uid);
    };

    const needsOnboarding = () => !_p?.username;

    const presence = uid => {
        const go = v => db.collection('users').doc(uid).update({ 
            online: v, 
            lastSeen: firebase.firestore.FieldValue.serverTimestamp() 
        }).catch(() => {});
        window.addEventListener('beforeunload', () => go(false));
        document.addEventListener('visibilitychange', () => go(!document.hidden));
    };

    const register = async (email, pw, name, username) => {
        const c = await auth.createUserWithEmailAndPassword(email, pw);
        await c.user.updateProfile({ displayName: name });
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
        const keys = await Crypto.getOrCreateKeyPair(c.user.uid);
        _kp = keys.keyPair; _pub = keys.publicKeyB64;
        await db.collection('users').doc(c.user.uid).update({ publicKey: _pub });
        presence(c.user.uid);
        return c.user;
    };

    const login = async (email, pw) => {
        const c = await auth.signInWithEmailAndPassword(email, pw);
        _u = c.user; await setup(c.user); return c.user;
    };

    const google = async () => {
        const c = await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
        _u = c.user; await setup(c.user); return c.user;
    };

    const logout = async () => {
        if (_u) await db.collection('users').doc(_u.uid).update({ 
            online: false, 
            lastSeen: firebase.firestore.FieldValue.serverTimestamp() 
        });
        Crypto.clearCache();
        await auth.signOut();
        _u = _p = _kp = _pub = null;
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

    const regenKeys = async () => {
        if (!_u) return;
        const keys = await Crypto.regen(_u.uid);
        _kp = keys.keyPair; _pub = keys.publicKeyB64;
        await db.collection('users').doc(_u.uid).update({ publicKey: _pub });
        UI.toast('Ключи обновлены');
    };

    const errMsg = e => ({
        'auth/email-already-in-use': 'Email уже используется',
        'auth/invalid-email': 'Неверный email',
        'auth/user-not-found': 'Пользователь не найден',
        'auth/wrong-password': 'Неверный пароль',
        'auth/weak-password': 'Слишком простой пароль',
        'auth/too-many-requests': 'Слишком много попыток. Подождите.',
        'auth/network-request-failed': 'Ошибка сети',
        'auth/popup-closed-by-user': 'Окно закрыто',
        'auth/invalid-credential': 'Неверный email или пароль',
    }[e.code] || e.message);

    // ЗДЕСЬ БЫЛА ОШИБКА: теперь возвращаем весь объект целиком
    return { 
        init, user, profile, keyPair, pubKey, needsOnboarding, 
        register, login, google, logout, update, saveOnboarding, 
        checkUsername, regenKeys, errMsg 
    };
})();
