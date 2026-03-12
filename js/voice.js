const Voice = (() => {
    let _mediaRecorder = null;
    let _chunks = [];
    let _stream = null;
    let _startTime = 0;
    let _timerInterval = null;

    const $ = id => document.getElementById(id);

    const start = async () => {
        try {
            _stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : MediaRecorder.isTypeSupported('audio/mp4')
                    ? 'audio/mp4'
                    : 'audio/webm';

            _mediaRecorder = new MediaRecorder(_stream, { mimeType });
            _chunks = [];

            _mediaRecorder.ondataavailable = e => {
                if (e.data.size > 0) _chunks.push(e.data);
            };

            _mediaRecorder.start();
            _startTime = Date.now();

            $('voice-recorder')?.classList.remove('hidden');
            const el = $('voice-rec-time');
            if (el) el.textContent = '0:00';

            _timerInterval = setInterval(() => {
                const elapsed = Math.floor((Date.now() - _startTime) / 1000);
                const min = Math.floor(elapsed / 60);
                const sec = elapsed % 60;
                const t = $('voice-rec-time');
                if (t) t.textContent = `${min}:${sec.toString().padStart(2, '0')}`;
            }, 200);

            UI.haptic('light');
        } catch (e) {
            console.error('Voice record error:', e);
            UI.toast('Нет доступа к микрофону');
        }
    };

    const stop = () => {
        return new Promise(resolve => {
            if (!_mediaRecorder || _mediaRecorder.state === 'inactive') {
                cleanup();
                resolve(null);
                return;
            }

            const mType = _mediaRecorder.mimeType;
            _mediaRecorder.onstop = () => {
                const blob = new Blob(_chunks, { type: mType });
                const duration = Math.floor((Date.now() - _startTime) / 1000);
                cleanup();
                resolve({ blob, duration, mimeType: mType });
            };

            _mediaRecorder.stop();
        });
    };

    const cancel = () => {
        if (_mediaRecorder && _mediaRecorder.state !== 'inactive') {
            _mediaRecorder.onstop = () => {};
            _mediaRecorder.stop();
        }
        cleanup();
    };

    const cleanup = () => {
        clearInterval(_timerInterval);
        _timerInterval = null;
        if (_stream) {
            _stream.getTracks().forEach(t => t.stop());
            _stream = null;
        }
        _mediaRecorder = null;
        _chunks = [];
        $('voice-recorder')?.classList.add('hidden');
    };

    const isRecording = () => _mediaRecorder && _mediaRecorder.state === 'recording';

    const sendVoice = async () => {
        const result = await stop();
        if (!result || !result.blob || result.duration < 1) {
            UI.toast('Слишком короткое');
            return;
        }

        if (!Chat.cid()) return;

        UI.toast('⏫ Отправка...');

        try {
            const me = Auth.user()?.uid;
            if (!me) return;

            const ext = result.mimeType.includes('mp4') ? 'mp4' : 'webm';
            const path = `chats/${Chat.cid()}/voice_${Date.now()}.${ext}`;
            const ref = storage.ref(path);
            const snap = await ref.put(result.blob);
            const url = await snap.ref.getDownloadURL();

            const waveform = Array.from({ length: 30 }, () => Math.random() * 0.8 + 0.2);

            await Chat.send('🎤 Голосовое', 'voice', {
                fileURL: url,
                voiceDuration: result.duration,
                voiceWaveform: waveform,
                fileType: result.mimeType
            });

            UI.toast('✅ Отправлено');
        } catch (e) {
            console.error('Voice send error:', e);
            UI.toast('❌ Ошибка отправки');
        }
    };

    const makeVoiceEl = (m) => {
        const dur = m.voiceDuration || 0;
        const min = Math.floor(dur / 60);
        const sec = dur % 60;
        const durStr = `${min}:${sec.toString().padStart(2, '0')}`;

        const waveform = m.voiceWaveform || Array.from({ length: 30 }, () => Math.random() * 0.8 + 0.2);

        const waveBarsHtml = waveform.map(v => {
            const h = Math.max(4, Math.round(v * 28));
            return `<div class="voice-wave-bar" style="height:${h}px"></div>`;
        }).join('');

        const container = document.createElement('div');
        container.className = 'msg-voice';
        container.innerHTML = `
            <button class="voice-play-btn" data-url="${m.fileURL || ''}" data-playing="false">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
            </button>
            <div class="voice-wave">${waveBarsHtml}</div>
            <span class="voice-dur">${durStr}</span>
        `;

        const playBtn = container.querySelector('.voice-play-btn');
        let audio = null;

        playBtn.addEventListener('click', () => {
            const url = playBtn.dataset.url;
            if (!url) return;

            const isPlaying = playBtn.dataset.playing === 'true';

            if (isPlaying && audio) {
                audio.pause();
                audio.currentTime = 0;
                playBtn.dataset.playing = 'false';
                playBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>';
                return;
            }

            if (audio) {
                audio.pause();
                audio.currentTime = 0;
            }

            audio = new Audio(url);
            audio.play().catch(() => UI.toast('Не удалось воспроизвести'));
            playBtn.dataset.playing = 'true';
            playBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';

            audio.onended = () => {
                playBtn.dataset.playing = 'false';
                playBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>';
            };
        });

        return container;
    };

    return { start, stop, cancel, sendVoice, isRecording, makeVoiceEl };
})();