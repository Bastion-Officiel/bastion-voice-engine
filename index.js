/**
 * @bastion-hub/voice-engine
 * Moteur de traitement vocal haute fidélité & passerelle WebRTC pour BASTION
 */

class EventEmitter {
    constructor() {
        this._events = {};
    }
    on(event, listener) {
        if (!this._events[event]) this._events[event] = [];
        this._events[event].push(listener);
        return this;
    }
    off(event, listener) {
        if (!this._events[event]) return this;
        this._events[event] = this._events[event].filter(l => l !== listener);
        return this;
    }
    emit(event, ...args) {
        if (!this._events[event]) return false;
        this._events[event].forEach(l => l(...args));
        return true;
    }
}

/**
 * Analyseur fréquentiel FFT basé sur Web Audio API
 */
class FrequencyAnalyzer {
    constructor(audioContext, sourceNode, options = {}) {
        this.ctx = audioContext;
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = options.fftSize || 256;
        this.analyser.smoothingTimeConstant = options.smoothingTimeConstant || 0.8;
        sourceNode.connect(this.analyser);

        this.bufferLength = this.analyser.frequencyBinCount;
        this.dataArray = new Uint8Array(this.bufferLength);
    }

    getAverageVolume() {
        this.analyser.getByteFrequencyData(this.dataArray);
        let sum = 0;
        for (let i = 0; i < this.bufferLength; i++) {
            sum += this.dataArray[i];
        }
        return sum / this.bufferLength;
    }

    getFrequencyData() {
        this.analyser.getByteFrequencyData(this.dataArray);
        return this.dataArray;
    }
}

/**
 * Détecteur d'activité vocale (Voice Activity Detection - VAD)
 */
class VoiceActivityDetector extends EventEmitter {
    constructor(analyzer, options = {}) {
        super();
        this.analyzer = analyzer;
        this.threshold = options.threshold || 18; // Seuil de sensibilité (0-100)
        this.silenceDelay = options.silenceDelay || 250; // Délai avant coupure (ms)
        this.isSpeaking = false;
        this.silenceTimer = null;
        this._interval = null;
    }

    start(pollIntervalMs = 30) {
        if (this._interval) return;
        this._interval = setInterval(() => {
            const vol = this.analyzer.getAverageVolume();
            if (vol >= this.threshold) {
                if (this.silenceTimer) {
                    clearTimeout(this.silenceTimer);
                    this.silenceTimer = null;
                }
                if (!this.isSpeaking) {
                    this.isSpeaking = true;
                    this.emit('speaking', { isSpeaking: true, volume: vol });
                }
            } else {
                if (this.isSpeaking && !this.silenceTimer) {
                    this.silenceTimer = setTimeout(() => {
                        this.isSpeaking = false;
                        this.silenceTimer = null;
                        this.emit('speaking', { isSpeaking: false, volume: 0 });
                    }, this.silenceDelay);
                }
            }
        }, pollIntervalMs);
    }

    stop() {
        if (this._interval) {
            clearInterval(this._interval);
            this._interval = null;
        }
        if (this.silenceTimer) {
            clearTimeout(this.silenceTimer);
            this.silenceTimer = null;
        }
        if (this.isSpeaking) {
            this.isSpeaking = false;
            this.emit('speaking', { isSpeaking: false, volume: 0 });
        }
    }

    setThreshold(newThreshold) {
        this.threshold = Math.max(0, Math.min(100, newThreshold));
    }
}

/**
 * Moteur Vocal Principal BASTION
 */
class VoiceEngine extends EventEmitter {
    constructor(options = {}) {
        super();
        this.options = {
            sampleRate: options.sampleRate || 48000,
            echoCancellation: options.echoCancellation ?? true,
            noiseSuppression: options.noiseSuppression ?? true,
            autoGainControl: options.autoGainControl ?? true,
            vadThreshold: options.vadThreshold || 18,
            ...options
        };

        this.audioContext = null;
        this.localStream = null;
        this.sourceNode = null;
        this.gainNode = null;
        this.analyzer = null;
        this.vad = null;

        this.isMuted = false;
        this.isDeafened = false;
        this.peers = new Map(); // peerId -> { connection, audioEl, gainNode }
    }

    async initMicrophone() {
        const AudioContextClass = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
        if (!AudioContextClass) {
            throw new Error("Web Audio API non supportée dans cet environnement");
        }

        this.audioContext = new AudioContextClass({ sampleRate: this.options.sampleRate });

        this.localStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: this.options.echoCancellation,
                noiseSuppression: this.options.noiseSuppression,
                autoGainControl: this.options.autoGainControl,
                sampleRate: this.options.sampleRate
            },
            video: false
        });

        this.sourceNode = this.audioContext.createMediaStreamSource(this.localStream);
        this.gainNode = this.audioContext.createGain();
        this.sourceNode.connect(this.gainNode);

        this.analyzer = new FrequencyAnalyzer(this.audioContext, this.gainNode);
        this.vad = new VoiceActivityDetector(this.analyzer, { threshold: this.options.vadThreshold });

        this.vad.on('speaking', (state) => {
            if (!this.isMuted) {
                this.emit('voiceStateChange', state);
            }
        });
        this.vad.start();

        return this.localStream;
    }

    setMute(mute) {
        this.isMuted = !!mute;
        if (this.localStream) {
            this.localStream.getAudioTracks().forEach(track => {
                track.enabled = !this.isMuted;
            });
        }
        this.emit('muteChange', this.isMuted);
    }

    setDeafen(deafen) {
        this.isDeafened = !!deafen;
        if (this.isDeafened && !this.isMuted) {
            this.setMute(true);
        }
        this.peers.forEach(({ audioEl }) => {
            if (audioEl) audioEl.muted = this.isDeafened;
        });
        this.emit('deafenChange', this.isDeafened);
    }

    setVolume(volumeMultiplier) {
        if (this.gainNode) {
            this.gainNode.gain.value = Math.max(0, volumeMultiplier);
        }
    }

    destroy() {
        if (this.vad) this.vad.stop();
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
        }
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close();
        }
        this.peers.clear();
    }
}

/**
 * Passerelle de Conférence Stage BASTION
 */
class StageConferenceBridge extends EventEmitter {
    constructor(engine, options = {}) {
        super();
        this.engine = engine;
        this.channelId = options.channelId || null;
        this.role = options.role || 'listener'; // 'speaker', 'listener', 'moderator'
        this.handRaised = false;
        this.speakers = new Map();
        this.listeners = new Map();
    }

    setRole(role) {
        this.role = role;
        if (role === 'listener') {
            this.engine.setMute(true);
        } else if (role === 'speaker') {
            this.engine.setMute(false);
        }
        this.emit('roleChange', { role: this.role });
    }

    toggleRaiseHand() {
        this.handRaised = !this.handRaised;
        this.emit('handRaisedChange', { raised: this.handRaised });
        return this.handRaised;
    }
}

module.exports = {
    VoiceEngine,
    FrequencyAnalyzer,
    VoiceActivityDetector,
    StageConferenceBridge
};

