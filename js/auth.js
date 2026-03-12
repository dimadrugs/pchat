/* ================================================
   PCHAT — Auth Module
   ================================================ */
const Auth = (() => {
    let _user = null, _profile = null, _kp = null, _pub = null;

    const user = () => _user;
    const profile = () => _profile;
    const keyPair = () => _kp;
    const pubKey = () => _pub;

    const init = () => new Promise(ok => {
        auth.onAuthStateChanged(async u => {
            if (u) { _user = u; await setup(u); ok(true) }
            else { _user = _profile = _kp = _pub = null; ok(false) }
        });
    });

    const setup = async u => {
        try {
            const doc = await db.collection('users').doc(u.uid).get();
            if (!doc.exists) {
                _profile = {
                    name: u.displayName || u.email.split('@')[0],
                    email: u.email,
                    bio: '',
                    online: true,
                    lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                await db.collection('users').doc(u.uid).set(_profile);
            } else {
                _profile = doc.data();
                await db.collection('users').doc(u.uid).update({ online: true, lastSeen: firebase.firestore.FieldValue.serverTimestamp() });
            }
            const keys = await Crypto.getOrCreateKeyPair(u.uid);
            _kp = keys.keyPair; _pub = keys.publicKeyB64;
            await db.collection('users').doc(u.uid).update({ publicKey: _pub });
            presence(u.uid);
        } catch (e) { console.error('Auth setup:', e) }
    };

    const presence = uid => {
        const go = online => db.collection('users').doc(uid).update({ online, lastSeen: firebase.firestore.FieldValue.serverTimestamp() }).catch(() => {});
        window.addEventListener('beforeunload', () => go(false));
        document.addEventListener('visibilitychange', () => go(!document.hidden));
    };

    const register = async (email, pw, name) => {
        const c = await auth.createUserWithEmailAndPassword(email, pw);
        await c.user.updateProfile({ displayName: name });
        _user = c.user;
        _profile = { name, email, bio: '', online: true, lastSeen: firebase.firestore.FieldValue.serverTimestamp(), createdAt: firebase.firestore.FieldValue.serverTimestamp() };
        await db.collection('users').doc(c.user.uid).set(_profile);
        const keys = await Crypto.getOrCreateKeyPair(c.user.uid);
        _kp = keys.keyPair; _pub = keys.publicKeyB64;
        await db.collection('users').doc(c.user.uid).update({ publicKey: _pub });
        presence(c.user.uid);
        return c.user;
    };

    const login = async (email, pw) => {
        const c = await auth.signInWithEmailAndPassword(email, pw);
        _user = c.user; await setup(c.user); return c.user;
    };

    const google = async () => {
        const c = await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
        _user = c.user; await setup(c.user); return c.user;
    };

    const logout = async () => {
        if (_user) await db.collection('users').doc(_user.uid).update({ online: false, lastSeen: firebase.firestore.FieldValue.serverTimestamp() }).catch(() => {});
        Crypto.clearCache();
        await auth.signOut();
        _user = _profile = _kp = _pub = null;
    };

    const update = async data => {
        if (!_user) return;
        await db.collection('users').doc(_user.uid).update(data);
        Object.assign(_profile, data);
    };

    const regenKeys = async () => {
        if (!_user) return;
        const keys = await Crypto.regen(_user.uid);
        _kp = keys.keyPair; _pub = keys.publicKeyB64;
        await db.collection('users').doc(_user.uid).update({ publicKey: _pub });
        UI.toast('🔑 Ключи обновлены');
    };

    const errMsg = e => {
        const m = {
            'auth/email-already-in-use': 'Email уже используется',
            'auth/invalid-email': 'Неверный email',
            'auth/user-not-found': 'Пользователь не найден',
            'auth/wrong-password': 'Неверный пароль',
            'auth/weak-password': 'Слишком простой пароль',
            'auth/too-many-requests': 'Слишком много попыток',
            'auth/network-request-failed': 'Ошибка сети',
            'auth/popup-closed-by-user': 'Окно закрыто',
        };
        return m[e.code] || e.message;
    };

    return { init, user, profile, keyPair, pubKey, register, login, google, logout, update, regenKeys, errMsg };
})();