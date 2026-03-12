const Crypto = (() => {
    const CURVE = 'P-256';
    const IV_LEN = 12;
    const DB = 'PCHAT_Keys';

    const openDB = () => new Promise((ok, no) => {
        const r = indexedDB.open(DB, 1);
        r.onupgradeneeded = e => { e.target.result.createObjectStore('keys', { keyPath: 'id' }) };
        r.onsuccess = e => ok(e.target.result);
        r.onerror = e => no(e.target.error);
    });

    const putKey = async (id, data) => {
        const idb = await openDB();
        return new Promise((ok, no) => {
            const tx = idb.transaction('keys', 'readwrite');
            tx.objectStore('keys').put({ id, ...data });
            tx.oncomplete = ok;
            tx.onerror = e => no(e.target.error);
        });
    };

    const getKey = async (id) => {
        const idb = await openDB();
        return new Promise((ok, no) => {
            const tx = idb.transaction('keys', 'readonly');
            const r = tx.objectStore('keys').get(id);
            r.onsuccess = () => ok(r.result || null);
            r.onerror = e => no(e.target.error);
        });
    };

    const delKey = async (id) => {
        const idb = await openDB();
        return new Promise((ok, no) => {
            const tx = idb.transaction('keys', 'readwrite');
            tx.objectStore('keys').delete(id);
            tx.oncomplete = ok;
            tx.onerror = e => no(e.target.error);
        });
    };

    const ab2b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
    const b642ab = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
    const concat = (...bufs) => {
        const t = bufs.reduce((s, b) => s + b.byteLength, 0);
        const r = new Uint8Array(t);
        let o = 0;
        bufs.forEach(b => { r.set(new Uint8Array(b), o); o += b.byteLength });
        return r.buffer;
    };

    const genKeyPair = () => crypto.subtle.generateKey({ name: 'ECDH', namedCurve: CURVE }, true, ['deriveKey', 'deriveBits']);
    const exportPub = async k => ab2b64(await crypto.subtle.exportKey('raw', k));
    const importPub = b64 => crypto.subtle.importKey('raw', b642ab(b64), { name: 'ECDH', namedCurve: CURVE }, true, []);
    const exportPriv = async k => JSON.stringify(await crypto.subtle.exportKey('jwk', k));
    // ВОТ ЗДЕСЬ БЫЛА ОШИБКА ИЗ-ЗА ОБРЕЗКИ:
    const importPriv = s => crypto.subtle.importKey('jwk', JSON.parse(s), { name: 'ECDH', namedCurve: CURVE }, true, ['deriveKey', 'deriveBits']);

    const deriveAES = async (priv, pub, salt) => {
        const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: pub }, priv, 256);
        const mat = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
        return crypto.subtle.deriveKey(
            { name: 'HKDF', hash: 'SHA-256', salt, info: new TextEncoder().encode('PCHAT-E2E-v1') },
            mat,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    };

    const encrypt = async (text, key) => {
        const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
        const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, new TextEncoder().encode(text));
        return ab2b64(concat(iv.buffer, ct));
    };

    const decrypt = async (b64, key) => {
        const buf = new Uint8Array(b642ab(b64));
        const iv = buf.slice(0, IV_LEN);
        const ct = buf.slice(IV_LEN);
        return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, ct));
    };

    const encryptFile = async (ab, key) => {
        const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
        const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, ab);
        return concat(iv.buffer, ct);
    };

    const decryptFile = async (buf, key) => {
        const a = new Uint8Array(buf);
        return crypto.subtle.decrypt({ name: 'AES-GCM', iv: a.slice(0, IV_LEN), tagLength: 128 }, key, a.slice(IV_LEN));
    };

    const fingerprint = async b64 => {
        const h = new Uint8Array(await crypto.subtle.digest('SHA-256', b642ab(b64)));
        return Array.from(h).slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(':').toUpperCase();
    };

    const cache = new Map();

    const getOrCreateKeyPair = async uid => {
        const stored = await getKey(uid);
        if (stored?.pub && stored?.priv) {
            return {
                keyPair: { publicKey: await importPub(stored.pub), privateKey: await importPriv(stored.priv) },
                publicKeyB64: stored.pub
            };
        }
        const kp = await genKeyPair();
        const pub = await exportPub(kp.publicKey);
        const priv = await exportPriv(kp.privateKey);
        await putKey(uid, { pub, priv, ts: Date.now() });
        return { keyPair: kp, publicKeyB64: pub };
    };

    const getSharedKey = async (chatId, myPriv, theirPubB64) => {
        if (cache.has(chatId)) return cache.get(chatId);
        const theirPub = await importPub(theirPubB64);
        const salt = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(chatId + '-pchat-salt'));
        const aes = await deriveAES(myPriv, theirPub, salt);
        cache.set(chatId, aes);
        return aes;
    };

    const clearCache = () => cache.clear();

    const regen = async uid => {
        await delKey(uid);
        cache.clear();
        return getOrCreateKeyPair(uid);
    };

    return { getOrCreateKeyPair, getSharedKey, encrypt, decrypt, encryptFile, decryptFile, fingerprint, clearCache, regen, ab2b64, b642ab };
})();
