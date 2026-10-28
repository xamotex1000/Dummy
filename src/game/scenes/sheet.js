// The paper the menus are printed on: crash test report primitives (masthead,
// form fields, sections, stamps, keycaps, buttons), the test recorder that
// prints results and cards, and the Overlay base class every menu extends.
//
// Overlays center on `layout.frame`: the arena on desktop (so the sidebar
// stays readable), the whole screen on phones.

import { roundRectPath, wrapText } from '../../engine/renderer.js';
import { clamp, lerp, easeOutCubic, easeOutBack } from '../../engine/math.js';
import { drawTarget as target } from '../icons.js';
import { FLOORS_PER_ACT } from '../variants.js';
import { C, F, font } from '../theme.js';

// ---------------------------------------------------------------- helpers

export const TAU = Math.PI * 2;
// Masthead height of a report sheet, and the strip a footer needs.
export const HEAD = 58;
export const FOOT = 22;
export const TODAY = new Date().toISOString().slice(0, 10);
// Torn printouts draw their own jagged shadow, so sheets skip theirs.
export let shadows = true;
export function setShadows(on) {
  shadows = on;
}

export function setSpacing(ctx, px) {
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${px}px`;
}

export function text(ctx, s, x, y, size, { family = F.body, weight = 600, color = C.formInk, align = 'left', baseline = 'alphabetic', spacing = 0, maxWidth } = {}) {
  ctx.font = font(size, family, weight);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  setSpacing(ctx, spacing);
  if (maxWidth) ctx.fillText(s, x, y, maxWidth);
  else ctx.fillText(s, x, y);
  setSpacing(ctx, 0);
}

// Typed values: report numbers, measurements, keys.
export const mono = (ctx, s, x, y, size, opts = {}) => text(ctx, s, x, y, size, { family: F.mono, weight: 500, ...opts });

// The tiny uppercase caption on a form field.
export const caption = (ctx, s, x, y, opts = {}) => text(ctx, s, x, y, 10, { weight: 700, color: C.formMuted, spacing: 1.2, ...opts });

export function measure(ctx, s, size, family = F.body, weight = 600, spacing = 0) {
  ctx.font = font(size, family, weight);
  setSpacing(ctx, spacing);
  const w = ctx.measureText(s).width;
  setSpacing(ctx, 0);
  return w;
}

export function paragraph(ctx, s, x, y, width, size, lineH, opts = {}) {
  ctx.font = font(size, opts.family ?? F.body, opts.weight ?? 500);
  let lines = wrapText(ctx, s, width);
  if (opts.maxLines != null && lines.length > opts.maxLines) {
    lines = lines.slice(0, Math.max(0, opts.maxLines));
    // Cut text ends in an ellipsis that still fits the line.
    if (lines.length) {
      let last = lines[lines.length - 1];
      while (last && ctx.measureText(last + '…').width > width) last = last.slice(0, last.lastIndexOf(' ') > 0 ? last.lastIndexOf(' ') : last.length - 1);
      lines[lines.length - 1] = last.replace(/[\s,.;:]+$/, '') + '…';
    }
  }
  lines.forEach((ln, i) => text(ctx, ln, x, y + i * lineH, size, { weight: 500, ...opts }));
  return lines.length * lineH;
}

export function dim(ctx, r, a) {
  ctx.fillStyle = `rgba(14,17,13,${Math.min(0.92, 0.64 * a)})`;
  ctx.fillRect(r.x, r.y, r.w, r.h);
}

export const keyW = (ctx, label) => Math.max(20, measure(ctx, label, 11, F.mono, 600) + 10);

export function keycap(ctx, label, x, y, { dark = false } = {}) {
  const w = keyW(ctx, label);
  ctx.fillStyle = dark ? C.inkSoft : C.paper;
  ctx.fillRect(x, y - 10, w, 20);
  ctx.strokeStyle = dark ? C.inkLine : C.formInk;
  ctx.lineWidth = 1.25;
  ctx.strokeRect(x + 0.5, y - 9.5, w - 1, 19);
  mono(ctx, label, x + w / 2, y + 1, 11, { weight: 600, color: dark ? C.paperDim : C.formInk, align: 'center', baseline: 'middle' });
  return w;
}

export function hazard(ctx, x, y, w, h, step = 12) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = C.ctYellow;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = C.formInk;
  for (let sx = x - h; sx < x + w + h; sx += step * 2) {
    ctx.beginPath();
    ctx.moveTo(sx, y + h);
    ctx.lineTo(sx + h, y);
    ctx.lineTo(sx + h + step, y);
    ctx.lineTo(sx + step, y + h);
    ctx.fill();
  }
  ctx.restore();
}

export function rule(ctx, x0, x1, y, color = C.rule) {
  ctx.fillStyle = color;
  ctx.fillRect(x0, Math.round(y), x1 - x0, 1);
}

// A report sheet: paper, a colored edge for the test class, and a masthead
// with the calibration target, the facility line and the form title.
export function report(ctx, x, y, w, h, title, { tone = C.formInk, hazardEdge = false, kicker = 'CRASH TEST FACILITY', form = null, compact = false, reserve = 0 } = {}) {
  if (shadows) {
    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    ctx.fillRect(x + 5, y + 8, w, h);
  }
  ctx.fillStyle = C.paper;
  ctx.fillRect(x, y, w, h);
  if (hazardEdge) hazard(ctx, x, y, w, 7, 9);
  else {
    ctx.fillStyle = tone;
    ctx.fillRect(x, y, w, 7);
  }
  const head = compact ? 40 : HEAD;
  if (compact) {
    target(ctx, x + 19, y + 23, 9);
    text(ctx, title, x + 36, y + 29, 15, { weight: 700, spacing: 1.2, maxWidth: w - 52 - reserve });
  } else {
    target(ctx, x + 26, y + 33, 13);
    mono(ctx, kicker, x + 48, y + 25, 10, { color: C.formMuted, maxWidth: w - 64 });
    text(ctx, title, x + 48, y + 46, 19, { weight: 700, spacing: 1.4, maxWidth: w - 64 - reserve });
  }
  ctx.fillStyle = C.formInk;
  ctx.fillRect(x + 12, y + head - 4, w - 24, 2);
  ctx.fillRect(x + 12, y + head - 0.5, w - 24, 1);
  if (form) {
    rule(ctx, x + 12, x + w - 12, y + h - FOOT + 2);
    mono(ctx, form, x + 14, y + h - 8, 9, { color: C.formMuted });
    mono(ctx, `PAGE 1 OF 1`, x + w - 14, y + h - 8, 9, { color: C.formMuted, align: 'right' });
  }
}

// A row of boxed form fields: caption on top, typed value below.
export function fields(ctx, x, y, w, items, h = 40) {
  const total = items.reduce((n, it) => n + (it.flex ?? 1), 0);
  ctx.strokeStyle = C.formInk;
  ctx.lineWidth = 1.25;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  let cx = x;
  items.forEach((it, i) => {
    const cw = (w * (it.flex ?? 1)) / total;
    if (i) {
      ctx.fillStyle = C.formInk;
      ctx.fillRect(Math.round(cx), y, 1.25, h);
    }
    caption(ctx, it.label, cx + 7, y + 13, { maxWidth: cw - 12 });
    mono(ctx, it.value, cx + 7, y + h - 9, it.size ?? 15, { weight: 600, color: it.color ?? C.formInk, maxWidth: cw - 13 });
    cx += cw;
  });
  return h;
}

// A numbered section heading with a rule running out to the margin.
export function section(ctx, x, y, w, num, title, { color = C.formInk, right = null, rightColor = C.formMuted } = {}) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y - 12, 16, 16);
  mono(ctx, String(num), x + 8, y - 3.5, 11, { weight: 700, color: C.paper, align: 'center', baseline: 'middle' });
  text(ctx, title, x + 24, y, 12, { weight: 700, color, spacing: 1.4 });
  let end = x + w;
  if (right) {
    mono(ctx, right, end, y, 11, { weight: 600, color: rightColor, align: 'right' });
    end -= measure(ctx, right, 11, F.mono, 600) + 8;
  }
  const start = x + 24 + measure(ctx, title, 12, F.body, 700, 1.4) + 8;
  if (end > start) rule(ctx, start, end, y - 4);
}

export function checkbox(ctx, x, y, state) {
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = C.formInk;
  ctx.strokeRect(x + 0.5, y + 0.5, 16, 16);
  ctx.lineCap = 'round';
  if (state === 'done') {
    ctx.strokeStyle = '#2f7d43';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(x + 3, y + 8);
    ctx.lineTo(x + 8, y + 14);
    ctx.lineTo(x + 19, y - 3);
    ctx.stroke();
  } else if (state === 'failed') {
    ctx.strokeStyle = C.pen;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(x + 3, y + 3);
    ctx.lineTo(x + 14, y + 14);
    ctx.moveTo(x + 14, y + 3);
    ctx.lineTo(x + 3, y + 14);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
}

// A settings gear, with its hole punched in `bg`.
export function gear(ctx, x, y, r, color, bg) {
  const teeth = 8;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < teeth * 2; i++) ctx.arc(x, y, i % 2 ? r * 0.74 : r, (i / (teeth * 2)) * TAU, ((i + 1) / (teeth * 2)) * TAU);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.32, 0, TAU);
  ctx.fill();
}

// A gear button: on paper, or dark on the backdrop.
export function gearButton(ctx, b, { dark = false } = {}) {
  const bg = dark ? (b.hover ? C.inkLine : C.inkSoft) : b.hover ? C.ruleSoft : C.paper;
  ctx.fillStyle = bg;
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.strokeStyle = dark ? C.paperDim : C.formInk;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(b.x + 0.75, b.y + 0.75, b.w - 1.5, b.h - 1.5);
  gear(ctx, b.x + b.w / 2, b.y + b.h / 2, b.h * 0.3, dark ? C.paper : C.formInk, bg);
}

// An OFF | ON switch, 96 x 28, with the live side filled.
export function toggle(ctx, x, y, on) {
  const w = 96, h = 28;
  ctx.fillStyle = on ? '#2f7d43' : C.formInk;
  ctx.fillRect(on ? x + w / 2 : x, y, w / 2, h);
  ctx.strokeStyle = C.formInk;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5);
  mono(ctx, 'OFF', x + w / 4, y + h / 2 + 1, 12, { weight: 700, color: on ? C.formMuted : C.paper, align: 'center', baseline: 'middle' });
  mono(ctx, 'ON', x + (w * 3) / 4, y + h / 2 + 1, 12, { weight: 700, color: on ? C.paper : C.formMuted, align: 'center', baseline: 'middle' });
}

// A boxed verdict like PASS or FAIL, right-aligned at rx. Returns its width.
export function verdict(ctx, s, rx, y, color) {
  const w = measure(ctx, s, 12, F.mono, 700) + 12;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(rx - w + 0.5, y - 13.5, w - 1, 18);
  mono(ctx, s, rx - w / 2, y, 12, { weight: 700, color, align: 'center' });
  return w;
}

export function stampMark(ctx, label, x, y, color, t, size = 22) {
  const k = t < 0.18 ? 2 - t / 0.18 : 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.2);
  ctx.scale(k, k);
  ctx.globalAlpha *= clamp(t / 0.1, 0, 1) * 0.85;
  const w = measure(ctx, label, size, F.display, 400) + 26;
  const h = size * 1.9;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.strokeRect(-w / 2, -h / 2, w, h);
  ctx.lineWidth = 1.25;
  ctx.strokeRect(-w / 2 + 4, -h / 2 + 4, w - 8, h - 8);
  text(ctx, label, 0, 1, size, { family: F.display, weight: 400, color, align: 'center', baseline: 'middle' });
  ctx.restore();
}

export function hit(b, x, y) {
  return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
}

export const pulse = (t) => 0.55 + 0.45 * Math.sin(t * 4);

export const floorName = (depth) => `${Math.floor((depth - 1) / FLOORS_PER_ACT) + 1}-${((depth - 1) % FLOORS_PER_ACT) + 1}`;

export function reportNo(play, n = play.round?.number ?? play.run?.depth ?? 0) {
  const seed = play.run?.seed ?? 0;
  return `CT-${(seed % 1679616).toString(36).toUpperCase().padStart(4, '0')}-${String(n).padStart(2, '0')}`;
}

export const kicker = (play, n) => `REPORT ${reportNo(play, n)}  ·  ${TODAY}`;

// -------------------------------------------------------------- printer

// Results and card picks come out of a test recorder at the bottom of the
// frame. It rises, feeds paper up a line at a time, pauses, then each sheet
// tears off (tipping from its right-hand corner) and lifts free to where it
// rests while the printer drops away. Sheets tear one after another.
export const FEED_STEP = 5;
export const RISE = 0.22;
export const TEAR = 0.14;
export const LIFT = 0.4;

export class Printer {
  constructor(sfx, { count = 1, stagger = 0.1 } = {}) {
    this.sfx = sfx;
    this.count = count;
    this.stagger = stagger;
    this.feedTime = 0.9;
    this.reset();
  }

  reset() {
    this.t = 0;
    this.lastTick = 0;
    this.ripped = 0;
  }

  // Paper feeds at a steady rate, so longer sheets take a little longer.
  setLength(px) {
    if (this.t < RISE) this.feedTime = clamp(px / 650, 0.55, 1.2);
  }

  get feedEnd() {
    return RISE + this.feedTime;
  }

  tearAt(i) {
    return this.feedEnd + 0.12 + i * this.stagger;
  }

  freeAt(i) {
    return this.tearAt(i) + TEAR;
  }

  get end() {
    return this.freeAt(this.count - 1) + LIFT;
  }

  get locked() {
    return this.t < this.end;
  }

  // First press finishes the feed, a second one finishes everything.
  skip() {
    this.t = this.t < this.feedEnd ? this.feedEnd : this.end;
  }

  update(dt) {
    this.t += dt;
    if (this.t > RISE && this.t < this.feedEnd && this.t - this.lastTick > 0.075) {
      this.lastTick = this.t;
      this.sfx.printFeed();
    }
    while (this.ripped < this.count && this.t >= this.tearAt(this.ripped)) {
      this.ripped++;
      this.sfx.paperTear();
    }
  }

  // How much paper is out of the slot, in whole printed lines.
  fed(len) {
    const p = clamp((this.t - RISE) / this.feedTime, 0, 1);
    return Math.min(len, Math.ceil((p * len) / FEED_STEP) * FEED_STEP);
  }

  // 0 tucked below the frame, 1 up and printing.
  get raised() {
    const down = clamp((this.t - this.freeAt(this.count - 1) - 0.1) / 0.3, 0, 1);
    return easeOutCubic(this.t / 0.2) * (1 - down * down);
  }

  // Where sheet i of length `len` sits, given the slot and its resting y.
  pose(i, restY, len, slotY) {
    const t = this.t;
    if (t < this.tearAt(i)) return { y: slotY - this.fed(len), angle: 0, clip: true, torn: false, free: 0 };
    if (t < this.freeAt(i)) return { y: slotY - len, angle: 0.05 * easeOutCubic((t - this.tearAt(i)) / TEAR), clip: true, torn: true, free: 0 };
    const k = clamp((t - this.freeAt(i)) / LIFT, 0, 1);
    return { y: lerp(slotY - len, restY, easeOutCubic(k)), angle: 0.05 * (1 - easeOutBack(k)), clip: false, torn: true, free: k };
  }
}

// A ragged tear along the bottom: [x, depth] pairs, stable per seed.
export function tornEdge(w, seed) {
  let s = (seed * 9301 + 49297) % 233280;
  const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const pts = [];
  for (let x = 0; x < w; x += 3 + rnd() * 7) pts.push([x, 1 + rnd() * 4.5]);
  pts.push([w, 1 + rnd() * 4.5]);
  return pts;
}

export function tornPath(ctx, x, y, w, h, teeth) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  for (let i = teeth.length - 1; i >= 0; i--) ctx.lineTo(x + teeth[i][0], y + h - teeth[i][1]);
  ctx.closePath();
}

// Draws a sheet with a torn bottom edge. Returns what `draw` returns.
export function drawTorn(ctx, x, y, w, h, teeth, draw, shadowDy = 8) {
  ctx.fillStyle = 'rgba(0,0,0,0.34)';
  tornPath(ctx, x + 5, y + shadowDy, w, h, teeth);
  ctx.fill();
  ctx.save();
  tornPath(ctx, x, y, w, h, teeth);
  ctx.clip();
  shadows = false;
  const used = draw();
  shadows = true;
  ctx.restore();
  return used;
}

// ----------------------------------------------------------------- base

export class Overlay {
  constructor(play) {
    this.play = play;
    this.t = 0;
    this.closing = -1;
    this.buttons = [];
    this.tapAnywhere = null;
    this.keys = {};
    this.heights = {};
  }

  get L() {
    return this.play.layout;
  }

  get frame() {
    return this.play.layout.frame;
  }

  get fine() {
    return this.play.input.finePointer;
  }

  get appear() {
    const a = easeOutCubic(this.t / 0.25);
    return this.closing >= 0 ? a * (1 - clamp(this.closing / 0.18, 0, 1)) : a;
  }

  close(after) {
    if (this.closing >= 0) return;
    this.closing = 0;
    this.after = after;
  }

  update(dt, isTop) {
    this.t += dt;
    this.printer?.update(dt);
    if (this.closing >= 0) {
      this.closing += dt;
      if (this.closing >= 0.18) {
        this.play.engine.remove(this);
        this.after?.();
      }
      return;
    }
    if (!isTop) return;
    const input = this.play.input;
    const p = input.pointer;
    const hover = p.type === 'mouse' && p.inside ? this.buttons.find((b) => hit(b, p.x, p.y)) : null;
    for (const b of this.buttons) b.hover = b === hover;
    this.play.engine.cursor = hover ? 'pointer' : 'default';
    if (this.t < 0.2) return;
    // While printing, a key or tap hurries the printer instead.
    if (this.printer?.locked) {
      if (input.keysPressed.size || p.released) this.printer.skip();
      for (const b of this.buttons) b.armed = false;
      return;
    }
    for (const key of input.keysPressed) this.keys[key]?.();
    if (p.pressed) for (const b of this.buttons) b.armed = hit(b, p.x, p.y);
    if (p.released) {
      const b = this.buttons.find((bb) => bb.armed && hit(bb, p.x, p.y));
      for (const bb of this.buttons) bb.armed = false;
      if (b) b.onClick();
      else if (this.tapAnywhere) this.tapAnywhere();
    }
  }

  // Primary buttons are ink with a yellow edge (hazard tape on hover).
  // Secondary ones are outlined, on paper or on the dark backdrop.
  drawButton(ctx, b, label, { primary = true, key = null, paper = false } = {}) {
    const y = b.y + (b.armed ? 2 : 0);
    let fg = C.paper;
    if (primary) {
      ctx.fillStyle = b.hover ? '#34302a' : C.formInk;
      ctx.fillRect(b.x, y, b.w, b.h);
      if (b.hover) hazard(ctx, b.x, y, 10, b.h, 6);
      else {
        ctx.fillStyle = C.ctYellow;
        ctx.fillRect(b.x, y, 5, b.h);
      }
    } else {
      fg = paper ? C.formInk : C.paper;
      if (b.hover) {
        ctx.fillStyle = paper ? C.ruleSoft : 'rgba(239,234,223,0.12)';
        ctx.fillRect(b.x, y, b.w, b.h);
      }
      ctx.strokeStyle = paper ? C.formInk : C.paperDim;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(b.x + 0.75, y + 0.75, b.w - 1.5, b.h - 1.5);
    }
    text(ctx, label, b.x + b.w / 2, y + b.h / 2 + 1, 17, { weight: 700, color: fg, align: 'center', baseline: 'middle', spacing: 2.5, maxWidth: b.w - 24 });
    if (key && this.fine) keycap(ctx, key, b.x + b.w - keyW(ctx, key) - 12, y + b.h / 2, { dark: primary || !paper });
  }

  // A vertically centered sheet rectangle inside the frame.
  ticketRect(w, h, drop = true) {
    const R = this.frame;
    w = Math.min(w, R.w - 32);
    const x = R.x + (R.w - w) / 2;
    const y = Math.max(R.y + 12, R.y + (R.h - h) / 2) + (drop ? (1 - easeOutBack(this.t / 0.35)) * 60 : 0);
    return { x, y, w, h };
  }

  // Draws a sheet whose height comes from its own contents: `draw(x, y, w, h)`
  // returns the height it used, which sizes the paper on the next frame. The
  // first frame measures with an invisible pass.
  sheet(ctx, key, w, draw, drop = true) {
    w = Math.min(w, this.frame.w - 32);
    key += `:${Math.round(w)}`;
    const R = this.ticketRect(w, this.measure(ctx, key, w, draw), drop);
    this.heights[key] = draw(R.x, R.y, R.w, this.heights[key]);
    return R;
  }

  // A sheet layout's height, measured once with an invisible pass.
  measure(ctx, key, w, draw) {
    if (this.heights[key] === undefined) {
      ctx.save();
      ctx.globalAlpha = 0;
      this.heights[key] = draw(this.frame.x, this.frame.y, w, 200);
      ctx.restore();
    }
    return this.heights[key];
  }

  // Picks the fullest layout that fits the frame's height. `variants` are
  // { key, w, draw } from fullest to most compact; the last one is the
  // fallback. Returns the chosen one with its width clamped to the frame.
  fit(ctx, variants) {
    const room = this.frame.h - 24;
    const sized = variants.map((v) => ({ ...v, w: Math.min(v.w, this.frame.w - 32) }));
    return sized.find((v) => this.measure(ctx, `${v.key}:${Math.round(v.w)}`, v.w, v.draw) <= room) ?? sized[sized.length - 1];
  }

  // Seconds since the printout came free (or since the overlay opened).
  get since() {
    return this.printer ? this.printer.t - this.printer.end : this.t;
  }

  // The paper slot's resting height, near the bottom of the frame.
  get slotY() {
    return this.frame.y + this.frame.h - 26;
  }

  edge(seed, w) {
    this.edges ??= new Map();
    const key = `${seed}:${Math.round(w)}`;
    if (!this.edges.has(key)) this.edges.set(key, tornEdge(w, seed));
    return this.edges.get(key);
  }

  // The recorder housing, centered at cx. `stubs` are the torn-off scraps
  // still sticking out of the slot: [{ x, w, seed }].
  drawPrinter(ctx, cx, w, stubs = []) {
    const pr = this.printer;
    if (pr.raised <= 0) return;
    const slot = this.slotY + (1 - pr.raised) * 90;
    const x = cx - w / 2;
    ctx.fillStyle = '#2c312b';
    roundRectPath(ctx, x, slot - 12, w, 90, 8);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.09)';
    ctx.fillRect(x + 8, slot - 10, w - 16, 2);
    ctx.fillStyle = '#0a0c09';
    ctx.fillRect(x + 12, slot - 2, w - 24, 5);
    ctx.fillStyle = C.paperDim;
    for (const st of stubs) {
      if (!st) continue;
      ctx.beginPath();
      ctx.moveTo(st.x, slot + 2);
      for (const [tx, d] of this.edge(st.seed, st.w)) ctx.lineTo(st.x + tx, slot + 2 - (6.5 - d));
      ctx.lineTo(st.x + st.w, slot + 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#394037';
    ctx.fillRect(x, slot + 6, w, 80);
    hazard(ctx, x, slot + 6, w, 4, 6);
    mono(ctx, 'TEST RECORDER  CT-9', x + 16, slot + 22, 9, { weight: 600, color: C.muted });
    const feeding = pr.t > RISE && pr.t < pr.feedEnd;
    ctx.beginPath();
    ctx.arc(x + w - 20, slot + 18, 3.5, 0, TAU);
    ctx.fillStyle = feeding ? (Math.floor(pr.t * 14) % 2 ? C.ctYellow : '#5a4a10') : C.good;
    ctx.fill();
  }

  // Draws `drawAt(y)` as a printout in `pose`: clipped at the slot while it
  // is still attached, tipped about its bottom-right corner, torn once off.
  paper(ctx, x, w, h, pose, seed, drawAt) {
    ctx.save();
    if (pose.clip) {
      ctx.beginPath();
      ctx.rect(this.frame.x - 40, this.slotY - 4000, this.frame.w + 80, 4000);
      ctx.clip();
    }
    const px = x + w, py = pose.y + h;
    ctx.translate(px, py);
    ctx.rotate(pose.angle);
    ctx.translate(-px, -py);
    const used = pose.torn ? drawTorn(ctx, x, pose.y, w, h, this.edge(seed, w), () => drawAt(pose.y)) : drawAt(pose.y);
    ctx.restore();
    return used;
  }

  // Like sheet(), but the sheet comes out of the printer.
  printSheet(ctx, key, w, draw) {
    w = Math.min(w, this.frame.w - 32);
    key += `:${Math.round(w)}`;
    const h = this.measure(ctx, key, w, draw);
    const R = this.ticketRect(w, h, false);
    this.printer.setLength(h);
    const pose = this.printer.pose(0, R.y, h, this.slotY);
    this.drawPrinter(ctx, R.x + R.w / 2, R.w + 44, [pose.torn && { x: R.x, w: R.w, seed: 1 }]);
    this.heights[key] = this.paper(ctx, R.x, R.w, h, pose, 1, (y) => draw(R.x, y, R.w, h));
    return R;
  }

  // Title block above a spread of cards or tickets, on the dark backdrop.
  heading(ctx, form, title, subtitle, color = C.paper) {
    const R = this.frame;
    const cx = R.x + R.w / 2;
    mono(ctx, form, cx, R.y + 34, 11, { weight: 600, color: C.ctYellow, align: 'center', spacing: 1.5, maxWidth: R.w - 32 });
    text(ctx, title, cx, R.y + 70, clamp(R.w * 0.05, 26, 38), { weight: 700, color, align: 'center', spacing: 3, maxWidth: R.w - 32 });
    text(ctx, subtitle, cx, R.y + 95, 16, { weight: 500, color: C.paperDim, align: 'center', maxWidth: R.w - 32 });
  }
}

