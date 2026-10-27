// Blood. Droplets fly, land and stain the cell: pools on the floor, splats
// on the padded back wall, runs down the side walls and drips from the
// ceiling. Stumps pump for a moment after a limb comes off. Stains last
// for the round. With gore off nothing here runs, and callers fall back
// to stuffing.

import { C } from './theme.js';
import { settings } from './settings.js';

const MAX_DROPS = 500;
const MAX_STAINS = 320;
const GRAVITY = 1500;
const DRIED = '#7d1826';

export class Gore {
  constructor(scene) {
    this.sc = scene;
    this.clear();
  }

  get on() {
    return settings.gore;
  }

  clear() {
    this.drops = [];
    this.stains = [];
    this.spurts = [];
  }

  // A burst of droplets from (x, y), roughly along (dx, dy).
  splash(x, y, n, { dx = 0, dy = -1, spread = 1.4, speed = 1 } = {}) {
    if (!this.on) return;
    const rng = this.sc.rng;
    const base = Math.atan2(dy, dx);
    for (let i = 0; i < n; i++) {
      if (this.drops.length >= MAX_DROPS) this.drops.shift();
      const a = base + rng.range(-spread, spread);
      const sp = rng.range(120, 520) * speed;
      this.drops.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: rng.range(2, 4.4), age: 0,
        // Some droplets hit the back wall a moment after leaving the dummy.
        back: rng.chance(0.4) ? rng.range(0.04, 0.22) : Infinity,
      });
    }
  }

  // One slow drop, for bleeding.
  drip(x, y, s = 1) {
    if (!this.on) return;
    this.drops.push({ x, y, vx: this.sc.rng.range(-20, 20), vy: 0, r: 1.8 * s, age: 0, back: Infinity });
  }

  // A severed stump at point `p` pumps blood away from the dummy's middle.
  spurt(dummy, p, t = 1.6) {
    if (!this.on) return;
    this.spurts.push({ dummy, p, t, max: t, acc: 0 });
  }

  update(dt) {
    if (!this.on) {
      if (this.drops.length || this.stains.length || this.spurts.length) this.clear();
      return;
    }
    const B = this.sc.bounds;
    for (const s of this.spurts) {
      s.t -= dt;
      // Pulses, weakening as it goes.
      const beat = Math.sin(s.t * 16) > 0 ? 1 : 0.2;
      s.acc += dt * 60 * (s.t / s.max) * beat;
      const c = s.dummy.center();
      while (s.acc >= 1) {
        s.acc -= 1;
        this.splash(s.p.x, s.p.y, 1, { dx: s.p.x - c.x, dy: s.p.y - c.y - 10, spread: 0.3, speed: 0.9 });
      }
    }
    this.spurts = this.spurts.filter((s) => s.t > 0);

    const keep = [];
    for (const d of this.drops) {
      d.age += dt;
      d.vy += GRAVITY * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.age >= d.back) this.stain(d.x, d.y, d.r * 1.5, 'back');
      else if (d.y >= B.bottom) this.stain(d.x, B.bottom, d.r, 'floor');
      else if (d.x <= B.left) this.stain(B.left, d.y, d.r, 'side');
      else if (d.x >= B.right) this.stain(B.right, d.y, d.r, 'side');
      else if (d.y <= B.top) this.stain(d.x, B.top, d.r, 'top');
      else if (d.age < 3) keep.push(d);
    }
    this.drops = keep;
    for (const s of this.stains) if (s.run < s.runMax) s.run = Math.min(s.runMax, s.run + dt * 16);
  }

  stain(x, y, r, surface) {
    const rng = this.sc.rng;
    if (this.stains.length >= MAX_STAINS) this.stains.shift();
    const runs = surface !== 'floor' && rng.chance(surface === 'back' ? 0.35 : 0.8);
    this.stains.push({
      x, y, r, surface,
      stretch: rng.range(2, 3.6),
      dark: rng.chance(0.4),
      run: 0,
      runMax: runs ? rng.range(8, 46) : 0,
      dots: surface === 'back' ? [0, 1, 2].map(() => ({ dx: rng.range(-3, 3) * r, dy: rng.range(-3, 3) * r, r: rng.range(0.25, 0.6) * r })) : [],
    });
  }

  // Stains go on the cell itself, behind the machine and the dummies.
  drawStains(ctx) {
    if (!this.on || !this.stains.length) return;
    const B = this.sc.bounds;
    ctx.save();
    ctx.globalAlpha = 0.88;
    for (const s of this.stains) {
      ctx.fillStyle = s.dark ? DRIED : C.blood;
      ctx.beginPath();
      if (s.surface === 'floor') {
        ctx.ellipse(s.x, B.bottom + 1, s.r * s.stretch, s.r * 0.65, 0, 0, Math.PI * 2);
      } else {
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        for (const d of s.dots) {
          ctx.moveTo(s.x + d.dx + d.r, s.y + d.dy);
          ctx.arc(s.x + d.dx, s.y + d.dy, d.r, 0, Math.PI * 2);
        }
      }
      ctx.fill();
      if (s.run > 0) {
        const w = Math.max(1, s.r * 0.6);
        ctx.fillRect(s.x - w / 2, s.y, w, s.run);
        ctx.beginPath();
        ctx.arc(s.x, s.y + s.run, w * 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawDrops(ctx) {
    if (!this.on || !this.drops.length) return;
    ctx.fillStyle = C.blood;
    ctx.beginPath();
    for (const d of this.drops) {
      ctx.moveTo(d.x + d.r, d.y);
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    }
    ctx.fill();
  }
}
