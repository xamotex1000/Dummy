// Synthesized sound effects with WebAudio. No audio files: every sound is a
// filtered noise burst or an oscillator with an envelope.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
    this.muted = false;
    this._last = new Map();
  }

  // Browsers only allow audio after a user gesture.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch {
      return;
    }
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    comp.connect(this.ctx.destination);
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(comp);
    const len = this.ctx.sampleRate;
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  get ready() {
    return !!this.ctx && !this.muted && this.ctx.state === 'running';
  }

  // Returns false if `key` played less than `ms` ago.
  throttle(key, ms) {
    const now = performance.now();
    if (now - (this._last.get(key) ?? -1e9) < ms) return false;
    this._last.set(key, now);
    return true;
  }

  _env(gain, t0, attack, dur, peak) {
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + dur);
  }

  noise({ dur = 0.2, gain = 0.4, type = 'lowpass', freq = 1200, freqEnd = null, q = 1, attack = 0.002, delay = 0 } = {}) {
    if (!this.ready) return;
    const c = this.ctx;
    const t0 = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = c.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(freq, t0);
    if (freqEnd) filter.frequency.exponentialRampToValueAtTime(freqEnd, t0 + attack + dur);
    const g = c.createGain();
    this._env(g, t0, attack, dur, gain);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + attack + dur + 0.05);
  }

  tone({ freq = 440, freqEnd = null, dur = 0.2, gain = 0.3, type = 'sine', attack = 0.003, delay = 0 } = {}) {
    if (!this.ready) return;
    const c = this.ctx;
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t0 + attack + dur);
    const g = c.createGain();
    this._env(g, t0, attack, dur, gain);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + attack + dur + 0.05);
  }
}
