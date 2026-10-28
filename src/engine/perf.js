// Adaptive quality. The engine feeds it every frame's duration; when frames
// run long for a while it steps quality down (canvas resolution, particle
// budget, physics catch-up), and when there's headroom for a good while it
// steps back up. Phones start one step down.
//
// `?quality=0|1|2` in the URL pins a level (0 is full quality).

const LEVELS = [
  { dprCap: 2.5, particles: 1200, texts: 60, maxTicks: 4 },
  { dprCap: 2, particles: 600, texts: 36, maxTicks: 3 },
  { dprCap: 1.5, particles: 320, texts: 20, maxTicks: 3 },
];

const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const pinned = (() => {
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('quality') : null;
  return q !== null && LEVELS[+q] ? +q : null;
})();

// Smoothed frame time (ms) above which quality drops, below which it can rise.
const SLOW_MS = 22;
const FAST_MS = 13;
const DROP_AFTER = 1.2; // seconds of slow frames
const RAISE_AFTER = 8; // seconds of fast frames

export const perf = {
  level: pinned ?? (coarse ? 1 : 0),
  ema: 16,
  slowFor: 0,
  fastFor: 0,

  get settings() {
    return LEVELS[this.level];
  },

  // Feed one frame's real duration in seconds. Returns true when the level
  // changed (the caller resizes the canvas).
  frame(dt) {
    // Ignore stalls (tab switches, GC hiccups): they say nothing about load.
    if (pinned !== null || dt <= 0 || dt > 0.25) return false;
    const ms = dt * 1000;
    this.ema += (ms - this.ema) * 0.08;
    this.slowFor = this.ema > SLOW_MS ? this.slowFor + dt : 0;
    this.fastFor = this.ema < FAST_MS ? this.fastFor + dt : 0;
    if (this.slowFor > DROP_AFTER && this.level < LEVELS.length - 1) {
      this.level++;
      this.slowFor = this.fastFor = 0;
      this.ema = 16;
      return true;
    }
    if (this.fastFor > RAISE_AFTER && this.level > 0) {
      this.level--;
      this.slowFor = this.fastFor = 0;
      return true;
    }
    return false;
  },
};
