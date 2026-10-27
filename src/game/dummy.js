// The test dummy: a 15-point Verlet ragdoll drawn as burlap capsules.
// Damage is tracked per segment and per limb; limbs tear off when their
// stitching runs out, and the whole thing bursts at the seams on death.

import { Point, Stick } from '../engine/physics.js';
import { capsulePath } from '../engine/renderer.js';
import { closestOnSegment, segmentDistance, clamp, hexToRgb } from '../engine/math.js';
import { C, RGB } from './theme.js';
import { VARIANTS } from './variants.js';
import { settings } from './settings.js';

let nextId = 1;

export const GROUPS = ['head', 'torso', 'arms', 'legs'];

export class Dummy {
  constructor(world, x, y, { scale = 1, hp = 100, limbFragility = 1, bounce = 0.25, variant = 'standard' } = {}) {
    const v = VARIANTS[variant] ?? VARIANTS.standard;
    this.id = nextId++;
    this.world = world;
    this.s = scale;
    this.maxHp = hp;
    this.hp = hp;
    this.variant = variant;
    this.traits = v;
    this.boss = !!v.boss;
    this.impactMult = v.impactMult ?? 1;
    bounce = v.bounce ?? bounce;
    // Armor soaks hits to the head and torso until it has taken its share.
    this.armor = v.armor ? { head: hp * v.armor, torso: hp * v.armor, max: hp * v.armor } : null;
    this.balloon = v.balloon ? { hp: hp * 0.12, popped: false } : null;
    this.nails = [];
    this.shockT = 0;
    // Impact bookkeeping: one impact per dummy at a time, and each bounce
    // after a throw is worth half the last.
    this.impactUntil = 0;
    this.impactChain = 0;
    this.entering = null;
    this.alive = true;
    this.deadT = 0;
    this.gone = false;
    this.age = 0;
    this.flash = 0;
    this.ouch = 0;
    this.lastHitBy = null;
    this.lastHitT = -99;
    this.statuses = new Map();
    this.sticks = [];
    this.baseRgb = v.color ? hexToRgb(v.color) : this.boss ? RGB.burlapBoss : RGB.burlap;

    const s = scale;
    const group = 'dummy' + this.id;
    // (x, y) is the pelvis.
    const P = (dx, dy, r, mass = 1) => {
      const p = new Point(x + dx * s, y + dy * s, { r: r * s, mass, bounce, friction: 0.75, group });
      p.owner = this;
      world.addPoint(p);
      return p;
    };
    const head = P(0, -98, 20, 1.3);
    const neck = P(0, -66, 10, 1.2);
    const pelvis = P(0, 0, 12, 1.6);
    const lSh = P(-13, -60, 7), rSh = P(13, -60, 7);
    const lEl = P(-22, -33, 6, 0.9), rEl = P(22, -33, 6, 0.9);
    const lHa = P(-27, -8, 7, 0.8), rHa = P(27, -8, 7, 0.8);
    const lHip = P(-9, 4, 8), rHip = P(9, 4, 8);
    const lKn = P(-11, 38, 7), rKn = P(11, 38, 7);
    const lFt = P(-12, 72, 8), rFt = P(12, 72, 8);
    this.points = { head, neck, pelvis, lSh, rSh, lEl, rEl, lHa, rHa, lHip, rHip, lKn, rKn, lFt, rFt };

    const L = (a, b, o) => {
      const st = world.addStick(new Stick(a, b, o));
      this.sticks.push(st);
      return st;
    };
    this.neckSticks = [L(head, neck), L(head, pelvis, { stiffness: 0.5 })];
    L(neck, pelvis);
    const lArmRoot = [L(lSh, neck), L(lSh, pelvis), L(lSh, rSh, { stiffness: 0.8 })];
    const rArmRoot = [L(rSh, neck), L(rSh, pelvis)];
    const lLegRoot = [L(lHip, pelvis), L(lHip, neck), L(lHip, rHip, { stiffness: 0.8 })];
    const rLegRoot = [L(rHip, pelvis), L(rHip, neck)];
    L(lSh, lEl); L(lEl, lHa); L(rSh, rEl); L(rEl, rHa);
    L(lHip, lKn); L(lKn, lFt); L(rHip, rKn); L(rKn, rFt);
    // Keep knees and feet from folding through each other.
    L(lKn, rKn, { minOnly: true, length: 12 * s });
    L(lFt, rFt, { minOnly: true, length: 10 * s });
    // A helium head lifts the whole body (gravity here is per-point acceleration).
    if (this.balloon) head.gravityScale = -12;

    this.sticksByPoint = new Map();
    for (const st of this.sticks) {
      if (st.minOnly) continue;
      for (const p of [st.a, st.b]) {
        if (!this.sticksByPoint.has(p)) this.sticksByPoint.set(p, []);
        this.sticksByPoint.get(p).push(st);
      }
    }

    const limbHp = (hp * 0.32) / limbFragility;
    this.limbs = {
      lArm: { root: lArmRoot, joint: lSh, side: 1, top: true, hp: limbHp, max: limbHp, severed: false },
      rArm: { root: rArmRoot, joint: rSh, side: -1, top: true, hp: limbHp, max: limbHp, severed: false },
      lLeg: { root: lLegRoot, joint: lHip, side: 1, top: false, hp: limbHp, max: limbHp, severed: false },
      rLeg: { root: rLegRoot, joint: rHip, side: -1, top: false, hp: limbHp, max: limbHp, severed: false },
    };

    const seg = (name, a, b, r, group, limb = null) => ({ name, a, b, r: r * s, group, limb, dmg: 0, char: 0, chill: 0, frozen: 0 });
    const segs = {
      lThigh: seg('lThigh', lHip, lKn, 9, 'legs', 'lLeg'),
      lShin: seg('lShin', lKn, lFt, 8, 'legs', 'lLeg'),
      rThigh: seg('rThigh', rHip, rKn, 9, 'legs', 'rLeg'),
      rShin: seg('rShin', rKn, rFt, 8, 'legs', 'rLeg'),
      torso: seg('torso', neck, pelvis, 19, 'torso'),
      lUpper: seg('lUpper', lSh, lEl, 7.5, 'arms', 'lArm'),
      lFore: seg('lFore', lEl, lHa, 7, 'arms', 'lArm'),
      rUpper: seg('rUpper', rSh, rEl, 7.5, 'arms', 'rArm'),
      rFore: seg('rFore', rEl, rHa, 7, 'arms', 'rArm'),
      head: seg('head', head, head, 21, 'head'),
    };
    this.segMap = segs;
    // Draw order: back to front.
    this.segs = [segs.lThigh, segs.lShin, segs.rThigh, segs.rShin, segs.torso, segs.lUpper, segs.lFore, segs.rUpper, segs.rFore, segs.head];

    this.pointSeg = new Map([
      [head, segs.head], [neck, segs.torso], [pelvis, segs.torso],
      [lSh, segs.lUpper], [lEl, segs.lFore], [lHa, segs.lFore],
      [rSh, segs.rUpper], [rEl, segs.rFore], [rHa, segs.rFore],
      [lHip, segs.lThigh], [lKn, segs.lShin], [lFt, segs.lShin],
      [rHip, segs.rThigh], [rKn, segs.rShin], [rFt, segs.rShin],
    ]);
  }

  get pointList() {
    return Object.values(this.points);
  }

  center() {
    const { neck, pelvis } = this.points;
    return { x: (neck.x + pelvis.x) / 2, y: (neck.y + pelvis.y) / 2 };
  }

  segCenter(seg) {
    return { x: (seg.a.x + seg.b.x) / 2, y: (seg.a.y + seg.b.y) / 2 };
  }

  segForPoint(p) {
    return this.pointSeg.get(p) ?? this.segMap.torso;
  }

  // Nearest segment whose surface is within `pad` of (x, y).
  hitPoint(x, y, pad = 0) {
    if (!this.alive) return null;
    let best = null;
    for (const seg of this.segs) {
      const c = closestOnSegment(x, y, seg.a.x, seg.a.y, seg.b.x, seg.b.y);
      const d = Math.hypot(x - c.x, y - c.y) - seg.r;
      if (d <= pad && (!best || d < best.d)) best = { dummy: this, seg, d, x: c.x, y: c.y, t: c.t };
    }
    return best;
  }

  // First segment touched by the swept segment (x0,y0)->(x1,y1).
  hitSwipe(x0, y0, x1, y1, pad = 0) {
    if (!this.alive) return null;
    let best = null;
    for (const seg of this.segs) {
      const r = segmentDistance(x0, y0, x1, y1, seg.a.x, seg.a.y, seg.b.x, seg.b.y);
      if (r.d - seg.r <= pad && (!best || r.s < best.s)) best = { dummy: this, seg, s: r.s, t: r.t, x: r.x, y: r.y };
    }
    return best;
  }

  // Nearest segment to a point and the distance to its surface.
  nearest(x, y) {
    let best = null;
    for (const seg of this.segs) {
      const c = closestOnSegment(x, y, seg.a.x, seg.a.y, seg.b.x, seg.b.y);
      const d = Math.max(0, Math.hypot(x - c.x, y - c.y) - seg.r);
      if (!best || d < best.d) best = { dummy: this, seg, d, x: c.x, y: c.y, t: c.t };
    }
    return best;
  }

  // Push a segment; the nearer endpoint gets the full velocity.
  impulse(seg, t, vx, vy, dt) {
    if (seg.a === seg.b) {
      seg.a.addVelocity(vx, vy, dt);
      return;
    }
    const wa = 1 - t, wb = t;
    const k = 1 / Math.max(wa, wb, 0.5);
    seg.a.addVelocity(vx * wa * k, vy * wa * k, dt);
    seg.b.addVelocity(vx * wb * k, vy * wb * k, dt);
  }

  // Rotate the whole body around the pelvis (used to spawn it lying down).
  rotate(angle) {
    const { pelvis } = this.points;
    const c = Math.cos(angle), s = Math.sin(angle);
    for (const p of this.pointList) {
      if (p === pelvis) continue;
      const dx = p.x - pelvis.x, dy = p.y - pelvis.y;
      p.x = p.px = pelvis.x + dx * c - dy * s;
      p.y = p.py = pelvis.y + dx * s + dy * c;
    }
  }

  // Coming in from outside the arena through an opening in one wall.
  enter(wall) {
    this.entering = { wall, t: 0 };
    for (const p of this.pointList) p.passWall = wall;
    // A balloon head would float straight back out of a ceiling hatch.
    if (this.balloon) this.points.head.gravityScale = 1;
  }

  updateEntry(dt, bounds) {
    const e = this.entering;
    if (!e) return;
    e.t += dt;
    const inside = this.pointList.every((p) => p.x - p.r > bounds.left && p.x + p.r < bounds.right && p.y - p.r > bounds.top && p.y + p.r < bounds.bottom + 1);
    if (!inside && e.t < 2) return;
    for (const p of this.pointList) p.passWall = null;
    if (this.balloon && !this.balloon.popped) this.points.head.gravityScale = -12;
    this.entering = null;
  }

  isBleeding() {
    for (const key of this.statuses.keys()) if (key.startsWith('bleed:')) return true;
    return false;
  }

  // Returns what actually landed after armor, plus anything that broke.
  applyDamage(seg, amount, { limbMult = 1, pierce = false } = {}) {
    const res = { killed: false, severed: null, dealt: amount, armorBroken: null, popped: false };
    if (!this.alive) return res;
    const g = seg.group;
    if (this.armor && !pierce && (g === 'head' || g === 'torso') && this.armor[g] > 0) {
      this.armor[g] -= amount;
      amount *= 0.4;
      res.dealt = amount;
      if (this.armor[g] <= 0) res.armorBroken = g;
    }
    if (this.balloon && !this.balloon.popped && g === 'head') {
      this.balloon.hp -= amount;
      if (this.balloon.hp <= 0) {
        this.balloon.popped = true;
        this.points.head.gravityScale = 1;
        res.popped = true;
      }
    }
    this.hp -= amount;
    seg.dmg += amount;
    this.flash = 0.08;
    this.ouch = 0.35;
    if (seg.limb) {
      const limb = this.limbs[seg.limb];
      if (!limb.severed) {
        limb.hp -= amount * limbMult;
        if (limb.hp <= 0) {
          this.sever(seg.limb);
          res.severed = seg.limb;
        }
      }
    }
    if (this.hp <= 0) {
      this.hp = 0;
      res.killed = true;
    }
    return res;
  }

  sever(key) {
    const limb = this.limbs[key];
    limb.severed = true;
    for (const st of limb.root) st.broken = true;
  }

  // Bursts at the seams: every joint between body parts lets go.
  die(dt) {
    this.alive = false;
    this.deadT = 0;
    for (const st of this.neckSticks) st.broken = true;
    for (const key in this.limbs) {
      if (!this.limbs[key].severed) this.sever(key);
    }
    const c = this.center();
    for (const p of this.pointList) {
      p.solid = false;
      const dx = p.x - c.x, dy = p.y - c.y;
      const d = Math.hypot(dx, dy) || 1;
      p.addVelocity((dx / d) * 500 + (Math.random() - 0.5) * 300, (dy / d) * 400 - 450 - Math.random() * 300, dt);
    }
  }

  destroy() {
    for (const p of this.pointList) p.dead = true;
    for (const st of this.sticks) st.broken = true;
    this.gone = true;
  }

  update(dt) {
    this.age += dt;
    this.flash = Math.max(0, this.flash - dt);
    this.ouch = Math.max(0, this.ouch - dt);
    this.shockT = Math.max(0, this.shockT - dt);
    if (this.alive && this.traits.regen && !this.isBleeding()) {
      this.hp = Math.min(this.maxHp, this.hp + this.traits.regen * this.maxHp * dt);
    }
    if (!this.alive) {
      this.deadT += dt;
      if (this.deadT > 2.2) this.destroy();
    }
  }

  draw(ctx) {
    ctx.save();
    if (!this.alive) ctx.globalAlpha = clamp(1 - (this.deadT - 1.4) / 0.8, 0, 1);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const seg of this.segs) {
      if (seg.name === 'head') continue;
      this.drawSeg(ctx, seg);
      if (seg.name === 'torso') {
        this.drawTorsoDetail(ctx, seg);
        if (this.armor?.torso > 0) this.drawVest(ctx, seg);
      }
    }
    this.drawSockets(ctx);
    this.drawHead(ctx, this.segMap.head);
    this.drawNails(ctx);
    if (this.shockT > 0 && this.alive) this.drawArcs(ctx);
    ctx.restore();
    if (this.alive && this.hp < this.maxHp) this.drawHealth(ctx);
  }

  // Base burlap, then bruising, scorching, ice, electricity and hit flash.
  segColor(seg) {
    const mix = (c, to, t) => c.map((v, i) => v + (to[i] - v) * t);
    let c = mix(this.baseRgb, settings.gore ? RGB.bruise : RGB.grime, clamp(seg.dmg / (this.maxHp * 0.45), 0, 1) * 0.8);
    if (seg.char > 0) c = mix(c, RGB.char, clamp(seg.char, 0, 0.7));
    if (seg.frozen > 0) c = mix(c, RGB.ice, 0.65);
    if (this.shockT > 0 && Math.random() < 0.5) c = mix(c, RGB.volt, 0.6);
    if (this.flash > 0) c = mix(c, RGB.white, 0.45);
    return `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
  }

  drawSeg(ctx, seg) {
    capsulePath(ctx, seg.a.x, seg.a.y, seg.b.x, seg.b.y, seg.r);
    ctx.fillStyle = this.segColor(seg);
    ctx.fill();
    ctx.lineWidth = 2.5 * this.s;
    ctx.strokeStyle = seg.frozen > 0 ? '#5a8fae' : C.seam;
    ctx.stroke();
    if (seg.frozen > 0) {
      // Frost glints.
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1.5 * this.s;
      ctx.beginPath();
      const mx = (seg.a.x + seg.b.x) / 2, my = (seg.a.y + seg.b.y) / 2;
      ctx.moveTo(mx - seg.r * 0.5, my - seg.r * 0.3);
      ctx.lineTo(mx + seg.r * 0.2, my - seg.r * 0.6);
      ctx.stroke();
    }
  }

  drawVest(ctx, seg) {
    const s = this.s;
    const ax = seg.a.x + (seg.b.x - seg.a.x) * 0.12, ay = seg.a.y + (seg.b.y - seg.a.y) * 0.12;
    const bx = seg.a.x + (seg.b.x - seg.a.x) * 0.72, by = seg.a.y + (seg.b.y - seg.a.y) * 0.72;
    capsulePath(ctx, ax, ay, bx, by, seg.r * 1.06);
    ctx.fillStyle = '#596067';
    ctx.fill();
    ctx.lineWidth = 2 * s;
    ctx.strokeStyle = C.ink;
    ctx.stroke();
    ctx.fillStyle = '#9aa1a8';
    for (const t of [0.2, 0.5, 0.8]) {
      ctx.beginPath();
      ctx.arc(ax + (bx - ax) * t, ay + (by - ay) * t, 1.8 * s, 0, Math.PI * 2);
      ctx.fill();
    }
    if (this.armor.torso < this.armor.max * 0.5) this.drawCrack(ctx, (ax + bx) / 2, (ay + by) / 2, seg.r);
  }

  drawCrack(ctx, x, y, r) {
    ctx.strokeStyle = 'rgba(20,20,20,0.8)';
    ctx.lineWidth = 1.5 * this.s;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.6, y - r * 0.2);
    ctx.lineTo(x - r * 0.1, y + r * 0.1);
    ctx.lineTo(x + r * 0.2, y - r * 0.3);
    ctx.lineTo(x + r * 0.6, y + r * 0.2);
    ctx.stroke();
  }

  drawNails(ctx) {
    for (const n of this.nails) {
      ctx.fillStyle = '#b8bec4';
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(n.x, n.y, 3.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.arc(n.x - 1, n.y - 1, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Crackling arcs between random body points while shocked.
  drawArcs(ctx) {
    const pts = this.pointList;
    ctx.strokeStyle = C.volt;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      const a = pts[Math.floor(Math.random() * pts.length)];
      const b = pts[Math.floor(Math.random() * pts.length)];
      ctx.moveTo(a.x, a.y);
      for (let i = 1; i <= 4; i++) {
        const t = i / 4;
        ctx.lineTo(a.x + (b.x - a.x) * t + (Math.random() - 0.5) * 14, a.y + (b.y - a.y) * t + (Math.random() - 0.5) * 14);
      }
    }
    ctx.stroke();
  }

  drawTorsoDetail(ctx, seg) {
    const s = this.s;
    const ax = seg.a.x, ay = seg.a.y, bx = seg.b.x, by = seg.b.y;
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const ux = (bx - ax) / len, uy = (by - ay) / len;
    const nx = -uy, ny = ux;
    ctx.strokeStyle = C.stitch;
    ctx.lineWidth = 1.6 * s;
    ctx.beginPath();
    for (let t = 0.1; t <= 0.95; t += 0.14) {
      const cx = ax + (bx - ax) * t + nx * 4 * s, cy = ay + (by - ay) * t + ny * 4 * s;
      ctx.moveTo(cx - nx * 4 * s - ux * 2 * s, cy - ny * 4 * s - uy * 2 * s);
      ctx.lineTo(cx + nx * 4 * s + ux * 2 * s, cy + ny * 4 * s + uy * 2 * s);
    }
    ctx.stroke();
    // A little cloth patch over the heart.
    const px = ax + (bx - ax) * 0.3 - nx * 8 * s, py = ay + (by - ay) * 0.3 - ny * 8 * s;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.atan2(uy, ux) - Math.PI / 2);
    ctx.fillStyle = this.boss ? C.bad : C.accent;
    ctx.strokeStyle = C.seam;
    ctx.lineWidth = 1.5 * s;
    ctx.beginPath();
    ctx.rect(-5 * s, -5 * s, 10 * s, 10 * s);
    ctx.fill();
    ctx.setLineDash([2 * s, 2 * s]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  drawSockets(ctx) {
    const s = this.s;
    const { neck, pelvis } = this.points;
    const len = Math.hypot(pelvis.x - neck.x, pelvis.y - neck.y) || 1;
    const ux = (pelvis.x - neck.x) / len, uy = (pelvis.y - neck.y) / len;
    const nx = -uy, ny = ux;
    ctx.fillStyle = C.fluff;
    ctx.strokeStyle = 'rgba(120,100,70,0.6)';
    ctx.lineWidth = 1.2 * s;
    const puff = (x, y, r) => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.arc(x + r * 0.7, y - r * 0.4, r * 0.7, 0, Math.PI * 2);
      ctx.arc(x - r * 0.6, y + r * 0.3, r * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    };
    for (const key in this.limbs) {
      const limb = this.limbs[key];
      if (!limb.severed) continue;
      puff(limb.joint.x, limb.joint.y, 6 * s);
      if (this.alive) {
        const base = limb.top ? neck : pelvis;
        const along = limb.top ? 7 : 3;
        const side = limb.top ? 13 : 9;
        puff(base.x + nx * side * s * limb.side + ux * along * s, base.y + ny * side * s * limb.side + uy * along * s, 5 * s);
      }
    }
    if (!this.alive) puff(neck.x, neck.y, 7 * s);
  }

  drawHead(ctx, seg) {
    const s = this.s;
    const { head, neck } = this.points;
    if (this.balloon && !this.balloon.popped) {
      // A string back to the neck and a shiny balloon for a head.
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(neck.x, neck.y);
      ctx.quadraticCurveTo((neck.x + head.x) / 2 + 6, (neck.y + head.y) / 2, head.x, head.y + seg.r);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(head.x, head.y, seg.r * 1.05, seg.r * 1.2, 0, 0, Math.PI * 2);
      ctx.fillStyle = this.flash > 0 ? '#ff9a90' : '#e2483d';
      ctx.fill();
      ctx.lineWidth = 2.5 * s;
      ctx.strokeStyle = '#7d1d17';
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.ellipse(head.x - seg.r * 0.4, head.y - seg.r * 0.5, seg.r * 0.22, seg.r * 0.35, -0.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      this.drawSeg(ctx, seg);
    }
    const ang = this.alive ? Math.atan2(head.y - neck.y, head.x - neck.x) + Math.PI / 2 : this.age * 3;
    ctx.save();
    ctx.translate(head.x, head.y);
    ctx.rotate(ang);
    // Tied-off sack knot on top.
    ctx.fillStyle = this.segColor(seg);
    ctx.strokeStyle = C.seam;
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.moveTo(-3 * s, -19 * s);
    ctx.lineTo(-9 * s, -29 * s);
    ctx.lineTo(0, -25 * s);
    ctx.lineTo(9 * s, -29 * s);
    ctx.lineTo(3 * s, -19 * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    const hurt = this.hp / this.maxHp < 0.35 || !this.alive;
    const eye = (ex, xEye) => {
      if (xEye) {
        ctx.strokeStyle = C.button;
        ctx.lineWidth = 2.6 * s;
        ctx.beginPath();
        ctx.moveTo(ex - 4 * s, -7 * s);
        ctx.lineTo(ex + 4 * s, 1 * s);
        ctx.moveTo(ex + 4 * s, -7 * s);
        ctx.lineTo(ex - 4 * s, 1 * s);
        ctx.stroke();
        return;
      }
      ctx.fillStyle = C.button;
      ctx.beginPath();
      ctx.arc(ex, -3 * s, 4.8 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.paperDim;
      for (const [hx, hy] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) {
        ctx.beginPath();
        ctx.arc(ex + hx * s, -3 * s + hy * s, 0.8 * s, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    eye(-7.5 * s, !this.alive);
    eye(7.5 * s, hurt);
    if (this.armor?.head > 0) {
      // Riot helmet with a visor line.
      ctx.beginPath();
      ctx.arc(0, 0, seg.r * 1.12, Math.PI * 1.05, Math.PI * 1.95);
      ctx.lineTo(seg.r * 1.1, -seg.r * 0.1);
      ctx.lineTo(-seg.r * 1.1, -seg.r * 0.1);
      ctx.closePath();
      ctx.fillStyle = '#596067';
      ctx.fill();
      ctx.lineWidth = 2 * s;
      ctx.strokeStyle = C.ink;
      ctx.stroke();
      ctx.fillStyle = 'rgba(150,200,230,0.5)';
      ctx.fillRect(-seg.r * 0.8, -seg.r * 0.38, seg.r * 1.6, seg.r * 0.22);
      if (this.armor.head < this.armor.max * 0.5) this.drawCrack(ctx, 0, -seg.r * 0.7, seg.r * 0.8);
    }

    ctx.strokeStyle = C.stitch;
    ctx.lineWidth = 1.8 * s;
    if (this.ouch > 0 && this.alive) {
      ctx.fillStyle = C.button;
      ctx.beginPath();
      ctx.ellipse(0, 9 * s, 4 * s, 5 * s * Math.min(1, this.ouch * 4), 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(-8 * s, 9 * s);
      ctx.quadraticCurveTo(0, hurt ? 6 * s : 12 * s, 8 * s, 9 * s);
      for (let i = -6; i <= 6; i += 4) {
        ctx.moveTo(i * s, 7 * s);
        ctx.lineTo(i * s, 12 * s);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  drawHealth(ctx) {
    const s = this.s;
    const { head } = this.points;
    const w = 46 * s * (this.boss ? 1.6 : 1);
    const x = head.x - w / 2;
    const y = head.y - 42 * s;
    ctx.fillStyle = 'rgba(22,25,21,0.75)';
    ctx.fillRect(x - 2, y - 2, w + 4, 8);
    ctx.fillStyle = this.hp / this.maxHp < 0.35 ? C.bad : C.gold;
    ctx.fillRect(x, y, w * (this.hp / this.maxHp), 4);
  }
}
