// The rogue-lite progression tree, drawn as a facility development plan on
// graph paper. Drag to pan, wheel or the corner buttons to zoom, tap a node
// to inspect it. Owned nodes are calibration targets, the ones next to them
// can be bought, one step further they show only as undiscovered markers,
// and past that nothing is drawn.

import { clamp } from '../../engine/math.js';
import { drawTarget as target } from '../icons.js';
import { TREE, EDGES, BRANCHES, node, branchOf } from '../tree.js';
import { meta, nodeState, buyNode, ownedCount, nodeCount, applyTree, creditBonus } from '../meta.js';
import { Run } from '../run.js';
import { settings } from '../settings.js';
import { C, F, font } from '../theme.js';
import { Overlay, HEAD, TODAY, TAU, report, text, mono, caption, paragraph, dim, verdict, hit, rule, measure } from './sheet.js';

const ZOOM_MIN = 0.45;
const ZOOM_MAX = 1.8;
const GREEN = '#2f7d43';

const BASE_R = { start: 22, keystone: 19, outer: 19, bridge: 14, node: 14 };

// Labels over lines and grid get a paper halo.
function halo(ctx, s, x, y, size, { family = F.body, weight = 700, color = C.formInk, align = 'center' } = {}) {
  ctx.font = font(size, family, weight);
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#f4f1e8';
  ctx.strokeText(s, x, y);
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

// What the owned nodes add up to, worked out by applying them to a blank run.
const pct = (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`;
const SUMMARY = [
  ['rerolls', (d) => `+${d} starting rerolls`],
  ['timeBonus', (d) => `+${d} s on every floor`],
  ['lives', (d) => `+${d} Second Wind`],
  ['choices', (d) => `+${d} card choice`],
  ['weaponMult', (d, v) => `${pct(v - 1)} weapon damage`, true],
  ['trapMult', (d, v) => `${pct(v - 1)} trap damage`, true],
  ['critChance', (d) => `${pct(d)} crit chance`],
  ['critMult', (d) => `+${d}x crit damage`],
  ['statusMult', (d, v) => `${pct(v - 1)} status effects`, true],
  ['reactionMult', (d, v) => `${pct(v - 1)} reaction damage`, true],
  ['dummyHpMult', (d, v) => `${pct(v - 1)} dummy health`, true],
  ['limbFragility', (d, v) => `limbs tear ${pct(v - 1)} easier`, true],
  ['headMult', (d, v) => `${pct(v - 1)} head damage`, true],
  ['impactMult', (d, v) => `${pct(v - 1)} impact damage`, true],
  ['hydraChance', (d) => `${pct(d)} split chance`],
  ['chainStep', (d) => `${pct(d)} per chain source`],
  ['startLevel', (d, v) => `starting weapons level ${v}`],
  ['trapStartLevel', (d, v) => `new traps start at level ${v}`],
  ['bossRerolls', (d) => `+${d} rerolls per boss`],
];
const FLAGS = [
  ['extraStarter', 'second starting weapon'],
  ['extraTrap', 'second starting trap'],
  ['prewired', 'first trap one level up'],
  ['overclock', 'Overclocked'],
  ['adrenaline', 'Adrenaline'],
  ['combo', 'Combo Counter'],
  ['shatter', 'exploding dummies'],
  ['chainReaction', 'Chain Reaction'],
];

function treeSummary() {
  const base = new Run(0);
  const run = new Run(0);
  applyTree(run);
  const lines = [];
  for (const [key, fmt, ratio] of SUMMARY) {
    const d = +(run[key] - base[key]).toFixed(3);
    if (ratio ? Math.abs(run[key] - 1) > 0.001 && run[key] !== base[key] : d) lines.push(fmt(d, run[key]));
  }
  for (const [key, label] of FLAGS) if (run[key] && !base[key]) lines.push(label);
  const credits = creditBonus();
  if (credits) lines.push(`${pct(credits)} credits per run`);
  return lines;
}

function kindLabel(n) {
  if (n.kind === 'start') return 'CHARTER';
  if (n.kind === 'bridge') return 'BRIDGE';
  if (n.kind === 'outer') return 'DIRECTORATE';
  const br = branchOf(n);
  return n.kind === 'keystone' ? `${br.name} · KEYSTONE` : br.name;
}

function glyph(n) {
  if (n.kind === 'bridge') return '=';
  if (n.kind === 'outer') return '*';
  return branchOf(n)?.glyph ?? '';
}

export class TreeOverlay extends Overlay {
  constructor(play) {
    super(play);
    this.blocksUpdate = true;
    this.pan = { x: 0, y: 0 };
    this.zoom = 1;
    this.selected = 'start';
    this.hoverNode = null;
    this.drag = null;
    this.flash = null;
    const mk = (h, onClick) => ({ x: 0, y: 0, w: 0, h, onClick });
    this.buyBtn = mk(44, () => this.buy());
    this.done = mk(44, () => this.close());
    this.zoomInBtn = mk(32, () => this.zoomBy(1.2));
    this.zoomOutBtn = mk(32, () => this.zoomBy(1 / 1.2));
    this.homeBtn = mk(32, () => this.recenter());
    const step = (dx, dy) => () => this.panBy(dx, dy);
    this.keys = {
      escape: this.done.onClick, u: this.done.onClick,
      enter: this.buyBtn.onClick, b: this.buyBtn.onClick,
      '+': this.zoomInBtn.onClick, '=': this.zoomInBtn.onClick, '-': this.zoomOutBtn.onClick,
      c: this.homeBtn.onClick, 0: this.homeBtn.onClick,
      n: () => this.nextOpen(),
      arrowleft: step(80, 0), arrowright: step(-80, 0), arrowup: step(0, 80), arrowdown: step(0, -80),
    };
  }

  // Sheet, viewport and info panel. The panel sits on the right when the
  // sheet is wide, along the bottom otherwise.
  layout() {
    const R = this.frame;
    const sheet = { x: R.x + 12, y: R.y + 12, w: R.w - 24, h: R.h - 24 };
    const side = sheet.w >= 760;
    const top = sheet.y + HEAD + 8;
    let view, panel;
    if (side) {
      panel = { x: sheet.x + sheet.w - 12 - 256, y: top, w: 256, h: sheet.y + sheet.h - 12 - top };
      view = { x: sheet.x + 12, y: top, w: panel.x - 10 - (sheet.x + 12), h: panel.h };
      Object.assign(this.done, { x: panel.x + 12, y: panel.y + panel.h - 12 - 44, w: panel.w - 24 });
      Object.assign(this.buyBtn, { x: panel.x + 12, y: this.done.y - 10 - 44, w: panel.w - 24 });
    } else {
      const ph = 178;
      panel = { x: sheet.x + 12, y: sheet.y + sheet.h - 12 - ph, w: sheet.w - 24, h: ph };
      view = { x: sheet.x + 12, y: top, w: sheet.w - 24, h: panel.y - 10 - top };
      const half = (panel.w - 34) / 2;
      Object.assign(this.buyBtn, { x: panel.x + 12, y: panel.y + panel.h - 12 - 44, w: half });
      Object.assign(this.done, { x: panel.x + 22 + half, y: this.buyBtn.y, w: half });
    }
    const zx = view.x + view.w - 8 - 32;
    Object.assign(this.zoomInBtn, { x: zx, y: view.y + 8, w: 32 });
    Object.assign(this.zoomOutBtn, { x: zx, y: view.y + 46, w: 32 });
    Object.assign(this.homeBtn, { x: zx, y: view.y + 84, w: 32 });
    this.box = { sheet, side, view, panel };
  }

  // Screen position of a tree point.
  toScreen(n) {
    const V = this.box.view;
    return { x: V.x + V.w / 2 + this.pan.x + n.x * this.zoom, y: V.y + V.h / 2 + this.pan.y + n.y * this.zoom };
  }

  radius(n) {
    return BASE_R[n.kind] * clamp(this.zoom, 0.65, 1.3);
  }

  nodeAt(x, y) {
    let best = null, bestD = Infinity;
    for (const n of TREE.nodes) {
      if (nodeState(n.id) === 'hidden') continue;
      const p = this.toScreen(n);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < this.radius(n) + 8 && d < bestD) {
        best = n;
        bestD = d;
      }
    }
    return best;
  }

  panBy(dx, dy) {
    const lim = 6.6 * 96 * this.zoom;
    this.pan.x = clamp(this.pan.x + dx, -lim, lim);
    this.pan.y = clamp(this.pan.y + dy, -lim, lim);
  }

  // Zoom about a screen point (the view's middle by default).
  zoomBy(f, ax, ay) {
    const V = this.box.view;
    const cx = V.x + V.w / 2, cy = V.y + V.h / 2;
    ax ??= cx;
    ay ??= cy;
    const z = clamp(this.zoom * f, ZOOM_MIN, ZOOM_MAX);
    const k = z / this.zoom;
    this.pan.x = ax - cx - (ax - cx - this.pan.x) * k;
    this.pan.y = ay - cy - (ay - cy - this.pan.y) * k;
    this.zoom = z;
  }

  recenter() {
    this.pan = { x: 0, y: 0 };
    this.zoom = 1;
  }

  // Select the next buyable node and bring it into view.
  nextOpen() {
    const open = TREE.nodes.filter((n) => nodeState(n.id) === 'open');
    if (!open.length) return;
    const i = open.findIndex((n) => n.id === this.selected);
    const n = open[(i + 1) % open.length];
    this.selected = n.id;
    this.pan = { x: -n.x * this.zoom, y: -n.y * this.zoom };
    this.play.sfx.select();
  }

  buy() {
    const n = node(this.selected);
    if (nodeState(n.id) !== 'open') return;
    if (buyNode(n.id)) {
      this.play.sfx.install();
      this.flash = { id: n.id, t: 0.7 };
    } else {
      this.play.sfx.bonusFail();
    }
  }

  update(dt, isTop) {
    this.layout();
    if (this.flash) {
      this.flash.t -= dt;
      if (this.flash.t <= 0) this.flash = null;
    }
    this.buttons = [this.zoomInBtn, this.zoomOutBtn, this.homeBtn, this.done];
    if (nodeState(this.selected) === 'open') this.buttons.push(this.buyBtn);
    super.update(dt, isTop);
    if (!isTop || this.closing >= 0) return;

    const input = this.play.input;
    const p = input.pointer;
    const V = this.box.view;
    const overButton = this.buttons.some((b) => hit(b, p.x, p.y));
    const inView = hit(V, p.x, p.y) && !overButton;
    if (p.pressed && inView) this.drag = { x: p.x, y: p.y, px: this.pan.x, py: this.pan.y, moved: false };
    if (this.drag && p.down) {
      const dx = p.x - this.drag.x, dy = p.y - this.drag.y;
      if (Math.hypot(dx, dy) > 6) this.drag.moved = true;
      if (this.drag.moved) {
        this.pan = { x: this.drag.px, y: this.drag.py };
        this.panBy(dx, dy);
      }
    }
    if (p.released && this.drag) {
      if (!this.drag.moved) {
        const n = this.nodeAt(p.x, p.y);
        if (n && n.id !== this.selected) {
          this.selected = n.id;
          this.play.sfx.select();
        }
      }
      this.drag = null;
    }
    this.hoverNode = p.type === 'mouse' && !p.down && inView ? this.nodeAt(p.x, p.y)?.id ?? null : null;
    if (this.hoverNode) this.play.engine.cursor = 'pointer';
    else if (this.drag?.moved) this.play.engine.cursor = 'grabbing';
    else if (inView) this.play.engine.cursor = 'grab';
    if (input.wheel && inView) this.zoomBy(input.wheel < 0 ? 1.15 : 1 / 1.15, p.x, p.y);
  }

  render(ctx) {
    this.layout();
    const { sheet } = this.box;
    const a = this.appear;
    dim(ctx, this.frame, a * 1.2);
    ctx.save();
    ctx.globalAlpha = a;
    const installed = `${ownedCount() - 1}/${nodeCount() - 1} INSTALLED`;
    if (sheet.w >= 560) {
      report(ctx, sheet.x, sheet.y, sheet.w, sheet.h, 'FACILITY DEVELOPMENT PLAN', { tone: GREEN, kicker: `FORM DR-15 · CAPITAL REQUISITION  ·  ${TODAY}`, reserve: 200 });
      mono(ctx, `BUDGET ${meta.credits} CR`, sheet.x + sheet.w - 18, sheet.y + 30, 15, { weight: 700, color: GREEN, align: 'right' });
      mono(ctx, installed, sheet.x + sheet.w - 18, sheet.y + 46, 10, { weight: 600, color: C.formMuted, align: 'right' });
    } else {
      // Narrow: the budget rides in the kicker line.
      report(ctx, sheet.x, sheet.y, sheet.w, sheet.h, 'DEVELOPMENT PLAN', { tone: GREEN, kicker: `BUDGET ${meta.credits} CR  ·  ${installed}` });
    }
    this.renderView(ctx);
    this.renderPanel(ctx);
    ctx.restore();
  }

  renderView(ctx) {
    const V = this.box.view;
    const z = this.zoom;
    const o = this.toScreen({ x: 0, y: 0 });
    ctx.save();
    ctx.beginPath();
    ctx.rect(V.x, V.y, V.w, V.h);
    ctx.clip();

    // Graph paper, aligned to the charter.
    ctx.fillStyle = '#f4f1e8';
    ctx.fillRect(V.x, V.y, V.w, V.h);
    const cell = 24 * z;
    const startX = o.x - Math.ceil((o.x - V.x) / cell) * cell;
    const startY = o.y - Math.ceil((o.y - V.y) / cell) * cell;
    for (let gx = startX, i = Math.round((startX - o.x) / cell); gx < V.x + V.w; gx += cell, i++) {
      ctx.fillStyle = i % 4 ? '#e6e0d1' : '#d4ccb9';
      ctx.fillRect(Math.round(gx), V.y, 1, V.h);
    }
    for (let gy = startY, i = Math.round((startY - o.y) / cell); gy < V.y + V.h; gy += cell, i++) {
      ctx.fillStyle = i % 4 ? '#e6e0d1' : '#d4ccb9';
      ctx.fillRect(V.x, Math.round(gy), V.w, 1);
    }
    // Survey rings around the charter.
    ctx.strokeStyle = 'rgba(122,114,99,0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    for (let r = 1; r <= 6; r++) {
      ctx.beginPath();
      ctx.arc(o.x, o.y, r * 96 * z, 0, TAU);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Branch names once a branch is in sight.
    for (const br of BRANCHES) {
      if (nodeState(`${br.id}.1`) === 'hidden') continue;
      const ang = ((br.angle - 14) * Math.PI) / 180;
      halo(ctx, br.name, o.x + Math.cos(ang) * 1.5 * 96 * z, o.y + Math.sin(ang) * 1.5 * 96 * z, 10, { family: F.mono, color: C.formMuted });
    }

    // Links: solid between owned nodes, thin to buyable ones, dashed toward
    // the undiscovered.
    for (const [ia, ib] of EDGES) {
      const sa = nodeState(ia), sb = nodeState(ib);
      if (sa === 'hidden' || sb === 'hidden' || (sa === 'hinted' && sb === 'hinted')) continue;
      const pa = this.toScreen(node(ia)), pb = this.toScreen(node(ib));
      const both = sa === 'owned' && sb === 'owned';
      const hinted = sa === 'hinted' || sb === 'hinted';
      ctx.strokeStyle = hinted ? C.rule : C.formInk;
      ctx.lineWidth = both ? 3.5 * clamp(z, 0.7, 1.2) : hinted ? 1 : 1.5;
      ctx.setLineDash(hinted ? [4, 4] : []);
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    const focus = this.hoverNode ?? this.selected;
    const order = TREE.nodes.filter((n) => nodeState(n.id) !== 'hidden').sort((p, q) => (p.id === focus) - (q.id === focus));
    for (const n of order) this.drawNode(ctx, n, n.id === focus || n.id === this.selected);

    // Legend and zoom controls.
    if (V.w > 380) {
      const ly = V.y + V.h - 12;
      let lx = V.x + 12;
      target(ctx, lx + 5, ly - 4, 5);
      mono(ctx, 'INSTALLED', lx + 14, ly, 9, { weight: 600, color: C.formMuted });
      lx += 86;
      ctx.beginPath();
      ctx.arc(lx + 5, ly - 4, 5, 0, TAU);
      ctx.fillStyle = C.paper;
      ctx.fill();
      ctx.strokeStyle = C.formInk;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      mono(ctx, 'AVAILABLE', lx + 14, ly, 9, { weight: 600, color: C.formMuted });
      lx += 86;
      ctx.setLineDash([2, 2]);
      ctx.strokeStyle = C.rule;
      ctx.beginPath();
      ctx.arc(lx + 5, ly - 4, 5, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      mono(ctx, 'UNDISCOVERED', lx + 14, ly, 9, { weight: 600, color: C.formMuted });
    }
    for (const [b, label] of [[this.zoomInBtn, '+'], [this.zoomOutBtn, '-'], [this.homeBtn, 'C']]) {
      ctx.fillStyle = b.hover ? C.ruleSoft : C.paper;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = C.formInk;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(b.x + 0.75, b.y + 0.75, b.w - 1.5, b.h - 1.5);
      mono(ctx, label, b.x + b.w / 2, b.y + b.h / 2 + 1, 16, { weight: 700, align: 'center', baseline: 'middle' });
    }
    ctx.strokeStyle = C.formInk;
    ctx.lineWidth = 1.25;
    ctx.strokeRect(V.x + 0.5, V.y + 0.5, V.w - 1, V.h - 1);
    ctx.restore();
  }

  drawNode(ctx, n, focused) {
    const st = nodeState(n.id);
    const p = this.toScreen(n);
    const r = this.radius(n);
    const V = this.box.view;
    if (p.x < V.x - 60 || p.x > V.x + V.w + 60 || p.y < V.y - 60 || p.y > V.y + V.h + 60) return;
    const big = n.kind === 'keystone' || n.kind === 'outer' || n.kind === 'start';

    if (st === 'hinted') {
      ctx.fillStyle = '#f4f1e8';
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 0.8, 0, TAU);
      ctx.fill();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = C.rule;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
      mono(ctx, '?', p.x, p.y + 1, 12 * clamp(this.zoom, 0.8, 1.2), { weight: 700, color: C.formMuted, align: 'center', baseline: 'middle' });
    } else if (st === 'owned') {
      if (big) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 4, 0, TAU);
        ctx.strokeStyle = C.formInk;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      target(ctx, p.x, p.y, r);
    } else {
      const afford = meta.credits >= n.cost;
      if (afford) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 3 + 2 * Math.sin(this.t * 5), 0, TAU);
        ctx.strokeStyle = 'rgba(47,125,67,0.45)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, TAU);
      ctx.fillStyle = C.paper;
      ctx.fill();
      ctx.strokeStyle = afford ? C.formInk : C.rule;
      ctx.lineWidth = 2;
      ctx.stroke();
      if (big) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r - 4, 0, TAU);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      mono(ctx, glyph(n), p.x, p.y + 1, (big ? 14 : 12) * clamp(this.zoom, 0.8, 1.2), { weight: 700, color: afford ? C.formInk : C.formMuted, align: 'center', baseline: 'middle' });
    }

    if (this.flash?.id === n.id) {
      const k = 1 - this.flash.t / 0.7;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 4 + k * 30, 0, TAU);
      ctx.strokeStyle = `rgba(47,125,67,${1 - k})`;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    if (focused) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + (big ? 8 : 5), 0, TAU);
      ctx.strokeStyle = C.accent;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    if (st === 'hinted') return;
    // Names (and prices) once zoomed in enough, or for the focused node.
    if (this.zoom >= 0.75 || focused) {
      const ly = p.y + r + 13;
      halo(ctx, n.name, p.x, ly, 11, { color: st === 'owned' ? C.formInk : '#4a453c' });
      if (st === 'open') halo(ctx, `${n.cost} CR`, p.x, ly + 12, 10, { family: F.mono, color: meta.credits >= n.cost ? GREEN : C.formMuted });
    }
  }

  renderPanel(ctx) {
    const { panel: P, side } = this.box;
    const n = node(this.hoverNode ?? this.selected);
    const st = nodeState(n.id);
    ctx.fillStyle = C.paper;
    ctx.fillRect(P.x, P.y, P.w, P.h);
    ctx.strokeStyle = C.formInk;
    ctx.lineWidth = 1.25;
    ctx.strokeRect(P.x + 0.5, P.y + 0.5, P.w - 1, P.h - 1);
    const lx = P.x + 12;
    const inner = P.w - 24;
    let cy = P.y + 20;
    caption(ctx, st === 'hinted' ? 'UNDISCOVERED' : kindLabel(n), lx, cy, { color: n.kind === 'keystone' || n.kind === 'outer' ? C.pen : C.formMuted });
    cy += 24;
    text(ctx, st === 'hinted' ? '? ? ?' : n.name, lx, cy, 20, { weight: 700, maxWidth: inner });
    const desc = st === 'hinted' ? 'Buy a connected upgrade to find out what this is.' : n.kind === 'start' ? `${n.desc} Tap a node to inspect it; drag to look around.` : n.desc;
    cy += 8;
    cy += paragraph(ctx, desc, lx, cy + 14, inner, 14, 18, { color: '#4a453c', maxLines: side ? 6 : 2 });
    cy += side ? 24 : 18;
    if (st === 'owned') {
      const tag = n.kind === 'start' ? 'ON FILE' : 'INSTALLED';
      verdict(ctx, tag, lx + measure(ctx, tag, 12, F.mono, 700) + 12, cy, GREEN);
    } else if (st === 'open') {
      const short = n.cost - meta.credits;
      mono(ctx, short > 0 ? `COST ${n.cost} CR · NEED ${short} MORE` : `COST ${n.cost} CR`, lx, cy, 12, { weight: 700, color: short > 0 ? C.pen : GREEN, maxWidth: inner });
    }
    if (side) {
      cy += 26;
      rule(ctx, lx, lx + inner, cy - 8, C.ruleSoft);
      const note = settings.rogueLite ? 'Upgrades apply when a new run starts.' : 'Rogue-lite mode is off: turn it on in settings for upgrades to apply.';
      cy += paragraph(ctx, note, lx, cy + 6, inner, 13, 17, { color: settings.rogueLite ? C.formMuted : C.pen }) + 22;
      // Everything owned, totalled, as far as the panel has room.
      const lines = treeSummary();
      const bottom = (nodeState(n.id) === 'open' ? this.buyBtn.y : this.done.y) - 10;
      if (cy + 20 < bottom) {
        caption(ctx, 'ACTIVE UPGRADES', lx, cy);
        cy += 6;
        if (!lines.length) {
          text(ctx, 'None yet.', lx, cy + 16, 13, { weight: 500, color: C.formMuted });
        }
        for (const ln of lines) {
          if (cy + 34 > bottom) {
            mono(ctx, '...', lx, cy + 16, 11, { color: C.formMuted });
            break;
          }
          cy += 17;
          text(ctx, ln, lx + 10, cy, 13, { weight: 600, maxWidth: inner - 10 });
          ctx.fillStyle = GREEN;
          ctx.fillRect(lx, cy - 7, 4, 4);
        }
      }
    }
    if (st === 'open') {
      const afford = meta.credits >= n.cost;
      this.drawButton(ctx, this.buyBtn, afford ? `BUY · ${n.cost} CR` : 'NOT ENOUGH CR', { primary: afford, paper: true, key: afford ? 'B' : null });
    }
    this.drawButton(ctx, this.done, 'DONE', { primary: st !== 'open', paper: true, key: 'ESC' });
  }
}
