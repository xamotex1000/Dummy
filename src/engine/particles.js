// Lightweight particle system. Particles are plain objects drawn by kind.
//
// Two things keep a busy scene cheap:
// - A budget from the adaptive quality level. Decorative kinds (fire, smoke,
//   dots, fluff, sparks) thin out as the pool fills and stop at the budget;
//   rings, beams and text always spawn, and text has its own cap.
// - Batched drawing. Particles that look the same (kind, color, alpha step,
//   line width) share one path, so a thousand flames cost a few fills
//   instead of a thousand.
// - Text (damage numbers) is rendered once per string, font, color and scale
//   into a small cached bitmap, since outlined text is slow to draw.

import { perf } from './perf.js';

const DECOR = new Set(['dot', 'fluff', 'spark', 'smoke', 'fire']);
// Back to front.
const ORDER = ['smoke', 'fire', 'fluff', 'dot', 'spark', 'beam', 'ring'];
const STROKED = new Set(['spark', 'beam', 'ring']);
const TAU = Math.PI * 2;
// Alpha is drawn in steps so similar particles batch together.
const qa = (a) => Math.round(Math.min(1, Math.max(0, a)) * 10) / 10;
const ql = (w) => Math.max(0.5, Math.round(w * 2) / 2);
// Handed back for a particle the budget dropped, so callers can still set
// fields on the result.
const DROPPED = {};
const SPRITE_CACHE = 300;
const makeCanvas = (w, h) => {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

export class Particles {
  constructor(max = 1200) {
    this.max = max;
    this.list = [];
    this.texts = 0;
    this.floorY = Infinity;
    this.batches = Object.fromEntries(ORDER.map((k) => [k, new Map()]));
    this.textList = [];
    this.sprites = new Map();
    // Sprites drawn before the web fonts arrived used a fallback font.
    document.fonts?.addEventListener?.('loadingdone', () => this.sprites.clear());
  }

  get budget() {
    return Math.min(this.max, perf.settings.particles);
  }

  spawn(o) {
    const kind = o.kind ?? 'dot';
    const n = this.list.length;
    if (DECOR.has(kind)) {
      const B = this.budget;
      if (n >= B) return DROPPED;
      // Past 60% of the budget, accept fewer and fewer.
      if (n > B * 0.6 && Math.random() > (B - n) / (B * 0.4)) return DROPPED;
    }
    const p = {
      kind: 'dot', x: 0, y: 0, vx: 0, vy: 0, life: 0.6, size: 4, grow: 0,
      color: '#fff', color2: null, gravity: 0, drag: 0, bounce: 0.3, text: '', rot: 0, spin: 0,
      ...o,
    };
    p.maxLife = p.life;
    if (kind === 'text') {
      if (this.texts >= perf.settings.texts) {
        // Replace the oldest number rather than pile on more.
        let oldest = -1;
        let best = Infinity;
        for (let i = 0; i < n; i++) {
          const q = this.list[i];
          if (q.kind === 'text' && q.life / q.maxLife < best) {
            best = q.life / q.maxLife;
            oldest = i;
          }
        }
        if (oldest >= 0) {
          this.list[oldest] = p;
          return p;
        }
      }
      this.texts++;
    }
    if (n >= this.max) {
      const i = Math.floor(Math.random() * n);
      if (this.list[i].kind === 'text') this.texts--;
      this.list[i] = p;
    } else {
      this.list.push(p);
    }
    return p;
  }

  update(dt) {
    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.life -= dt;
      if (p.life <= 0) {
        if (p.kind === 'text') this.texts--;
        list[i] = list[list.length - 1];
        list.pop();
        continue;
      }
      if (p.drag) {
        const k = Math.exp(-p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.size += p.grow * dt;
      p.rot += p.spin * dt;
      if (p.gravity > 0 && p.y > this.floorY) {
        p.y = this.floorY;
        p.vy *= -p.bounce;
        p.vx *= 0.6;
      }
    }
    // Over the text cap (it shrinks when quality drops): drop the oldest
    // numbers outright. Fading them wouldn't do, since new numbers replace
    // the oldest one before it gets to die.
    const extra = this.texts - perf.settings.texts;
    if (extra > 0) {
      const gone = new Set(
        list.filter((p) => p.kind === 'text').sort((a, b) => a.life / a.maxLife - b.life / b.maxLife).slice(0, extra),
      );
      this.list = list.filter((p) => !gone.has(p));
      this.texts -= gone.size;
    }
  }

  // Sort particles into batches keyed by how they look.
  sort() {
    for (const k of ORDER) for (const arr of this.batches[k].values()) arr.length = 0;
    const texts = this.textList;
    texts.length = 0;
    for (const p of this.list) {
      const t = p.life / p.maxLife; // 1 at birth, 0 at death
      let color = p.color;
      let alpha;
      let lw = 0;
      switch (p.kind) {
        case 'dot': alpha = t * 2; break;
        case 'fluff': alpha = t * 2.5; break;
        case 'smoke': alpha = t * 0.5; break;
        case 'fire':
          alpha = t * 1.5;
          color = t > 0.6 ? '#fff3b0' : t > 0.35 ? p.color : p.color2 || p.color;
          break;
        case 'spark': alpha = t; lw = ql(p.size); break;
        case 'beam': alpha = t; lw = ql(p.size * t); break;
        case 'ring': alpha = t; lw = ql(6 * t); break;
        case 'text': texts.push(p); continue;
        default: continue;
      }
      const key = `${color}|${qa(alpha)}|${lw}`;
      const map = this.batches[p.kind];
      let arr = map.get(key);
      if (!arr) map.set(key, (arr = []));
      arr.push(p);
    }
  }

  render(ctx) {
    this.sort();
    ctx.lineCap = 'round';
    for (const kind of ORDER) {
      const stroked = STROKED.has(kind);
      for (const [key, arr] of this.batches[kind]) {
        if (!arr.length) continue;
        const [color, a, lw] = key.split('|');
        if (+a <= 0) continue;
        ctx.globalAlpha = +a;
        ctx.beginPath();
        for (const p of arr) this.path(ctx, p);
        if (stroked) {
          ctx.strokeStyle = color;
          ctx.lineWidth = +lw;
          ctx.stroke();
        } else {
          ctx.fillStyle = color;
          ctx.fill();
        }
      }
      // Drop batches nobody used this frame, so the maps stay small.
      for (const [key, arr] of this.batches[kind]) if (!arr.length) this.batches[kind].delete(key);
    }
    if (this.textList.length) {
      // Device pixels per world unit, with room for the pop-in overshoot,
      // in steps so sprites get reused.
      const m = ctx.getTransform();
      const scale = Math.max(0.5, Math.round(Math.hypot(m.a, m.b) * 1.2 * 4) / 4);
      for (const p of this.textList) this.drawText(ctx, p, scale);
    }
    ctx.globalAlpha = 1;
  }

  // Add one particle's shape to the current path.
  path(ctx, p) {
    const t = p.life / p.maxLife;
    switch (p.kind) {
      case 'dot':
      case 'smoke':
      case 'ring': {
        const r = Math.max(0.1, p.size);
        ctx.moveTo(p.x + r, p.y);
        ctx.arc(p.x, p.y, r, 0, TAU);
        break;
      }
      case 'fire': {
        const r = Math.max(0.1, p.size * (0.4 + t * 0.6));
        ctx.moveTo(p.x + r, p.y);
        ctx.arc(p.x, p.y, r, 0, TAU);
        break;
      }
      case 'fluff': {
        const s = Math.max(0.1, p.size);
        ctx.moveTo(p.x + s, p.y);
        ctx.arc(p.x, p.y, s, 0, TAU);
        ctx.moveTo(p.x + s * 1.4, p.y - s * 0.3);
        ctx.arc(p.x + s * 0.7, p.y - s * 0.3, s * 0.7, 0, TAU);
        ctx.moveTo(p.x, p.y + s * 0.2);
        ctx.arc(p.x - s * 0.6, p.y + s * 0.2, s * 0.6, 0, TAU);
        break;
      }
      case 'spark':
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
        break;
      case 'beam':
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x2, p.y2);
        break;
    }
  }

  drawText(ctx, p, scale) {
    const t = p.life / p.maxLife;
    const age = 1 - t;
    const pop = age < 0.12 ? 0.6 + (age / 0.12) * 0.6 : 1.2 - Math.min(0.2, (age - 0.12) * 0.6);
    const s = this.sprite(p, scale);
    ctx.globalAlpha = Math.min(1, t * 3);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.scale(pop, pop);
    ctx.drawImage(s.c, -s.w / 2, -s.h / 2, s.w, s.h);
    ctx.restore();
  }

  // The outlined text as a bitmap, sized for `scale` device pixels per unit.
  sprite(p, scale) {
    const key = `${p.text}|${p.font}|${p.color}|${scale}`;
    let s = this.sprites.get(key);
    if (s) {
      // Most recently used goes to the back.
      this.sprites.delete(key);
      this.sprites.set(key, s);
      return s;
    }
    const size = +(p.font.match(/([\d.]+)px/)?.[1] ?? 16);
    const probe = makeCanvas(1, 1).getContext('2d');
    probe.font = p.font;
    const pad = 4;
    const w = probe.measureText(p.text).width + pad * 2;
    const h = size * 1.35 + pad * 2;
    const c = makeCanvas(Math.max(1, Math.ceil(w * scale)), Math.max(1, Math.ceil(h * scale)));
    const g = c.getContext('2d');
    g.scale(scale, scale);
    g.font = p.font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 4;
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(20,22,20,0.9)';
    g.strokeText(p.text, w / 2, h / 2);
    g.fillStyle = p.color;
    g.fillText(p.text, w / 2, h / 2);
    s = { c, w, h };
    this.sprites.set(key, s);
    if (this.sprites.size > SPRITE_CACHE) this.sprites.delete(this.sprites.keys().next().value);
    return s;
  }
}
