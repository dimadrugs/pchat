const Calls = (() => {
    let _pc = null;           // RTCPeerConnection
    let _localStream = null;
    let _remoteStream = null;
    let _timerInterval = null;
    let _startTime = null;
    let _muted = false;
    let _camOff = false;
    let _isVideo = false;
    let _remotePid = null;
    let _myUid = null;
    let _ringtone = null;
    let _signalUnsub = null;
    let _callId = null;
    let _isCaller = false;

    const $ = id => document.getElementById(id);

    const ICE_SERVERS = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            {
                urls: [
                    'turn:openrelay.metered.ca:80',
                    'turn:openrelay.metered.ca:443',
                    'turn:openrelay.metered.ca:443?transport=tcp'
                ],
                username: 'openrelayproject',
                credential: 'openrelayproject'
            }
        ]
    };

    const init = uid => {
        _myUid = uid;
        _listenSignals(uid);
        console.log('✅ Calls ready (WebRTC via Firestore)');
    };

    // Слушаем сигналы через Firestore
    const _listenSignals = uid => {
        if (_signalUnsub) _signalUnsub();

        _signalUnsub = db.collection('webrtc_signals').doc(uid)
            .onSnapshot(async doc => {
                if (!doc.exists) return;
                const d = doc.data();
                if (!d || !d.ts) return;

                // Игнорируем старые сигналы (> 60 сек)
                const age = Date.now() - (d.ts.toMillis ? d.ts.toMillis() : Date.now());
                if (age > 60000) return;

                console.log('📡 Signal received:', d.type);

                switch (d.type) {
                    case 'call-offer':
                        await _handleOffer(d);
                        break;
                    case 'call-answer':
                        await _handleAnswer(d);
                        break;
                    case 'ice-candidate':
                        await _handleIce(d);
                        break;
                    case 'call-end':
                    case 'call-reject':
                        _onRemoteEnd(d.type);
                        break;
                }
            });
    };

    // ==================== ЗВОНЯЩИЙ ====================

    const callUser = async (peerUid, peerName, isVideo = false) => {
        if (_pc) { UI.toast('⚠ Уже идёт звонок'); return; }

        _isVideo = isVideo;
        _remotePid = peerUid;
        _isCaller = true;
        _callId = _myUid + '_' + peerUid + '_' + Date.now();

        try {
            _localStream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 48000 },
                video: isVideo ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false
            });
        } catch (e) {
            console.error('getUserMedia error:', e);
            UI.toast('❌ Нет доступа к ' + (isVideo ? 'камере/микрофону' : 'микрофону'));
            return;
        }

        showUI(peerName, peerName[0].toUpperCase(), 'Вызов...');

        if (isVideo) {
            const lv = $('call-local-video');
            if (lv) lv.srcObject = _localStream;
        }

        // Создаём PeerConnection
        _pc = _createPC();

        // Добавляем треки
        _localStream.getTracks().forEach(t => _pc.addTrack(t, _localStream));

        // Создаём offer
        const offer = await _pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: isVideo
        });
        await _pc.setLocalDescription(offer);

        // Отправляем offer через Firestore
        await db.collection('webrtc_signals').doc(peerUid).set({
            type: 'call-offer',
            callId: _callId,
            callerUid: _myUid,
            callerName: Auth.profile()?.name || 'User',
            isVideo: isVideo,
            sdp: offer.sdp,
            ts: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Таймаут если не ответили
        _answerTimeout = setTimeout(() => {
            if (_pc && _pc.connectionState !== 'connected') {
                UI.toast('⏰ Нет ответа');
                end();
            }
        }, 45000);
    };

    // ==================== ПРИНИМАЮЩИЙ ====================

    let _pendingOffer = null;
    let _answerTimeout = null;

    const _handleOffer = async (d) => {
        // Если уже в звонке — отклоняем
        if (_pc) {
            await _sendSignal(d.callerUid, { type: 'call-reject', reason: 'busy' });
            return;
        }

        _remotePid = d.callerUid;
        _isVideo = !!d.isVideo;
        _callId = d.callId;
        _isCaller = false;
        _pendingOffer = d;

        showUI(d.callerName || 'Звонок', (d.callerName || 'U')[0].toUpperCase(), 'Входящий звонок...');
        $('call-actions')?.classList.add('hidden');
        $('call-incoming')?.classList.remove('hidden');

        startRingtone();
    };

    const accept = async () => {
        if (!_pendingOffer) return;
        stopRingtone();
        $('call-incoming')?.classList.add('hidden');
        $('call-actions')?.classList.remove('hidden');

        const d = _pendingOffer;
        _pendingOffer = null;

        try {
            _localStream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true },
                video: _isVideo ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false
            });
        } catch (e) {
            console.error('getUserMedia error:', e);
            UI.toast('❌ Нет доступа к ' + (_isVideo ? 'камере/микрофону' : 'микрофону'));
            reject();
            return;
        }

        if (_isVideo) {
            const lv = $('call-local-video');
            if (lv) lv.srcObject = _localStream;
        }

        _pc = _createPC();
        _localStream.getTracks().forEach(t => _pc.addTrack(t, _localStream));

        // Устанавливаем remote description (offer)
        await _pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: d.sdp }));

        // Создаём answer
        const answer = await _pc.createAnswer();
        await _pc.setLocalDescription(answer);

        // Отправляем answer
        await _sendSignal(_remotePid, {
            type: 'call-answer',
            callId: _callId,
            sdp: answer.sdp
        });
    };

    const _handleAnswer = async (d) => {
        if (!_pc) return;
        clearTimeout(_answerTimeout);

        try {
            await _pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: d.sdp }));
            setStatus('Соединение...');
        } catch (e) {
            console.error('setRemoteDescription error:', e);
        }
    };

    const _handleIce = async (d) => {
        if (!_pc || !d.candidate) return;
        try {
            await _pc.addIceCandidate(new RTCIceCandidate(JSON.parse(d.candidate)));
        } catch (e) {
            // Иногда ICE candidates приходят до setRemoteDescription — это нормально
        }
    };

    const reject = async () => {
        stopRingtone();
        _pendingOffer = null;
        if (_remotePid) {
            await _sendSignal(_remotePid, { type: 'call-reject' });
        }
        _cleanup();
        hideUI();
    };

    const end = async () => {
        clearTimeout(_answerTimeout);
        if (_remotePid) {
            await _sendSignal(_remotePid, { type: 'call-end' }).catch(() => {});
        }
        _cleanup();
        hideUI();
    };

    const _onRemoteEnd = (type) => {
        stopRingtone();
        clearTimeout(_answerTimeout);
        setStatus(type === 'call-reject' ? 'Звонок отклонён' : 'Звонок завершён');
        setTimeout(() => {
            _cleanup();
            hideUI();
        }, 1500);
    };

    // ==================== WebRTC PC ====================

    const _createPC = () => {
        const pc = new RTCPeerConnection(ICE_SERVERS);

        // ICE candidates — отправляем через Firestore
        const iceCandidates = [];
        let iceTimer = null;

        pc.onicecandidate = e => {
            if (e.candidate) {
                // Батчим кандидатов чтобы не спамить Firestore
                iceCandidates.push(JSON.stringify(e.candidate));
                clearTimeout(iceTimer);
                iceTimer = setTimeout(async () => {
                    for (const c of iceCandidates.splice(0)) {
                        await _sendSignal(_remotePid, {
                            type: 'ice-candidate',
                            callId: _callId,
                            candidate: c
                        }).catch(() => {});
                    }
                }, 200);
            }
        };

        pc.ontrack = e => {
            const rv = $('call-remote-video');
            if (rv && e.streams[0]) {
                rv.srcObject = e.streams[0];
            }
        };

        pc.onconnectionstatechange = () => {
            console.log('Connection state:', pc.connectionState);
            switch (pc.connectionState) {
                case 'connected':
                    setStatus('Соединено');
                    startTimer();
                    if (_isVideo) {
                        $('call-videos')?.classList.remove('hidden');
                        $('call-cam-btn')?.classList.remove('hidden');
                    }
                    break;
                case 'disconnected':
                    setStatus('Соединение прервано...');
                    break;
                case 'failed':
                    UI.toast('❌ Соединение не удалось');
                    end();
                    break;
                case 'closed':
                    break;
            }
        };

        pc.onicegatheringstatechange = () => {
            console.log('ICE gathering:', pc.iceGatheringState);
        };

        return pc;
    };

    const _sendSignal = async (toUid, data) => {
        await db.collection('webrtc_signals').doc(toUid).set({
            ...data,
            fromUid: _myUid,
            ts: firebase.firestore.FieldValue.serverTimestamp()
        });
    };

    const _cleanup = () => {
        stopTimer();
        stopRingtone();

        if (_pc) {
            try { _pc.close(); } catch(e) {}
            _pc = null;
        }

        if (_localStream) {
            _localStream.getTracks().forEach(t => t.stop());
            _localStream = null;
        }

        const rv = $('call-remote-video');
        const lv = $('call-local-video');
        if (rv) rv.srcObject = null;
        if (lv) lv.srcObject = null;

        $('call-videos')?.classList.add('hidden');
        $('call-cam-btn')?.classList.add('hidden');

        _muted = false;
        _camOff = false;
        _remotePid = null;
        _callId = null;
        _pendingOffer = null;
        _isCaller = false;
    };

    // ==================== CONTROLS ====================

    const toggleMute = () => {
        if (!_localStream) return;
        _muted = !_muted;
        _localStream.getAudioTracks().forEach(t => t.enabled = !_muted);
        const btn = $('call-mute-btn');
        if (btn) {
            btn.style.opacity = _muted ? '0.4' : '1';
            btn.innerHTML = _muted
                ? `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`
                : `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>`;
        }
        UI.toast(_muted ? '🔇 Микрофон выкл.' : '🎤 Микрофон вкл.');
    };

    const toggleCam = () => {
        if (!_localStream || !_isVideo) return;
        _camOff = !_camOff;
        _localStream.getVideoTracks().forEach(t => t.enabled = !_camOff);
        const btn = $('call-cam-btn');
        if (btn) btn.style.opacity = _camOff ? '0.4' : '1';
        UI.toast(_camOff ? '📵 Камера выкл.' : '📷 Камера вкл.');
    };

    // ==================== UI ====================

    const showUI = (name, avatar, status) => {
        $('call-overlay')?.classList.remove('hidden');
        const el = $('call-name'); if (el) el.textContent = name;
        const av = $('call-avatar'); if (av) av.textContent = avatar;
        setStatus(status);
        $('call-actions')?.classList.remove('hidden');
        $('call-incoming')?.classList.add('hidden');
        $('call-timer')?.classList.add('hidden');
        $('call-cam-btn')?.classList.add('hidden');
        $('call-status')?.classList.remove('hidden');
    };

    const hideUI = () => {
        $('call-overlay')?.classList.add('hidden');
        $('call-videos')?.classList.add('hidden');
    };

    const setStatus = txt => {
        const el = $('call-status');
        if (el) el.textContent = txt;
    };

    const startTimer = () => {
        _startTime = Date.now();
        const te = $('call-timer');
        if (te) te.classList.remove('hidden');
        $('call-status')?.classList.add('hidden');
        _timerInterval = setInterval(() => {
            const s = Math.floor((Date.now() - _startTime) / 1000);
            if (te) te.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
        }, 1000);
    };

    const stopTimer = () => {
        clearInterval(_timerInterval);
        _timerInterval = null;
        $('call-status')?.classList.remove('hidden');
    };

    const startRingtone = () => {
        try {
            _ringtone = new Audio('./notification.mp3');
            _ringtone.loop = true;
            _ringtone.play().catch(() => {});
        } catch (e) {}
    };

    const stopRingtone = () => {
        if (_ringtone) {
            try { _ringtone.pause(); } catch(e) {}
            _ringtone = null;
        }
    };

    return { init, callUser, accept, reject, end, toggleMute, toggleCam };
})();
