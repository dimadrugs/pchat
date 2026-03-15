const PChatCrypto = (() => {
    const CURVE = 'P-256';
    const IV_LEN = 12;
    const DB_NAME = 'PCHAT_Keys';

    const openDB = () => new Promise((ok, no) => {
        const r = indexedDB.open(DB_NAME, 1);
        r.onupgradeneeded = e => e.target.result.createObjectStore('keys', { keyPath: 'id' });
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

    const getKey = async id => {
        const idb = await openDB();
        return new Promise((ok, no) => {
            const tx = idb.transaction('keys', 'readonly');
            const r = tx.objectStore('keys').get(id);
            r.onsuccess = () => ok(r.result || null);
            r.onerror = e => no(e.target.error);
        });
    };

    const delKey = async id => {
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

    const genKeyPair = () => window.crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: CURVE }, true, ['deriveKey', 'deriveBits']
    );

    const exportPub = async k => ab2b64(await window.crypto.subtle.exportKey('raw', k));
    const importPub = b64 => window.crypto.subtle.importKey(
        'raw', b642ab(b64), { name: 'ECDH', namedCurve: CURVE }, true, []
    );
    const exportPriv = async k => JSON.stringify(await window.crypto.subtle.exportKey('jwk', k));
    const importPriv = s => window.crypto.subtle.importKey(
        'jwk', JSON.parse(s), { name: 'ECDH', namedCurve: CURVE }, true, ['deriveKey', 'deriveBits']
    );

    const getOrCreateKeyPair = async uid => {
        try {
            const stored = await getKey(uid);
            if (stored?.pub && stored?.priv) {
                const publicKey = await importPub(stored.pub);
                const privateKey = await importPriv(stored.priv);
                return { keyPair: { publicKey, privateKey }, publicKeyB64: stored.pub };
            }
        } catch (e) {
            console.warn('PChatCrypto: failed to load keys, regenerating', e);
        }

        const kp = await genKeyPair();
        const pub = await exportPub(kp.publicKey);
        const priv = await exportPriv(kp.privateKey);
        await putKey(uid, { pub, priv, ts: Date.now() });
        return { keyPair: kp, publicKeyB64: pub };
    };

    const clearCache = () => {};

    const regen = async uid => {
        await delKey(uid).catch(() => {});
        return getOrCreateKeyPair(uid);
    };

    return { getOrCreateKeyPair, clearCache, regen, ab2b64, b642ab };
})();
