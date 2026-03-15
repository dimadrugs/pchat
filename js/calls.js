const Calls = (() => {
    let _peer = null;
    let _call = null;
    let _localStream = null;
    let _timerInterval = null;
    let _startTime = null;
    let _muted = false;
    let _camOff = false;
    let _isVideo = false;
    let _callerPid = null;
    let _ringtone = null;
    let _signalUnsub = null;

    const $ = id => document.getElementById(id);

    const init = uid => {
        if (_peer) { _peer.destroy(); _peer = null; }

        _peer = new Peer(uid, {
            debug: 0,
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
                    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }
                ]
            }
        });

        _peer.on('open', id => console.log('📞 PeerJS ready:', id));

        _peer.on('call', incomingCall => {
            const meta = incomingCall.metadata || {};
            _isVideo = !!meta.video;
            _callerPid = meta.callerUid;

            _call = incomingCall;

            showUI(meta.callerName || 'Звонок', (meta.callerName || 'U')[0].toUpperCase(), 'Входящий звонок...');
            $('call-actions')?.classList.add('hidden');
            $('call-incoming')?.classList.remove('hidden');

            startRingtone();
        });

        _peer.on('error', err => {
            console.error('PeerJS:', err.type, err);
            UI.toast('❌ Ошибка звонка: ' + err.type);
            _endCall();
        });

        // Слушаем сигнал завершения/отклонения
        if (_signalUnsub) _signalUnsub();
        _signalUnsub = db.collection('call_signals').doc(uid)
            .onSnapshot(doc => {
                if (!doc.exists) return;
                const d = doc.data();
                const age = Date.now() - (d.ts?.toMillis?.() || 0);
                if (age > 30000) return; // игнорируем старые
                if (d.type === 'end' || d.type === 'reject') {
                    if (_call) {
                        setStatus('Звонок завершён');
                        setTimeout(_endCall, 1500);
                    }
                }
            });
    };

    const callUser = async (peerUid, peerName, isVideo = false) => {
        if (!_peer) { UI.toast('❌ Звонки не инициализированы'); return; }
        if (_call) { UI.toast('⚠ Уже идёт звонок'); return; }

        _isVideo = isVideo;
        _callerPid = peerUid;

        try {
            _localStream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: isVideo ? { width: 1280, height: 720 } : false
            });
        } catch (e) {
            UI.toast('❌ Нет доступа к ' + (isVideo ? 'камере/микрофону' : 'микрофону'));
            return;
        }

        const me = Auth.user();
        const myProfile = Auth.profile();

        const outCall = _peer.call(peerUid, _localStream, {
            metadata: {
                callerUid: me.uid,
                callerName: myProfile?.name || 'User',
                video: isVideo
            }
        });

        _call = outCall;
        showUI(peerName, peerName[0].toUpperCase(), 'Вызов...');

        if (isVideo) {
            const lv = $('call-local-video');
            if (lv) lv.srcObject = _localStream;
        }

        outCall.on('stream', remoteStream => {
            connectStream(remoteStream);
            setStatus('Соединено');
            startTimer();
        });

        outCall.on('close', () => { setStatus('Звонок завершён'); setTimeout(_endCall, 1000); });
        outCall.on('error', e => { console.error(e); _endCall(); });

        // Сигнал звонящему
        await db.collection('call_signals').doc(peerUid).set({
            type: 'incoming',
            callerUid: me.uid,
            callerName: myProfile?.name || 'User',
            video: isVideo,
            ts: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(() => {});
    };

    const accept = async () => {
        if (!_call) return;
        stopRingtone();
        $('call-incoming')?.classList.add('hidden');
        $('call-actions')?.classList.remove('hidden');

        try {
            _localStream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: _isVideo ? { width: 1280, height: 720 } : false
            });
        } catch (e) {
            UI.toast('❌ Нет доступа к ' + (_isVideo ? 'камере/микрофону' : 'микрофону'));
            reject();
            return;
        }

        _call.answer(_localStream);

        _call.on('stream', remoteStream => {
            connectStream(remoteStream);
            setStatus('Соединено');
            startTimer();
        });
        _call.on('close', () => { setStatus('Звонок завершён'); setTimeout(_endCall, 1000); });

        if (_isVideo) {
            const lv = $('call-local-video');
            if (lv) lv.srcObject = _localStream;
        }
    };

    const reject = async () => {
        stopRingtone();
        if (_call) { _call.close(); _call = null; }
        if (_callerPid) {
            await db.collection('call_signals').doc(_callerPid).set({
                type: 'reject', ts: firebase.firestore.FieldValue.serverTimestamp()
            }).catch(() => {});
        }
        hideUI();
    };

    const end = async () => {
        if (_callerPid) {
            await db.collection('call_signals').doc(_callerPid).set({
                type: 'end', ts: firebase.firestore.FieldValue.serverTimestamp()
            }).catch(() => {});
        }
        _endCall();
    };

    const _endCall = () => {
        stopRingtone();
        stopTimer();
        if (_call) { try { _call.close(); } catch (e) {} _call = null; }
        if (_localStream) { _localStream.getTracks().forEach(t => t.stop()); _localStream = null; }
        const rv = $('call-remote-video');
        const lv = $('call-local-video');
        if (rv) rv.srcObject = null;
        if (lv) lv.srcObject = null;
        $('call-videos')?.classList.add('hidden');
        _muted = false; _camOff = false; _isVideo = false;
        hideUI();
    };

    const connectStream = stream => {
        const rv = $('call-remote-video');
        if (rv) rv.srcObject = stream;
        if (_isVideo) {
            $('call-videos')?.classList.remove('hidden');
            $('call-cam-btn')?.classList.remove('hidden');
        }
    };

    const toggleMute = () => {
        if (!_localStream) return;
        _muted = !_muted;
        _localStream.getAudioTracks().forEach(t => t.enabled = !_muted);
        const btn = $('call-mute-btn');
        if (btn) btn.style.opacity = _muted ? '0.4' : '1';
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

    const showUI = (name, avatar, status) => {
        $('call-overlay')?.classList.remove('hidden');
        $('call-name').textContent = name;
        $('call-avatar').textContent = avatar;
        setStatus(status);
        $('call-actions')?.classList.remove('hidden');
        $('call-incoming')?.classList.add('hidden');
        $('call-timer')?.classList.add('hidden');
        $('call-cam-btn')?.classList.add('hidden');
    };

    const hideUI = () => {
        $('call-overlay')?.classList.add('hidden');
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
            if (te) te.textContent = `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
        }, 1000);
    };

    const stopTimer = () => {
        clearInterval(_timerInterval);
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
        if (_ringtone) { try { _ringtone.pause(); } catch (e) {} _ringtone = null; }
    };

    return { init, callUser, accept, reject, end, toggleMute, toggleCam };
})();
