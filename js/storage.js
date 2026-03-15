const Storage = (() => {

    // Берём ключи из storage-config.js (не попадает в GitHub)
    const YA_KEY_ID  = (typeof STORAGE_CONFIG !== 'undefined') ? STORAGE_CONFIG.keyId   : null;
    const YA_SECRET  = (typeof STORAGE_CONFIG !== 'undefined') ? STORAGE_CONFIG.secret  : null;
    const YA_BUCKET  = (typeof STORAGE_CONFIG !== 'undefined') ? STORAGE_CONFIG.bucket  : 'pchat-files';
    const YA_ENDPOINT = (typeof STORAGE_CONFIG !== 'undefined') ? STORAGE_CONFIG.endpoint : 'https://storage.yandexcloud.net';
    const YA_REGION  = (typeof STORAGE_CONFIG !== 'undefined') ? STORAGE_CONFIG.region  : 'ru-central1';

    const isConfigured = () => !!YA_KEY_ID && !!YA_SECRET;

    // ==================== CRYPTO HELPERS ====================

    const sha256hex = async data => {
        const buf = (typeof data === 'string')
            ? new TextEncoder().encode(data)
            : (data instanceof Uint8Array ? data : new Uint8Array(data));
        const hash = await window.crypto.subtle.digest('SHA-256', buf);
        return Array.from(new Uint8Array(hash))
            .map(b => b.toString(16).padStart(2, '0')).join('');
    };

    const hmacBytes = async (key, data) => {
        const keyBytes = (key instanceof Uint8Array) ? key : new TextEncoder().encode(key);
        const k = await window.crypto.subtle.importKey(
            'raw', keyBytes,
            { name: 'HMAC', hash: 'SHA-256' },
            false, ['sign']
        );
        const sig = await window.crypto.subtle.sign(
            'HMAC', k, new TextEncoder().encode(data)
        );
        return new Uint8Array(sig);
    };

    const hmacHex = async (key, data) => {
        const bytes = await hmacBytes(key, data);
        return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    };

    const getSigningKey = async dateShort => {
        const kDate    = await hmacBytes('AWS4' + YA_SECRET, dateShort);
        const kRegion  = await hmacBytes(kDate, YA_REGION);
        const kService = await hmacBytes(kRegion, 's3');
        return hmacBytes(kService, 'aws4_request');
    };

    // ==================== ЯНДЕКС S3 UPLOAD ====================

    const uploadToYandex = async (file, onProgress) => {
        if (onProgress) onProgress(5);

        const ext = file.name.split('.').pop().toLowerCase();
        const key = `chats/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const contentType = file.type || 'application/octet-stream';
        const host = `${YA_BUCKET}.storage.yandexcloud.net`;
        const putUrl = `https://${host}/${key}`;

        const now = new Date();
        const date = now.toISOString()
            .replace(/[:\-]/g, '')
            .replace(/\.\d{3}/, '')
            .slice(0, 15) + 'Z';
        const dateShort = date.slice(0, 8);

        const arrayBuffer = await file.arrayBuffer();
        const bodyHash = await sha256hex(new Uint8Array(arrayBuffer));

        const canonicalHeaders =
            `content-type:${contentType}\n` +
            `host:${host}\n` +
            `x-amz-content-sha256:${bodyHash}\n` +
            `x-amz-date:${date}\n`;

        const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';

        const canonicalRequest = [
            'PUT',
            `/${key}`,
            '',
            canonicalHeaders,
            signedHeaders,
            bodyHash
        ].join('\n');

        const credentialScope = `${dateShort}/${YA_REGION}/s3/aws4_request`;
        const stringToSign = [
            'AWS4-HMAC-SHA256',
            date,
            credentialScope,
            await sha256hex(canonicalRequest)
        ].join('\n');

        const signingKey = await getSigningKey(dateShort);
        const signature = await hmacHex(signingKey, stringToSign);

        const authorization =
            `AWS4-HMAC-SHA256 Credential=${YA_KEY_ID}/${credentialScope}, ` +
            `SignedHeaders=${signedHeaders}, Signature=${signature}`;

        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();

            xhr.upload.addEventListener('progress', e => {
                if (e.lengthComputable && onProgress) {
                    onProgress(Math.round(e.loaded / e.total * 95));
                }
            });

            xhr.addEventListener('load', () => {
                if (xhr.status === 200) {
                    const publicUrl = `${YA_ENDPOINT}/${YA_BUCKET}/${key}`;
                    if (onProgress) onProgress(100);
                    resolve(publicUrl);
                } else {
                    console.error('Yandex S3 error:', xhr.status, xhr.responseText);
                    reject(new Error(`Ошибка загрузки: ${xhr.status}`));
                }
            });

            xhr.addEventListener('error', () => reject(new Error('Сетевая ошибка')));
            xhr.addEventListener('abort', () => reject(new Error('Загрузка отменена')));

            xhr.open('PUT', putUrl);
            xhr.setRequestHeader('Content-Type', contentType);
            xhr.setRequestHeader('x-amz-date', date);
            xhr.setRequestHeader('x-amz-content-sha256', bodyHash);
            xhr.setRequestHeader('Authorization', authorization);
            xhr.send(arrayBuffer);
        });
    };

    // ==================== TELEGRAPH ====================

    const uploadToTelegraph = async (file, onProgress) => {
        if (onProgress) onProgress(10);
        const formData = new FormData();
        formData.append('file', file, file.name || 'file');
        const resp = await fetch('https://telegra.ph/upload', {
            method: 'POST',
            body: formData
        });
        if (!resp.ok) throw new Error('Telegraph: ' + resp.status);
        const data = await resp.json();
        if (data.error) throw new Error(data.error);
        if (!Array.isArray(data) || !data[0]?.src) throw new Error('Неверный ответ');
        if (onProgress) onProgress(100);
        return 'https://telegra.ph' + data[0].src;
    };

    // ==================== BASE64 ====================

    const toBase64 = blob => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });

    // ==================== MAIN UPLOAD ====================

    const upload = async (file, onProgress) => {
        if (!file) throw new Error('Нет файла');

        const sizeMB = file.size / 1024 / 1024;
        const isImg = file.type.startsWith('image/');

        console.log(`📁 Upload: ${file.name}, ${sizeMB.toFixed(2)}МБ`);

        // < 500КБ → base64 в Firestore (мгновенно, бесплатно)
        if (sizeMB < 0.5) {
            if (onProgress) onProgress(40);
            const base64 = await toBase64(file);
            if (onProgress) onProgress(100);
            return {
                url: base64,
                fileName: file.name,
                fileSize: file.size,
                fileType: file.type,
                isBase64: true
            };
        }

        // Яндекс настроен → всё через Яндекс
        if (isConfigured()) {
            const url = await uploadToYandex(file, onProgress);
            return {
                url,
                fileName: file.name,
                fileSize: file.size,
                fileType: file.type
            };
        }

        // Яндекс НЕ настроен → Telegraph (до 5МБ)
        if (sizeMB <= 5) {
            const url = await uploadToTelegraph(file, onProgress);
            return {
                url,
                fileName: file.name,
                fileSize: file.size,
                fileType: file.type
            };
        }

        throw new Error(`Файл слишком большой: ${sizeMB.toFixed(1)}МБ. Настройте хранилище.`);
    };

    const uploadAudio = (file, onProgress) => upload(file, onProgress);

    return { upload, uploadAudio };
})();
