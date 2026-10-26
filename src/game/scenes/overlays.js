// Overlay scenes drawn on top of the arena. Paperwork is the UI motif:
// each round is a work order, results are stamped, cards are drafted.
//
// Overlays center on `layout.frame`: the arena on desktop (so the sidebar
// stays readable), the whole screen on phones.

import { roundRectPath, wrapText } from '../../engine/renderer.js';
import { clamp, easeOutCubic, easeOutBack } from '../../engine/math.js';
import { drawWeaponIcon } from '../icons.js';
import { WEAPONS, MAX_SLOTS } from '../weapons.js';
import { drawOffer, takeCard, KIND_LABEL } from '../cards.js';
import { REWARD_LABEL } from '../objectives.js';
import { VARIANTS, ACTS, TWISTS, FLOORS_PER_ACT } from '../variants.js';
import { REACTIONS, REACTION_IDS } from '../reactions.js';
import { C, F, font } from '../theme.js';

// ---------------------------------------------------------------- helpers

function setSpacing(ctx, px) {
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${px}px`;
}

function text(ctx, s, x, y, size, { family = F.body, weight = 600, color = C.paperInk, align = 'left', baseline = 'alphabetic', spacing = 0, maxWidth } = {}) {
  ctx.font = font(size, family, weight);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  setSpacing(ctx, spacing);
  if (maxWidth) ctx.fillText(s, x, y, maxWidth);
  else ctx.fillText(s, x, y);
  setSpacing(ctx, 0);
}

function paragraph(ctx, s, x, y, width, size, lineH, opts = {}) {
  ctx.font = font(size, opts.family ?? F.body, opts.weight ?? 500);
  const lines = wrapText(ctx, s, width);
  lines.forEach((ln, i) => text(ctx, ln, x, y + i * lineH, size, { weight: 500, ...opts }));
  return lines.length * lineH;
}

function dim(ctx, r, a) {
  ctx.fillStyle = `rgba(14,17,13,${Math.min(0.92, 0.64 * a)})`;
  ctx.fillRect(r.x, r.y, r.w, r.h);
}

function keycap(ctx, label, x, y, { dark = false } = {}) {
  ctx.font = font(12, F.body, 700);
  const w = Math.max(22, ctx.measureText(label).width + 12);
  roundRectPath(ctx, x, y - 11, w, 22, 5);
  ctx.fillStyle = dark ? C.inkSoft : C.paperDim;
  ctx.fill();
  text(ctx, label, x + w / 2, y + 1, 12, { weight: 700, color: dark ? C.paperDim : C.paperInk, align: 'center', baseline: 'middle' });
  return w;
}

function ticket(ctx, x, y, w, h, header, { bg = C.ink, fg = C.paper } = {}) {
  roundRectPath(ctx, x + 4, y + 7, w, h, 8);
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.fill();
  roundRectPath(ctx, x, y, w, h, 8);
  ctx.fillStyle = C.paper;
  ctx.fill();
  ctx.save();
  roundRectPath(ctx, x, y, w, h, 8);
  ctx.clip();
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, 40);
  ctx.restore();
  text(ctx, header, x + 18, y + 27, 15, { family: F.display, weight: 400, color: fg, spacing: 0.5, maxWidth: w - 36 });
  ctx.fillStyle = C.paperDim;
  for (let hx = x + 12; hx < x + w - 8; hx += 14) {
    ctx.beginPath();
    ctx.arc(hx, y + 44, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function dashed(ctx, x0, x1, y) {
  ctx.strokeStyle = C.paperDim;
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x1, y);
  ctx.stroke();
  ctx.setLineDash([]);
}

function checkbox(ctx, x, y, state) {
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = C.paperInk;
  ctx.strokeRect(x, y, 18, 18);
  ctx.lineCap = 'round';
  if (state === 'done') {
    ctx.strokeStyle = C.good;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x + 3, y + 9);
    ctx.lineTo(x + 8, y + 15);
    ctx.lineTo(x + 20, y - 2);
    ctx.stroke();
  } else if (state === 'failed') {
    ctx.strokeStyle = C.bad;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x + 3, y + 3);
    ctx.lineTo(x + 15, y + 15);
    ctx.moveTo(x + 15, y + 3);
    ctx.lineTo(x + 3, y + 15);
    ctx.stroke();
  }
}

function stampMark(ctx, label, x, y, color, t) {
  const k = t < 0.18 ? 2 - t / 0.18 : 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.22);
  ctx.scale(k, k);
  ctx.globalAlpha *= clamp(t / 0.1, 0, 1) * 0.9;
  ctx.font = font(22, F.display, 400);
  const w = ctx.measureText(label).width + 22;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  roundRectPath(ctx, -w / 2, -20, w, 40, 6);
  ctx.stroke();
  text(ctx, label, 0, 1, 22, { family: F.display, weight: 400, color, align: 'center', baseline: 'middle' });
  ctx.restore();
}

function hit(b, x, y) {
  return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
}

const pulse = (t) => 0.55 + 0.45 * Math.sin(t * 4);

const PITCH = 'Fight through three acts of test dummies. Pick your route between floors, draft weapons and mods, and combine fire, ice, shocks, nails and blasts into reactions. Miss a deadline and the run is over.';

// Header colors per ticket type.
const TYPE_TONE = {
  standard: { bg: C.ink, fg: C.paper, label: 'STANDARD' },
  elite: { bg: C.bad, fg: C.paper, label: 'ELITE' },
  crate: { bg: '#7b4fc4', fg: C.paper, label: 'CRATE' },
  workshop: { bg: C.gold, fg: C.ink, label: 'WORKSHOP' },
  boss: { bg: C.bad, fg: C.paper, label: 'BOSS' },
};

const floorName = (depth) => `${Math.floor((depth - 1) / FLOORS_PER_ACT) + 1}-${((depth - 1) % FLOORS_PER_ACT) + 1}`;

function metaLine(play) {
  const parts = [];
  if (play.bestDepth > 0) parts.push(`Best: floor ${floorName(play.bestDepth)}`);
  if (play.wins > 0) parts.push(`Wins: ${play.wins}`);
  parts.push(`Reactions found: ${play.status.discovered.size}/${REACTION_IDS.length}`);
  return parts.join('  \u00b7  ');
}

// ----------------------------------------------------------------- base

class Overlay {
  constructor(play) {
    this.play = play;
    this.t = 0;
    this.closing = -1;
    this.buttons = [];
    this.tapAnywhere = null;
    this.keys = {};
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
    for (const key of input.keysPressed) this.keys[key]?.();
    if (p.pressed) for (const b of this.buttons) b.armed = hit(b, p.x, p.y);
    if (p.released) {
      const b = this.buttons.find((bb) => bb.armed && hit(bb, p.x, p.y));
      for (const bb of this.buttons) bb.armed = false;
      if (b) b.onClick();
      else if (this.tapAnywhere) this.tapAnywhere();
    }
  }

  drawButton(ctx, b, label, { primary = true, key = null } = {}) {
    const down = b.armed ? 2 : 0;
    roundRectPath(ctx, b.x, b.y + down, b.w, b.h, 10);
    ctx.fillStyle = primary ? (b.hover ? C.inkSoft : C.ink) : b.hover ? 'rgba(239,234,223,0.12)' : 'rgba(0,0,0,0)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = primary ? (b.hover ? C.accent : C.ink) : C.paperDim;
    ctx.stroke();
    text(ctx, label, b.x + b.w / 2, b.y + b.h / 2 + down + 1, 16, { family: F.display, weight: 400, color: C.paper, align: 'center', baseline: 'middle', spacing: 0.5 });
    if (key && this.fine) {
      ctx.font = font(12, F.body, 700);
      const kw = Math.max(22, ctx.measureText(key).width + 12);
      keycap(ctx, key, b.x + b.w - kw - 12, b.y + b.h / 2 + down, { dark: true });
    }
  }

  // A vertically centered ticket rectangle inside the frame.
  ticketRect(w, h, drop = true) {
    const R = this.frame;
    w = Math.min(w, R.w - 32);
    const x = R.x + (R.w - w) / 2;
    const y = Math.max(R.y + 12, R.y + (R.h - h) / 2) + (drop ? (1 - easeOutBack(this.t / 0.35)) * 60 : 0);
    return { x, y, w, h };
  }
}

// ---------------------------------------------------------------- title

const CONTROLS = [
  ['MOVE', 'Swing the bat and knife. They pivot from your grip'],
  ['CLICK', 'Punch, fire guns, drop grenades and anvils'],
  ['DRAG', 'Grab and throw the dummy with Hands'],
  ['1-6 / WHEEL', 'Switch weapon'],
  ['ESC', 'Pause'],
];

export class TitleOverlay extends Overlay {
  constructor(play) {
    super(play);
    this.tapAnywhere = () => this.close(() => this.play.newRun());
    this.keys = { enter: this.tapAnywhere, ' ': this.tapAnywhere };
  }

  update(dt, isTop) {
    super.update(dt, isTop);
    if (isTop) this.play.engine.cursor = 'pointer';
  }

  render(ctx) {
    if (this.L.mode === 'wide') this.renderWide(ctx);
    else this.renderCompact(ctx);
  }

  logo(ctx, x, y, size, align) {
    for (const [word, dy, col] of [['DUMMY', 0, C.paper], ['RUN', size * 0.92, C.gold]]) {
      text(ctx, word, x + 5, y + dy + 6, size, { family: F.display, weight: 400, color: C.accent, align, baseline: 'middle' });
      text(ctx, word, x, y + dy, size, { family: F.display, weight: 400, color: col, align, baseline: 'middle' });
    }
  }

  // Desktop: a left-hand column with the pitch and controls; the dummy stays
  // visible on the right.
  renderWide(ctx) {
    const L = this.L;
    const a = this.appear;
    const grad = ctx.createLinearGradient(0, 0, L.w, 0);
    grad.addColorStop(0, `rgba(14,17,13,${0.95 * a})`);
    grad.addColorStop(0.55, `rgba(14,17,13,${0.82 * a})`);
    grad.addColorStop(1, `rgba(14,17,13,${0.35 * a})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, L.w, L.h);

    ctx.save();
    ctx.globalAlpha = a;
    const x = Math.max(56, L.w * 0.07);
    const colW = Math.min(560, L.w * 0.48);
    const size = clamp(L.h * 0.15, 70, 140);
    let y = L.h * 0.16 + size * 0.5;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.04);
    this.logo(ctx, 0, 0, size, 'left');
    ctx.restore();
    y += size * 1.55;
    y += paragraph(ctx, PITCH, x, y, colW, 20, 27, { color: C.paperDim });
    y += 22;
    text(ctx, 'CONTROLS', x, y, 12, { weight: 700, color: C.muted, spacing: 1.5 });
    y += 26;
    for (const [key, desc] of CONTROLS) {
      keycap(ctx, key, x, y, { dark: true });
      text(ctx, desc, x + 120, y + 6, 17, { weight: 500, color: C.paper });
      y += 32;
    }
    y += 26;
    ctx.globalAlpha = a * pulse(this.t);
    text(ctx, 'CLICK OR PRESS SPACE TO START', x, y, 22, { family: F.display, weight: 400, color: C.paper, spacing: 1 });
    ctx.globalAlpha = a;
    text(ctx, metaLine(this.play), x, y + 30, 15, { color: C.muted });
    ctx.restore();
  }

  renderCompact(ctx) {
    const L = this.L;
    const a = this.appear;
    dim(ctx, { x: 0, y: 0, w: L.w, h: L.h }, a * 1.4);
    ctx.save();
    ctx.globalAlpha = a;
    const size = clamp(Math.min(L.w * 0.19, L.h * 0.13), 44, 112);
    const cy = L.h * (L.mode === 'short' ? 0.2 : 0.3);
    ctx.save();
    ctx.translate(L.w / 2, cy);
    ctx.rotate(-0.06);
    this.logo(ctx, 0, 0, size, 'center');
    ctx.restore();

    const w = Math.min(420, L.w - 48);
    let y = cy + size * 1.75;
    y += paragraph(ctx, PITCH, L.w / 2, y, w, 17, 23, { color: C.paperDim, align: 'center' });
    const verb = this.fine ? 'CLICK' : 'TAP';
    const py = Math.min(L.h - 50, Math.max(y + 46, L.h * 0.74));
    ctx.globalAlpha = a * pulse(this.t);
    text(ctx, `${verb} TO START`, L.w / 2, py, 22, { family: F.display, weight: 400, color: C.paper, align: 'center', spacing: 1 });
    ctx.globalAlpha = a;
    text(ctx, metaLine(this.play), L.w / 2, py + 30, 15, { color: C.muted, align: 'center' });
    ctx.restore();
  }
}

// ---------------------------------------------------------- work order

export class IntroOverlay extends Overlay {
  constructor(play) {
    super(play);
    const go = () => this.close(() => this.play.beginPlay());
    this.tapAnywhere = go;
    this.keys = { enter: go, ' ': go };
  }

  update(dt, isTop) {
    super.update(dt, isTop);
    if (isTop) this.play.engine.cursor = 'pointer';
  }

  render(ctx) {
    if (this.frame.h < 480) {
      this.renderShort(ctx);
      return;
    }
    const round = this.play.round;
    const a = this.appear;
    dim(ctx, this.frame, a * 0.7);
    const wide = this.frame.w >= 600;
    const w = Math.min(wide ? 460 : 400, this.frame.w - 32);
    const inner = w - 36;
    ctx.font = font(16, F.body, 500);
    const hintH = wrapText(ctx, round.primary.hint, inner - 28).length * 20;
    const v = VARIANTS[round.variant];
    const twist = round.twist ? TWISTS[round.twist] : null;
    ctx.font = font(15, F.body, 500);
    const subjectH = 68 + wrapText(ctx, v.desc, inner).length * 19 + (twist ? 24 + wrapText(ctx, twist.desc, inner).length * 19 : 0);
    const h = 40 + 26 + subjectH + 30 + hintH + 22 + 18 + 30 + 22 + 30 + 48;
    const { x, y } = this.ticketRect(w, h);

    ctx.save();
    ctx.globalAlpha = a;
    const header = `${round.boss ? 'BOSS ORDER' : 'WORK ORDER'} · FLOOR ${round.act}-${round.floor}`;
    const tone = TYPE_TONE[round.type] ?? TYPE_TONE.standard;
    ticket(ctx, x, y, w, h, header, { bg: tone.bg, fg: tone.fg });
    let cy = y + 40 + 26;
    const lx = x + 18;
    text(ctx, 'SUBJECT', lx, cy, 12, { weight: 700, color: C.muted, spacing: 1.5 });
    cy += 22;
    text(ctx, v.name.toUpperCase(), lx, cy, 18, { family: F.display, weight: 400, maxWidth: inner });
    cy += 4;
    cy += paragraph(ctx, v.desc, lx, cy + 14, inner, 15, 19, { color: C.muted });
    if (twist) {
      cy += 24;
      text(ctx, `TWIST · ${twist.name.toUpperCase()}`, lx, cy, 12, { weight: 700, color: '#8a4fd1', spacing: 1.5 });
      cy += paragraph(ctx, twist.desc, lx, cy + 18, inner, 15, 19, { color: C.paperInk });
    }
    cy += 18;
    dashed(ctx, lx, x + w - 18, cy);
    cy += 24;
    text(ctx, 'OBJECTIVE', lx, cy, 12, { weight: 700, color: C.muted, spacing: 1.5 });
    cy += 18;
    checkbox(ctx, lx, cy - 3, 'open');
    text(ctx, round.primary.label, lx + 28, cy + 14, 23, { weight: 700, maxWidth: inner - 28 });
    cy += 30;
    cy += paragraph(ctx, round.primary.hint, lx + 28, cy + 4, inner - 28, 16, 20, { color: C.muted });
    cy += 10;
    dashed(ctx, lx, x + w - 18, cy);
    cy += 24;
    text(ctx, 'BONUS · OPTIONAL', lx, cy, 12, { weight: 700, color: C.accent, spacing: 1.5 });
    cy += 18;
    checkbox(ctx, lx, cy - 3, 'open');
    text(ctx, round.secondary.label, lx + 28, cy + 14, 20, { weight: 700, maxWidth: inner - 28 });
    cy += 30;
    text(ctx, 'Reward: one extra card pick', lx + 28, cy + 2, 15, { weight: 500, color: C.muted });
    cy += 24;
    dashed(ctx, lx, x + w - 18, cy);
    cy += 26;
    text(ctx, `TIME ${round.time}s`, lx, cy, 16, { family: F.display, weight: 400 });
    text(ctx, `Reward: ${REWARD_LABEL[round.reward]}`, x + w - 18, cy, 15, { weight: 600, color: C.muted, align: 'right' });

    const prompt = this.fine ? 'CLICK OR PRESS SPACE TO BEGIN' : 'TAP TO BEGIN';
    ctx.globalAlpha = a * pulse(this.t);
    text(ctx, prompt, x + w / 2, Math.min(this.frame.y + this.frame.h - 16, y + h + 40), 18, { family: F.display, weight: 400, color: C.paper, align: 'center', spacing: 1 });
    ctx.restore();
  }

  // Short screens (landscape phones): the same order, one line per item.
  renderShort(ctx) {
    const round = this.play.round;
    const a = this.appear;
    dim(ctx, this.frame, a * 0.7);
    const v = VARIANTS[round.variant];
    const twist = round.twist ? TWISTS[round.twist] : null;
    const h = 40 + 30 + 34 + 30 + 34 + 24;
    const { x, y, w } = this.ticketRect(520, h);
    const lx = x + 18;
    const inner = w - 36;
    ctx.save();
    ctx.globalAlpha = a;
    const tone = TYPE_TONE[round.type] ?? TYPE_TONE.standard;
    ticket(ctx, x, y, w, h, `${round.boss ? 'BOSS ORDER' : 'WORK ORDER'} · FLOOR ${round.act}-${round.floor}`, { bg: tone.bg, fg: tone.fg });
    let cy = y + 40 + 28;
    text(ctx, `${v.name.toUpperCase()}${twist ? ` · ${twist.name.toUpperCase()}` : ''}`, lx, cy, 16, { family: F.display, weight: 400, maxWidth: inner });
    cy += 34;
    checkbox(ctx, lx, cy - 15, 'open');
    text(ctx, round.primary.label, lx + 28, cy, 20, { weight: 700, maxWidth: inner - 28 });
    cy += 30;
    text(ctx, `Bonus: ${round.secondary.label}`, lx + 28, cy, 16, { weight: 600, color: C.accent, maxWidth: inner - 28 });
    cy += 30;
    text(ctx, `TIME ${round.time}s`, lx, cy, 15, { family: F.display, weight: 400 });
    text(ctx, `Reward: ${REWARD_LABEL[round.reward]}`, x + w - 18, cy, 14, { weight: 600, color: C.muted, align: 'right' });
    ctx.globalAlpha = a * pulse(this.t);
    text(ctx, this.fine ? 'CLICK OR PRESS SPACE TO BEGIN' : 'TAP TO BEGIN', x + w / 2, Math.min(this.frame.y + this.frame.h - 12, y + h + 30), 16, { family: F.display, weight: 400, color: C.paper, align: 'center', spacing: 1 });
    ctx.restore();
  }
}

// ------------------------------------------------------------- results

export class ClearOverlay extends Overlay {
  constructor(play) {
    super(play);
    this.btn = { x: 0, y: 0, w: 0, h: 50, onClick: () => this.close(() => this.play.afterClear()) };
    this.buttons = [this.btn];
    this.keys = { enter: this.btn.onClick, ' ': this.btn.onClick };
  }

  render(ctx) {
    const play = this.play;
    const round = play.round;
    const sec = round.secondary;
    const a = this.appear;
    dim(ctx, this.frame, a * 0.7);
    const h = 40 + 30 + 34 + 34 + 16 + 3 * 26 + 14 + 50 + 20;
    const { x, y, w } = this.ticketRect(420, h);
    const lx = x + 18;
    const rx = x + w - 18;

    ctx.save();
    ctx.globalAlpha = a;
    ticket(ctx, x, y, w, h, `FLOOR ${round.act}-${round.floor} · CLEARED`, { bg: C.good, fg: C.ink });
    let cy = y + 40 + 30;
    checkbox(ctx, lx, cy - 3, 'done');
    text(ctx, round.primary.label, lx + 28, cy + 13, 19, { weight: 700, maxWidth: w - 70 });
    cy += 34;
    checkbox(ctx, lx, cy - 3, sec.state);
    text(ctx, sec.label, lx + 28, cy + 13, 19, { weight: 700, color: sec.state === 'done' ? C.paperInk : C.muted, maxWidth: w - 70 });
    cy += 26;
    text(ctx, sec.state === 'done' ? 'Bonus complete: extra card unlocked' : 'Bonus missed', lx + 28, cy + 6, 15, { weight: 600, color: sec.state === 'done' ? '#2f8f57' : C.bad });
    cy += 24;
    dashed(ctx, lx, rx, cy);
    cy += 26;
    const rows = [
      ['Damage this round', String(Math.round(play.stats.damage))],
      ['Reactions', String(play.stats.reactions)],
      ['Reward', REWARD_LABEL[round.reward]],
    ];
    for (const [k, v] of rows) {
      text(ctx, k, lx, cy, 16, { weight: 500, color: C.muted });
      text(ctx, v, rx, cy, 17, { weight: 700, align: 'right' });
      cy += 26;
    }
    cy += 4;
    Object.assign(this.btn, { x: lx, y: cy, w: w - 36 });
    this.drawButton(ctx, this.btn, 'CONTINUE', { key: 'SPACE' });
    stampMark(ctx, sec.state === 'done' ? 'PERFECT' : 'PASSED', rx - 62, y + 22, sec.state === 'done' ? C.accent : C.ink, this.t - 0.2);
    ctx.restore();
  }
}

// --------------------------------------------------------------- cards

// Picks one card from an offer. Used for rewards, the starter weapon, the
// workshop and crates. Taking a weapon with a full arsenal asks what to drop.
export class CardOverlay extends Overlay {
  constructor(play, { bonus = false, onDone, offer = null, title = null, subtitle = null, rerolls = true, kinds = null, count } = {}) {
    super(play);
    this.bonus = bonus;
    this.onDone = onDone;
    this.draw = { bonus, kinds, count: count ?? play.run.choices };
    this.offer = offer ?? drawOffer(play.run, play.rng, this.draw);
    this.title = title ?? (bonus ? 'BONUS CARD' : 'PICK A CARD');
    this.subtitle = subtitle ?? `Floor ${play.round?.act}-${play.round?.floor} cleared. Choose one.`;
    this.allowReroll = rerolls && !offer;
    this.picked = null;
    this.replacing = null;
    this.rects = [];
    this.cardButtons = [];
    this.dropButtons = [];
    this.reroll = { x: 0, y: 0, w: 0, h: 44, onClick: () => this.doReroll() };
    for (let i = 1; i <= 6; i++) {
      this.keys[String(i)] = () => {
        if (this.replacing) this.dropButtons[i - 1]?.onClick();
        else if (this.offer[i - 1]) this.pick(this.offer[i - 1]);
      };
    }
    this.keys.r = () => this.doReroll();
  }

  get canReroll() {
    return this.allowReroll && this.play.run.rerolls > 0 && !this.replacing;
  }

  doReroll() {
    const run = this.play.run;
    if (!this.canReroll || this.picked) return;
    run.rerolls--;
    this.offer = drawOffer(run, this.play.rng, { ...this.draw, exclude: this.offer.map((c) => c.id) });
    if (!this.offer.length) this.offer = drawOffer(run, this.play.rng, this.draw);
    this.cardButtons = [];
    this.t = 0.2;
    this.play.sfx.select();
  }

  pick(card) {
    if (this.picked || this.replacing) return;
    if (card.kind === 'weapon' && this.play.run.slotsFull) {
      this.replacing = card;
      this.t = 0.2;
      this.play.sfx.select();
      return;
    }
    this.take(card);
  }

  take(card, drop = null) {
    this.picked = card;
    const play = this.play;
    if (drop) {
      delete play.run.weapons[drop];
      if (play.weaponId === drop) play.weaponId = 'hands';
    }
    if (card) {
      takeCard(play.run, card);
      play.sfx.card();
      if (card.kind === 'weapon') play.selectWeapon(card.icon);
    }
    play.hud.layout();
    this.close(() => this.onDone?.());
  }

  layoutCards() {
    const R = this.frame;
    const n = this.offer.length;
    const top = R.y + 110;
    const bottomRoom = this.canReroll ? 84 : 30;
    const avail = R.y + R.h - top - bottomRoom;
    const rows = R.w < 640;
    const gap = rows ? 12 : 18;
    if (rows) {
      const w = Math.min(460, R.w - 32);
      const h = clamp((avail - gap * (n - 1)) / n, 84, 140);
      const total = n * h + (n - 1) * gap;
      const y0 = top + Math.max(0, (avail - total) / 2);
      this.rects = this.offer.map((c, i) => ({ x: R.x + (R.w - w) / 2, y: y0 + i * (h + gap), w, h, rows: true }));
    } else {
      const maxW = clamp(R.w * 0.2, 210, 270);
      const w = Math.min(maxW, (R.w - 48 - gap * (n - 1)) / n);
      const h = clamp(avail, 240, maxW * 1.3);
      const total = n * w + (n - 1) * gap;
      const x0 = R.x + (R.w - total) / 2;
      const y0 = top + Math.max(0, (avail - h) / 2);
      this.rects = this.offer.map((c, i) => ({ x: x0 + i * (w + gap), y: y0, w, h, rows: false }));
    }
    const rw = Math.min(260, R.w - 32);
    Object.assign(this.reroll, { x: R.x + (R.w - rw) / 2, y: R.y + R.h - 66, w: rw });
  }

  // The "arsenal full" step: one button per droppable weapon, plus skip.
  layoutDrops() {
    const R = this.frame;
    const run = this.play.run;
    const ids = run.owned.filter((id) => id !== 'hands');
    const w = Math.min(420, R.w - 32);
    const h = 52;
    const y0 = R.y + 130;
    const old = this.dropButtons;
    this.dropButtons = ids.map((id, i) => Object.assign(old[i] ?? {}, { id, x: R.x + (R.w - w) / 2, y: y0 + i * (h + 10), w, h, onClick: () => this.take(this.replacing, id) }));
    this.keep = Object.assign(this.keep ?? {}, { x: R.x + (R.w - w) / 2, y: y0 + ids.length * (h + 10) + 14, w, h: 46, onClick: () => this.take(null) });
  }

  update(dt, isTop) {
    if (this.replacing) {
      this.layoutDrops();
      this.buttons = [...this.dropButtons, this.keep];
    } else {
      this.layoutCards();
      // Card buttons persist so hover and press state survive re-layout.
      this.cardButtons = this.offer.map((card, i) => Object.assign(this.cardButtons[i] ?? {}, this.rects[i], { onClick: () => this.pick(card) }));
      this.buttons = [...this.cardButtons];
      if (this.canReroll) this.buttons.push(this.reroll);
    }
    super.update(dt, isTop);
  }

  renderDrops(ctx) {
    this.layoutDrops();
    const R = this.frame;
    const cx = R.x + R.w / 2;
    const card = this.replacing;
    text(ctx, 'ARSENAL FULL', cx, R.y + 58, clamp(R.w * 0.06, 26, 40), { family: F.display, weight: 400, color: C.gold, align: 'center' });
    text(ctx, `You can carry ${MAX_SLOTS} weapons. Drop one to take the ${card.name}.`, cx, R.y + 88, 16, { weight: 500, color: C.paperDim, align: 'center', maxWidth: R.w - 32 });
    const run = this.play.run;
    this.dropButtons.forEach((b, i) => {
      roundRectPath(ctx, b.x, b.y, b.w, b.h, 10);
      ctx.fillStyle = b.hover ? C.paper : C.paperDim;
      ctx.fill();
      drawWeaponIcon(ctx, b.id, b.x + 32, b.y + b.h / 2, 34);
      text(ctx, `Drop ${WEAPONS[b.id].name}`, b.x + 62, b.y + b.h / 2 + 6, 18, { weight: 700 });
      text(ctx, `LV ${run.level(b.id)}`, b.x + b.w - 16, b.y + b.h / 2 + 5, 14, { weight: 700, color: C.muted, align: 'right' });
      if (this.fine) keycap(ctx, String(i + 1), b.x + b.w - 64, b.y + b.h / 2);
    });
    this.drawButton(ctx, this.keep, `KEEP MY ARSENAL`, { primary: false });
  }

  render(ctx) {
    const R = this.frame;
    const a = this.appear;
    dim(ctx, R, a * 1.4);
    ctx.save();
    ctx.globalAlpha = a;
    if (this.replacing) {
      this.renderDrops(ctx);
      ctx.restore();
      return;
    }
    this.layoutCards();
    const cx = R.x + R.w / 2;
    text(ctx, this.title, cx, R.y + 58, clamp(R.w * 0.06, 26, 40), { family: F.display, weight: 400, color: this.bonus ? C.accent : C.paper, align: 'center', maxWidth: R.w - 32 });
    const keyHint = this.fine ? `  Press 1-${this.offer.length} to pick.` : '';
    text(ctx, this.subtitle + keyHint, cx, R.y + 88, 16, { weight: 500, color: C.paperDim, align: 'center', maxWidth: R.w - 32 });

    this.offer.forEach((card, i) => {
      const r = this.rects[i];
      const delay = i * 0.06;
      const k = easeOutBack((this.t - delay) / 0.3);
      if (k <= 0) return;
      const hover = this.cardButtons[i]?.hover;
      ctx.save();
      ctx.globalAlpha = a * clamp((this.t - delay) / 0.15, 0, 1) * (this.picked && this.picked !== card ? 0.3 : 1);
      ctx.translate(r.x + r.w / 2, r.y + r.h / 2 + (1 - k) * 40 - (hover ? 8 : 0));
      const s = this.picked === card ? 1 + (this.closing >= 0 ? this.closing * 0.6 : 0) : hover ? 1.03 : 1;
      ctx.scale(s, s);
      drawCard(ctx, card, -r.w / 2, -r.h / 2, r.w, r.h, r.rows, i + 1, { hover, keys: this.fine });
      ctx.restore();
    });

    const run = this.play.run;
    if (this.canReroll) this.drawButton(ctx, this.reroll, `REROLL (${run.rerolls})`, { primary: false, key: 'R' });
    ctx.restore();
  }
}

function drawCard(ctx, card, x, y, w, h, rows, index, { hover = false, keys = false } = {}) {
  const rc = C.rarity[card.rarity] ?? C.rarity.common;
  roundRectPath(ctx, x + 3, y + (hover ? 12 : 5), w, h, 10);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fill();
  roundRectPath(ctx, x, y, w, h, 10);
  ctx.fillStyle = C.paper;
  ctx.fill();
  ctx.lineWidth = hover ? 4 : 3;
  ctx.strokeStyle = hover ? C.accent : rc;
  ctx.stroke();

  ctx.save();
  roundRectPath(ctx, x, y, w, h, 10);
  ctx.clip();
  ctx.fillStyle = rc;
  ctx.fillRect(x, y, w, 24);
  ctx.restore();
  text(ctx, KIND_LABEL[card.kind].toUpperCase(), x + 12, y + 17, 12, { weight: 700, color: C.ink, spacing: 1.2 });
  text(ctx, card.rarity.toUpperCase(), x + w - 12, y + 17, 12, { weight: 700, color: C.ink, align: 'right', spacing: 1.2 });

  const drawIcon = (cx, cy, size) => {
    roundRectPath(ctx, cx - size / 2, cy - size / 2, size, size, 10);
    ctx.fillStyle = C.ink;
    ctx.fill();
    if (card.icon) {
      drawWeaponIcon(ctx, card.icon, cx, cy - (card.badge ? 6 : 0), size * 0.62);
      if (card.badge) text(ctx, card.badge, cx, cy + size / 2 - 8, 12, { weight: 700, color: C.gold, align: 'center' });
    } else {
      const fs = clamp(size * 0.3, 14, 30) * (card.badge.length > 4 ? 0.75 : 1);
      text(ctx, card.badge, cx, cy + 2, fs, { family: F.display, weight: 400, color: card.kind === 'curse' ? C.bad : C.gold, align: 'center', baseline: 'middle', maxWidth: size - 10 });
    }
  };

  if (rows) {
    const iconSize = Math.min(h - 40, 84);
    drawIcon(x + 12 + iconSize / 2, y + 24 + (h - 24) / 2, iconSize);
    const tx = x + 24 + iconSize;
    const tw = w - (tx - x) - 12;
    let ty = y + 46;
    ctx.font = font(18, F.display, 400);
    const nameLines = wrapText(ctx, card.name.toUpperCase(), tw).slice(0, 2);
    nameLines.forEach((ln, i) => text(ctx, ln, tx, ty + i * 20, 17, { family: F.display, weight: 400, maxWidth: tw }));
    ty += nameLines.length * 20 + 2;
    ctx.font = font(15, F.body, 500);
    const descLines = wrapText(ctx, card.desc, tw);
    const maxLines = Math.max(1, Math.floor((y + h - 8 - ty) / 18) + 1);
    descLines.slice(0, maxLines).forEach((ln, i) => text(ctx, ln, tx, ty + i * 18, 15, { weight: 500, color: '#4c473e' }));
  } else {
    const iconSize = Math.min(w - 40, 100);
    drawIcon(x + w / 2, y + 36 + iconSize / 2, iconSize);
    let ty = y + 36 + iconSize + 30;
    ctx.font = font(18, F.display, 400);
    const nameLines = wrapText(ctx, card.name.toUpperCase(), w - 24).slice(0, 2);
    nameLines.forEach((ln, i) => text(ctx, ln, x + w / 2, ty + i * 21, 18, { family: F.display, weight: 400, align: 'center', maxWidth: w - 24 }));
    ty += nameLines.length * 21 + 6;
    paragraph(ctx, card.desc, x + w / 2, ty, w - 28, 16, 20, { color: '#4c473e', align: 'center' });
    if (keys) {
      ctx.font = font(12, F.body, 700);
      const kw = Math.max(22, ctx.measureText(String(index)).width + 12);
      keycap(ctx, String(index), x + (w - kw) / 2, y + h - 20);
    }
  }
}

// ----------------------------------------------------------------- pause

export class PauseOverlay extends Overlay {
  constructor(play) {
    super(play);
    this.blocksUpdate = true;
    const mk = (onClick) => ({ x: 0, y: 0, w: 0, h: 48, onClick });
    this.resume = mk(() => this.close());
    this.restart = mk(() => this.close(() => this.play.newRun()));
    this.quit = mk(() => this.close(() => this.play.quitToTitle()));
    this.buttons = [this.resume, this.restart, this.quit];
    this.keys = { escape: this.resume.onClick, p: this.resume.onClick, enter: this.resume.onClick };
  }

  render(ctx) {
    const play = this.play;
    const a = this.appear;
    dim(ctx, this.frame, a * 1.1);
    const showCodex = this.frame.h >= 560;
    const codexH = showCodex ? 34 + REACTION_IDS.length * 40 : 0;
    const h = 40 + 34 + 26 + 3 * 58 + 10 + codexH;
    const { x, y, w } = this.ticketRect(showCodex ? 440 : 360, h, false);
    ctx.save();
    ctx.globalAlpha = a;
    ticket(ctx, x, y, w, h, 'PAUSED');
    text(ctx, `Floor ${play.round.act}-${play.round.floor} · ${Math.ceil(Math.max(0, play.timeLeft))}s left on the clock`, x + 18, y + 40 + 34, 16, { weight: 600, color: C.muted, maxWidth: w - 36 });
    if (showCodex) this.renderCodex(ctx, x + 18, y + 40 + 34 + 26 + 3 * 58 + 18, w - 36);
    let by = y + 40 + 34 + 22;
    for (const [b, label, primary, key] of [[this.resume, 'RESUME', true, 'ESC'], [this.restart, 'NEW RUN', false], [this.quit, 'QUIT TO TITLE', false]]) {
      Object.assign(b, { x: x + 18, y: by, w: w - 36 });
      if (!primary) {
        roundRectPath(ctx, b.x, b.y, b.w, b.h, 10);
        ctx.fillStyle = b.hover ? C.paperDim : 'rgba(0,0,0,0)';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = C.paperDim;
        ctx.stroke();
        text(ctx, label, b.x + b.w / 2, b.y + b.h / 2 + 1, 16, { family: F.display, weight: 400, color: C.paperInk, align: 'center', baseline: 'middle', spacing: 0.5 });
      } else {
        this.drawButton(ctx, b, label, { key });
      }
      by += 58;
    }
    ctx.restore();
  }

  // The reactions you've found, and hints for the rest.
  renderCodex(ctx, x, y, w) {
    const found = this.play.status.discovered;
    dashed(ctx, x, x + w, y - 8);
    text(ctx, `REACTIONS \u00b7 ${found.size}/${REACTION_IDS.length} FOUND`, x, y + 12, 12, { weight: 700, color: C.muted, spacing: 1.5 });
    let cy = y + 38;
    for (const id of REACTION_IDS) {
      const r = REACTIONS[id];
      const known = found.has(id);
      ctx.fillStyle = known ? r.color : C.paperDim;
      ctx.beginPath();
      ctx.arc(x + 6, cy - 5, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      text(ctx, known ? r.name : '???', x + 20, cy, 16, { weight: 700, color: known ? C.paperInk : C.muted });
      text(ctx, known ? r.desc : `Hint: ${r.hint}`, x + 20, cy + 17, 13, { weight: 500, color: C.muted, maxWidth: w - 20 });
      cy += 40;
    }
  }
}

// ---------------------------------------------------------------- routes

// Pick the next work order from up to three tickets.
export class RouteOverlay extends Overlay {
  constructor(play, route, onPick) {
    super(play);
    this.route = route;
    this.onPick = onPick;
    this.tickets = route.map((node, i) => ({ node, x: 0, y: 0, w: 0, h: 0, onClick: () => this.choose(i) }));
    this.buttons = this.tickets;
    route.forEach((_, i) => {
      this.keys[String(i + 1)] = () => this.choose(i);
    });
    if (route.length === 1) this.keys.enter = this.keys[' '] = () => this.choose(0);
  }

  choose(i) {
    const node = this.route[i];
    this.play.sfx.card();
    this.close(() => this.onPick(node));
  }

  layoutTickets() {
    const R = this.frame;
    const n = this.tickets.length;
    const top = R.y + 112;
    const avail = R.y + R.h - top - 24;
    this.rows = R.w < 760;
    const gap = 14;
    if (this.rows) {
      const w = Math.min(460, R.w - 32);
      const h = clamp((avail - gap * (n - 1)) / n, 120, 170);
      const y0 = top + Math.max(0, (avail - (n * h + (n - 1) * gap)) / 2);
      this.tickets.forEach((t, i) => Object.assign(t, { x: R.x + (R.w - w) / 2, y: y0 + i * (h + gap), w, h }));
    } else {
      const w = Math.min(280, (R.w - 48 - gap * (n - 1)) / n);
      const h = clamp(avail, 240, 270);
      const x0 = R.x + (R.w - (n * w + (n - 1) * gap)) / 2;
      this.tickets.forEach((t, i) => Object.assign(t, { x: x0 + i * (w + gap), y: top + Math.max(0, (avail - h) / 2), w, h }));
    }
  }

  update(dt, isTop) {
    this.layoutTickets();
    super.update(dt, isTop);
  }

  render(ctx) {
    const R = this.frame;
    const run = this.play.run;
    const a = this.appear;
    dim(ctx, R, a * 1.4);
    this.layoutTickets();
    ctx.save();
    ctx.globalAlpha = a;
    const cx = R.x + R.w / 2;
    const boss = this.route[0].type === 'boss';
    text(ctx, boss ? 'BOSS FLOOR' : 'CHOOSE THE NEXT JOB', cx, R.y + 58, clamp(R.w * 0.055, 24, 38), { family: F.display, weight: 400, color: boss ? C.bad : C.paper, align: 'center', maxWidth: R.w - 32 });
    const keyHint = this.fine && !boss ? '  Press 1-3.' : '';
    text(ctx, `Act ${run.act} \u00b7 ${run.actDef.name} \u00b7 floor ${run.floor} of ${FLOORS_PER_ACT}${run.loop ? ` \u00b7 endless ${run.loop}` : ''}${keyHint}`, cx, R.y + 88, 16, { weight: 500, color: C.paperDim, align: 'center', maxWidth: R.w - 32 });
    this.tickets.forEach((t, i) => {
      const k = easeOutBack((this.t - i * 0.07) / 0.3);
      if (k <= 0) return;
      ctx.save();
      ctx.translate(0, (1 - k) * 40 - (t.hover ? 6 : 0));
      this.drawTicket(ctx, t, i);
      ctx.restore();
    });
    ctx.restore();
  }

  drawTicket(ctx, t, i) {
    const node = t.node;
    const tone = TYPE_TONE[node.type];
    const { x, y, w, h } = t;
    const lx = x + 16;
    const inner = w - 32;
    let header = tone.label;
    if (node.type === 'crate') header += ` \u00b7 ${TWISTS[node.twist].name.toUpperCase()}`;
    ticket(ctx, x, y, w, h, header, { bg: tone.bg, fg: tone.fg });
    if (t.hover) {
      roundRectPath(ctx, x, y, w, h, 8);
      ctx.strokeStyle = C.accent;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    if (this.fine && this.tickets.length > 1) keycap(ctx, String(i + 1), x + w - 36, y + 20);
    let cy = y + 72;
    if (node.type === 'workshop') {
      text(ctx, 'NO FIGHT', lx, cy, 18, { family: F.display, weight: 400 });
      paragraph(ctx, 'Skip this floor and upgrade one of your weapons instead.', lx, cy + 26, inner, 15, 19, { color: C.muted });
      text(ctx, 'Reward: weapon upgrade', lx, y + h - 18, 15, { weight: 700, color: '#8a6a10' });
      return;
    }
    const round = node.round;
    const v = VARIANTS[node.variant];
    text(ctx, v.name.toUpperCase(), lx, cy, 17, { family: F.display, weight: 400, maxWidth: inner });
    cy += 8;
    if (!this.rows) {
      cy += paragraph(ctx, v.desc, lx, cy + 14, inner, 14, 18, { color: C.muted });
      if (node.twist) cy += paragraph(ctx, TWISTS[node.twist].desc, lx, cy + 18, inner, 14, 18, { color: '#7b4fc4' }) + 4;
      cy += 14;
      dashed(ctx, lx, x + w - 16, cy);
      cy += 12;
    }
    cy += 22;
    text(ctx, round.primary.label, lx, cy, 18, { weight: 700, maxWidth: inner });
    cy += 22;
    text(ctx, `Bonus: ${round.secondary.label}`, lx, cy, 14, { weight: 600, color: C.accent, maxWidth: inner });
    const fy = y + h - 18;
    text(ctx, `Reward: ${REWARD_LABEL[round.reward]}`, lx, fy, 15, { weight: 700, color: C.paperInk, maxWidth: inner - 50 });
    text(ctx, `${round.time}s`, x + w - 16, fy, 15, { family: F.display, weight: 400, align: 'right' });
  }
}

// --------------------------------------------------------------- acts

export class ActOverlay extends Overlay {
  constructor(play, onDone) {
    super(play);
    const go = () => this.close(onDone);
    this.tapAnywhere = go;
    this.keys = { enter: go, ' ': go };
  }

  update(dt, isTop) {
    super.update(dt, isTop);
    if (isTop) this.play.engine.cursor = 'pointer';
  }

  render(ctx) {
    const R = this.frame;
    const run = this.play.run;
    const act = run.actDef;
    const a = this.appear;
    dim(ctx, R, a * 1.2);
    ctx.save();
    ctx.globalAlpha = a;
    const cx = R.x + R.w / 2;
    const cy = R.y + R.h * 0.4;
    const k = easeOutBack(this.t / 0.4);
    text(ctx, run.loop ? `ENDLESS ${run.loop} \u00b7 ACT ${run.act}` : `ACT ${run.act}`, cx, cy - 70, 18, { family: F.display, weight: 400, color: C.gold, align: 'center', spacing: 2 });
    ctx.save();
    ctx.translate(cx, cy - 20);
    ctx.scale(k, k);
    text(ctx, act.name.toUpperCase(), 0, 0, clamp(R.w * 0.09, 34, 72), { family: F.display, weight: 400, color: C.paper, align: 'center', baseline: 'middle', maxWidth: R.w - 32 });
    ctx.restore();
    paragraph(ctx, act.blurb, cx, cy + 36, Math.min(460, R.w - 48), 18, 24, { color: C.paperDim, align: 'center' });
    // Act progress: three stops, the current one filled.
    for (let i = 0; i < ACTS.length; i++) {
      const dx = (i - 1) * 46;
      ctx.beginPath();
      ctx.arc(cx + dx, cy + 110, 9, 0, Math.PI * 2);
      ctx.fillStyle = i < run.act - 1 ? C.good : i === run.act - 1 ? C.gold : C.inkSoft;
      ctx.fill();
      ctx.strokeStyle = C.paperDim;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    text(ctx, `Boss: ${VARIANTS[act.boss].name}`, cx, cy + 148, 16, { weight: 600, color: C.muted, align: 'center' });
    ctx.globalAlpha = a * pulse(this.t);
    text(ctx, this.fine ? 'CLICK OR PRESS SPACE' : 'TAP TO CONTINUE', cx, Math.min(R.y + R.h - 24, cy + 196), 18, { family: F.display, weight: 400, color: C.paper, align: 'center', spacing: 1 });
    ctx.restore();
  }
}

// ------------------------------------------------------------- run end

export class SecondWindOverlay extends Overlay {
  constructor(play) {
    super(play);
    this.btn = { x: 0, y: 0, w: 0, h: 50, onClick: () => this.close(() => this.play.retryRound()) };
    this.buttons = [this.btn];
    this.keys = { enter: this.btn.onClick, ' ': this.btn.onClick };
  }

  render(ctx) {
    const a = this.appear;
    dim(ctx, this.frame, a * 0.75);
    const h = 220;
    const { x, y, w } = this.ticketRect(380, h, false);
    ctx.save();
    ctx.globalAlpha = a;
    ticket(ctx, x, y, w, h, 'SECOND WIND', { bg: C.gold, fg: C.ink });
    paragraph(ctx, `Time ran out on floor ${this.play.round.act}-${this.play.round.floor}, but your Second Wind card saves the run. You get a fresh work order for the same floor.`, x + 18, y + 76, w - 36, 17, 22, {});
    Object.assign(this.btn, { x: x + 18, y: y + h - 68, w: w - 36 });
    this.drawButton(ctx, this.btn, 'RETRY ROUND', { key: 'SPACE' });
    ctx.restore();
  }
}

export class GameOverOverlay extends Overlay {
  constructor(play) {
    super(play);
    this.btn = { x: 0, y: 0, w: 0, h: 50, onClick: () => this.close(() => this.play.newRun()) };
    this.buttons = [this.btn];
    this.keys = { enter: this.btn.onClick, ' ': this.btn.onClick };
  }

  render(ctx) {
    const play = this.play;
    const run = play.run;
    const a = this.appear;
    dim(ctx, this.frame, a * 0.8);
    const fav = Object.entries(run.weaponDamage).sort((p, q) => q[1] - p[1])[0]?.[0];
    const rows = runRows(run, fav).slice(0, this.frame.h < 480 ? 2 : 99);
    const cards = run.taken.length ? run.taken.join(', ') : 'None';
    const w0 = Math.min(420, this.frame.w - 32);
    ctx.font = font(15, F.body, 500);
    const cardLines = Math.min(this.frame.h < 480 ? 1 : 4, wrapText(ctx, cards, w0 - 36).length);
    const h = 40 + 44 + 38 + rows.length * 25 + 16 + 22 + cardLines * 19 + 20 + 50 + 18;
    const { x, y, w } = this.ticketRect(w0, h);
    const lx = x + 18;
    const rx = x + w - 18;

    ctx.save();
    ctx.globalAlpha = a;
    ticket(ctx, x, y, w, h, 'RUN OVER', { bg: C.bad, fg: C.paper });
    let cy = y + 40 + 44;
    text(ctx, `REACHED FLOOR ${play.round.act}-${play.round.floor}`, lx, cy, 26, { family: F.display, weight: 400, maxWidth: w - 36 });
    cy += 14;
    text(ctx, play.round.number >= play.bestDepth ? 'New best run' : `Best: floor ${floorName(play.bestDepth)}`, lx, cy + 14, 15, { weight: 600, color: C.muted });
    cy += 42;
    for (const [k, v] of rows) {
      text(ctx, k, lx, cy, 16, { weight: 500, color: C.muted });
      text(ctx, v, rx, cy, 17, { weight: 700, align: 'right' });
      cy += 25;
    }
    dashed(ctx, lx, rx, cy - 8);
    cy += 14;
    text(ctx, 'CARDS TAKEN', lx, cy, 12, { weight: 700, color: C.muted, spacing: 1.5 });
    cy += 20;
    ctx.font = font(15, F.body, 500);
    wrapText(ctx, cards, w - 36).slice(0, cardLines).forEach((ln, i) => text(ctx, ln, lx, cy + i * 19, 15, { weight: 500 }));
    cy += cardLines * 19 + 8;
    Object.assign(this.btn, { x: lx, y: cy, w: w - 36 });
    this.drawButton(ctx, this.btn, 'NEW RUN', { key: 'SPACE' });
    stampMark(ctx, 'VOID', rx - 44, y + 22, C.ink, this.t - 0.25);
    ctx.restore();
  }
}

function runRows(run, fav) {
  return [
    ['Floors cleared', String(run.totals.cleared)],
    ['Bonuses completed', String(run.totals.bonuses)],
    ['Reactions triggered', String(run.totals.reactions)],
    ['Damage dealt', String(Math.round(run.totals.damage))],
    ['Dummies destroyed', String(run.totals.kills)],
    ['Limbs torn off', String(run.totals.severs)],
    ['Favorite weapon', fav ? WEAPONS[fav].name : '-'],
  ];
}

export class VictoryOverlay extends Overlay {
  constructor(play) {
    super(play);
    this.endless = { x: 0, y: 0, w: 0, h: 50, onClick: () => this.close(() => this.play.goEndless()) };
    this.fresh = { x: 0, y: 0, w: 0, h: 46, onClick: () => this.close(() => this.play.newRun()) };
    this.buttons = [this.endless, this.fresh];
    this.keys = { enter: this.endless.onClick, ' ': this.endless.onClick };
  }

  render(ctx) {
    const run = this.play.run;
    const a = this.appear;
    dim(ctx, this.frame, a * 0.9);
    const fav = Object.entries(run.weaponDamage).sort((p, q) => q[1] - p[1])[0]?.[0];
    const rows = runRows(run, fav).slice(0, this.frame.h < 480 ? 2 : 99);
    const h = 40 + 44 + 40 + rows.length * 25 + 20 + 50 + 12 + 46 + 18;
    const { x, y, w } = this.ticketRect(420, h);
    const lx = x + 18;
    const rx = x + w - 18;
    ctx.save();
    ctx.globalAlpha = a;
    ticket(ctx, x, y, w, h, 'RUN COMPLETE', { bg: C.good, fg: C.ink });
    let cy = y + 40 + 44;
    text(ctx, 'ALL THREE ACTS CLEARED', lx, cy, 24, { family: F.display, weight: 400, maxWidth: w - 36 });
    cy += 26;
    text(ctx, `Wins so far: ${this.play.wins}. Keep going for endless floors with tougher dummies.`, lx, cy, 15, { weight: 600, color: C.muted, maxWidth: w - 36 });
    cy += 30;
    for (const [k, v] of rows) {
      text(ctx, k, lx, cy, 16, { weight: 500, color: C.muted });
      text(ctx, v, rx, cy, 17, { weight: 700, align: 'right' });
      cy += 25;
    }
    cy += 8;
    Object.assign(this.endless, { x: lx, y: cy, w: w - 36 });
    this.drawButton(ctx, this.endless, 'KEEP GOING', { key: 'SPACE' });
    cy += 62;
    Object.assign(this.fresh, { x: lx, y: cy, w: w - 36 });
    roundRectPath(ctx, this.fresh.x, this.fresh.y, this.fresh.w, this.fresh.h, 10);
    ctx.fillStyle = this.fresh.hover ? C.paperDim : 'rgba(0,0,0,0)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = C.paperDim;
    ctx.stroke();
    text(ctx, 'NEW RUN', this.fresh.x + this.fresh.w / 2, this.fresh.y + this.fresh.h / 2 + 1, 16, { family: F.display, weight: 400, color: C.paperInk, align: 'center', baseline: 'middle' });
    stampMark(ctx, 'APPROVED', rx - 70, y + 22, C.ink, this.t - 0.25);
    ctx.restore();
  }
}
