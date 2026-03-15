const Storage = (() => {

    // Берём из storage-config.js если есть
    const CFG = (typeof STORAGE_CONFIG !== 'undefined') ? STORAGE_CONFIG : null;
    const FUNCTION_URL = CFG?.functionUrl || null; // URL Яндекс Cloud Function
    const MAX_MB = 40;

    // ==================== TELEGRAPH ====================
    // Бесплатно, до 5МБ, без регистрации
    const uploadToTelegraph = async (file, onProgress) => {
        if (onProgress) onProgress(5);

        const formData = new FormData();
        formData.append('file', file, file.name || 'file');

        const resp = await fetch('https://telegra.ph/upload', {
            method: 'POST',
            body: formData
        });

        if (!resp.ok) throw new Error('Telegraph: ошибка ' + resp.status);

        const data = await resp.json();
        if (data.error) throw new Error('Telegraph: ' + data.error);
        if (!Array.isArray(data) || !data[0]?.src) throw new Error('Telegraph: неверный ответ');

        if (onProgress) onProgress(100);
        return 'https://telegra.ph' + data[0].src;
    };

    // ==================== ЯНДЕКС ЧЕРЕЗ CLOUD FUNCTION ====================
    const uploadViaFunction = async (file, onProgress) => {
        if (onProgress) onProgress(5);

        const token = await firebase.auth().currentUser?.getIdToken();
        if (!token) throw new Error('Не авторизован');

        const params = new URLSearchParams({
            name: file.name,
            type: file.type || 'application/octet-stream',
            folder: 'chats'
        });

        const arrayBuffer = await file.arrayBuffer();

        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();

            xhr.upload.addEventListener('progress', e => {
                if (e.lengthComputable && onProgress) {
                    onProgress(Math.round(e.loaded / e.total * 95));
                }
            });

            xhr.addEventListener('load', () => {
                if (xhr.status === 200) {
                    try {
                        const result = JSON.parse(xhr.responseText);
                        if (onProgress) onProgress(100);
                        resolve(result.url);
                    } catch (e) {
                        reject(new Error('Ошибка парсинга ответа'));
                    }
                } else {
                    let msg = `Ошибка: ${xhr.status}`;
                    try { msg = JSON.parse(xhr.responseText).error || msg; } catch(e) {}
                    reject(new Error(msg));
                }
            });

            xhr.addEventListener('error', () => reject(new Error('Сетевая ошибка')));
            xhr.addEventListener('abort', () => reject(new Error('Отменено')));

            xhr.open('POST', `${FUNCTION_URL}?${params}`);
            xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            xhr.send(arrayBuffer);
        });
    };

    // ==================== BASE64 ====================
    const toBase64 = blob => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });

    // ==================== MAIN ====================
    const upload = async (file, onProgress) => {
        if (!file) throw new Error('Нет файла');

        const sizeMB = file.size / 1024 / 1024;
        const isImg = file.type.startsWith('image/');

        if (sizeMB > MAX_MB) {
            throw new Error(`Файл слишком большой: ${sizeMB.toFixed(1)}МБ. Максимум ${MAX_MB}МБ`);
        }

        console.log(`📁 Upload: ${file.name}, ${sizeMB.toFixed(2)}МБ`);

        // < 500КБ → base64 в Firestore
        if (sizeMB < 0.5) {
            if (onProgress) onProgress(30);
            const base64 = await toBase64(file);
            if (onProgress) onProgress(100);
            return { url: base64, fileName: file.name, fileSize: file.size, fileType: file.type, isBase64: true };
        }

        // Cloud Function настроена → через неё (до 40МБ)
        if (FUNCTION_URL) {
            try {
                const url = await uploadViaFunction(file, onProgress);
                return { url, fileName: file.name, fileSize: file.size, fileType: file.type };
            } catch (e) {
                console.warn('Cloud Function failed:', e.message);
                // Fallback на Telegraph если файл до 5МБ
                if (sizeMB <= 5) {
                    UI.toast('⚠ Используем резервное хранилище');
                    const url = await uploadToTelegraph(file, onProgress);
                    return { url, fileName: file.name, fileSize: file.size, fileType: file.type };
                }
                throw e;
            }
        }

        // Cloud Function не настроена → Telegraph до 5МБ
        if (sizeMB <= 5) {
            const url = await uploadToTelegraph(file, onProgress);
            return { url, fileName: file.name, fileSize: file.size, fileType: file.type };
        }

        throw new Error(`Для файлов больше 5МБ настройте Cloud Function. Текущий размер: ${sizeMB.toFixed(1)}МБ`);
    };

    const uploadAudio = (file, onProgress) => upload(file, onProgress);

    return { upload, uploadAudio };
})();
