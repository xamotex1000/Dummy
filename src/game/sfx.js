// Named sound effects built from the engine's synth primitives.

export class Sfx {
  constructor(audio) {
    this.a = audio;
  }

  punch() {
    this.a.noise({ dur: 0.1, freq: 700, gain: 0.55 });
    this.a.tone({ freq: 150, freqEnd: 60, dur: 0.12, gain: 0.5 });
  }

  whoosh() {
    if (!this.a.throttle('whoosh', 120)) return;
    this.a.noise({ dur: 0.12, type: 'bandpass', freq: 600, freqEnd: 1800, q: 0.8, gain: 0.12 });
  }

  bat(power = 1) {
    if (!this.a.throttle('bat', 50)) return;
    this.a.noise({ dur: 0.09, type: 'bandpass', freq: 1300, q: 1.4, gain: 0.45 + power * 0.3 });
    this.a.tone({ freq: 240, freqEnd: 80, dur: 0.12, gain: 0.4, type: 'triangle' });
  }

  slash() {
    if (!this.a.throttle('slash', 45)) return;
    this.a.noise({ dur: 0.08, type: 'highpass', freq: 2500, freqEnd: 6000, gain: 0.3 });
  }

  shot() {
    this.a.noise({ dur: 0.14, freq: 4000, freqEnd: 300, gain: 0.75 });
    this.a.tone({ freq: 900, freqEnd: 110, dur: 0.05, gain: 0.15, type: 'square' });
  }

  boom(size = 1) {
    this.a.noise({ dur: 0.55 * size + 0.1, freq: 1000, freqEnd: 70, gain: 0.95 });
    this.a.tone({ freq: 95, freqEnd: 30, dur: 0.45 * size, gain: 0.8 });
  }

  clang() {
    if (!this.a.throttle('clang', 70)) return;
    this.a.tone({ freq: 523, dur: 0.45, gain: 0.12, type: 'square' });
    this.a.tone({ freq: 1307, dur: 0.3, gain: 0.07, type: 'square' });
    this.a.noise({ dur: 0.08, type: 'bandpass', freq: 2600, gain: 0.3 });
  }

  thud(v = 1) {
    if (!this.a.throttle('thud', 55)) return;
    this.a.tone({ freq: 120, freqEnd: 50, dur: 0.1, gain: 0.35 * v });
    this.a.noise({ dur: 0.07, freq: 400, gain: 0.3 * v });
  }

  tick() {
    if (!this.a.throttle('tick', 60)) return;
    this.a.tone({ freq: 1900, dur: 0.03, gain: 0.08, type: 'square' });
  }

  rip() {
    this.a.noise({ dur: 0.28, type: 'bandpass', freq: 2200, freqEnd: 500, q: 2.5, gain: 0.7 });
  }

  pop() {
    this.a.noise({ dur: 0.3, freq: 1400, freqEnd: 200, gain: 0.7 });
    this.a.tone({ freq: 260, freqEnd: 900, dur: 0.12, gain: 0.3, type: 'triangle' });
  }

  burn() {
    if (!this.a.throttle('burn', 90)) return;
    this.a.noise({ dur: 0.12, type: 'bandpass', freq: 700 + Math.random() * 500, q: 0.7, gain: 0.14 });
  }

  select() {
    this.a.tone({ freq: 880, dur: 0.04, gain: 0.08, type: 'square' });
  }

  card() {
    this.a.tone({ freq: 660, dur: 0.07, gain: 0.15, type: 'triangle' });
    this.a.tone({ freq: 990, dur: 0.12, gain: 0.15, type: 'triangle', delay: 0.07 });
  }

  clear() {
    [523, 659, 784, 1047].forEach((f, i) => this.a.tone({ freq: f, dur: 0.16, gain: 0.16, type: 'triangle', delay: i * 0.08 }));
  }

  bonusFail() {
    this.a.tone({ freq: 220, freqEnd: 150, dur: 0.18, gain: 0.14, type: 'square' });
  }

  fail() {
    this.a.tone({ freq: 392, freqEnd: 130, dur: 0.7, gain: 0.2, type: 'sawtooth' });
  }
}
