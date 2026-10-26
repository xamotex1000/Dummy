// Canvas wrapper: DPR-aware sizing, screen shake and a few path helpers.

const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.w = 1;
    this.h = 1;
    this.dpr = 1;
    this.trauma = 0;
    this.ox = 0;
    this.oy = 0;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.w = Math.max(1, rect.width);
    this.h = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
  }

  // Trauma-based shake: amount is 0..1, offset grows with trauma squared.
  shake(amount) {
    this.trauma = Math.min(1, this.trauma + amount * (reducedMotion ? 0.3 : 1));
  }

  update(dt) {
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    const m = 20 * this.trauma * this.trauma;
    this.ox = (Math.random() * 2 - 1) * m;
    this.oy = (Math.random() * 2 - 1) * m;
  }

  begin() {
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.w, this.h);
  }
}

export function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// A stadium shape around segment AB with radius r (a circle when A == B).
export function capsulePath(ctx, ax, ay, bx, by, r) {
  ctx.beginPath();
  if (Math.abs(ax - bx) < 0.01 && Math.abs(ay - by) < 0.01) {
    ctx.arc(ax, ay, r, 0, Math.PI * 2);
    return;
  }
  const ang = Math.atan2(by - ay, bx - ax);
  ctx.arc(ax, ay, r, ang + Math.PI / 2, ang + (Math.PI * 3) / 2);
  ctx.arc(bx, by, r, ang - Math.PI / 2, ang + Math.PI / 2);
  ctx.closePath();
}

export function wrapText(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}
