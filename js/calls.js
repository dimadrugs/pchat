const Calls = (() => {
    let _peer = null;
    let _call = null;
    let _localStream = null;
    let _timerInterval = null;
    let _startTime = null;
    let _muted = false;
    let _camOff = false;
    let _isVideo = false;
    let _remotePid = null;
    let _ringtone = null;
    let _signalUnsub = null;
    let _myUid = null;

    const $ = id => document.getElementById(id);

    const init = uid => {
        _myUid = uid;
        if (_peer) { try { _peer.destroy(); } catch(e){} _peer = null; }

        // Используем бесплатный PeerJS сервер с retry
        _createPeer(uid);

        // Слушаем входящие сигналы через Firestore (надёжнее чем WebSocket)
        _listenSignals(uid);
    };

    const _createPeer = (uid, attempt = 0) => {
        const servers = [
            // Попытка 1: публичный PeerJS
            { host: '0.peerjs.com', port: 443, path: '/', secure: true, key: 'peerjs' },
            // Попытка 2: peer.com
            { host: 'peerjs.com', port: 443, path: '/', secure: true, key: 'peerjs' },
        ];

        const config = attempt < servers.length ? servers[attempt] : servers[0];

        _peer = new Peer(uid, {
            ...config,
            debug: 0,
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' },
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
            }
        });

        _peer.on('open', id => {
            console.log('✅ PeerJS connected:', id);
        });

        _peer.on('call', incomingCall => {
            const meta = incomingCall.metadata || {};
            _isVideo = !!meta.video;
            _remotePid = meta.callerUid;
            _call = incomingCall;

            showUI(meta.callerName || 'Звонок', (meta.callerName || 'U')[0].toUpperCase(), 'Входящий звонок...');
            $('call-actions')?.classList.add('hidden');
            $('call-incoming')?.classList.remove('hidden');
            startRingtone();
        });

        _peer.on('disconnected', () => {
            console.warn('PeerJS disconnected, reconnecting...');
            setTimeout(() => {
                if (_peer && !_peer.destroyed) {
                    _peer.reconnect();
                }
            }, 3000);
        });

        _peer.on('error', err => {
            console.error('PeerJS error:', err.type);
            if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error') {
                // Пробуем другой сервер
                setTimeout(() => _createPeer(uid, attempt + 1), 2000);
            } else if (err.type === 'peer-unavailable') {
                UI.toast('❌ Пользователь недоступен для звонка');
                _endCall();
            } else {
                UI.toast('❌ Ошибка звонка: ' + err.type);
                _endCall();
            }
        });
    };

    const _listenSignals = uid => {
        if (_signalUnsub) _signalUnsub();
        _signalUnsub = db.collection('call_signals').doc(uid)
            .onSnapshot(doc => {
                if (!doc.exists) return;
                const d = doc.data();
                if (!d.ts) return;
                const age = Date.now() - (d.ts.toMillis?.() || 0);
                if (age > 30000) return; // старые сигналы игнорируем

                if (d.type === 'end' || d.type === 'reject') {
                    if (_call || $('call-overlay') && !$('call-overlay').classList.contains('hidden')) {
                        setStatus(d.type === 'reject' ? 'Звонок отклонён' : 'Звонок завершён');
                        setTimeout(_endCall, 1500);
                    }
                }
            });
    };

    const callUser = async (peerUid, peerName, isVideo = false) => {
        if (!_peer) { UI.toast('❌ Звонки не готовы'); return; }
        if (_call) { UI.toast('⚠ Уже идёт звонок'); return; }

        // Проверяем что peer готов
        if (_peer.disconnected || _peer.destroyed) {
            UI.toast('🔄 Переподключение...');
            _createPeer(_myUid);
            await new Promise(r => setTimeout(r, 2000));
        }

        _isVideo = isVideo;
        _remotePid = peerUid;

        try {
            _localStream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true },
                video: isVideo ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false
            });
        } catch (e) {
            console.error('Media error:', e);
            UI.toast('❌ Нет доступа к ' + (isVideo ? 'камере/микрофону' : 'микрофону'));
            return;
        }

        const me = Auth.user();
        const myProfile = Auth.profile();

        try {
            const outCall = _peer.call(peerUid, _localStream, {
                metadata: {
                    callerUid: me.uid,
                    callerName: myProfile?.name || 'User',
                    video: isVideo
                }
            });

            if (!outCall) {
                UI.toast('❌ Не удалось инициировать звонок');
                _cleanupMedia();
                return;
            }

            _call = outCall;
            showUI(peerName, peerName[0].toUpperCase(), 'Вызов...');
            if (isVideo && _localStream) {
                const lv = $('call-local-video');
                if (lv) lv.srcObject = _localStream;
            }

            outCall.on('stream', remoteStream => {
                connectStream(remoteStream);
                setStatus('Соединено');
                startTimer();
            });

            outCall.on('close', () => {
                setStatus('Звонок завершён');
                setTimeout(_endCall, 1000);
            });

            outCall.on('error', e => {
                console.error('Call error:', e);
                UI.toast('❌ Ошибка соединения');
                _endCall();
            });

            // Сигнал через Firestore
            await db.collection('call_signals').doc(peerUid).set({
                type: 'incoming',
                callerUid: me.uid,
                callerName: myProfile?.name || 'User',
                video: isVideo,
                ts: firebase.firestore.FieldValue.serverTimestamp()
            }).catch(() => {});

        } catch (e) {
            console.error('callUser error:', e);
            UI.toast('❌ Ошибка: ' + e.message);
            _cleanupMedia();
        }
    };

    const accept = async () => {
        if (!_call) return;
        stopRingtone();
        $('call-incoming')?.classList.add('hidden');
        $('call-actions')?.classList.remove('hidden');

        try {
            _localStream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true },
                video: _isVideo ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false
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

        _call.on('close', () => {
            setStatus('Звонок завершён');
            setTimeout(_endCall, 1000);
        });

        if (_isVideo && _localStream) {
            const lv = $('call-local-video');
            if (lv) lv.srcObject = _localStream;
        }
    };

    const reject = async () => {
        stopRingtone();
        if (_call) { try { _call.close(); } catch(e){} _call = null; }
        if (_remotePid) {
            await db.collection('call_signals').doc(_remotePid).set({
                type: 'reject',
                ts: firebase.firestore.FieldValue.serverTimestamp()
            }).catch(() => {});
        }
        hideUI();
    };

    const end = async () => {
        if (_remotePid) {
            await db.collection('call_signals').doc(_remotePid).set({
                type: 'end',
                ts: firebase.firestore.FieldValue.serverTimestamp()
            }).catch(() => {});
        }
        _endCall();
    };

    const _endCall = () => {
        stopRingtone();
        stopTimer();
        if (_call) { try { _call.close(); } catch(e){} _call = null; }
        _cleanupMedia();
        const rv = $('call-remote-video');
        const lv = $('call-local-video');
        if (rv) rv.srcObject = null;
        if (lv) lv.srcObject = null;
        $('call-videos')?.classList.add('hidden');
        $('call-cam-btn')?.classList.add('hidden');
        _muted = false; _camOff = false; _isVideo = false;
        hideUI();
    };

    const _cleanupMedia = () => {
        if (_localStream) {
            _localStream.getTracks().forEach(t => t.stop());
            _localStream = null;
        }
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
        const el = $('call-name'); if (el) el.textContent = name;
        const av = $('call-avatar'); if (av) av.textContent = avatar;
        setStatus(status);
        $('call-actions')?.classList.remove('hidden');
        $('call-incoming')?.classList.add('hidden');
        $('call-timer')?.classList.add('hidden');
        $('call-cam-btn')?.classList.add('hidden');
    };

    const hideUI = () => $('call-overlay')?.classList.add('hidden');

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
        if (_ringtone) { try { _ringtone.pause(); } catch(e){} _ringtone = null; }
    };

    return { init, callUser, accept, reject, end, toggleMute, toggleCam };
})();
