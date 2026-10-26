// The test dummy: a 15-point Verlet ragdoll drawn as burlap capsules.
// Damage is tracked per segment and per limb; limbs tear off when their
// stitching runs out, and the whole thing bursts at the seams on death.

import { Point, Stick } from '../engine/physics.js';
import { capsulePath } from '../engine/renderer.js';
import { closestOnSegment, segmentDistance, mixRgb, clamp } from '../engine/math.js';
import { C, RGB } from './theme.js';

let nextId = 1;

export const GROUPS = ['head', 'torso', 'arms', 'legs'];

export class Dummy {
  constructor(world, x, y, { scale = 1, hp = 100, limbFragility = 1, bounce = 0.25, boss = false } = {}) {
    this.id = nextId++;
    this.world = world;
    this.s = scale;
    this.maxHp = hp;
    this.hp = hp;
    this.boss = boss;
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
    this.baseRgb = boss ? RGB.burlapBoss : RGB.burlap;

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

    const limbHp = (hp * 0.32) / limbFragility;
    this.limbs = {
      lArm: { root: lArmRoot, joint: lSh, side: 1, top: true, hp: limbHp, max: limbHp, severed: false },
      rArm: { root: rArmRoot, joint: rSh, side: -1, top: true, hp: limbHp, max: limbHp, severed: false },
      lLeg: { root: lLegRoot, joint: lHip, side: 1, top: false, hp: limbHp, max: limbHp, severed: false },
      rLeg: { root: rLegRoot, joint: rHip, side: -1, top: false, hp: limbHp, max: limbHp, severed: false },
    };

    const seg = (name, a, b, r, group, limb = null) => ({ name, a, b, r: r * s, group, limb, dmg: 0, char: 0 });
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

  applyDamage(seg, amount, { limbMult = 1 } = {}) {
    const res = { killed: false, severed: null };
    if (!this.alive) return res;
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
      if (seg.name === 'torso') this.drawTorsoDetail(ctx, seg);
    }
    this.drawSockets(ctx);
    this.drawHead(ctx, this.segMap.head);
    ctx.restore();
    if (this.alive && this.hp < this.maxHp) this.drawHealth(ctx);
  }

  segColor(seg) {
    const bruise = clamp(seg.dmg / (this.maxHp * 0.45), 0, 1) * 0.8;
    let col = mixRgb(this.baseRgb, RGB.bruise, bruise);
    if (seg.char > 0 || this.flash > 0) {
      // Recompute from components when layering effects.
      const base = this.baseRgb.map((v, i) => v + (RGB.bruise[i] - v) * bruise);
      const charred = base.map((v, i) => v + (RGB.char[i] - v) * clamp(seg.char, 0, 0.7));
      col = mixRgb(charred, RGB.white, this.flash > 0 ? 0.45 : 0);
    }
    return col;
  }

  drawSeg(ctx, seg) {
    capsulePath(ctx, seg.a.x, seg.a.y, seg.b.x, seg.b.y, seg.r);
    ctx.fillStyle = this.segColor(seg);
    ctx.fill();
    ctx.lineWidth = 2.5 * this.s;
    ctx.strokeStyle = C.seam;
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
    this.drawSeg(ctx, seg);
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
