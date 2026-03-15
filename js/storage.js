const Storage = (() => {

    const uploadToTelegraph = async (file, onProgress) => {
        if (onProgress) onProgress(10);

        const formData = new FormData();
        formData.append('file', file, file.name || 'file');

        const resp = await fetch('https://telegra.ph/upload', {
            method: 'POST',
            body: formData
        });

        if (!resp.ok) throw new Error('Telegraph error: ' + resp.status);

        const data = await resp.json();
        if (data.error) throw new Error(data.error);
        if (!Array.isArray(data) || !data[0]?.src) throw new Error('Неверный ответ от сервера');

        if (onProgress) onProgress(100);
        return 'https://telegra.ph' + data[0].src;
    };

    const toBase64 = blob => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });

    const upload = async (file, onProgress) => {
        if (!file) throw new Error('Нет файла');

        const sizeMB = file.size / 1024 / 1024;
        const isImg = file.type.startsWith('image/');
        const isVid = file.type.startsWith('video/');
        const isAud = file.type.startsWith('audio/');

        // Изображения до 5МБ — Telegraph
        if (isImg && sizeMB <= 5) {
            const url = await uploadToTelegraph(file, onProgress);
            return { url, fileName: file.name, fileSize: file.size, fileType: file.type };
        }

        // Видео до 5МБ — Telegraph
        if (isVid && sizeMB <= 5) {
            // Telegraph принимает mp4
            const url = await uploadToTelegraph(file, onProgress);
            return { url, fileName: file.name, fileSize: file.size, fileType: file.type };
        }

        // Аудио (голосовые) — base64 если маленькие, Telegraph если большие
        if (isAud) {
            if (sizeMB < 1) {
                if (onProgress) onProgress(50);
                const base64 = await toBase64(file);
                if (onProgress) onProgress(100);
                return { url: base64, fileName: file.name, fileSize: file.size, fileType: file.type, isBase64: true };
            } else if (sizeMB <= 5) {
                const url = await uploadToTelegraph(file, onProgress);
                return { url, fileName: file.name, fileSize: file.size, fileType: file.type };
            }
        }

        // Другие файлы до 5МБ
        if (sizeMB <= 5) {
            const url = await uploadToTelegraph(file, onProgress);
            return { url, fileName: file.name, fileSize: file.size, fileType: file.type };
        }

        // Больше 5МБ — base64 если до 1МБ
        if (sizeMB <= 1) {
            if (onProgress) onProgress(50);
            const base64 = await toBase64(file);
            if (onProgress) onProgress(100);
            return { url: base64, fileName: file.name, fileSize: file.size, fileType: file.type, isBase64: true };
        }

        throw new Error(`Файл слишком большой: ${sizeMB.toFixed(1)}МБ. Максимум: 5МБ`);
    };

    const uploadAudio = (file, onProgress) => upload(file, onProgress);

    return { upload, uploadAudio };
})();
