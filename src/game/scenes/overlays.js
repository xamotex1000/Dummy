// Overlay scenes drawn on top of the arena. Every menu is a crash test
// report (see sheet.js for the paper): a masthead with a calibration target,
// numbered sections, form fields with typed values, injury ratings and an
// inspector's stamp.

import { roundRectPath, capsulePath, wrapText } from '../../engine/renderer.js';
import { clamp, easeOutCubic, easeOutBack } from '../../engine/math.js';
import { drawWeaponIcon, drawTarget as target } from '../icons.js';
import { WEAPONS } from '../weapons.js';
import { DISCIPLINES, DISCIPLINE_IDS, sourceTags, trapTags } from '../tags.js';
import { MODS } from '../mods.js';
import { AFFIXES } from '../affixes.js';
import { drawOffer, takeCard, KIND_LABEL } from '../cards.js';
import { REWARD_LABEL } from '../objectives.js';
import { VARIANTS, ACTS, TWISTS, FLOORS_PER_ACT } from '../variants.js';
import { REACTIONS, REACTION_IDS } from '../reactions.js';
import { TRAPS, mountPoints, createTrap, drawTrapIcon, SURFACE_LABEL } from '../traps.js';
import { settings, setSetting } from '../settings.js';
import { meta } from '../meta.js';
import { loadRun } from '../save.js';
import { topScores } from '../scores.js';
import { progress, setRating, RATINGS, CERTS } from '../progress.js';
import { MUTATORS } from '../daily.js';
import { TreeOverlay } from './tree-overlay.js';
import { ScoresOverlay } from './records.js';
import { C, F, font } from '../theme.js';
import {
  TAU, HEAD, FOOT, TODAY, shadows, text, mono, caption, measure, paragraph, dim, keyW, keycap, hazard, rule, report, fields, section, checkbox, gearButton, toggle, verdict, stampMark, hit, pulse, floorName, kicker, Printer, drawTorn, Overlay, setShadows,
} from './sheet.js';

// Results charts are sampled every quarter second.
const TRACE_STEP = 0.25;

// Injury ratings: G, A, M, P by share of the worst-hit region.
const RATE_LETTERS = ['G', 'A', 'M', 'P'];
const rateIdx = (v, max) => (v <= 0 ? 0 : v / max < 0.25 ? 0 : v / max < 0.5 ? 1 : v / max < 0.8 ? 2 : 3);

function rateBox(ctx, idx, x, y, s = 16) {
  ctx.fillStyle = C.rate[idx];
  ctx.fillRect(x, y, s, s);
  mono(ctx, RATE_LETTERS[idx], x + s / 2, y + s / 2 + 1, s * 0.66, { weight: 700, color: idx === 1 ? C.formInk : C.paper, align: 'center', baseline: 'middle' });
}

const regionGroups = (regions = {}) => ({
  head: regions.head ?? 0,
  torso: regions.torso ?? 0,
  arms: (regions.lArm ?? 0) + (regions.rArm ?? 0),
  legs: (regions.lLeg ?? 0) + (regions.rLeg ?? 0),
});

// A front view of the dummy with each region filled by its rating.
function injuryFigure(ctx, cx, top, h, groups) {
  const u = h / 150;
  const max = Math.max(1, ...Object.values(groups));
  const col = (g) => C.rate[rateIdx(groups[g], max)];
  ctx.lineWidth = 1.25;
  ctx.strokeStyle = C.formInk;
  const limb = (g, ax, ay, bx, by, r) => {
    capsulePath(ctx, cx + ax * u, top + ay * u, cx + bx * u, top + by * u, r * u);
    ctx.fillStyle = col(g);
    ctx.fill();
    ctx.stroke();
  };
  for (const side of [-1, 1]) {
    limb('arms', 21 * side, 33, 31 * side, 84, 6);
    limb('legs', 9 * side, 82, 12 * side, 143, 7);
  }
  roundRectPath(ctx, cx - 17 * u, top + 27 * u, 34 * u, 58 * u, 7 * u);
  ctx.fillStyle = col('torso');
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, top + 13 * u, 12 * u, 0, TAU);
  ctx.fillStyle = col('head');
  ctx.fill();
  ctx.stroke();
  target(ctx, cx + 6 * u, top + 11 * u, 4 * u);
}

// A chart-recorder strip of damage per quarter second.
function traceChart(ctx, x, y, w, h, trace, seconds) {
  ctx.fillStyle = '#f7f3ea';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = C.ruleSoft;
  for (let i = 1; i < 10; i++) ctx.fillRect(Math.round(x + (w * i) / 10), y, 1, h);
  for (let i = 1; i < 4; i++) rule(ctx, x, x + w, y + (h * i) / 4, C.ruleSoft);
  ctx.strokeStyle = C.formInk;
  ctx.lineWidth = 1.25;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  const n = trace.length;
  let max = 1, peak = 0;
  trace.forEach((v, i) => {
    if (v > max) {
      max = v;
      peak = i;
    }
  });
  const px = (i) => x + 3 + (n > 1 ? (i / (n - 1)) * (w - 6) : 0);
  const py = (v) => y + h - 4 - (v / max) * (h - 14);
  ctx.strokeStyle = C.pen;
  ctx.lineWidth = 1.6;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (n < 2) {
    ctx.moveTo(x + 3, py(0));
    ctx.lineTo(x + w - 3, py(0));
  } else {
    trace.forEach((v, i) => (i ? ctx.lineTo(px(i), py(v)) : ctx.moveTo(px(i), py(v))));
  }
  ctx.stroke();
  if (n > 1 && max > 1) {
    ctx.fillStyle = C.pen;
    ctx.beginPath();
    ctx.arc(px(peak), py(max), 3, 0, TAU);
    ctx.fill();
    const label = `PEAK ${Math.round(max)}`;
    const right = px(peak) > x + w - 80;
    mono(ctx, label, px(peak) + (right ? -7 : 7), y + 12, 10, { weight: 700, color: C.pen, align: right ? 'right' : 'left' });
  }
  mono(ctx, '0s', x + 5, y + h - 5, 9, { color: C.formMuted });
  mono(ctx, `${seconds.toFixed(1)}s`, x + w - 5, y + h - 5, 9, { color: C.formMuted, align: 'right' });
}

// ---------------------------------------------------- cardiac monitor

// Pink ECG paper: fine squares every 5 px, bold every 25.
function ecgPaper(ctx, x, y, w, h) {
  ctx.fillStyle = '#fbf0ee';
  ctx.fillRect(x, y, w, h);
  for (let gx = 0; gx <= w; gx += 5) {
    ctx.fillStyle = gx % 25 ? '#f4d2d0' : '#e8a9a6';
    ctx.fillRect(Math.round(x + gx), y, 1, h);
  }
  for (let gy = 0; gy <= h; gy += 5) {
    ctx.fillStyle = gy % 25 ? '#f4d2d0' : '#e8a9a6';
    ctx.fillRect(x, Math.round(y + gy), w, 1);
  }
  ctx.strokeStyle = C.formInk;
  ctx.lineWidth = 1.25;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

const inSpan = (list, t) => list.some(([a, b]) => t >= a - 0.05 && t <= b + 0.05);
const bump = (u, c, s) => Math.exp(-((u - c) * (u - c)) / (2 * s * s));

// One heartbeat, P-QRS-T, around its R peak. Fast hearts squeeze it.
function beatShape(u, rr) {
  u /= Math.min(1, Math.max(0.55, rr / 0.8));
  return 0.12 * bump(u, -0.16, 0.025) - 0.12 * bump(u, -0.028, 0.009) + bump(u, 0, 0.012) - 0.28 * bump(u, 0.028, 0.01) + 0.28 * bump(u, 0.22, 0.045);
}

// Ventricular fibrillation: a fast, irregular squiggle with no beats in it.
const fibWave = (t) => (0.5 * Math.sin(t * 31.4) + 0.35 * Math.sin(t * 47.9 + 1.3) + 0.25 * Math.sin(t * 73.1 + 0.7)) * (0.6 + 0.4 * Math.sin(t * 5.3));

// The most telling few seconds: the first shock if there was one, else the
// fastest stretch.
function rhythmWindow(rec, elapsed, step, len = 6) {
  len = Math.min(len, elapsed);
  let mid;
  if (rec.fib.length) mid = rec.fib[0][0] + 1.5;
  else {
    let best = 0;
    rec.bpm.forEach((v, i) => {
      if (v > rec.bpm[best]) best = i;
    });
    mid = best * step;
  }
  const t0 = clamp(mid - len / 2, 0, Math.max(0, elapsed - len));
  return [t0, t0 + len];
}

// The rhythm strip: lead II, true ECG shape, over [t0, t1].
function rhythmStrip(ctx, x, y, w, h, rec, t0, t1) {
  ecgPaper(ctx, x, y, w, h);
  const base = y + h * 0.66;
  const amp = h * 0.5;
  const beats = rec.beats.filter((b) => b > t0 - 1 && b < t1 + 1);
  const value = (t) => {
    if (inSpan(rec.flat, t)) return 0;
    if (inSpan(rec.fib, t)) return fibWave(t) * 0.55;
    let v = 0;
    for (let i = 0; i < beats.length; i++) {
      const u = t - beats[i];
      if (u < -0.4 || u > 0.5) continue;
      const rr = (beats[i + 1] ?? beats[i] + 0.8) - beats[i];
      v += beatShape(u, rr);
    }
    return v;
  };
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 1, y + 1, w - 2, h - 2);
  ctx.clip();
  ctx.strokeStyle = C.formInk;
  ctx.lineWidth = 1.4;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let px = 0; px <= w; px += 0.5) {
    const py = base - value(t0 + ((t1 - t0) * px) / w) * amp;
    if (px) ctx.lineTo(x + px, py);
    else ctx.moveTo(x + px, py);
  }
  ctx.stroke();
  ctx.restore();
  mono(ctx, `LEAD II  ·  ${t0.toFixed(1)}-${t1.toFixed(1)} s  ·  25 mm/s`, x + 6, y + 12, 9, { weight: 600, color: '#a5524e' });
  // Name what's on the strip.
  const fib = rec.fib.find(([a, b]) => b >= t0 && a <= t1);
  const flat = rec.flat.find(([a, b]) => b >= t0 && a <= t1);
  const tag = fib ? 'V-FIB' : flat ? 'ASYSTOLE' : null;
  if (tag) mono(ctx, tag, x + w - 6, y + 12, 10, { weight: 700, color: C.pen, align: 'right' });
}

// The whole round's rate, with shocks and flatlines marked.
function heartTrend(ctx, x, y, w, h, rec, elapsed, step) {
  ctx.fillStyle = '#f7f3ea';
  ctx.fillRect(x, y, w, h);
  const lo = 30, hi = 230;
  const px = (t) => x + (elapsed > 0 ? (t / elapsed) * w : 0);
  const py = (v) => y + h - 2 - ((clamp(v, lo, hi) - lo) / (hi - lo)) * (h - 4);
  for (const v of [60, 120, 180]) {
    rule(ctx, x, x + w, py(v), C.ruleSoft);
    mono(ctx, String(v), x + 3, py(v) - 2, 8, { color: C.formMuted });
  }
  ctx.fillStyle = 'rgba(124,247,255,0.45)';
  for (const [a, b] of rec.fib) ctx.fillRect(px(a), y, Math.max(2, px(b) - px(a)), h);
  ctx.fillStyle = 'rgba(36,33,28,0.18)';
  for (const [a, b] of rec.flat) ctx.fillRect(px(a), y, Math.max(2, px(b) - px(a)), h);
  ctx.strokeStyle = C.pen;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  rec.bpm.forEach((v, i) => {
    const X = px(i * step), Y = v > 0 ? py(v) : y + h - 2;
    if (i) ctx.lineTo(X, Y);
    else ctx.moveTo(X, Y);
  });
  ctx.stroke();
  ctx.strokeStyle = C.formInk;
  ctx.lineWidth = 1.25;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  mono(ctx, 'BPM', x + w - 4, y + 10, 8, { weight: 700, color: C.formMuted, align: 'right' });
}

function heartStats(rec) {
  const live = rec.bpm.filter((v) => v > 0);
  return {
    rest: live.length ? Math.min(...live) : 0,
    peak: live.length ? Math.max(...live) : 0,
    avg: live.length ? Math.round(live.reduce((a, b) => a + b, 0) / live.length) : 0,
    fib: rec.fib.length,
    arrests: rec.flat.length,
  };
}

const PITCH = 'Build a machine of traps around a test dummy and set it loose. Pick your route through three acts, draft weapons, traps and mods, and chain fire, ice, shocks, nails and blasts into reactions. Miss a deadline and the run is over.';

// Test classes for route tickets and orders.
const TYPE_TONE = {
  standard: { tone: C.formInk, label: 'STANDARD' },
  elite: { tone: C.bad, label: 'ELITE' },
  crate: { tone: '#7b4fc4', label: 'CRATE' },
  workshop: { tone: C.ctYellow, label: 'WORKSHOP' },
  supply: { tone: '#2f7d43', label: 'SUPPLY ROOM' },
  incident: { tone: C.fire, label: 'INCIDENT', hazardEdge: true },
  boss: { tone: C.bad, label: 'BOSS', hazardEdge: true },
};

// The route stops that aren't fights: what they say on the ticket.
const STOP_TEXT = {
  workshop: { head: 'NO TEST THIS FLOOR', body: 'Skip this floor and upgrade one of your weapons instead.', reward: 'WEAPON UPGRADE' },
  supply: { head: 'NO TEST THIS FLOOR', body: 'Spend scrap on cards, rig mods and services.', reward: 'SHOP WITH SCRAP' },
  incident: { head: 'SOMETHING HAPPENED', body: 'No dummy, just a report and a choice. Risk and reward vary.', reward: 'A CHOICE' },
};

// ---------------------------------------------------------------- title

const CONTROLS = [
  ['MOVE', 'Swing the bat and knife. They pivot from your grip'],
  ['CLICK', 'Punch, fire guns, drop grenades and anvils'],
  ['DRAG', 'Grab and throw the dummy with Hands'],
  ['1-6 / WHEEL', 'Switch weapon'],
  ['ESC', 'Pause'],
];

// With a saved run the title offers CONTINUE and NEW RUN (which asks once
// before throwing the save away); without one, any tap starts a run.
export class TitleOverlay extends Overlay {
  constructor(play) {
    super(play);
    this.save = loadRun();
    this.confirmNew = false;
    const begin = () => this.close(() => this.play.newRun());
    this.gearBtn = { x: 0, y: 0, w: 40, h: 40, onClick: () => play.engine.push(new SettingsOverlay(play)) };
    this.upgradeBtn = { x: 0, y: 0, w: 0, h: 40, onClick: () => play.engine.push(new TreeOverlay(play)) };
    this.recordsBtn = { x: 0, y: 0, w: 0, h: 40, onClick: () => play.engine.push(new ScoresOverlay(play)) };
    // Today's daily test asks before throwing away a saved run.
    this.dailyBtn = {
      x: 0, y: 0, w: 0, h: 40,
      onClick: () => {
        if (this.save && !this.confirmDaily) {
          this.confirmDaily = true;
          this.play.sfx.select();
        } else this.close(() => this.play.newRun({ daily: true }));
      },
    };
    this.ratingDown = { x: 0, y: 0, w: 32, h: 30, onClick: () => this.shiftRating(-1) };
    this.ratingUp = { x: 0, y: 0, w: 32, h: 30, onClick: () => this.shiftRating(1) };
    this.keys = {
      s: this.gearBtn.onClick, u: () => settings.rogueLite && this.upgradeBtn.onClick(), r: this.recordsBtn.onClick, d: this.dailyBtn.onClick,
      arrowleft: this.ratingDown.onClick, arrowright: this.ratingUp.onClick,
    };
    if (this.save) {
      this.continueBtn = { x: 0, y: 0, w: 0, h: 46, onClick: () => this.close(() => this.play.continueRun()) };
      this.newBtn = {
        x: 0, y: 0, w: 0, h: 46,
        onClick: () => {
          if (this.confirmNew) begin();
          else {
            this.confirmNew = true;
            this.play.sfx.select();
          }
        },
      };
      this.keys.enter = this.keys[' '] = this.continueBtn.onClick;
      this.keys.n = this.newBtn.onClick;
    } else {
      this.tapAnywhere = begin;
      this.keys.enter = this.keys[' '] = begin;
    }
  }

  shiftRating(dir) {
    const before = progress.rating;
    setRating(before + dir);
    if (progress.rating !== before) this.play.sfx.select();
  }

  // The Safety Rating picker, once a win has opened rating 1. `compact`
  // draws a short version starting at cx instead of centred on it.
  renderRating(ctx, cx, y, compact = false) {
    if (progress.maxRating <= 0) return [];
    const r = progress.rating;
    const label = compact ? `RATING ${r}/${progress.maxRating}` : r ? `SAFETY RATING ${r} OF ${progress.maxRating}` : `SAFETY RATING: STANDARD (UP TO ${progress.maxRating})`;
    const lw = measure(ctx, label, 15, F.body, 700, 2) + 20;
    if (compact) cx += 36 + lw / 2;
    Object.assign(this.ratingDown, { x: cx - lw / 2 - 36, y: y - 21 });
    Object.assign(this.ratingUp, { x: cx + lw / 2 + 4, y: y - 21 });
    for (const [b, glyph, on] of [[this.ratingDown, '<', r > 0], [this.ratingUp, '>', r < progress.maxRating]]) {
      ctx.globalAlpha *= on ? 1 : 0.35;
      this.drawButton(ctx, b, glyph, { primary: false });
      ctx.globalAlpha /= on ? 1 : 0.35;
    }
    text(ctx, label, cx, y, 15, { weight: 700, color: r ? C.ctYellow : C.paper, align: 'center', spacing: 2 });
    if (compact) return [this.ratingDown, this.ratingUp];
    const sub = r ? `Adds: ${RATINGS[r].desc}${r > 1 ? ' Plus every rating below.' : ''}  Score x${(1 + 0.1 * r).toFixed(1)}.` : 'Win at a rating to open the next one.';
    text(ctx, sub, cx, y + 20, 13, { weight: 500, color: C.paperDim, align: 'center', maxWidth: this.L.w - 24 });
    return [this.ratingDown, this.ratingUp];
  }

  // Records, the upgrade tree in rogue-lite, and settings, top right.
  renderCorner(ctx) {
    const L = this.L;
    const narrow = L.w < 560;
    let x = L.w - 16 - 40;
    Object.assign(this.gearBtn, { x, y: 14 });
    gearButton(ctx, this.gearBtn, { dark: true });
    const corner = [this.gearBtn];
    const add = (b, label) => {
      const w = measure(ctx, label, 17, F.body, 700, 2.5) + 30;
      x -= 10 + w;
      Object.assign(b, { x, y: 14, w });
      this.drawButton(ctx, b, label, { primary: false });
      corner.push(b);
    };
    if (settings.rogueLite) add(this.upgradeBtn, narrow ? 'UPGRADES' : `UPGRADES · ${meta.credits} CR`);
    add(this.recordsBtn, 'RECORDS');
    add(this.dailyBtn, this.confirmDaily ? 'DISCARD SAVE?' : narrow ? 'DAILY' : 'DAILY TEST');
    this.buttons = this.save ? [...corner, this.continueBtn, this.newBtn] : corner;
  }

  update(dt, isTop) {
    super.update(dt, isTop);
    if (isTop && this.tapAnywhere && !this.buttons.some((b) => b.hover)) this.play.engine.cursor = 'pointer';
  }

  // The logo, set on paper: CRASH in ink, TEST on a strip of hazard tape.
  logo(ctx, x, y, size) {
    text(ctx, 'CRASH', x + 4, y + size * 0.5 + 5, size, { family: F.display, weight: 400, color: C.accent, baseline: 'middle' });
    text(ctx, 'CRASH', x, y + size * 0.5, size, { family: F.display, weight: 400, color: C.formInk, baseline: 'middle' });
    const rw = measure(ctx, 'TEST', size, F.display, 400);
    const ty = y + size * 1.02;
    const th = size * 0.86;
    ctx.fillStyle = C.ctYellow;
    ctx.fillRect(x - 6, ty, rw + 22, th);
    hazard(ctx, x - 6, ty, rw + 22, 5, 6);
    hazard(ctx, x - 6, ty + th - 5, rw + 22, 5, 6);
    text(ctx, 'TEST', x + 5, y + size * 1.47, size, { family: F.display, weight: 400, color: C.formInk, baseline: 'middle' });
    target(ctx, x + rw + 22 + size * 0.5, ty + th / 2, size * 0.36);
    return size * 1.95;
  }

  // The cover sheet of the test program. Returns its height.
  cover(ctx, x, y, w, h, { logoSize, pitch, controls }) {
    const play = this.play;
    report(ctx, x, y, w, h, 'TEST PROGRAM', { kicker: `CRASH TEST FACILITY  ·  ${TODAY}`, form: 'FORM CT-1 · TEST PROGRAM COVER' });
    const lx = x + 20;
    const inner = w - 40;
    let cy = y + HEAD + 18;
    cy += this.logo(ctx, lx, cy, logoSize) + 14;
    fields(ctx, lx, cy, inner, [
      { label: 'TEST SUBJECT', value: 'CRASH DUMMY', flex: 1.5 },
      { label: 'PERCENTILE', value: '50TH', flex: 0.9 },
      { label: 'STATUS', value: 'READY', color: C.rate[0], flex: 0.9 },
    ]);
    cy += 40;
    let n = 1;
    if (pitch) {
      cy += 30;
      section(ctx, lx, cy, inner, n++, 'TEST PROTOCOL');
      cy += 24;
      cy += paragraph(ctx, PITCH, lx, cy, inner, 16, 21, {});
    }
    if (controls) {
      cy += 18;
      section(ctx, lx, cy, inner, n++, 'CONTROLS');
      cy += 8;
      for (const [key, desc] of CONTROLS) {
        cy += 27;
        keycap(ctx, key, lx, cy - 5);
        text(ctx, desc, lx + 112, cy, 15, { weight: 500, maxWidth: inner - 112 });
        rule(ctx, lx, lx + inner, cy + 8, C.ruleSoft);
      }
    }
    cy += 24;
    const best = topScores()[0]?.score;
    fields(ctx, lx, cy, inner, [
      { label: 'HIGH SCORE', value: best ? best.toLocaleString('en-US') : '-', flex: 1.1 },
      { label: 'BEST FLOOR', value: play.bestDepth > 0 ? floorName(play.bestDepth) : '-', flex: 0.9 },
      { label: 'REACTIONS LOGGED', value: `${play.status.discovered.size}/${REACTION_IDS.length}` },
      settings.rogueLite ? { label: 'CREDITS', value: String(meta.credits), color: '#2f7d43', flex: 0.8 } : null,
    ].filter(Boolean));
    cy += 40 + 12 + FOOT;
    if (w >= 480) stampMark(ctx, 'CONFIDENTIAL', x + w - 100, y + 31, C.pen, this.t - 0.35, 15);
    return cy - y;
  }

  render(ctx) {
    const L = this.L;
    const a = this.appear;
    const wide = L.mode === 'wide';
    if (wide) {
      const grad = ctx.createLinearGradient(0, 0, L.w, 0);
      grad.addColorStop(0, `rgba(14,17,13,${0.95 * a})`);
      grad.addColorStop(0.55, `rgba(14,17,13,${0.78 * a})`);
      grad.addColorStop(1, `rgba(14,17,13,${0.3 * a})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, L.w, L.h);
    } else {
      dim(ctx, { x: 0, y: 0, w: L.w, h: L.h }, a * 1.4);
    }

    const short = L.mode === 'short';
    const w = wide ? 540 : Math.min(440, L.w - 24);
    const opts = {
      logoSize: wide ? clamp(L.h * 0.1, 64, 96) : clamp(Math.min(L.w * 0.16, L.h * 0.1), 40, 76),
      pitch: !short,
      controls: this.fine && !short,
    };
    const key = `${w}:${opts.logoSize}:${opts.pitch}:${opts.controls}`;
    if (this.heights[key] === undefined) {
      ctx.save();
      ctx.globalAlpha = 0;
      this.heights[key] = this.cover(ctx, 0, 0, w, 300, opts);
      ctx.restore();
    }
    const h = this.heights[key];
    // Phones and short screens keep the top strip clear for the corner
    // buttons (and, on short screens, the rating picker).
    const top = wide ? 0 : short ? 52 : 60;
    const room = L.h - top - (short ? (this.save ? 64 : 56) : 104);
    const s = Math.min(1, room / h);
    const x = wide ? Math.max(48, L.w * 0.06) : (L.w - w * s) / 2;
    const y = top + Math.max(12, (room - h * s) / 2 + (short ? 4 : 12)) + (1 - easeOutBack(this.t / 0.45)) * 50;

    ctx.save();
    ctx.globalAlpha = a;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(wide ? -0.012 : 0);
    ctx.scale(s, s);
    this.heights[key] = this.cover(ctx, 0, 0, w, h, opts);
    ctx.restore();

    const px = wide ? x + (w * s) / 2 : L.w / 2;
    this.renderCorner(ctx);
    if (this.save) {
      // Resume the saved run, or start over.
      const r = this.save.run;
      const bh = short ? 40 : 46;
      const bw = Math.min(250, (L.w - 44) / 2);
      const by = y + h * s + (short ? 12 : 22);
      Object.assign(this.continueBtn, { x: px - bw - 6, y: by, w: bw, h: bh });
      Object.assign(this.newBtn, { x: px + 6, y: by, w: bw, h: bh });
      const keys = bw >= 220;
      this.drawButton(ctx, this.continueBtn, `CONTINUE · ${r.act}-${r.floor}`, { key: keys ? 'SPACE' : null });
      this.drawButton(ctx, this.newBtn, this.confirmNew ? 'DISCARD SAVE?' : 'NEW RUN', { primary: false, key: keys ? 'N' : null });
      // The saved run keeps its own rating, so the picker sits out.
    } else {
      const py = y + h * s + (short ? 26 : 44);
      ctx.globalAlpha = a * pulse(this.t);
      const verb = this.fine ? 'CLICK OR PRESS SPACE' : 'TAP';
      text(ctx, `${verb} TO BEGIN TESTING`, px, py, short ? 18 : 22, { weight: 700, color: C.paper, align: 'center', spacing: 3, maxWidth: L.w - 24 });
      ctx.globalAlpha = a;
      // Short screens have no room under the prompt: the picker goes top left.
      const rb = short ? this.renderRating(ctx, 16, 36, true) : this.renderRating(ctx, px, py + 40);
      this.buttons.push(...rb);
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------- test order

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
    const a = this.appear;
    dim(ctx, this.frame, a * 0.7);
    ctx.save();
    ctx.globalAlpha = a;
    const v = this.fit(ctx, [
      { key: 'full', w: this.frame.w >= 600 ? 480 : 420, draw: (x, y, w, h) => this.order(ctx, x, y, w, h, false) },
      { key: 'short', w: 540, draw: (x, y, w, h) => this.order(ctx, x, y, w, h, true) },
    ]);
    const short = v.key === 'short';
    const R = this.sheet(ctx, v.key, v.w, v.draw);
    const prompt = this.fine ? 'CLICK OR PRESS SPACE TO BEGIN THE TEST' : 'TAP TO BEGIN THE TEST';
    ctx.globalAlpha = a * pulse(this.t);
    text(ctx, prompt, R.x + R.w / 2, Math.min(this.frame.y + this.frame.h - 12, R.y + R.h + (short ? 28 : 40)), short ? 16 : 18, { weight: 700, color: C.paper, align: 'center', spacing: 2.5 });
    ctx.restore();
  }

  order(ctx, x, y, w, h, short) {
    const round = this.play.round;
    const v = VARIANTS[round.variant];
    const twist = round.twist ? TWISTS[round.twist] : null;
    const tone = TYPE_TONE[round.type] ?? TYPE_TONE.standard;
    const lx = x + 18;
    const rx = x + w - 18;
    const inner = w - 36;
    report(ctx, x, y, w, h, round.boss ? 'BOSS TEST ORDER' : 'TEST ORDER', { tone: tone.tone, hazardEdge: tone.hazardEdge, kicker: kicker(this.play), form: short ? null : 'FORM CT-3 · PRE-TEST SPECIFICATION' });
    let cy = y + HEAD + 12;
    fields(ctx, lx, cy, inner, [
      { label: 'FLOOR', value: `${round.act}-${round.floor}`, flex: 0.8 },
      { label: 'TEST CLASS', value: tone.label, color: round.type === 'standard' ? C.formInk : tone.tone === C.ctYellow ? '#9a7a00' : tone.tone },
      { label: 'TIME LIMIT', value: `${round.time} s`, flex: 0.9 },
      { label: 'ON PASS', value: REWARD_LABEL[round.reward], flex: short ? 1.6 : 1.3, size: 13 },
    ]);
    cy += 40;

    if (short) {
      cy += 26;
      const extra = [twist && `TWIST: ${twist.name.toUpperCase()}`, ...(round.dummy.affixes ?? []).map((id) => AFFIXES[id].name.toUpperCase())].filter(Boolean);
      text(ctx, `SUBJECT: ${v.name.toUpperCase()}${extra.length ? `  ·  ${extra.join('  ·  ')}` : ''}`, lx, cy, 14, { weight: 700, spacing: 1, maxWidth: inner });
      cy += 30;
      checkbox(ctx, lx, cy - 14, 'open');
      text(ctx, round.primary.label, lx + 26, cy, 19, { weight: 700, maxWidth: inner - 26 });
      cy += 28;
      checkbox(ctx, lx, cy - 14, 'open');
      text(ctx, round.secondary.label, lx + 26, cy, 16, { weight: 700, maxWidth: inner - 110 });
      mono(ctx, 'OPTIONAL', rx, cy, 11, { weight: 700, color: C.accent, align: 'right' });
      return cy + 18 - y;
    }

    cy += 30;
    section(ctx, lx, cy, inner, 1, 'TEST SUBJECT', { right: round.variant === 'standard' ? null : 'VARIANT' });
    cy += 26;
    text(ctx, v.name.toUpperCase(), lx, cy, 19, { weight: 700, spacing: 0.8, maxWidth: inner });
    cy += 6;
    cy += paragraph(ctx, v.desc, lx, cy + 15, inner, 15, 19, { color: C.formMuted });
    if (twist) {
      cy += 26;
      caption(ctx, `TWIST · ${twist.name.toUpperCase()}`, lx, cy, { color: '#7b4fc4' });
      cy += paragraph(ctx, twist.desc, lx, cy + 18, inner, 15, 19, {});
    }
    for (const id of round.dummy.affixes ?? []) {
      cy += 26;
      caption(ctx, `AFFIX · ${AFFIXES[id].name.toUpperCase()}`, lx, cy, { color: C.pen });
      cy += paragraph(ctx, AFFIXES[id].desc, lx, cy + 18, inner, 15, 19, {});
    }
    cy += 34;
    section(ctx, lx, cy, inner, 2, 'PRIMARY OBJECTIVE', { right: 'REQUIRED' });
    cy += 28;
    checkbox(ctx, lx, cy - 15, 'open');
    text(ctx, round.primary.label, lx + 26, cy, 21, { weight: 700, maxWidth: inner - 26 });
    cy += 6;
    cy += paragraph(ctx, round.primary.hint, lx + 26, cy + 16, inner - 26, 15, 19, { color: C.formMuted });
    cy += 30;
    section(ctx, lx, cy, inner, 3, 'SECONDARY OBJECTIVE', { color: C.accent, right: 'OPTIONAL', rightColor: C.accent });
    cy += 28;
    checkbox(ctx, lx, cy - 15, 'open');
    text(ctx, round.secondary.label, lx + 26, cy, 19, { weight: 700, maxWidth: inner - 26 });
    cy += 21;
    text(ctx, 'On pass: one extra card pick', lx + 26, cy, 14, { weight: 500, color: C.formMuted });
    cy += 16 + FOOT;
    return cy - y;
  }
}

// ------------------------------------------------------------- results

export class ClearOverlay extends Overlay {
  constructor(play) {
    super(play);
    this.btn = { x: 0, y: 0, w: 0, h: 50, onClick: () => this.close(() => this.play.afterClear()) };
    this.buttons = [this.btn];
    this.printer = new Printer(play.sfx);
    this.keys = { enter: this.btn.onClick, ' ': this.btn.onClick };
  }

  render(ctx) {
    const a = this.appear;
    dim(ctx, this.frame, a * 0.7);
    ctx.save();
    ctx.globalAlpha = a;
    // Short frames lose the damage trace, then the injury diagram, then
    // the cardiac monitor.
    const v = this.fit(ctx, [
      // Desktop: injury and cardiac side by side.
      ...(this.frame.w >= 800 ? [
        { key: 'wide', w: 760, draw: (x, y, w, h) => this.results(ctx, x, y, w, h, { wide: true, trace: true }) },
        { key: 'wide-short', w: 760, draw: (x, y, w, h) => this.results(ctx, x, y, w, h, { wide: true }) },
      ] : []),
      { key: 'full', w: 460, draw: (x, y, w, h) => this.results(ctx, x, y, w, h, { injury: true, heart: true, trace: true }) },
      { key: 'heart+injury', w: 460, draw: (x, y, w, h) => this.results(ctx, x, y, w, h, { injury: true, heart: true }) },
      { key: 'heart', w: 500, draw: (x, y, w, h) => this.results(ctx, x, y, w, h, { heart: true }) },
      // Landscape phones: objectives beside the monitor.
      ...(this.frame.w >= 720 ? [{ key: 'side', w: 760, draw: (x, y, w, h) => this.results(ctx, x, y, w, h, { side: true }) }] : []),
      { key: 'short', w: 540, draw: (x, y, w, h) => this.results(ctx, x, y, w, h, {}) },
    ]);
    this.printSheet(ctx, v.key, v.w, v.draw);
    ctx.restore();
  }

  results(ctx, x, y, w, h, { injury = false, heart = false, trace = false, wide = false, side = false }) {
    const short = !injury && !heart && !trace && !wide && !side;
    const play = this.play;
    const round = play.round;
    const st = play.stats;
    const sec = round.secondary;
    const lx = x + 18;
    const rx = x + w - 18;
    const inner = w - 36;
    const perfect = sec.state === 'done';
    report(ctx, x, y, w, h, 'TEST RESULTS', { tone: C.rate[0], kicker: kicker(play), form: short ? null : 'FORM CT-9 · POST-TEST ASSESSMENT' });
    let cy = y + HEAD + 12;
    fields(ctx, lx, cy, inner, [
      { label: 'FLOOR', value: `${round.act}-${round.floor}`, flex: 0.8 },
      { label: 'DURATION', value: `${st.elapsed.toFixed(1)} s` },
      { label: 'TOTAL DAMAGE', value: String(Math.round(st.damage)), flex: 1.1 },
      { label: 'DESTROYED', value: String(st.kills), flex: 0.9 },
    ]);
    cy += 40;

    cy += 30;
    // Side by side, the objectives take the left half and the monitor the right.
    const ow = side ? (inner - 24) / 2 : inner;
    const orx = lx + ow;
    const sideTop = cy;
    section(ctx, lx, cy, ow, 1, 'OBJECTIVES');
    cy += 28;
    checkbox(ctx, lx, cy - 14, 'done');
    const vw = verdict(ctx, 'PASS', orx, cy, '#2f7d43');
    text(ctx, round.primary.label, lx + 26, cy, 17, { weight: 700, maxWidth: ow - 36 - vw });
    cy += 27;
    checkbox(ctx, lx, cy - 14, sec.state);
    const sw = verdict(ctx, perfect ? 'PASS' : 'FAIL', orx, cy, perfect ? '#2f7d43' : C.pen);
    text(ctx, sec.label, lx + 26, cy, 17, { weight: 700, color: perfect ? C.formInk : C.formMuted, maxWidth: ow - 36 - sw });
    cy += 18;
    text(ctx, perfect ? 'Secondary met: extra card unlocked' : 'Secondary not met', lx + 26, cy, 13, { weight: 600, color: perfect ? '#2f7d43' : C.pen, maxWidth: ow - 26 });
    if (side) cy = Math.max(cy, this.heartBlock(ctx, st, orx + 24, sideTop, ow, 2, true));

    let n = 2;
    if (wide) {
      // Injury and cardiac side by side.
      cy += 34;
      const colW = (inner - 24) / 2;
      const a = this.injuryBlock(ctx, st, lx, cy, colW, n++);
      const b = this.heartBlock(ctx, st, lx + colW + 24, cy, colW, n++);
      cy = Math.max(a, b);
    } else {
      if (injury) cy = this.injuryBlock(ctx, st, lx, cy + 34, inner, n++);
      if (heart) cy = this.heartBlock(ctx, st, lx, cy + (injury ? 26 : 34), inner, n++);
    }
    if (trace) {
      cy += 26;
      section(ctx, lx, cy, inner, n++, 'DAMAGE TRACE', { right: 'PER 0.25 s' });
      cy += 10;
      traceChart(ctx, lx, cy, inner, 58, st.trace, st.elapsed);
      cy += 58;
    }

    cy += 16;
    Object.assign(this.btn, { x: lx, y: cy, w: inner });
    this.drawButton(ctx, this.btn, 'FILE REPORT & CONTINUE', { key: 'SPACE' });
    cy += 50 + 14 + (short ? 0 : FOOT);
    stampMark(ctx, perfect ? 'PERFECT' : 'PASSED', rx - 62, y + 32, perfect ? C.accent : '#2f7d43', this.since - 0.05);
    return cy - y;
  }

  // The injury diagram and region table. Returns the y below it.
  injuryBlock(ctx, st, x, cy, w, num) {
    const rx = x + w;
    section(ctx, x, cy, w, num, 'INJURY ASSESSMENT', { right: 'G A M P' });
    cy += 14;
    const groups = regionGroups(st.regions);
    const max = Math.max(1, ...Object.values(groups));
    const figH = 132;
    injuryFigure(ctx, x + 40, cy, figH, groups);
    RATE_LETTERS.forEach((_, i) => rateBox(ctx, i, x + 4 + i * 19, cy + figH + 8, 15));
    const tx = x + 104;
    let ty = cy + 14;
    caption(ctx, 'REGION', tx, ty);
    caption(ctx, 'DAMAGE', rx - 26, ty, { align: 'right' });
    ty += 6;
    for (const [name, g] of [['Head', 'head'], ['Torso', 'torso'], ['Arms', 'arms'], ['Legs', 'legs']]) {
      ty += 21;
      text(ctx, name, tx, ty, 15, { weight: 600 });
      mono(ctx, String(Math.round(groups[g])), rx - 26, ty, 14, { weight: 600, align: 'right' });
      rateBox(ctx, rateIdx(groups[g], max), rx - 16, ty - 12, 16);
      rule(ctx, tx, rx, ty + 6, C.ruleSoft);
    }
    ty += 10;
    for (const [name, val] of [['Peak hit', Math.round(st.maxHit)], ['Reactions', st.reactions], ['Limbs torn', st.severs]]) {
      ty += 20;
      text(ctx, name, tx, ty, 14, { weight: 500, color: C.formMuted });
      mono(ctx, String(val), rx, ty, 14, { weight: 600, align: 'right' });
    }
    return cy + Math.max(figH + 24, ty - cy + 8);
  }

  // The rhythm strip, the rate over the round and the readouts. Returns
  // the y below it.
  heartBlock(ctx, st, x, cy, w, num, compact = false) {
    const rec = st.heart;
    const hs = heartStats(rec);
    section(ctx, x, cy, w, num, 'CARDIAC MONITOR', { right: `PEAK ${hs.peak} BPM`, rightColor: C.pen });
    cy += 10;
    const [t0, t1] = rhythmWindow(rec, st.elapsed, TRACE_STEP);
    const stripH = compact ? 52 : 60;
    const trendH = compact ? 30 : 38;
    rhythmStrip(ctx, x, cy, w, stripH, rec, t0, t1);
    cy += stripH + 6;
    heartTrend(ctx, x, cy, w, trendH, rec, st.elapsed, TRACE_STEP);
    cy += trendH + 15;
    const parts = [`REST ${hs.rest}`, `AVG ${hs.avg}`, `PEAK ${hs.peak}`, `V-FIB ${hs.fib}`, `ARREST ${hs.arrests}`];
    const size = w < 300 ? 9 : 10;
    parts.forEach((p, i) => mono(ctx, p, x + (w * i) / (parts.length - 1), cy, size, { weight: 600, color: (i === 3 && hs.fib) || (i === 4 && hs.arrests) ? C.pen : C.formInk, align: i === 0 ? 'left' : i === parts.length - 1 ? 'right' : 'center' }));
    return cy;
  }
}

// --------------------------------------------------------------- cards

// Picks one card from an offer. Used for rewards, the starter weapon, the
// workshop and crates. Taking a weapon with a full arsenal asks what to drop.
export class CardOverlay extends Overlay {
  constructor(play, { bonus = false, onDone, offer = null, title = null, subtitle = null, rerolls = true, kinds = null, count, filter = null } = {}) {
    super(play);
    this.bonus = bonus;
    this.onDone = onDone;
    this.draw = { bonus, kinds, filter, count: count ?? play.run.choices };
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
    this.printer = new Printer(play.sfx, { stagger: 0.1 });
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
    this.printer.reset();
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
    // A trap still needs a spot in the arena before we move on.
    if (card?.kind === 'trap') this.close(() => play.engine.push(new PlaceOverlay(play, card.trap, () => this.onDone?.())));
    else this.close(() => this.onDone?.());
  }

  layoutCards() {
    const R = this.frame;
    const n = this.offer.length;
    const top = R.y + 114;
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
      const h = clamp(avail, 240, maxW * 1.32);
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

  // Side by side, every card feeds out at once and they tear off one by one.
  // Stacked (phones), the cards come out as one perforated strip, torn once
  // at the bottom; the perforations let go as it lifts.
  printCards(ctx, a) {
    const rects = this.rects;
    const n = rects.length;
    if (!n) return;
    const pr = this.printer;
    const rows = rects[0].rows;
    const first = rects[0], last = rects[n - 1];
    const left = Math.min(...rects.map((r) => r.x));
    const right = Math.max(...rects.map((r) => r.x + r.w));
    const len = rows ? last.y + last.h - first.y : first.h;
    pr.count = rows ? 1 : n;
    pr.setLength(len);
    const slot = this.slotY;
    const poses = rows ? [pr.pose(0, first.y, len, slot)] : rects.map((r, i) => pr.pose(i, r.y, r.h, slot));
    const stubs = rows ? [poses[0].torn && { x: first.x, w: first.w, seed: 1 }] : rects.map((r, i) => poses[i].torn && { x: r.x, w: r.w, seed: i + 1 });
    this.drawPrinter(ctx, (left + right) / 2, right - left + 44, stubs);
    const keys = this.fine;

    if (pr.locked) {
      if (rows) {
        const pose = poses[0];
        this.paper(ctx, first.x, first.w, len, pose, 1, (y) => {
          setShadows(false);
          rects.forEach((r, i) => {
            const cy = y + (r.y - first.y);
            if (i < n - 1 && pose.free < 1) this.perforation(ctx, r.x, cy + r.h, r.w, rects[i + 1].y - (r.y + r.h), 1 - pose.free);
            drawCard(ctx, this.offer[i], r.x, cy, r.w, r.h, true, i + 1, { keys });
          });
          setShadows(true);
        });
      } else {
        rects.forEach((r, i) => this.paper(ctx, r.x, r.w, r.h, poses[i], i + 1, (y) => drawCard(ctx, this.offer[i], r.x, y, r.w, r.h, false, i + 1, { keys })));
      }
      return;
    }

    // Printed and torn off: the cards are live.
    this.offer.forEach((card, i) => {
      const r = rects[i];
      const hover = this.cardButtons[i]?.hover;
      ctx.save();
      ctx.globalAlpha = a * (this.picked && this.picked !== card ? 0.3 : 1);
      ctx.translate(r.x + r.w / 2, r.y + r.h / 2 - (hover ? 8 : 0));
      const s = this.picked === card ? 1 + (this.closing >= 0 ? this.closing * 0.6 : 0) : hover ? 1.03 : 1;
      ctx.scale(s, s);
      const draw = () => drawCard(ctx, card, -r.w / 2, -r.h / 2, r.w, r.h, rows, i + 1, { hover, keys });
      if (rows && i < n - 1) draw();
      else drawTorn(ctx, -r.w / 2, -r.h / 2, r.w, r.h, this.edge(rows ? 1 : i + 1, r.w), draw, hover ? 12 : 6);
      ctx.restore();
    });
  }

  // The paper joining two stacked cards on the strip.
  perforation(ctx, x, y, w, h, alpha) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.fillStyle = C.paper;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = C.rule;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x, y + h / 2);
    ctx.lineTo(x + w, y + h / 2);
    ctx.stroke();
    ctx.restore();
  }

  renderDrops(ctx) {
    this.layoutDrops();
    const card = this.replacing;
    this.heading(ctx, 'FORM CT-14 · EQUIPMENT DISPOSAL', 'ARSENAL FULL', `You can carry ${this.play.run.slots} weapons. Drop one to take the ${card.name}.`, C.ctYellow);
    const run = this.play.run;
    this.dropButtons.forEach((b, i) => {
      ctx.fillStyle = b.hover ? '#fffaf0' : C.paper;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = b.hover ? C.accent : C.formInk;
      ctx.fillRect(b.x, b.y, 5, b.h);
      ctx.fillStyle = C.ink;
      ctx.fillRect(b.x + 12, b.y + 6, b.h - 12, b.h - 12);
      drawWeaponIcon(ctx, b.id, b.x + 12 + (b.h - 12) / 2, b.y + b.h / 2, 32);
      text(ctx, `Drop ${WEAPONS[b.id].name}`, b.x + b.h + 14, b.y + b.h / 2 + 6, 18, { weight: 700 });
      mono(ctx, `LV ${run.level(b.id)}`, b.x + b.w - 14, b.y + b.h / 2 + 5, 13, { weight: 600, color: C.formMuted, align: 'right' });
      if (this.fine) keycap(ctx, String(i + 1), b.x + b.w - 78, b.y + b.h / 2);
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
    const keyHint = this.fine ? `  Press 1-${this.offer.length} to pick.` : '';
    const form = this.bonus ? 'FORM CT-12B · BONUS ALLOCATION' : 'FORM CT-12 · COMPONENT REQUISITION';
    this.heading(ctx, form, this.title, this.subtitle + keyHint, this.bonus ? C.accent : C.paper);

    this.printCards(ctx, a);

    const run = this.play.run;
    if (this.canReroll && !this.printer.locked) this.drawButton(ctx, this.reroll, `REROLL (${run.rerolls})`, { primary: false, key: 'R' });
    ctx.restore();
  }
}

export function cardTags(card) {
  if (card.tags) return card.tags;
  if (card.icon) return sourceTags(card.icon);
  if (card.trapIcon) return trapTags(card.trapIcon);
  return [];
}

// Discipline chips, right-aligned at rx with their top at y. Returns the
// left edge.
export function tagChips(ctx, tags, rx, y, h = 13) {
  let x = rx;
  for (let i = tags.length - 1; i >= 0; i--) {
    const d = DISCIPLINES[tags[i]];
    const w = measure(ctx, d.short, 9, F.mono, 700) + 8;
    x -= w;
    ctx.fillStyle = d.color;
    ctx.fillRect(x, y, w, h);
    mono(ctx, d.short, x + w / 2, y + h / 2 + 1, 9, { weight: 700, color: C.formInk, align: 'center', baseline: 'middle' });
    x -= 3;
  }
  return x;
}

// A short, stable spec number for a card, like W-417.
function cardCode(card) {
  let hsh = 0;
  for (const ch of card.id) hsh = (hsh * 31 + ch.charCodeAt(0)) % 1000;
  return `${card.kind[0].toUpperCase()}-${String(hsh).padStart(3, '0')}`;
}

// The exhibit photo: the item on a dark plate with a scale bar and a marker.
function exhibit(ctx, card, x, y, w, h, index) {
  ctx.fillStyle = C.ink;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(239,234,223,0.35)';
  for (let tx = 6, i = 0; tx < w - 4; tx += 6, i++) ctx.fillRect(x + tx, y + h - (i % 5 ? 5 : 9), 1, i % 5 ? 5 : 9);
  target(ctx, x + 11, y + 11, 6);
  if (w > 120) mono(ctx, `EXHIBIT ${String.fromCharCode(64 + index)}`, x + w - 7, y + 14, 9, { weight: 600, color: 'rgba(239,234,223,0.55)', align: 'right' });
  const cx = x + w / 2;
  const cy = y + h / 2 - 2;
  const size = Math.min(h * (card.badge ? 0.72 : 0.85), w * 0.62);
  if (card.icon || card.trapIcon) {
    const iy = cy - (card.badge ? 7 : 0);
    if (card.icon) drawWeaponIcon(ctx, card.icon, cx, iy, size);
    else drawTrapIcon(ctx, card.trapIcon, cx, iy, size);
    if (card.badge) mono(ctx, card.badge, cx, y + h - 13, 11, { weight: 700, color: C.gold, align: 'center', maxWidth: w - 12 });
  } else {
    const fs = clamp(h * 0.32, 14, 30) * (card.badge.length > 4 ? 0.75 : 1);
    text(ctx, card.badge, cx, cy + 2, fs, { family: F.display, weight: 400, color: card.kind === 'curse' ? C.bad : C.gold, align: 'center', baseline: 'middle', maxWidth: w - 16 });
  }
}

// Cards are component test sheets: class strip, kind and spec number, the
// exhibit photo, the finding, and a classification footer.
export function drawCard(ctx, card, x, y, w, h, rows, index, { hover = false, keys = false } = {}) {
  const rc = C.rarity[card.rarity] ?? C.rarity.common;
  if (shadows) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x + 4, y + (hover ? 12 : 6), w, h);
  }
  ctx.fillStyle = C.paper;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = rc;
  ctx.fillRect(x, y, w, 6);
  ctx.lineWidth = hover ? 3 : 1.25;
  ctx.strokeStyle = hover ? C.accent : C.formInk;
  ctx.strokeRect(x + ctx.lineWidth / 2, y + ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth);

  const kind = KIND_LABEL[card.kind].toUpperCase();
  const code = `No. ${cardCode(card)}`;
  // Disciplines, as chips: from the card itself, its weapon or its trap.
  const tags = cardTags(card);
  const descColor = '#4a453c';

  if (rows) {
    const s = Math.min(h - 22, 86);
    exhibit(ctx, card, x + 10, y + 6 + (h - 6 - s) / 2, s, s, index);
    const tx = x + 22 + s;
    const tw = x + w - 12 - tx;
    caption(ctx, kind, tx, y + 23, { color: C.formInk });
    if (tags.length) tagChips(ctx, tags, x + w - 12, y + 13);
    else mono(ctx, card.rarity.toUpperCase(), x + w - 12, y + 23, 10, { weight: 700, color: rc, align: 'right' });
    rule(ctx, tx, x + w - 12, y + 29);
    let ty = y + 48;
    ctx.font = font(18, F.body, 700);
    const nameLines = wrapText(ctx, card.name.toUpperCase(), tw).slice(0, 2);
    nameLines.forEach((ln, i) => text(ctx, ln, tx, ty + i * 19, 18, { weight: 700, spacing: 0.5, maxWidth: tw }));
    ty += nameLines.length * 19;
    // Always at least one line of description, even in a tight row.
    const maxLines = Math.max(1, Math.floor((y + h - 6 - ty) / 17));
    paragraph(ctx, card.desc, tx, ty + 1, tw, 14, 17, { color: descColor, maxLines });
    if (keys) keycap(ctx, String(index), x + w - 12 - keyW(ctx, String(index)), y + h - 18);
    return;
  }

  const lx = x + 12;
  const inner = w - 24;
  caption(ctx, kind, lx, y + 24, { color: C.formInk });
  if (tags.length) tagChips(ctx, tags, x + w - 12, y + 14);
  else mono(ctx, code, x + w - 12, y + 24, 10, { weight: 600, color: C.formMuted, align: 'right' });
  rule(ctx, lx, x + w - 12, y + 31);
  const ph = clamp(h * 0.3, 70, 96);
  exhibit(ctx, card, lx, y + 38, inner, ph, index);
  let ty = y + 38 + ph + 26;
  ctx.font = font(20, F.body, 700);
  const nameLines = wrapText(ctx, card.name.toUpperCase(), inner).slice(0, 2);
  nameLines.forEach((ln, i) => text(ctx, ln, lx, ty + i * 21, 20, { weight: 700, spacing: 0.6, maxWidth: inner }));
  ty += nameLines.length * 21 - 2;
  caption(ctx, 'FINDING', lx, ty + 4);
  ty += 22;
  const footY = y + h - 30;
  const maxLines = Math.floor((footY - 6 - ty) / 19) + 1;
  paragraph(ctx, card.desc, lx, ty, inner, 15, 19, { color: descColor, maxLines });

  // Classification footer.
  ctx.fillStyle = C.formInk;
  ctx.fillRect(lx, footY, inner, 1.25);
  caption(ctx, 'CLASS', lx, footY + 18);
  const cw = measure(ctx, 'CLASS', 10, F.body, 700, 1.2);
  ctx.fillStyle = rc;
  ctx.fillRect(lx + cw + 8, footY + 9, 10, 10);
  mono(ctx, card.rarity.toUpperCase(), lx + cw + 23, footY + 19, 11, { weight: 700 });
  if (keys) keycap(ctx, String(index), x + w - 12 - keyW(ctx, String(index)), footY + 14);
}

// ----------------------------------------------------------------- pause

export class PauseOverlay extends Overlay {
  constructor(play) {
    super(play);
    this.blocksUpdate = true;
    const mk = (onClick) => ({ x: 0, y: 0, w: 0, h: 46, onClick });
    this.resume = mk(() => this.close());
    this.restart = mk(() => this.close(() => this.play.newRun()));
    this.quit = mk(() => this.close(() => this.play.quitToTitle()));
    this.file = mk(() => play.engine.push(new RunFileOverlay(play)));
    this.gearBtn = { x: 0, y: 0, w: 36, h: 36, onClick: () => play.engine.push(new SettingsOverlay(play)) };
    this.buttons = [this.resume, this.file, this.restart, this.quit, this.gearBtn];
    this.keys = { escape: this.resume.onClick, p: this.resume.onClick, enter: this.resume.onClick, s: this.gearBtn.onClick, f: this.file.onClick };
  }

  render(ctx) {
    const a = this.appear;
    dim(ctx, this.frame, a * 1.1);
    ctx.save();
    ctx.globalAlpha = a;
    const v = this.fit(ctx, [
      { key: 'codex', w: 460, draw: (x, y, w, h) => this.body(ctx, x, y, w, h, true) },
      { key: 'plain', w: 380, draw: (x, y, w, h) => this.body(ctx, x, y, w, h, false) },
    ]);
    this.sheet(ctx, v.key, v.w, v.draw, false);
    ctx.restore();
  }

  body(ctx, x, y, w, h, showCodex) {
    const play = this.play;
    const lx = x + 18;
    const inner = w - 36;
    report(ctx, x, y, w, h, 'TEST SUSPENDED', { tone: C.ctYellow, kicker: kicker(play), form: showCodex ? 'FORM CT-5 · INTERRUPTION NOTICE' : null, reserve: 48 });
    Object.assign(this.gearBtn, { x: x + w - 18 - 36, y: y + 14 });
    gearButton(ctx, this.gearBtn);
    let cy = y + HEAD + 12;
    fields(ctx, lx, cy, inner, [
      { label: 'FLOOR', value: `${play.round.act}-${play.round.floor}` },
      { label: 'CLOCK', value: `${Math.ceil(Math.max(0, play.timeLeft))} s` },
      { label: 'MACHINE', value: `${play.run.traps.length} TRAPS` },
    ]);
    cy += 40 + 14;
    for (const [b, label, primary, key] of [[this.resume, 'RESUME TEST', true, 'ESC'], [this.file, 'RUN FILE: DISCIPLINES & MODS', false, 'F'], [this.restart, 'NEW RUN', false], [this.quit, 'QUIT TO TITLE', false]]) {
      Object.assign(b, { x: lx, y: cy, w: inner });
      this.drawButton(ctx, b, label, { primary, key, paper: true });
      cy += b.h + 10;
    }
    if (showCodex) cy = this.renderCodex(ctx, lx, cy + 24, inner) + FOOT;
    return cy + 6 - y;
  }

  // The reactions you've found, and hints for the rest.
  renderCodex(ctx, x, y, w) {
    const found = this.play.status.discovered;
    section(ctx, x, y, w, 1, 'REACTION LOG', { right: `${found.size}/${REACTION_IDS.length} FOUND` });
    let cy = y + 10;
    REACTION_IDS.forEach((id, i) => {
      const r = REACTIONS[id];
      const known = found.has(id);
      cy += 38;
      mono(ctx, `R-${String(i + 1).padStart(2, '0')}`, x, cy - 13, 10, { weight: 600, color: C.formMuted });
      ctx.fillStyle = known ? r.color : C.ruleSoft;
      ctx.fillRect(x + 1, cy - 7, 10, 10);
      ctx.strokeStyle = C.formInk;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 1.5, cy - 6.5, 9, 9);
      text(ctx, known ? r.name : 'UNLOGGED', x + 44, cy - 12, 15, { weight: 700, color: known ? C.formInk : C.formMuted, spacing: known ? 0 : 1 });
      text(ctx, known ? r.desc : `Hint: ${r.hint}`, x + 44, cy + 3, 13, { weight: 500, color: C.formMuted, maxWidth: w - 44 });
      rule(ctx, x, x + w, cy + 11, C.ruleSoft);
    });
    return cy + 14;
  }
}

// ---------------------------------------------------------------- run file

// What the run is built from: disciplines and their tiers, rig mods, and the
// reaction log, on three tabs.
const FILE_TABS = [['disciplines', 'DISCIPLINES'], ['mods', 'RIG MODS'], ['reactions', 'REACTIONS']];

export class RunFileOverlay extends Overlay {
  constructor(play) {
    super(play);
    this.blocksUpdate = true;
    this.tab = 'disciplines';
    this.tabs = FILE_TABS.map(([id]) => ({ id, x: 0, y: 0, w: 0, h: 32, onClick: () => { this.tab = id; play.sfx.select(); } }));
    this.done = { x: 0, y: 0, w: 0, h: 44, onClick: () => this.close() };
    this.buttons = [...this.tabs, this.done];
    const cycle = () => { this.tab = FILE_TABS[(FILE_TABS.findIndex(([id]) => id === this.tab) + 1) % FILE_TABS.length][0]; };
    this.keys = { escape: this.done.onClick, enter: this.done.onClick, f: this.done.onClick, tab: cycle, arrowright: cycle, 1: () => { this.tab = 'disciplines'; }, 2: () => { this.tab = 'mods'; }, 3: () => { this.tab = 'reactions'; } };
  }

  render(ctx) {
    const a = this.appear;
    dim(ctx, this.frame, a * 1.1);
    ctx.save();
    ctx.globalAlpha = a;
    const v = this.fit(ctx, [
      { key: `${this.tab}:full`, w: 560, draw: (x, y, w, h) => this.body(ctx, x, y, w, h, false) },
      { key: `${this.tab}:compact`, w: 640, draw: (x, y, w, h) => this.body(ctx, x, y, w, h, true) },
    ]);
    this.sheet(ctx, v.key, v.w, v.draw, false);
    ctx.restore();
  }

  body(ctx, x, y, w, h, compact) {
    const play = this.play;
    const lx = x + 18;
    const inner = w - 36;
    report(ctx, x, y, w, h, 'RUN FILE', { tone: C.ctYellow, kicker: kicker(play), form: compact ? null : 'FORM CT-7 · RUN FILE' });
    let cy = y + HEAD + 12;
    const tw = (inner - 2 * 8) / 3;
    FILE_TABS.forEach(([id, label], i) => {
      const b = this.tabs[i];
      Object.assign(b, { x: lx + i * (tw + 8), y: cy, w: tw });
      const on = this.tab === id;
      ctx.fillStyle = on ? C.formInk : b.hover ? C.ruleSoft : C.paper;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = C.formInk;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(b.x + 0.75, b.y + 0.75, b.w - 1.5, b.h - 1.5);
      text(ctx, label, b.x + b.w / 2, b.y + b.h / 2 + 1, 13, { weight: 700, color: on ? C.paper : C.formInk, align: 'center', baseline: 'middle', spacing: 1.5, maxWidth: b.w - 10 });
    });
    cy += 32 + 8;
    if (this.tab === 'disciplines') cy = this.renderDisciplines(ctx, lx, cy, inner, compact);
    else if (this.tab === 'mods') cy = this.renderMods(ctx, lx, cy, inner, compact);
    else cy = this.renderReactions(ctx, lx, cy, inner, compact);
    cy += 14;
    Object.assign(this.done, { x: lx, y: cy, w: inner });
    this.drawButton(ctx, this.done, 'BACK', { key: 'ESC', paper: true });
    return cy + this.done.h + 14 + (compact ? 0 : FOOT) - y;
  }

  renderDisciplines(ctx, x, cy, w, compact) {
    const syn = this.play.syn;
    const ids = compact ? DISCIPLINE_IDS.filter((t) => syn.counts[t] > 0) : DISCIPLINE_IDS;
    mono(ctx, syn.generalist ? 'GENERALIST: 6+ DISCIPLINES IN PLAY, +15% DAMAGE' : `GENERALIST AT 6 DISCIPLINES · ${syn.spread}/6`, x, cy + 12, 10, { weight: 700, color: syn.generalist ? '#2f7d43' : C.formMuted });
    cy += 18;
    if (!ids.length) {
      text(ctx, 'Nothing in play yet. Weapons and traps each count toward their disciplines.', x, cy + 18, 14, { weight: 500, color: C.formMuted, maxWidth: w });
      return cy + 28;
    }
    // Compact sheets on wide, short screens use two columns.
    const cols = compact && w >= 520 ? 2 : 1;
    const gap = 20;
    const cw = (w - gap * (cols - 1)) / cols;
    const top = cy;
    let bottom = cy;
    ids.forEach((t, i) => {
      const d = DISCIPLINES[t];
      const n = syn.counts[t];
      const tier = syn.tiers[t];
      const cx = x + (i % cols) * (cw + gap);
      if (i % cols === 0) cy = bottom;
      let ry = cy + (compact ? 22 : 24);
      tagChips(ctx, [t], cx + 34, ry - 12, 14);
      text(ctx, d.name, cx + 42, ry, 15, { weight: 700, color: n ? C.formInk : C.formMuted });
      mono(ctx, `${n} SOURCE${n === 1 ? '' : 'S'}`, cx + cw, ry, 10, { weight: 600, color: C.formMuted, align: 'right' });
      const rows = compact ? [[tier >= 2 ? 1 : 0, tier >= 2 ? syn.second : 2]] : [[0, 2], [1, syn.second]];
      for (const [k, need] of rows) {
        ry += compact ? 17 : 19;
        checkbox(ctx, cx + 42, ry - 12, tier > k ? 'done' : 'open');
        const color = tier > k ? C.formInk : C.formMuted;
        text(ctx, `${need}: ${d.tiers[k]}`, cx + 64, ry, 13, { weight: tier > k ? 600 : 500, color, maxWidth: cw - 64 });
      }
      rule(ctx, cx, cx + cw, ry + 7, C.ruleSoft);
      bottom = Math.max(bottom, ry);
    });
    return Math.max(top, bottom) + 8;
  }

  renderMods(ctx, x, cy, w, compact) {
    const run = this.play.run;
    if (!run.mods.length) {
      cy += 22;
      return cy + paragraph(ctx, 'No rig mods yet. Elites, bosses, the Supply Room and incidents hand them out.', x, cy, w, 14, 18, { color: C.formMuted });
    }
    for (const id of run.mods) {
      const m = MODS[id];
      const rc = C.rarity[m.rarity] ?? C.rarity.common;
      cy += compact ? 20 : 22;
      ctx.fillStyle = rc;
      ctx.fillRect(x, cy - 10, 6, 12);
      text(ctx, m.name, x + 14, cy, 15, { weight: 700 });
      if (m.tags.length) tagChips(ctx, m.tags, x + w, cy - 11, 13);
      if (compact) {
        text(ctx, m.desc, x + 14 + measure(ctx, m.name, 15, F.body, 700) + 10, cy, 12, { weight: 500, color: C.formMuted, maxWidth: w - 200 });
      } else {
        cy += 17;
        text(ctx, m.desc, x + 14, cy, 13, { weight: 500, color: C.formMuted, maxWidth: w - 14 });
      }
      rule(ctx, x, x + w, cy + 7, C.ruleSoft);
    }
    return cy + 8;
  }

  renderReactions(ctx, x, cy, w, compact) {
    const found = this.play.status.discovered;
    mono(ctx, `${found.size}/${REACTION_IDS.length} FOUND`, x, cy + 12, 10, { weight: 700, color: C.formMuted });
    cy += 14;
    for (const id of REACTION_IDS) {
      const r = REACTIONS[id];
      const known = found.has(id);
      cy += compact ? 20 : 34;
      ctx.fillStyle = known ? r.color : C.ruleSoft;
      ctx.fillRect(x + 1, cy - 10, 10, 10);
      text(ctx, known ? r.name : 'UNLOGGED', x + 20, cy, 14, { weight: 700, color: known ? C.formInk : C.formMuted });
      const desc = known ? r.desc : `Hint: ${r.hint}`;
      if (compact) text(ctx, desc, x + 130, cy, 12, { weight: 500, color: C.formMuted, maxWidth: w - 130 });
      else text(ctx, desc, x + 20, cy + 15, 13, { weight: 500, color: C.formMuted, maxWidth: w - 20 });
    }
    return cy + (compact ? 8 : 22);
  }
}

// ---------------------------------------------------------------- routes

// Pick the next test from up to three orders.
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
    const top = R.y + 114;
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
      const h = clamp(avail, 240, 280);
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
    const boss = this.route[0].type === 'boss';
    const keyHint = this.fine && !boss ? '  Press 1-3.' : '';
    const sub = `Act ${run.act} · ${run.actDef.name} · floor ${run.floor} of ${FLOORS_PER_ACT}${run.loop ? ` · endless ${run.loop}` : ''}${keyHint}`;
    this.heading(ctx, 'FORM CT-4 · TEST SCHEDULE · RUN SAVED', boss ? 'BOSS TEST' : 'SCHEDULE THE NEXT TEST', sub, boss ? C.bad : C.paper);
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
    const rx = x + w - 16;
    const inner = w - 32;
    const rows = this.rows;
    let title = `${tone.label} TEST`;
    if (STOP_TEXT[node.type]) title = tone.label;
    if (node.type === 'crate') title += ` · ${TWISTS[node.twist].name.toUpperCase()}`;
    report(ctx, x, y, w, h, title, { tone: tone.tone, hazardEdge: tone.hazardEdge, kicker: `TEST ORDER · OPTION ${i + 1}`, compact: rows, reserve: this.fine && this.tickets.length > 1 ? 34 : 0 });
    if (t.hover) {
      ctx.strokeStyle = C.accent;
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
    }
    const head = rows ? 40 : HEAD;
    if (this.fine && this.tickets.length > 1) keycap(ctx, String(i + 1), rx - keyW(ctx, String(i + 1)), y + (rows ? 23 : 33));
    const footH = rows ? 0 : 36;
    const bottom = y + h - footH - 10;
    let cy = y + head + 22;

    const stop = STOP_TEXT[node.type];
    if (stop) {
      text(ctx, stop.head, lx, cy, 17, { weight: 700, spacing: 0.8, maxWidth: inner });
      paragraph(ctx, stop.body, lx, cy + 22, inner, 15, 19, { color: C.formMuted, maxLines: rows ? 2 : 4 });
      if (rows) mono(ctx, `ON SELECTION: ${stop.reward}`, lx, y + h - 14, 11, { weight: 600, color: '#8a6a10' });
      else fields(ctx, lx, y + h - footH - 10, inner, [{ label: 'ON SELECTION', value: stop.reward, size: 13 }], footH);
      return;
    }
    const round = node.round;
    const v = VARIANTS[node.variant];
    text(ctx, v.name.toUpperCase(), lx, cy, 17, { weight: 700, spacing: 0.8, maxWidth: inner });
    // Affixes are the point of looking ahead: they sit right under the name.
    const affixes = round.dummy.affixes ?? [];
    if (affixes.length) {
      cy += 17;
      mono(ctx, affixes.map((id) => AFFIXES[id].name.toUpperCase()).join(' · '), lx, cy, 11, { weight: 700, color: C.pen, maxWidth: inner });
    }
    if (!rows) {
      // Description lines get whatever room the objectives leave.
      const objH = 74;
      let lines = Math.max(0, Math.floor((bottom - objH - (cy + 4)) / 18));
      const used = paragraph(ctx, v.desc, lx, cy + 20, inner, 14, 18, { color: C.formMuted, maxLines: lines });
      cy += used;
      lines -= used / 18;
      if (node.twist && lines > 0) cy += paragraph(ctx, TWISTS[node.twist].desc, lx, cy + 22, inner, 14, 18, { color: '#7b4fc4', maxLines: lines }) + 4;
      cy = Math.max(cy + 14, bottom - objH + 8);
      rule(ctx, lx, rx, cy);
      cy += 12;
    }
    cy += 22;
    if (!rows) caption(ctx, 'PRIMARY', lx, cy - 18);
    text(ctx, round.primary.label, lx, cy, 18, { weight: 700, maxWidth: inner });
    cy += 21;
    text(ctx, `Optional: ${round.secondary.label}`, lx, cy, 14, { weight: 600, color: C.accent, maxWidth: inner });
    if (rows) {
      mono(ctx, `ON PASS: ${REWARD_LABEL[round.reward].toUpperCase()}`, lx, y + h - 14, 11, { weight: 600, maxWidth: inner - 60 });
      mono(ctx, `${round.time} s`, rx, y + h - 14, 12, { weight: 700, align: 'right' });
    } else {
      fields(ctx, lx, y + h - footH - 10, inner, [
        { label: 'ON PASS', value: REWARD_LABEL[round.reward], flex: 2.3, size: 13 },
        { label: 'LIMIT', value: `${round.time} s`, size: 13 },
      ], footH);
    }
  }
}

// --------------------------------------------------------------- acts

const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

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
    // Hazard tape across the top and bottom of the frame.
    const tape = easeOutCubic(this.t / 0.5);
    hazard(ctx, R.x, R.y + 10, R.w * tape, 12, 10);
    hazard(ctx, R.x + R.w * (1 - tape), R.y + R.h - 22, R.w * tape, 12, 10);

    const cx = R.x + R.w / 2;
    const cy = R.y + R.h * 0.4;
    const k = easeOutBack(this.t / 0.4);
    const series = `TEST SERIES ${ROMAN[run.act - 1] ?? run.act} OF ${ROMAN[ACTS.length - 1]}${run.loop ? `  ·  ENDLESS ${run.loop}` : ''}`;
    mono(ctx, series, cx, cy - 72, 14, { weight: 600, color: C.ctYellow, align: 'center', spacing: 2 });
    ctx.save();
    ctx.translate(cx, cy - 22);
    ctx.scale(k, k);
    text(ctx, act.name.toUpperCase(), 0, 0, clamp(R.w * 0.085, 32, 70), { weight: 700, color: C.paper, align: 'center', baseline: 'middle', spacing: 4, maxWidth: R.w - 32 });
    ctx.restore();
    paragraph(ctx, act.blurb, cx, cy + 34, Math.min(460, R.w - 48), 18, 24, { color: C.paperDim, align: 'center' });

    // Series progress: a target per act, checked off as you go.
    for (let i = 0; i < ACTS.length; i++) {
      const dx = (i - (ACTS.length - 1) / 2) * 64;
      const px = cx + dx, py = cy + 112;
      if (i < run.act - 1) {
        target(ctx, px, py, 13, { alpha: 0.45 });
        ctx.strokeStyle = C.good;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(px - 8, py);
        ctx.lineTo(px - 2, py + 7);
        ctx.lineTo(px + 10, py - 9);
        ctx.stroke();
        ctx.lineCap = 'butt';
      } else if (i === run.act - 1) {
        target(ctx, px, py, 13 * (1 + 0.1 * Math.sin(this.t * 5)));
      } else {
        ctx.beginPath();
        ctx.arc(px, py, 13, 0, TAU);
        ctx.strokeStyle = C.muted;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      mono(ctx, ROMAN[i], px, py + 32, 11, { weight: 600, color: i === run.act - 1 ? C.paper : C.muted, align: 'center' });
    }
    mono(ctx, `FINAL SUBJECT: ${VARIANTS[act.boss].name.toUpperCase()}`, cx, cy + 172, 12, { weight: 600, color: C.muted, align: 'center', spacing: 1 });
    // The run's conditions: its Safety Rating, and today's mutators for a daily.
    const terms = [run.rating ? `SAFETY RATING ${run.rating}` : null, run.daily ? `DAILY TEST ${run.daily.date}` : null].filter(Boolean);
    if (terms.length) mono(ctx, terms.join('  ·  '), cx, cy + 190, 12, { weight: 700, color: C.ctYellow, align: 'center', spacing: 1 });
    if (run.daily) text(ctx, run.daily.mutators.map((id) => `${MUTATORS[id].name}: ${MUTATORS[id].desc}`).join('   '), cx, cy + 208, 13, { weight: 500, color: C.paperDim, align: 'center', maxWidth: R.w - 32 });
    ctx.globalAlpha = a * pulse(this.t);
    text(ctx, this.fine ? 'CLICK OR PRESS SPACE' : 'TAP TO CONTINUE', cx, Math.min(R.y + R.h - 36, cy + (run.daily ? 240 : 214)), 18, { weight: 700, color: C.paper, align: 'center', spacing: 2.5 });
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
    ctx.save();
    ctx.globalAlpha = a;
    this.sheet(ctx, 'sw', 400, (x, y, w, h) => {
      const round = this.play.round;
      report(ctx, x, y, w, h, 'TEST EXTENSION', { hazardEdge: true, kicker: kicker(this.play) });
      let cy = y + HEAD + 26;
      cy += paragraph(ctx, `Time ran out on floor ${round.act}-${round.floor}, but your Second Wind card saves the run. You get a fresh test order for the same floor.`, x + 18, cy, w - 36, 17, 22, {});
      cy += 8;
      Object.assign(this.btn, { x: x + 18, y: cy, w: w - 36 });
      this.drawButton(ctx, this.btn, 'RETRY TEST', { key: 'SPACE' });
      stampMark(ctx, 'EXTENDED', x + w - 76, y + 32, C.pen, this.t - 0.25, 16);
      return cy + 50 + 18 - y;
    }, false);
    ctx.restore();
  }
}

function runRows(run, fav) {
  return [
    ['Floors cleared', String(run.totals.cleared)],
    ['Secondaries met', String(run.totals.bonuses)],
    ['Reactions triggered', String(run.totals.reactions)],
    ['Damage dealt', String(Math.round(run.totals.damage))],
    ['Dummies destroyed', String(run.totals.kills)],
    ['Limbs torn off', String(run.totals.severs)],
    ['Favorite weapon', fav ? WEAPONS[fav].name.toUpperCase() : '-'],
  ];
}

// A ruled table of run totals. Returns the y after it.
function summaryTable(ctx, rows, lx, rx, cy) {
  for (const [k, v] of rows) {
    cy += 23;
    text(ctx, k, lx, cy, 15, { weight: 500, color: C.formMuted });
    mono(ctx, v, rx, cy, 14, { weight: 600, align: 'right' });
    rule(ctx, lx, rx, cy + 7, C.ruleSoft);
  }
  return cy;
}

// The score field for a finished run: its rank on the records, if it placed.
function scoreField(run) {
  const label = run.rank === 1 ? 'TEST SCORE · NEW RECORD' : run.rank ? `TEST SCORE · #${run.rank}` : 'TEST SCORE';
  return { label, value: runScoreText(run), color: run.rank === 1 ? '#2f7d43' : C.formInk, flex: 1.3 };
}

const runScoreText = (run) => (run.score ?? 0).toLocaleString('en-US');

// Under a finished run: rogue-lite credits, then buttons for the records and
// (in rogue-lite) the upgrade tree. Adds the buttons to the overlay once.
// Returns the y below them.
function renderFiling(o, ctx, lx, cy, inner, short) {
  const play = o.play;
  const lite = settings.rogueLite;
  // What this run unlocked for the future.
  const news = [
    ...(play.run.newCerts ?? []).map((id) => `CERTIFIED ${CERTS[id].name.toUpperCase()}: ${MODS[CERTS[id].mod].name} unlocked`),
    play.run.unlockedRating ? `SAFETY RATING ${progress.maxRating} UNLOCKED` : null,
  ].filter(Boolean).slice(0, short ? 1 : 4);
  for (const line of news) {
    cy += 16;
    mono(ctx, line, lx, cy, 11, { weight: 700, color: '#2f7d43', maxWidth: inner });
  }
  if (news.length) cy += 12;
  if (lite && !short) {
    fields(ctx, lx, cy, inner, [
      { label: 'CREDITS EARNED', value: `+${play.run.payout ?? 0}`, color: '#2f7d43' },
      { label: 'FACILITY BUDGET', value: `${meta.credits} CR` },
    ]);
    cy += 40 + 10;
  }
  if (!o.recordsBtn) {
    o.recordsBtn = { x: 0, y: 0, w: 0, h: 42, onClick: () => play.engine.push(new ScoresOverlay(play, play.run.scoreId)) };
    o.shopBtn = { x: 0, y: 0, w: 0, h: 42, onClick: () => play.engine.push(new TreeOverlay(play)) };
    o.buttons.push(o.recordsBtn);
    o.keys.r = o.recordsBtn.onClick;
    if (lite) {
      o.buttons.push(o.shopBtn);
      o.keys.u = o.shopBtn.onClick;
    }
  }
  const half = (inner - 10) / 2;
  Object.assign(o.recordsBtn, { x: lx, y: cy, w: lite ? half : inner });
  o.drawButton(ctx, o.recordsBtn, 'RECORDS', { primary: false, paper: true, key: 'R' });
  if (lite) {
    Object.assign(o.shopBtn, { x: lx + half + 10, y: cy, w: half });
    o.drawButton(ctx, o.shopBtn, short ? `UPGRADES · +${play.run.payout ?? 0}` : 'UPGRADES', { primary: false, paper: true, key: 'U' });
  }
  return cy + 42 + 12;
}

export class GameOverOverlay extends Overlay {
  constructor(play) {
    super(play);
    this.btn = { x: 0, y: 0, w: 0, h: 50, onClick: () => this.close(() => this.play.newRun()) };
    this.buttons = [this.btn];
    this.printer = new Printer(play.sfx);
    this.keys = { enter: this.btn.onClick, ' ': this.btn.onClick };
  }

  render(ctx) {
    const a = this.appear;
    dim(ctx, this.frame, a * 0.8);
    ctx.save();
    ctx.globalAlpha = a;
    const v = this.fit(ctx, [
      { key: 'full', w: 440, draw: (x, y, w, h) => this.body(ctx, x, y, w, h, false) },
      { key: 'short', w: 440, draw: (x, y, w, h) => this.body(ctx, x, y, w, h, true) },
    ]);
    this.printSheet(ctx, v.key, v.w, v.draw);
    ctx.restore();
  }

  body(ctx, x, y, w, h, short) {
    const play = this.play;
    const run = play.run;
    const lx = x + 18;
    const rx = x + w - 18;
    const inner = w - 36;
    const fav = Object.entries(run.weaponDamage).sort((p, q) => q[1] - p[1])[0]?.[0];
    report(ctx, x, y, w, h, 'TEST TERMINATED', { tone: C.pen, kicker: kicker(play), form: short ? null : 'FORM CT-10 · FAILURE REPORT' });
    let cy = y + HEAD + 12;
    fields(ctx, lx, cy, inner, [
      { label: 'REACHED FLOOR', value: `${play.round.act}-${play.round.floor}`, flex: 0.9 },
      scoreField(run),
      { label: 'CAUSE', value: 'TIME LIMIT', color: C.pen },
    ]);
    cy += 40 + 30;
    section(ctx, lx, cy, inner, 1, 'RUN SUMMARY');
    cy = summaryTable(ctx, runRows(run, fav).slice(0, short ? 2 : 99), lx, rx, cy + 2);
    if (!short) {
      cy += 32;
      section(ctx, lx, cy, inner, 2, 'COMPONENTS INSTALLED', { right: String(run.taken.length) });
      const cards = run.taken.length ? run.taken.join(', ') : 'None';
      cy += 6;
      cy += paragraph(ctx, cards, lx, cy + 16, inner, 14, 18, { maxLines: 4 });
    }
    cy += 18;
    cy = renderFiling(this, ctx, lx, cy, inner, short);
    Object.assign(this.btn, { x: lx, y: cy, w: inner });
    this.drawButton(ctx, this.btn, 'NEW RUN', { key: 'SPACE' });
    stampMark(ctx, 'VOID', rx - 46, y + 31, C.pen, this.since - 0.05, 24);
    return cy + 50 + 14 + (short ? 0 : FOOT) - y;
  }
}

export class VictoryOverlay extends Overlay {
  constructor(play) {
    super(play);
    this.endless = { x: 0, y: 0, w: 0, h: 50, onClick: () => this.close(() => this.play.goEndless()) };
    this.fresh = { x: 0, y: 0, w: 0, h: 46, onClick: () => this.close(() => this.play.newRun()) };
    this.buttons = [this.endless, this.fresh];
    this.printer = new Printer(play.sfx);
    this.keys = { enter: this.endless.onClick, ' ': this.endless.onClick };
  }

  render(ctx) {
    const a = this.appear;
    dim(ctx, this.frame, a * 0.9);
    ctx.save();
    ctx.globalAlpha = a;
    const v = this.fit(ctx, [
      { key: 'full', w: 440, draw: (x, y, w, h) => this.body(ctx, x, y, w, h, false) },
      { key: 'short', w: 440, draw: (x, y, w, h) => this.body(ctx, x, y, w, h, true) },
    ]);
    this.printSheet(ctx, v.key, v.w, v.draw);
    ctx.restore();
  }

  body(ctx, x, y, w, h, short) {
    const run = this.play.run;
    const lx = x + 18;
    const rx = x + w - 18;
    const inner = w - 36;
    const fav = Object.entries(run.weaponDamage).sort((p, q) => q[1] - p[1])[0]?.[0];
    report(ctx, x, y, w, h, 'SERIES CERTIFICATION', { tone: C.rate[0], kicker: kicker(this.play), form: short ? null : 'FORM CT-11 · CERTIFICATE OF DESTRUCTION' });
    let cy = y + HEAD + 12;
    fields(ctx, lx, cy, inner, [
      { label: 'SERIES', value: `${ACTS.length}/${ACTS.length} ACTS`, flex: 0.9 },
      scoreField(run),
      { label: 'RESULT', value: 'DESTROYED', color: '#2f7d43' },
    ]);
    cy += 40;
    if (!short) {
      cy += 24;
      text(ctx, 'Keep going for endless floors with tougher dummies.', lx, cy, 15, { weight: 500, color: C.formMuted, maxWidth: inner });
    }
    cy += 28;
    section(ctx, lx, cy, inner, 1, 'RUN SUMMARY');
    cy = summaryTable(ctx, runRows(run, fav).slice(0, short ? 2 : 99), lx, rx, cy + 2);
    cy += 20;
    cy = renderFiling(this, ctx, lx, cy, inner, short);
    Object.assign(this.endless, { x: lx, y: cy, w: inner });
    this.drawButton(ctx, this.endless, 'KEEP TESTING', { key: 'SPACE' });
    cy += 60;
    Object.assign(this.fresh, { x: lx, y: cy, w: inner });
    this.drawButton(ctx, this.fresh, 'NEW RUN', { primary: false, paper: true });
    stampMark(ctx, 'CERTIFIED', rx - 70, y + 32, '#2f7d43', this.since - 0.05, 20);
    return cy + 46 + 14 + (short ? 0 : FOOT) - y;
  }
}

// ------------------------------------------------------------- placement

// Pick a mount point for a new trap. The arena stays visible so you can see
// how it fits with the rest of the machine; hovering shows a preview.
export class PlaceOverlay extends Overlay {
  constructor(play, trapId, onDone) {
    super(play);
    this.trapId = trapId;
    this.def = TRAPS[trapId];
    this.onDone = onDone;
    this.marks = [];
    this.ghost = createTrap(trapId, null, Math.max(1, play.run.trapLevel(trapId)));
    this.skip = { x: 0, y: 0, w: 0, h: 40, onClick: () => this.close(this.onDone) };
    for (let i = 1; i <= 8; i++) this.keys[String(i)] = () => this.numbered()[i - 1]?.onClick();
  }

  layoutMarks() {
    const play = this.play;
    const L = play.layout;
    const old = this.marks;
    this.marks = mountPoints(play.bounds).map((m, i) => {
      const wx = m.x + m.nx * 34, wy = m.y + m.ny * 34;
      const sx = L.arena.x + wx * L.k, sy = L.arena.y + wy * L.k;
      const ok = this.def.surfaces.includes(m.surface);
      return Object.assign(old[i] ?? {}, {
        mount: m, ok, sx, sy, x: sx - 24, y: sy - 24, w: 48, h: 48,
        occupant: play.run.trapAt(m.id),
        onClick: () => this.place(m),
      });
    });
    const R = this.frame;
    const w = Math.min(240, R.w - 32);
    const A = this.play.layout.arena;
    Object.assign(this.skip, { x: A.x + (A.w - w) / 2, y: A.y + A.h * 0.55 + 58, w });
  }

  // Mounts that take this trap, numbered empty ones first so the low keys
  // never replace a trap by accident.
  numbered() {
    const ok = this.marks.filter((m) => m.ok);
    return [...ok.filter((m) => !m.occupant), ...ok.filter((m) => m.occupant)];
  }

  place(m) {
    const play = this.play;
    play.run.installTrap(this.trapId, m.id);
    play.rebuildMachine();
    play.sfx.install();
    play.fxDust(m.x + m.nx * 20, m.y + m.ny * 20, 10);
    this.close(this.onDone);
  }

  update(dt, isTop) {
    this.layoutMarks();
    this.buttons = [...this.marks.filter((m) => m.ok), this.skip];
    super.update(dt, isTop);
  }

  render(ctx) {
    const play = this.play;
    const L = this.L;
    const R = this.frame;
    const a = this.appear;
    this.layoutMarks();
    dim(ctx, L.arena, a * 0.45);

    // Preview the trap on the hovered mount, in world space.
    const hover = this.marks.find((m) => m.hover && m.ok);
    if (hover) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(L.arena.x, L.arena.y, L.arena.w, L.arena.h);
      ctx.clip();
      ctx.translate(L.arena.x, L.arena.y);
      ctx.scale(L.k, L.k);
      ctx.globalAlpha = 0.7 * a;
      this.ghost.m = hover.mount;
      this.def.draw(this.ghost, ctx, play, 'back');
      this.def.draw(this.ghost, ctx, play, 'front');
      ctx.restore();
    }

    // Mount points are calibration targets; occupied ones show their trap.
    ctx.save();
    ctx.globalAlpha = a;
    let n = 0;
    const order = this.numbered();
    for (const m of this.marks) {
      if (!m.ok) {
        ctx.fillStyle = 'rgba(239,234,223,0.25)';
        ctx.beginPath();
        ctx.arc(m.sx, m.sy, 6, 0, TAU);
        ctx.fill();
        continue;
      }
      n++;
      const s = 1 + 0.08 * Math.sin(this.t * 6 + n);
      ctx.beginPath();
      ctx.arc(m.sx, m.sy, 22 * s, 0, TAU);
      ctx.strokeStyle = m.hover ? C.accent : m.occupant ? C.gold : C.ctYellow;
      ctx.lineWidth = m.hover ? 4 : 2;
      ctx.setLineDash(m.hover ? [] : [5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      if (m.occupant) {
        ctx.beginPath();
        ctx.arc(m.sx, m.sy, 17, 0, TAU);
        ctx.fillStyle = 'rgba(22,25,21,0.9)';
        ctx.fill();
        drawTrapIcon(ctx, m.occupant.id, m.sx, m.sy, 24, { alpha: 0.9 });
        mono(ctx, 'SWAP', m.sx, m.sy + 38, 10, { weight: 700, color: C.gold, align: 'center' });
      } else {
        target(ctx, m.sx, m.sy, 14 * (m.hover ? 1.15 : 1));
      }
      if (this.fine) keycap(ctx, String(order.indexOf(m) + 1), m.sx + 18, m.sy - 22, { dark: true });
    }

    // An installation order across the middle of the arena, clear of the mounts.
    const cx = R.x + R.w / 2;
    const top = L.arena.y + L.arena.h * 0.55 - 48;
    ctx.fillStyle = C.paper;
    ctx.fillRect(L.arena.x, top, L.arena.w, 96);
    hazard(ctx, L.arena.x, top, L.arena.w, 6, 8);
    hazard(ctx, L.arena.x, top + 90, L.arena.w, 6, 8);
    mono(ctx, `FORM CT-6 · INSTALLATION ORDER · ${TODAY}`, cx, top + 23, 10, { weight: 600, color: C.formMuted, align: 'center', maxWidth: R.w - 32 });
    const title = `INSTALL: ${this.def.name.toUpperCase()}`;
    const size = clamp(R.w * 0.04, 20, 28);
    const tw = Math.min(measure(ctx, title, size, F.body, 700, 2), R.w - 110);
    ctx.fillStyle = C.ink;
    ctx.fillRect(cx - tw / 2 - 42, top + 28, 32, 32);
    drawTrapIcon(ctx, this.trapId, cx - tw / 2 - 26, top + 44, 26);
    text(ctx, title, cx + 4, top + 54, size, { weight: 700, align: 'center', spacing: 2, maxWidth: R.w - 110 });
    const where = this.def.surfaces.map((x) => SURFACE_LABEL[x]).join(', ');
    text(ctx, `Mounts on the ${where}. ${hover?.occupant ? `Replaces the ${TRAPS[hover.occupant.id].name}.` : 'Pick a target.'}`, cx, top + 78, 15, { weight: 500, color: C.formMuted, align: 'center', maxWidth: R.w - 32 });
    this.drawButton(ctx, this.skip, 'SKIP THIS TRAP', { primary: false });
    ctx.restore();
  }
}

// ------------------------------------------------------------- settings

// Opened from the gear on the pause sheet or the title screen.
export class SettingsOverlay extends Overlay {
  constructor(play) {
    super(play);
    this.blocksUpdate = true;
    this.rows = [
      { key: 'gore', title: 'Gore', desc: 'Blood splashes, stains the cell and pumps from torn limbs. Off: foam and plastic chips only.' },
      { key: 'rogueLite', title: 'Rogue-lite mode', desc: 'Runs pay out credits when they end. Spend them on permanent facility upgrades that apply from your next run. Off: every run starts from scratch.' },
    ].map((r) => ({ ...r, x: 0, y: 0, w: 0, h: 0, onClick: () => this.flip(r.key) }));
    this.done = { x: 0, y: 0, w: 0, h: 46, onClick: () => this.close() };
    this.shop = { x: 0, y: 0, w: 0, h: 40, onClick: () => play.engine.push(new TreeOverlay(play)) };
    this.keys = { escape: this.done.onClick, enter: this.done.onClick, s: this.done.onClick, 1: () => this.flip('gore'), 2: () => this.flip('rogueLite') };
  }

  flip(key) {
    setSetting(key, !settings[key]);
    this.play.sfx.select();
  }

  render(ctx) {
    const a = this.appear;
    dim(ctx, this.frame, a * 0.9);
    ctx.save();
    ctx.globalAlpha = a;
    // The rogue-lite row adds the shop button, so each state measures apart.
    const rl = settings.rogueLite;
    const v = this.fit(ctx, [
      { key: `full:${rl}`, w: 460, draw: (x, y, w, h) => this.body(ctx, x, y, w, h, false) },
      { key: `short:${rl}`, w: 460, draw: (x, y, w, h) => this.body(ctx, x, y, w, h, true) },
    ]);
    this.sheet(ctx, v.key, v.w, v.draw, false);
    ctx.restore();
  }

  body(ctx, x, y, w, h, short) {
    const lx = x + 18;
    const rx = x + w - 18;
    const inner = w - 36;
    report(ctx, x, y, w, h, 'FACILITY SETTINGS', { kicker: `CRASH TEST FACILITY  ·  ${TODAY}`, form: short ? null : 'FORM CT-2 · OPERATING PARAMETERS' });
    let cy = y + HEAD + 8;
    this.buttons = [];
    this.rows.forEach((r, i) => {
      if (short) cy += 6;
      else {
        cy += 28;
        section(ctx, lx, cy, inner, i + 1, i ? 'TEST PROGRAM' : 'DISPLAY');
        cy += 12;
      }
      const rowTop = cy;
      // Last frame's row height; rows don't change size on hover.
      if (r.hover) {
        ctx.fillStyle = C.ruleSoft;
        ctx.fillRect(lx - 6, rowTop, inner + 12, r.h);
      }
      cy += 22;
      text(ctx, r.title, lx, cy, 18, { weight: 700 });
      if (this.fine) keycap(ctx, String(i + 1), lx + measure(ctx, r.title, 18, F.body, 700) + 10, cy - 6);
      toggle(ctx, rx - 96, cy - 20, settings[r.key]);
      cy += paragraph(ctx, r.desc, lx, cy + 19, inner - 110, 14, 18, { color: C.formMuted, maxLines: short ? 2 : 4 }) + 4;
      Object.assign(r, { x: lx - 6, y: rowTop, w: inner + 12, h: cy - rowTop + 4 });
      this.buttons.push(r);
    });
    if (settings.rogueLite) {
      cy += 14;
      Object.assign(this.shop, { x: lx, y: cy, w: inner });
      this.drawButton(ctx, this.shop, `FACILITY UPGRADES · ${meta.credits} CR`, { primary: false, paper: true });
      this.buttons.push(this.shop);
      cy += this.shop.h;
    }
    cy += 16;
    Object.assign(this.done, { x: lx, y: cy, w: inner });
    this.drawButton(ctx, this.done, 'DONE', { key: 'ESC' });
    this.buttons.push(this.done);
    return cy + this.done.h + 14 + (short ? 0 : FOOT) - y;
  }
}
