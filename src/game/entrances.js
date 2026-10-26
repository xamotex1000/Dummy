// How dummies arrive, one entrance per act:
//   door  (Padded Cell)  a cell door in the left wall; an orderly flings it in
//   hatch (Crash Lab)    a ceiling hatch opens and it drops through
//   chute (Furnace)      a delivery chute in the right wall shoots it out
//
// Spawns queue up here. The entrance opens, launches each dummy from just
// outside the arena (its points may pass that one wall while entering, and
// the arena clip hides what's still outside), then closes again.

import { clamp, easeOutBack, easeOutCubic } from '../engine/math.js';
import { roundRectPath } from '../engine/renderer.js';
import { C } from './theme.js';

const KIND = { cell: 'door', lab: 'hatch', furnace: 'chute' };

const OPEN_TIME = { door: 0.4, hatch: 0.45, chute: 0.3 };

export class Entrance {
  constructor(sc, theme) {
    this.sc = sc;
    this.kind = KIND[theme] ?? 'door';
    this.reset();
  }

  reset() {
    this.queue = [];
    this.state = 'closed';
    this.open = 0; // 0 closed .. 1 fully open
    this.t = 0;
    this.arm = 0; // the orderly's throwing arm, 0..1
    this.armT = 0;
    this.slot = 0; // which hatch is next
    this.warn = 0;
    this.scale = 1;
  }

  get busy() {
    return this.queue.length > 0 || this.state !== 'closed';
  }

  enqueue(spec) {
    this.queue.push(spec);
    this.scale = Math.max(this.scale, spec.scale ?? 1);
    if (this.state === 'closed' || this.state === 'closing') {
      if (this.state === 'closed') this.slot = (this.slot + 1) % 2;
      this.state = 'opening';
      this.t = 0;
      this.warn = this.kind === 'hatch' ? 0.35 : 0;
      if (!this.warn) this.sc.sfx.entranceOpen(this.kind);
    }
  }

  update(dt) {
    this.armT = Math.max(0, this.armT - dt);
    this.arm = this.armT > 0.3 ? easeOutBack((0.42 - this.armT) / 0.12) : clamp(this.armT / 0.3, 0, 1);
    switch (this.state) {
      case 'opening':
        if (this.warn > 0) {
          // The lab hatch flashes a warning light first.
          this.warn -= dt;
          if (this.warn <= 0) this.sc.sfx.entranceOpen(this.kind);
          break;
        }
        this.open = Math.min(1, this.open + dt / OPEN_TIME[this.kind]);
        if (this.open >= 1) {
          this.state = 'open';
          this.t = 0;
          this.launchNext();
        }
        break;
      case 'open':
        this.t += dt;
        if (this.queue.length && this.t >= 0.3) {
          this.t = 0;
          this.launchNext();
        } else if (!this.queue.length && this.t >= 0.7) {
          this.state = 'closing';
        }
        break;
      case 'closing':
        this.open = Math.max(0, this.open - dt / 0.22);
        if (this.open <= 0) {
          this.state = 'closed';
          this.scale = 1;
          this.sc.sfx.entranceClose(this.kind);
          this.sc.shake(this.kind === 'door' ? 0.12 : 0.06);
        }
        break;
    }
  }

  // ------------------------------------------------------------ geometry

  // The opening, in world units, sized for the biggest dummy coming through.
  rect() {
    const B = this.sc.bounds;
    const s = this.scale;
    if (this.kind === 'door') {
      const h = 205 * s;
      return { x: 0, y: B.bottom - h, w: 84 * s, h };
    }
    if (this.kind === 'hatch') {
      const w = 130 * s;
      const cx = B.right * (this.slot ? 0.68 : 0.32);
      return { x: cx - w / 2, y: 0, w, h: 16 };
    }
    const h = 120 * s;
    const cy = Math.min(B.bottom * 0.4, B.bottom - h);
    return { x: B.right - 22, y: cy - h / 2, w: 22, h };
  }

  launchNext() {
    const spec = this.queue.shift();
    const sc = this.sc;
    const rng = sc.rng;
    const r = this.rect();
    const s = spec.scale ?? 1;
    let d;
    if (this.kind === 'door') {
      // Standing just outside the doorway, then flung in tumbling.
      d = sc.spawnDummy(-58 * s, { ...spec, y: sc.bounds.bottom - 84 * s, raw: true });
      d.enter('left');
      // A lobbed arc with a forward somersault: the top of the body moves
      // faster than the feet.
      const vx = rng.range(560, 760), vy = rng.range(-760, -600);
      const py = d.points.pelvis.y;
      for (const p of d.pointList) p.setVelocity(vx + (py - p.y) * 4.2 / s, vy, sc.dt);
      this.armT = 0.42;
      sc.sfx.whoosh();
    } else if (this.kind === 'hatch') {
      const cx = r.x + r.w / 2;
      d = sc.spawnDummy(cx, { ...spec, y: -110 * s, raw: true });
      d.enter('top');
      const vx = rng.range(-60, 60);
      for (const p of d.pointList) p.setVelocity(vx, 260, sc.dt);
      sc.fxDust(cx, 4, 6);
    } else {
      // Out of the chute head first, lying flat to fit the pipe.
      const cy = r.y + r.h / 2;
      d = sc.spawnDummy(sc.bounds.right + 70 * s, { ...spec, y: cy, raw: true });
      d.rotate(-Math.PI / 2);
      d.enter('right');
      const vx = -rng.range(1000, 1250), vy = rng.range(-260, -120);
      for (const p of d.pointList) p.setVelocity(vx, vy, sc.dt);
      for (let i = 0; i < 10; i++) {
        sc.particles.spawn({ kind: 'smoke', x: r.x, y: cy + rng.range(-30, 30), vx: -rng.range(80, 260), vy: rng.range(-60, 30), size: rng.range(8, 14), grow: 30, color: '#5b524c', life: rng.range(0.5, 0.9), drag: 2 });
      }
      sc.sfx.whoosh();
    }
    spec.onSpawn?.(d);
  }

  // --------------------------------------------------------------- render

  draw(ctx, layer) {
    if (this.kind === 'door') this.drawDoor(ctx, layer);
    else if (this.kind === 'hatch') this.drawHatch(ctx, layer);
    else this.drawChute(ctx, layer);
  }

  drawDoor(ctx, layer) {
    const r = this.rect();
    const o = easeOutCubic(this.open);
    if (layer === 'back') {
      // Frame and the dark corridor behind.
      ctx.fillStyle = '#6d756b';
      ctx.fillRect(r.x, r.y - 10, r.w + 10, r.h + 10);
      const g = ctx.createLinearGradient(r.x, 0, r.x + r.w, 0);
      g.addColorStop(0, '#0c0e0c');
      g.addColorStop(1, '#262b25');
      ctx.fillStyle = g;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      return;
    }
    // The orderly's arm reaches out of the doorway as it throws.
    if (this.arm > 0.01) {
      const ay = r.y + r.h * 0.42;
      const reach = r.x - 30 + this.arm * (r.w + 60);
      ctx.fillStyle = '#f1f3ef';
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 2.5;
      roundRectPath(ctx, r.x - 40, ay - 11, reach - r.x + 40, 22, 9);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#9fc6d9';
      ctx.fillRect(reach - 14, ay - 11, 6, 22);
      ctx.beginPath();
      ctx.arc(reach + 6, ay, 13, 0, Math.PI * 2);
      ctx.fillStyle = C.paper;
      ctx.fill();
      ctx.stroke();
    }
    // The door leaf swings toward the viewer on its right-hand hinge.
    const hinge = r.x + r.w;
    const leafW = r.w * (1 - o * 0.82);
    const skew = o * 16;
    ctx.beginPath();
    ctx.moveTo(hinge, r.y);
    ctx.lineTo(hinge - leafW, r.y - skew);
    ctx.lineTo(hinge - leafW, r.y + r.h + skew * 0.3);
    ctx.lineTo(hinge, r.y + r.h);
    ctx.closePath();
    ctx.fillStyle = o > 0.5 ? '#8f988d' : '#a3ab9f';
    ctx.fill();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 3;
    ctx.stroke();
    if (leafW > 24) {
      // Observation window and the cell number.
      const wx = hinge - leafW * 0.72, ww = leafW * 0.44;
      ctx.fillStyle = '#1d2a2f';
      ctx.fillRect(wx, r.y + r.h * 0.18, ww, r.h * 0.12);
      ctx.strokeStyle = '#596057';
      ctx.lineWidth = 2;
      ctx.strokeRect(wx, r.y + r.h * 0.18, ww, r.h * 0.12);
      ctx.fillStyle = C.ink;
      ctx.fillRect(hinge - leafW * 0.85, r.y + r.h * 0.52, leafW * 0.14, 8);
    }
  }

  drawHatch(ctx, layer) {
    const r = this.rect();
    const o = easeOutCubic(this.open);
    if (layer === 'back') {
      ctx.fillStyle = '#15181b';
      ctx.fillRect(r.x, 0, r.w, 14);
      return;
    }
    // Frame with hazard stripes.
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x - 14, 0, r.w + 28, 14);
    ctx.clip();
    ctx.fillStyle = '#f2c230';
    ctx.fillRect(r.x - 14, 0, r.w + 28, 14);
    ctx.fillStyle = C.ink;
    for (let x = r.x - 30; x < r.x + r.w + 30; x += 18) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 9, 0);
      ctx.lineTo(x + 23, 14);
      ctx.lineTo(x + 14, 14);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    // Two flaps hinged at the sides swing down.
    const half = r.w / 2;
    for (const side of [-1, 1]) {
      const hx = side < 0 ? r.x : r.x + r.w;
      const a = o * Math.PI * 0.45;
      plate(ctx, hx, 14, hx - side * half * Math.cos(a), 14 + half * Math.sin(a), 6, '#c7ced3');
    }
    // Warning light.
    const blink = this.warn > 0 ? Math.floor(this.warn * 16) % 2 : this.state === 'open' ? 1 : 0;
    ctx.beginPath();
    ctx.arc(r.x + r.w + 24, 10, 6, 0, Math.PI * 2);
    ctx.fillStyle = blink ? C.bad : '#5b2a26';
    ctx.fill();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  drawChute(ctx, layer) {
    const r = this.rect();
    const o = easeOutCubic(this.open);
    const cy = r.y + r.h / 2;
    const B = this.sc.bounds;
    if (layer === 'back') {
      // Pipe mouth, glowing inside.
      const g = ctx.createRadialGradient(B.right, cy, 4, B.right, cy, r.h * 0.6);
      g.addColorStop(0, `rgba(255,140,50,${0.4 + o * 0.4})`);
      g.addColorStop(1, '#120d0b');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(B.right, cy, r.w + 14, r.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    // Flange rim.
    ctx.strokeStyle = '#7c6a60';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.ellipse(B.right, cy, r.w + 14, r.h / 2 + 4, 0, Math.PI * 0.5, Math.PI * 1.5);
    ctx.stroke();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 2;
    ctx.stroke();
    for (const k of [-0.75, 0, 0.75]) {
      ctx.fillStyle = '#a89184';
      ctx.beginPath();
      ctx.arc(B.right - (r.w + 14) * Math.sqrt(1 - k * k), cy + k * (r.h / 2 + 4), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Flap hinged at the top swings up and into the room.
    const ang = o * 1.3;
    plate(ctx, B.right - 4, r.y, B.right - 4 - Math.sin(ang) * r.h, r.y + Math.cos(ang) * r.h, 9, '#6b5d55');
  }
}

// A flat panel from (x0,y0) to (x1,y1) with real thickness, so it doesn't
// collapse into a line at some angles.
function plate(ctx, x0, y0, x1, y1, thick, fill) {
  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
  const nx = (-(y1 - y0) / len) * thick / 2;
  const ny = ((x1 - x0) / len) * thick / 2;
  ctx.beginPath();
  ctx.moveTo(x0 + nx, y0 + ny);
  ctx.lineTo(x1 + nx, y1 + ny);
  ctx.lineTo(x1 - nx, y1 - ny);
  ctx.lineTo(x0 - nx, y0 - ny);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 2;
  ctx.stroke();
}
