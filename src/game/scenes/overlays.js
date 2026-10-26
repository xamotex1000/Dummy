// Overlay scenes drawn on top of the arena. Paperwork is the UI motif:
// each round is a work order, results are stamped, cards are drafted.

import { roundRectPath, wrapText } from '../../engine/renderer.js';
import { clamp, easeOutCubic, easeOutBack } from '../../engine/math.js';
import { drawWeaponIcon } from '../icons.js';
import { WEAPONS } from '../weapons.js';
import { drawOffer, takeCard, KIND_LABEL } from '../cards.js';
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
  if (!opts.measure) lines.forEach((ln, i) => text(ctx, ln, x, y + i * lineH, size, { weight: 500, ...opts }));
  return lines.length * lineH;
}

function dim(ctx, L, a) {
  ctx.fillStyle = `rgba(14,17,13,${0.64 * a})`;
  ctx.fillRect(0, 0, L.w, L.h);
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
  const k = t < 0.18 ? 2 - (t / 0.18) : 1;
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
    if (!isTop || this.t < 0.2) return;
    const input = this.play.input;
    const p = input.pointer;
    for (const key of input.keysPressed) this.keys[key]?.();
    if (p.pressed) for (const b of this.buttons) b.armed = hit(b, p.x, p.y);
    if (p.released) {
      const b = this.buttons.find((bb) => bb.armed && hit(bb, p.x, p.y));
      for (const bb of this.buttons) bb.armed = false;
      if (b) b.onClick();
      else if (this.tapAnywhere) this.tapAnywhere();
    }
  }

  drawButton(ctx, b, label, { primary = true } = {}) {
    const down = b.armed ? 2 : 0;
    roundRectPath(ctx, b.x, b.y + down, b.w, b.h, 10);
    ctx.fillStyle = primary ? C.ink : 'rgba(0,0,0,0)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = primary ? C.ink : C.paperDim;
    ctx.stroke();
    text(ctx, label, b.x + b.w / 2, b.y + b.h / 2 + down + 1, 16, { family: F.display, weight: 400, color: primary ? C.paper : C.paper, align: 'center', baseline: 'middle', spacing: 0.5 });
  }
}

// ---------------------------------------------------------------- title

export class TitleOverlay extends Overlay {
  constructor(play) {
    super(play);
    this.tapAnywhere = () => this.close(() => this.play.newRun());
    this.keys = { enter: this.tapAnywhere, ' ': this.tapAnywhere };
  }

  render(ctx) {
    const L = this.L;
    const a = this.appear;
    dim(ctx, L, a * 0.9);
    ctx.save();
    ctx.globalAlpha = a;
    const size = clamp(L.w * 0.19, 52, 112);
    const cy = L.h * 0.3;
    ctx.save();
    ctx.translate(L.w / 2, cy);
    ctx.rotate(-0.06);
    for (const [word, dy, col] of [['DUMMY', 0, C.paper], ['RUN', size * 0.92, C.gold]]) {
      text(ctx, word, 5, dy + 6, size, { family: F.display, weight: 400, color: C.accent, align: 'center', baseline: 'middle' });
      text(ctx, word, 0, dy, size, { family: F.display, weight: 400, color: col, align: 'center', baseline: 'middle' });
    }
    ctx.restore();

    const w = Math.min(380, L.w - 48);
    let y = cy + size * 1.75;
    y += paragraph(ctx, 'Beat up a test dummy to meet each round’s work order. Hit the optional bonus for an extra card. Draft weapons and mods between rounds. Run out of time and the run is over.', L.w / 2, y, w, 17, 23, { color: C.paperDim, align: 'center' });

    const pulse = 0.55 + 0.45 * Math.sin(this.t * 4);
    ctx.globalAlpha = a * pulse;
    text(ctx, 'TAP TO START', L.w / 2, Math.max(y + 46, L.h * 0.74), 22, { family: F.display, weight: 400, color: C.paper, align: 'center', spacing: 1 });
    ctx.globalAlpha = a;
    if (this.play.bestRound > 0) {
      text(ctx, `Best run: round ${this.play.bestRound}`, L.w / 2, Math.max(y + 76, L.h * 0.74 + 30), 15, { color: C.muted, align: 'center' });
    }
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

  render(ctx) {
    const L = this.L;
    const round = this.play.round;
    const a = this.appear;
    dim(ctx, L, a * 0.7);
    const w = Math.min(400, L.w - 32);
    const inner = w - 36;

    // Measure body height first so the ticket can be centered.
    ctx.font = font(16, F.body, 500);
    const hintH = wrapText(ctx, round.primary.hint, inner - 28).length * 20;
    const h = 40 + 26 + 18 + 30 + hintH + 22 + 18 + 30 + 22 + 30 + 34;
    const x = (L.w - w) / 2;
    const y = Math.max(L.arenaTop - 60, (L.h - h) / 2 - 20) + (1 - easeOutBack(this.t / 0.35)) * 60;

    ctx.save();
    ctx.globalAlpha = a;
    const header = `${round.boss ? 'BOSS ORDER' : 'WORK ORDER'} · ROUND ${round.number}`;
    ticket(ctx, x, y, w, h, header, round.boss ? { bg: C.bad, fg: C.paper } : {});
    let cy = y + 40 + 26;
    const lx = x + 18;
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
    if (round.cardAfter) text(ctx, 'Card pick after this round', x + w - 18, cy, 15, { weight: 600, color: C.muted, align: 'right' });

    const pulse = 0.55 + 0.45 * Math.sin(this.t * 4);
    ctx.globalAlpha = a * pulse;
    text(ctx, 'TAP TO BEGIN', L.w / 2, Math.min(L.h - 16, y + h + 40), 18, { family: F.display, weight: 400, color: C.paper, align: 'center', spacing: 1 });
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
    const L = this.L;
    const play = this.play;
    const round = play.round;
    const sec = round.secondary;
    const a = this.appear;
    dim(ctx, L, a * 0.7);
    const w = Math.min(400, L.w - 32);
    const h = 40 + 30 + 34 + 34 + 16 + 3 * 26 + 14 + 50 + 20;
    const x = (L.w - w) / 2;
    const y = (L.h - h) / 2 + (1 - easeOutBack(this.t / 0.35)) * 60;
    const lx = x + 18;
    const rx = x + w - 18;

    ctx.save();
    ctx.globalAlpha = a;
    ticket(ctx, x, y, w, h, `ROUND ${round.number} · CLEARED`, { bg: C.good, fg: C.ink });
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
    const next = sec.state === 'done' || round.cardAfter ? 'Card pick' : `Round ${round.number + 1}`;
    const rows = [
      ['Damage this round', String(Math.round(play.stats.damage))],
      ['Time left', `${Math.ceil(Math.max(0, play.timeLeft))}s`],
      ['Up next', next],
    ];
    for (const [k, v] of rows) {
      text(ctx, k, lx, cy, 16, { weight: 500, color: C.muted });
      text(ctx, v, rx, cy, 17, { weight: 700, align: 'right' });
      cy += 26;
    }
    cy += 4;
    Object.assign(this.btn, { x: lx, y: cy, w: w - 36 });
    this.drawButton(ctx, this.btn, 'CONTINUE');
    stampMark(ctx, sec.state === 'done' ? 'PERFECT' : 'PASSED', rx - 62, y + 22, sec.state === 'done' ? C.accent : C.ink, this.t - 0.2);
    ctx.restore();
  }
}

// --------------------------------------------------------------- cards

export class CardOverlay extends Overlay {
  constructor(play, { bonus = false, onDone }) {
    super(play);
    this.bonus = bonus;
    this.onDone = onDone;
    this.offer = drawOffer(play.run, play.rng, { bonus });
    this.picked = null;
    this.rects = [];
    this.reroll = { x: 0, y: 0, w: 0, h: 44, onClick: () => this.doReroll() };
    for (let i = 1; i <= 5; i++) this.keys[String(i)] = () => this.offer[i - 1] && this.pick(this.offer[i - 1]);
    this.keys.r = () => this.doReroll();
  }

  doReroll() {
    const run = this.play.run;
    if (run.rerolls <= 0 || this.picked) return;
    run.rerolls--;
    this.offer = drawOffer(run, this.play.rng, { bonus: this.bonus, exclude: this.offer.map((c) => c.id) });
    if (!this.offer.length) this.offer = drawOffer(run, this.play.rng, { bonus: this.bonus });
    this.t = 0.2;
    this.play.sfx.select();
  }

  pick(card) {
    if (this.picked) return;
    this.picked = card;
    const play = this.play;
    takeCard(play.run, card);
    play.sfx.card();
    play.hud.layout();
    if (card.kind === 'weapon') play.selectWeapon(card.icon);
    this.close(() => this.onDone?.());
  }

  layoutCards() {
    const L = this.L;
    const n = this.offer.length;
    const top = 110;
    const bottomRoom = this.play.run.rerolls > 0 ? 80 : 30;
    const avail = L.h - top - bottomRoom;
    const rows = L.w < 640;
    const gap = 12;
    if (rows) {
      const w = Math.min(460, L.w - 32);
      const h = clamp((avail - gap * (n - 1)) / n, 84, 140);
      const total = n * h + (n - 1) * gap;
      const y0 = top + Math.max(0, (avail - total) / 2);
      this.rects = this.offer.map((c, i) => ({ x: (L.w - w) / 2, y: y0 + i * (h + gap), w, h, rows: true }));
    } else {
      const w = Math.min(220, (L.w - 48 - gap * (n - 1)) / n);
      const h = clamp(avail, 240, 290);
      const total = n * w + (n - 1) * gap;
      const x0 = (L.w - total) / 2;
      const y0 = top + Math.max(0, (avail - h) / 2);
      this.rects = this.offer.map((c, i) => ({ x: x0 + i * (w + gap), y: y0, w, h, rows: false }));
    }
    const rw = Math.min(240, L.w - 32);
    Object.assign(this.reroll, { x: (L.w - rw) / 2, y: L.h - 64, w: rw });
  }

  update(dt, isTop) {
    this.layoutCards();
    this.buttons = [
      ...this.offer.map((card, i) => ({ ...this.rects[i], onClick: () => this.pick(card), armed: this.buttons[i]?.armed })),
    ];
    if (this.play.run.rerolls > 0) this.buttons.push(this.reroll);
    super.update(dt, isTop);
  }

  render(ctx) {
    const L = this.L;
    const a = this.appear;
    dim(ctx, L, a * 1.4);
    this.layoutCards();
    ctx.save();
    ctx.globalAlpha = a;
    text(ctx, this.bonus ? 'BONUS CARD' : 'PICK A CARD', L.w / 2, 56, clamp(L.w * 0.08, 26, 38), { family: F.display, weight: 400, color: this.bonus ? C.accent : C.paper, align: 'center' });
    const sub = this.bonus ? 'You hit the bonus. Take one more.' : `Round ${this.play.round.number} cleared. Choose one.`;
    text(ctx, sub, L.w / 2, 84, 16, { weight: 500, color: C.paperDim, align: 'center' });

    const p = this.play.input.pointer;
    this.offer.forEach((card, i) => {
      const r = this.rects[i];
      const delay = i * 0.06;
      const k = easeOutBack((this.t - delay) / 0.3);
      if (k <= 0) return;
      const hover = p.type === 'mouse' && p.inside && hit(r, p.x, p.y);
      ctx.save();
      ctx.globalAlpha = a * clamp((this.t - delay) / 0.15, 0, 1) * (this.picked && this.picked !== card ? 0.3 : 1);
      ctx.translate(r.x + r.w / 2, r.y + r.h / 2 + (1 - k) * 40 - (hover ? 4 : 0));
      const s = this.picked === card ? 1 + (this.closing >= 0 ? this.closing * 0.6 : 0) : 1;
      ctx.scale(s, s);
      drawCard(ctx, card, -r.w / 2, -r.h / 2, r.w, r.h, r.rows, i + 1);
      ctx.restore();
    });

    const run = this.play.run;
    if (run.rerolls > 0) this.drawButton(ctx, this.reroll, `REROLL (${run.rerolls})`, { primary: false });
    ctx.restore();
  }
}

function drawCard(ctx, card, x, y, w, h, rows, index) {
  const rc = C.rarity[card.rarity] ?? C.rarity.common;
  roundRectPath(ctx, x + 3, y + 5, w, h, 10);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fill();
  roundRectPath(ctx, x, y, w, h, 10);
  ctx.fillStyle = C.paper;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = rc;
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
    const iconSize = Math.min(w - 40, 96);
    drawIcon(x + w / 2, y + 34 + iconSize / 2, iconSize);
    let ty = y + 34 + iconSize + 30;
    ctx.font = font(18, F.display, 400);
    const nameLines = wrapText(ctx, card.name.toUpperCase(), w - 24).slice(0, 2);
    nameLines.forEach((ln, i) => text(ctx, ln, x + w / 2, ty + i * 21, 18, { family: F.display, weight: 400, align: 'center', maxWidth: w - 24 }));
    ty += nameLines.length * 21 + 6;
    paragraph(ctx, card.desc, x + w / 2, ty, w - 28, 16, 20, { color: '#4c473e', align: 'center' });
    text(ctx, String(index), x + w / 2, y + h - 12, 12, { weight: 700, color: C.muted, align: 'center' });
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
    const L = this.L;
    const a = this.appear;
    dim(ctx, L, a * 0.75);
    const w = Math.min(380, L.w - 32);
    const h = 220;
    const x = (L.w - w) / 2;
    const y = (L.h - h) / 2;
    ctx.save();
    ctx.globalAlpha = a;
    ticket(ctx, x, y, w, h, 'SECOND WIND', { bg: C.gold, fg: C.ink });
    let cy = y + 76;
    cy += paragraph(ctx, `Time ran out on round ${this.play.round.number}, but your Second Wind card saves the run. You get a fresh work order for the same round.`, x + 18, cy, w - 36, 17, 22, {});
    Object.assign(this.btn, { x: x + 18, y: y + h - 68, w: w - 36 });
    this.drawButton(ctx, this.btn, 'RETRY ROUND');
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
    const L = this.L;
    const play = this.play;
    const run = play.run;
    const a = this.appear;
    dim(ctx, L, a * 0.8);
    const w = Math.min(400, L.w - 32);
    const x = (L.w - w) / 2;
    const lx = x + 18;
    const rx = x + w - 18;
    const fav = Object.entries(run.weaponDamage).sort((p, q) => q[1] - p[1])[0]?.[0];
    const rows = [
      ['Rounds cleared', String(run.totals.cleared)],
      ['Bonuses completed', String(run.totals.bonuses)],
      ['Damage dealt', String(Math.round(run.totals.damage))],
      ['Dummies destroyed', String(run.totals.kills)],
      ['Limbs torn off', String(run.totals.severs)],
      ['Favorite weapon', fav ? WEAPONS[fav].name : '-'],
    ];
    const cards = run.taken.length ? run.taken.join(', ') : 'None';
    ctx.font = font(15, F.body, 500);
    const cardLines = Math.min(4, wrapText(ctx, cards, w - 36).length);
    const h = 40 + 44 + 38 + rows.length * 25 + 16 + 22 + cardLines * 19 + 20 + 50 + 18;
    const y = Math.max(8, (L.h - h) / 2) + (1 - easeOutBack(this.t / 0.35)) * 60;

    ctx.save();
    ctx.globalAlpha = a;
    ticket(ctx, x, y, w, h, 'RUN OVER', { bg: C.bad, fg: C.paper });
    let cy = y + 40 + 44;
    text(ctx, `REACHED ROUND ${play.round.number}`, lx, cy, 26, { family: F.display, weight: 400, maxWidth: w - 36 });
    cy += 14;
    text(ctx, play.round.number >= play.bestRound ? 'New best run' : `Best: round ${play.bestRound}`, lx, cy + 14, 15, { weight: 600, color: C.muted });
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
    wrapText(ctx, cards, w - 36).slice(0, 4).forEach((ln, i) => text(ctx, ln, lx, cy + i * 19, 15, { weight: 500 }));
    cy += cardLines * 19 + 8;
    Object.assign(this.btn, { x: lx, y: cy, w: w - 36 });
    this.drawButton(ctx, this.btn, 'NEW RUN');
    stampMark(ctx, 'VOID', rx - 44, y + 22, C.ink, this.t - 0.25);
    ctx.restore();
  }
}
