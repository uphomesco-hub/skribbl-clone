// ===== Sound Effects Manager =====
// Lightweight SFX using WebAudio (no external audio files).

class SoundManager {
    constructor() {
        this.enabled = this.loadEnabled();
        this.ctx = null;
        this.masterGain = null;
        this.lastTickSecond = null;
        this.lastTickState = null;
        this.unlockBound = null;
    }

    loadEnabled() {
        const raw = localStorage.getItem('sound_enabled');
        if (raw === null) return true;
        return raw === 'true';
    }

    saveEnabled() {
        localStorage.setItem('sound_enabled', String(this.enabled));
    }

    setEnabled(enabled) {
        this.enabled = !!enabled;
        this.saveEnabled();
        this.updateToggleUI();
        if (!this.enabled) this.stopTick();
    }

    toggle() {
        this.setEnabled(!this.enabled);
    }

    updateToggleUI() {
        const btn = document.getElementById('sound-toggle-btn');
        if (!btn) return;
        btn.textContent = this.enabled ? '🔊' : '🔇';
        btn.setAttribute('aria-pressed', this.enabled ? 'false' : 'true');
        btn.title = this.enabled ? 'Sound on' : 'Sound off';
    }

    installUnlock() {
        if (this.unlockBound) return;
        this.unlockBound = () => {
            this.ensureContext();
            if (this.ctx && this.ctx.state === 'suspended') {
                this.ctx.resume().catch(() => { });
            }
            // Remove listeners after first unlock attempt.
            window.removeEventListener('pointerdown', this.unlockBound);
            window.removeEventListener('keydown', this.unlockBound);
        };
        window.addEventListener('pointerdown', this.unlockBound, { once: true });
        window.addEventListener('keydown', this.unlockBound, { once: true });
    }

    ensureContext() {
        if (this.ctx) return;
        const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextCtor) return;
        this.ctx = new AudioContextCtor();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.15;
        this.masterGain.connect(this.ctx.destination);
    }

    play(name) {
        if (!this.enabled) return;
        this.ensureContext();
        if (!this.ctx || !this.masterGain) return;

        // Some browsers start suspended until a user gesture; try resume opportunistically.
        if (this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => { });
        }

        switch (name) {
            case 'gameStart':
                this.sequence([
                    { f: 523, d: 70 }, { f: 659, d: 70 }, { f: 784, d: 110 }
                ]);
                break;
            case 'wordSelect':
                this.sequence([
                    { f: 740, d: 60 }, { f: 880, d: 90 }
                ]);
                break;
            case 'drawingStart':
                this.sequence([{ f: 440, d: 60 }, { f: 587, d: 80 }]);
                break;
            case 'roundEnd':
                this.sequence([{ f: 392, d: 90 }, { f: 330, d: 90 }]);
                break;
            case 'gameEnd':
                this.sequence([{ f: 392, d: 120 }, { f: 294, d: 140 }, { f: 247, d: 180 }]);
                break;
            case 'correct':
                this.sequence([{ f: 659, d: 80 }, { f: 784, d: 80 }, { f: 988, d: 120 }]);
                break;
            case 'close':
                this.sequence([{ f: 600, d: 55 }, { f: 600, d: 55 }]);
                break;
            case 'playerJoin':
                this.sequence([{ f: 523, d: 60 }, { f: 659, d: 70 }]);
                break;
            case 'playerLeave':
                this.sequence([{ f: 330, d: 80 }, { f: 262, d: 110 }]);
                break;
            case 'kick':
                this.sequence([{ f: 196, d: 80 }, { f: 196, d: 80 }, { f: 196, d: 120 }]);
                break;
            default:
                break;
        }
    }

    handleTimerTick(time, state) {
        if (!this.enabled) return;
        if (state !== 'drawing') {
            this.stopTick();
            return;
        }

        if (typeof time !== 'number') return;
        if (time > 10 || time < 0) {
            this.stopTick();
            return;
        }

        // De-duplicate ticks if UI receives multiple updates.
        if (this.lastTickState === state && this.lastTickSecond === time) return;
        this.lastTickState = state;
        this.lastTickSecond = time;

        // Higher pitch near the end.
        const freq = time <= 3 ? 1100 : 880;
        this.beep(freq, 55);
    }

    stopTick() {
        this.lastTickSecond = null;
        this.lastTickState = null;
    }

    sequence(steps) {
        let offset = 0;
        steps.forEach((s) => {
            this.beep(s.f, s.d, offset);
            offset += (s.d + 35);
        });
    }

    beep(freq, durationMs, delayMs = 0) {
        if (!this.ctx || !this.masterGain) return;
        const now = this.ctx.currentTime + (delayMs / 1000);

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.value = freq;

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.9, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + (durationMs / 1000));

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + (durationMs / 1000) + 0.02);
    }
}

export default SoundManager;

