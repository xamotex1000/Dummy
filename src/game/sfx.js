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

  // The test recorder: stepper-motor chatter while it feeds, then the tear-off.
  printFeed() {
    if (!this.a.throttle('printFeed', 60)) return;
    this.a.tone({ freq: 420, freqEnd: 380, dur: 0.035, gain: 0.05, type: 'square' });
    this.a.noise({ dur: 0.04, type: 'bandpass', freq: 3200, q: 3, gain: 0.08 });
  }

  paperTear() {
    if (!this.a.throttle('paperTear', 50)) return;
    this.a.noise({ dur: 0.18, type: 'highpass', freq: 1800, freqEnd: 5200, gain: 0.28 });
    this.a.noise({ dur: 0.1, type: 'bandpass', freq: 900, q: 1.5, gain: 0.15 });
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

  zap() {
    if (!this.a.throttle('zap', 60)) return;
    this.a.tone({ freq: 1800, freqEnd: 600, dur: 0.12, gain: 0.12, type: 'sawtooth' });
    this.a.noise({ dur: 0.1, type: 'highpass', freq: 3000, gain: 0.25 });
  }

  saw() {
    if (!this.a.throttle('saw', 70)) return;
    this.a.tone({ freq: 110 + Math.random() * 20, dur: 0.09, gain: 0.12, type: 'sawtooth' });
    this.a.noise({ dur: 0.08, type: 'bandpass', freq: 1600, q: 1.5, gain: 0.12 });
  }

  nail() {
    if (!this.a.throttle('nail', 40)) return;
    this.a.noise({ dur: 0.05, type: 'highpass', freq: 2200, gain: 0.4 });
    this.a.tone({ freq: 700, freqEnd: 300, dur: 0.05, gain: 0.12, type: 'square' });
  }

  freeze() {
    this.a.tone({ freq: 1500, freqEnd: 2600, dur: 0.18, gain: 0.08, type: 'sine' });
    this.a.noise({ dur: 0.15, type: 'highpass', freq: 5000, gain: 0.2 });
  }

  freezeBeam() {
    if (!this.a.throttle('freezeBeam', 110)) return;
    this.a.tone({ freq: 900 + Math.random() * 200, dur: 0.12, gain: 0.04, type: 'sine' });
  }

  shatter() {
    this.a.noise({ dur: 0.35, type: 'highpass', freq: 3500, freqEnd: 1500, gain: 0.6 });
    [2100, 2900, 3700].forEach((f, i) => this.a.tone({ freq: f, dur: 0.12, gain: 0.05, type: 'triangle', delay: i * 0.03 }));
  }

  rocket() {
    this.a.noise({ dur: 0.35, freq: 800, freqEnd: 3000, gain: 0.5 });
    this.a.tone({ freq: 160, freqEnd: 90, dur: 0.2, gain: 0.3, type: 'triangle' });
  }

  vortex() {
    this.a.tone({ freq: 60, freqEnd: 180, dur: 1.4, gain: 0.25, type: 'sawtooth' });
    this.a.tone({ freq: 90, freqEnd: 40, dur: 1.4, gain: 0.2, type: 'sine' });
  }

  reaction() {
    if (!this.a.throttle('reaction', 120)) return;
    [392, 494, 587, 784].forEach((f, i) => this.a.tone({ freq: f, dur: 0.14, gain: 0.12, type: 'square', delay: i * 0.035 }));
  }

  entranceOpen(kind) {
    if (kind === 'door') {
      this.a.noise({ dur: 0.1, freq: 500, gain: 0.35 });
      this.a.tone({ freq: 170, freqEnd: 250, dur: 0.35, gain: 0.07, type: 'sawtooth' });
    } else if (kind === 'hatch') {
      this.a.tone({ freq: 330, dur: 0.12, gain: 0.08, type: 'square' });
      this.a.noise({ dur: 0.3, type: 'bandpass', freq: 900, freqEnd: 400, q: 1.2, gain: 0.25 });
    } else {
      this.a.noise({ dur: 0.35, type: 'highpass', freq: 1500, gain: 0.3 });
    }
  }

  entranceClose(kind) {
    if (kind === 'door') {
      this.a.tone({ freq: 90, freqEnd: 45, dur: 0.22, gain: 0.45 });
      this.a.noise({ dur: 0.12, freq: 700, gain: 0.5 });
      this.a.tone({ freq: 420, dur: 0.18, gain: 0.05, type: 'square', delay: 0.02 });
    } else if (kind === 'hatch') {
      this.a.tone({ freq: 620, dur: 0.16, gain: 0.08, type: 'square' });
      this.a.tone({ freq: 930, dur: 0.12, gain: 0.05, type: 'square', delay: 0.04 });
    } else {
      this.a.tone({ freq: 140, freqEnd: 70, dur: 0.12, gain: 0.25 });
      this.a.noise({ dur: 0.08, freq: 900, gain: 0.3 });
    }
  }

  spring() {
    if (!this.a.throttle('spring', 80)) return;
    this.a.tone({ freq: 180, freqEnd: 620, dur: 0.22, gain: 0.25, type: 'triangle' });
    this.a.tone({ freq: 90, freqEnd: 60, dur: 0.1, gain: 0.25 });
  }

  install() {
    this.a.noise({ dur: 0.06, type: 'highpass', freq: 2500, gain: 0.3 });
    this.a.tone({ freq: 300, dur: 0.08, gain: 0.12, type: 'square', delay: 0.05 });
    this.a.tone({ freq: 450, dur: 0.08, gain: 0.12, type: 'square', delay: 0.12 });
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
