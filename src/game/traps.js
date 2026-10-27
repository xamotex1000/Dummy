// Traps: machines bolted to the arena's mount points that act on their own.
// You build them up over a run; your hands become the spark that feeds them.
//
// Mount points sit on the floor, ceiling and walls. Each has an inward normal
// (nx, ny) so a trap can face into the room from any surface. Trap damage is
// credited to 'trap:<id>', so it counts for chains and trap objectives but
// never against weapon bonuses.

import { lerp } from '../engine/math.js';
import { roundRectPath } from '../engine/renderer.js';
import { C } from './theme.js';

export const TRAP_ORDER = ['spring', 'spinner', 'fan', 'flamejet', 'saw', 'tesla', 'cryo', 'turret', 'crusher'];
export const STARTER_TRAPS = ['spring', 'spinner', 'fan', 'flamejet', 'saw', 'tesla'];
export const MAX_TRAP_LEVEL = 5;

export const SURFACE_LABEL = { floor: 'floor', ceiling: 'ceiling', wall: 'wall' };

// The eight mounts, laid out to stay clear of the act entrances
// (cell door bottom-left, lab hatches at 32%/68% of the ceiling, chute right).
export function mountPoints(B) {
  const W = B.right, H = B.bottom;
  return [
    { id: 'floorL', surface: 'floor', x: W * 0.2, y: H, nx: 0, ny: -1 },
    { id: 'floorC', surface: 'floor', x: W * 0.5, y: H, nx: 0, ny: -1 },
    { id: 'floorR', surface: 'floor', x: W * 0.8, y: H, nx: 0, ny: -1 },
    { id: 'ceilL', surface: 'ceiling', x: W * 0.15, y: 0, nx: 0, ny: 1 },
    { id: 'ceilC', surface: 'ceiling', x: W * 0.5, y: 0, nx: 0, ny: 1 },
    { id: 'ceilR', surface: 'ceiling', x: W * 0.85, y: 0, nx: 0, ny: 1 },
    { id: 'wallL', surface: 'wall', x: 0, y: H * 0.3, nx: 1, ny: 0 },
    { id: 'wallR', surface: 'wall', x: W, y: H * 0.78, nx: -1, ny: 0 },
  ];
}

export function mountById(B, id) {
  return mountPoints(B).find((m) => m.id === id);
}

// A point `off` units into the room from the mount.
const out = (m, off) => ({ x: m.x + m.nx * off, y: m.y + m.ny * off });

function nearestDummy(sc, x, y, range = Infinity) {
  let best = null;
  for (const d of sc.dummies) {
    if (!d.alive || d.entering) continue;
    const n = d.nearest(x, y);
    if (n.d < range && (!best || n.d < best.n.d)) best = { d, n };
  }
  return best;
}

// Rotate into the mount's frame: +x along the inward normal.
function mountFrame(ctx, m) {
  ctx.translate(m.x, m.y);
  ctx.rotate(Math.atan2(m.ny, m.nx));
}

function bracket(ctx, w = 46) {
  ctx.fillStyle = '#4b5250';
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 2.5;
  ctx.fillRect(0, -w / 2, 10, w);
  ctx.strokeRect(0, -w / 2, 10, w);
  ctx.fillStyle = '#8d9592';
  for (const y of [-w / 2 + 6, w / 2 - 6]) {
    ctx.beginPath();
    ctx.arc(5, y, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function batArm(ctx, x, y, ang, len) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(14, -4);
  ctx.lineTo(len - 26, -9);
  ctx.arc(len - 12, 0, 10, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(14, 4);
  ctx.closePath();
  ctx.fillStyle = C.wood;
  ctx.fill();
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.restore();
}

export const TRAPS = {
  spring: {
    name: 'Spring Pad',
    desc: 'Launches anything that lands on it into the ceiling.',
    rarity: 'common',
    surfaces: ['floor'],
    perks: [
      { name: 'Stiffer Spring', desc: 'Launches 30% harder and recharges faster.' },
      { name: 'Launch Pad', desc: 'Each launch also lands a blunt hit.' },
    ],
    init(t) {
      t.cd = 0;
      t.anim = 0;
    },
    update(t, sc, dt) {
      t.cd -= dt;
      t.anim = Math.max(0, t.anim - dt * 3);
      if (t.cd > 0) return;
      const B = sc.bounds;
      for (const d of sc.dummies) {
        if (!d.alive || d.entering) continue;
        if (!d.pointList.some((p) => Math.abs(p.x - t.m.x) < 46 && p.y + p.r > B.bottom - 24)) continue;
        const power = 1500 * (t.level >= 2 ? 1.3 : 1);
        const drift = (B.right / 2 - t.m.x) * 0.5;
        for (const p of d.pointList) if (!p.pinned) p.setVelocity(drift, -power, sc.dt);
        d.lastHitBy = 'trap:spring';
        d.lastHitT = sc.time;
        d.impactChain = 0;
        if (t.level >= 3) sc.dealDamage(d, d.segMap.torso, 10, 'trap:spring', {});
        t.cd = t.level >= 2 ? 0.5 : 0.8;
        t.anim = 1;
        sc.sfx.spring();
        sc.fxDust(t.m.x, B.bottom, 6);
        break;
      }
    },
    draw(t, ctx, sc, layer) {
      if (layer !== 'back') return;
      const { x, y } = t.m;
      const h = 12 + t.anim * 34;
      ctx.fillStyle = '#4b5250';
      ctx.fillRect(x - 44, y - 6, 88, 6);
      ctx.strokeStyle = '#c3c9c7';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i <= 8; i++) {
        const px = x - 30 + (i % 2) * 60;
        const py = y - 6 - (h * i) / 8;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      roundRectPath(ctx, x - 46, y - 14 - h, 92, 10, 4);
      ctx.fillStyle = C.bad;
      ctx.fill();
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    },
    icon(ctx) {
      ctx.strokeStyle = C.steel;
      ctx.lineWidth = 6;
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) ctx.lineTo(-24 + (i % 2) * 48, 30 - i * 9);
      ctx.stroke();
      roundRectPath(ctx, -38, -36, 76, 14, 5);
      ctx.fillStyle = C.bad;
      ctx.fill();
    },
  },

  spinner: {
    name: 'Spinner',
    desc: 'A motorized bat arm that never stops swinging. Blunt: shatters ice.',
    rarity: 'common',
    surfaces: ['floor', 'ceiling', 'wall'],
    perks: [
      { name: 'Overdrive', desc: 'Spins 40% faster.' },
      { name: 'Twin Arms', desc: 'Adds a second arm.' },
    ],
    init(t) {
      t.angle = 0;
      t.prev = 0;
    },
    update(t, sc, dt) {
      const ARM = 92;
      const w = 5.2 * (t.level >= 2 ? 1.4 : 1);
      t.prev = t.angle;
      t.angle += w * dt;
      const hub = out(t.m, 100);
      const arms = t.level >= 3 ? [0, Math.PI] : [0];
      for (const off of arms) {
        for (const d of sc.dummies) {
          if (!d.alive || d.entering) continue;
          let hit = null;
          let ang = 0;
          for (let i = 1; i <= 3 && !hit; i++) {
            ang = lerp(t.prev, t.angle, i / 3) + off;
            const c = Math.cos(ang), s = Math.sin(ang);
            hit = d.hitSwipe(hub.x + c * 18, hub.y + s * 18, hub.x + c * ARM, hub.y + s * ARM, 6);
          }
          if (!hit || !sc.ready(`spin${t.m.id}${off}${d.id}`, 0.3)) continue;
          const speed = w * (18 + hit.s * (ARM - 18));
          const tx = -Math.sin(ang), ty = Math.cos(ang);
          const f = Math.min(speed * 1.6, 1700);
          sc.push(hit, tx * f + t.m.nx * 300, ty * f + t.m.ny * 300);
          sc.dealDamage(hit.dummy, hit.seg, 7 + speed * 0.008, 'trap:spinner', { x: hit.x, y: hit.y });
          sc.fxHit(hit.x, hit.y, { x: tx, y: ty }, 0.7);
          sc.sfx.bat(0.5);
        }
      }
    },
    draw(t, ctx, sc, layer) {
      const hub = out(t.m, 100);
      if (layer === 'back') {
        ctx.save();
        mountFrame(ctx, t.m);
        bracket(ctx);
        ctx.fillStyle = '#6b7370';
        ctx.fillRect(10, -6, 90, 12);
        ctx.strokeStyle = C.ink;
        ctx.lineWidth = 2;
        ctx.strokeRect(10, -6, 90, 12);
        ctx.restore();
        return;
      }
      const arms = t.level >= 3 ? [0, Math.PI] : [0];
      for (const off of arms) batArm(ctx, hub.x, hub.y, t.angle + off, 92);
      ctx.beginPath();
      ctx.arc(hub.x, hub.y, 14, 0, Math.PI * 2);
      ctx.fillStyle = '#7d8584';
      ctx.fill();
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fillStyle = C.gold;
      ctx.beginPath();
      ctx.arc(hub.x, hub.y, 4, 0, Math.PI * 2);
      ctx.fill();
    },
    icon(ctx) {
      batArm(ctx, 0, 0, -0.6, 48);
      batArm(ctx, 0, 0, 2.54, 48);
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fillStyle = '#7d8584';
      ctx.fill();
    },
  },

  fan: {
    name: 'Fan',
    desc: 'On the floor it juggles dummies in the air. On a wall it pins them.',
    rarity: 'common',
    surfaces: ['floor', 'wall'],
    perks: [
      { name: 'High Speed', desc: 'Blows 40% harder.' },
      { name: 'Wide Vents', desc: 'A much wider gust.' },
    ],
    init(t) {
      t.blade = 0;
      t.tag = 0;
    },
    update(t, sc, dt) {
      const m = t.m;
      // Strong enough near the fan to beat gravity, fading with distance, so a
      // floor fan holds a dummy bobbing in mid-air.
      const force = 3700 * (t.level >= 2 ? 1.3 : 1);
      const width = t.level >= 3 ? 200 : 120;
      const len = 520;
      t.blade += dt * 30;
      t.tag -= dt;
      const touched = new Set();
      for (const p of sc.world.points) {
        if (p.pinned || p.proj?.kind === 'anvil') continue;
        const dx = p.x - m.x, dy = p.y - m.y;
        const along = dx * m.nx + dy * m.ny;
        const perp = -dx * m.ny + dy * m.nx;
        if (along < 0 || along > len || Math.abs(perp) > width / 2) continue;
        const f = force * (1 - along / len);
        p.addVelocity(m.nx * f * dt, m.ny * f * dt, dt);
        if (p.owner) touched.add(p.owner);
      }
      // Being blown into a wall counts as the player's doing.
      if (t.tag <= 0) {
        t.tag = 0.5;
        for (const d of touched) {
          if (sc.time - d.lastHitT > 1) {
            d.lastHitBy = 'trap:fan';
            d.lastHitT = sc.time;
          }
        }
      }
      if (sc.rng.chance(0.5)) {
        const perp = sc.rng.range(-width / 2, width / 2);
        const sx = m.x + m.nx * 20 - m.ny * perp, sy = m.y + m.ny * 20 + m.nx * perp;
        sc.particles.spawn({ kind: 'spark', x: sx, y: sy, vx: m.nx * 700, vy: m.ny * 700, size: 1.5, color: 'rgba(255,255,255,0.6)', life: 0.35, drag: 1.5 });
      }
    },
    draw(t, ctx, sc, layer) {
      if (layer !== 'back') return;
      const width = t.level >= 3 ? 110 : 76;
      ctx.save();
      mountFrame(ctx, t.m);
      roundRectPath(ctx, 0, -width / 2, 26, width, 5);
      ctx.fillStyle = '#5e6664';
      ctx.fill();
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      // Blades seen edge-on, flickering as they spin.
      ctx.strokeStyle = '#c3c9c7';
      ctx.lineWidth = 4;
      for (let i = 0; i < 3; i++) {
        const k = Math.sin(t.blade + (i * Math.PI * 2) / 3);
        ctx.beginPath();
        ctx.moveTo(18, 0);
        ctx.lineTo(18 + Math.abs(k) * 6, k * (width / 2 - 6));
        ctx.stroke();
      }
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 1.5;
      for (let y = -width / 2 + 6; y < width / 2; y += 8) {
        ctx.beginPath();
        ctx.moveTo(24, y);
        ctx.lineTo(28, y);
        ctx.stroke();
      }
      ctx.restore();
    },
    icon(ctx) {
      ctx.beginPath();
      ctx.arc(0, 0, 34, 0, Math.PI * 2);
      ctx.fillStyle = '#5e6664';
      ctx.fill();
      ctx.fillStyle = '#c3c9c7';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(Math.cos(i * 2.1) * 15, Math.sin(i * 2.1) * 15, 16, 7, i * 2.1, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  },

  flamejet: {
    name: 'Flame Jet',
    desc: 'Belches a jet of fire every few seconds.',
    rarity: 'common',
    surfaces: ['floor', 'wall'],
    perks: [
      { name: 'Long Burn', desc: 'Fires for longer.' },
      { name: 'Quick Ignition', desc: 'Fires twice as often.' },
    ],
    init(t) {
      t.phase = 'idle';
      t.tt = 1.5;
      t.acc = 0;
    },
    update(t, sc, dt) {
      const m = t.m;
      t.tt -= dt;
      if (t.phase === 'idle' && t.tt <= 0) {
        t.phase = 'warn';
        t.tt = 0.4;
      } else if (t.phase === 'warn' && t.tt <= 0) {
        t.phase = 'fire';
        t.tt = t.level >= 2 ? 1.5 : 0.9;
        sc.sfx.boom(0.3);
      } else if (t.phase === 'fire') {
        const n = out(m, 14);
        for (let i = 0; i < 3; i++) {
          const sp = sc.rng.range(600, 850);
          const spread = sc.rng.range(-0.12, 0.12);
          const vx = m.nx * sp - m.ny * sp * spread, vy = m.ny * sp + m.nx * sp * spread;
          sc.particles.spawn({ kind: 'fire', x: n.x, y: n.y, vx, vy, drag: 1.6, size: sc.rng.range(9, 16), grow: 20, color: C.fire, color2: C.fire2, life: sc.rng.range(0.3, 0.42) });
        }
        t.acc += dt;
        if (t.acc >= 0.12) {
          t.acc = 0;
          for (const d of sc.dummies) {
            if (!d.alive) continue;
            for (const seg of d.segs) {
              const c = d.segCenter(seg);
              const dx = c.x - m.x, dy = c.y - m.y;
              const along = dx * m.nx + dy * m.ny;
              const perp = Math.abs(-dx * m.ny + dy * m.nx);
              if (along > 0 && along < 260 && perp < 28 + seg.r) sc.addBurn(d, seg, 8, 2.5, 'trap:flamejet');
            }
          }
        }
        if (t.tt <= 0) {
          t.phase = 'idle';
          t.tt = t.level >= 3 ? 1.5 : 3;
        }
      }
    },
    draw(t, ctx, sc, layer) {
      if (layer !== 'back') return;
      ctx.save();
      mountFrame(ctx, t.m);
      bracket(ctx, 40);
      roundRectPath(ctx, 8, -11, 18, 22, 3);
      ctx.fillStyle = '#3e3633';
      ctx.fill();
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 2;
      ctx.stroke();
      const glow = t.phase === 'warn' ? 0.5 + 0.5 * Math.abs(Math.sin(sc.time * 25)) : t.phase === 'fire' ? 1 : 0.15;
      ctx.fillStyle = `rgba(255,140,40,${glow})`;
      ctx.beginPath();
      ctx.arc(26, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },
    icon(ctx) {
      roundRectPath(ctx, -40, -14, 28, 28, 4);
      ctx.fillStyle = '#3e3633';
      ctx.fill();
      ctx.fillStyle = C.fire;
      ctx.beginPath();
      ctx.moveTo(-12, -14);
      ctx.quadraticCurveTo(30, -26, 44, 0);
      ctx.quadraticCurveTo(30, 26, -12, 14);
      ctx.fill();
      ctx.fillStyle = C.gold;
      ctx.beginPath();
      ctx.ellipse(6, 0, 18, 8, 0, 0, Math.PI * 2);
      ctx.fill();
    },
  },

  saw: {
    name: 'Floor Saw',
    desc: 'A circular saw that runs back and forth along a floor track.',
    rarity: 'rare',
    surfaces: ['floor'],
    perks: [
      { name: 'Bigger Blade', desc: 'A bigger, faster blade.' },
      { name: 'Twin Track', desc: 'Two blades on the track.' },
    ],
    init(t) {
      t.pos = 0;
      t.dir = 1;
      t.spin = 0;
    },
    radius(t) {
      return t.level >= 2 ? 32 : 26;
    },
    range(t, sc) {
      return Math.min(140, t.m.x - 30, sc.bounds.right - t.m.x - 30);
    },
    update(t, sc, dt) {
      const R = this.radius(t);
      const range = this.range(t, sc);
      t.pos += t.dir * 150 * (t.level >= 2 ? 1.4 : 1) * dt;
      if (Math.abs(t.pos) > range) {
        t.pos = Math.sign(t.pos) * range;
        t.dir *= -1;
      }
      t.spin += dt * 18;
      const blades = t.level >= 3 ? [t.pos, -t.pos] : [t.pos];
      blades.forEach((pos, i) => {
        const cx = t.m.x + pos, cy = sc.bounds.bottom - R;
        for (const d of sc.dummies) {
          if (!d.alive || d.entering) continue;
          const n = d.nearest(cx, cy);
          if (n.d > R * 0.9 || !sc.ready(`saw${t.m.id}${i}${d.id}`, 0.1)) continue;
          sc.dealDamage(d, n.seg, 3.5, 'trap:saw', { kind: 'grind', x: n.x, y: n.y });
          sc.addBleed(d, n.seg, 2, 3, 'trap:saw');
          sc.push({ dummy: d, seg: n.seg, t: n.t }, t.dir * 90, -170);
          sc.fxSparks(n.x, n.y, 2, C.gold);
          sc.sfx.saw();
        }
      });
    },
    draw(t, ctx, sc, layer) {
      const R = this.radius(t);
      const B = sc.bounds;
      const range = this.range(t, sc);
      if (layer === 'back') {
        ctx.fillStyle = '#2c302f';
        ctx.fillRect(t.m.x - range - R, B.bottom - 6, (range + R) * 2, 6);
        return;
      }
      const blades = t.level >= 3 ? [t.pos, -t.pos] : [t.pos];
      for (const pos of blades) {
        const cx = t.m.x + pos, cy = B.bottom - R;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(t.spin * t.dir);
        ctx.beginPath();
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          const r = i % 2 ? R : R * 0.82;
          ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fillStyle = C.steel;
        ctx.fill();
        ctx.strokeStyle = C.ink;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.25, 0, Math.PI * 2);
        ctx.fillStyle = '#6b7370';
        ctx.fill();
        ctx.restore();
      }
    },
    icon(ctx) {
      ctx.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const r = i % 2 ? 38 : 30;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fillStyle = C.steel;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.fillStyle = '#6b7370';
      ctx.fill();
    },
  },

  tesla: {
    name: 'Tesla Coil',
    desc: 'Zaps the nearest dummy every couple of seconds. Sets off shock reactions.',
    rarity: 'rare',
    surfaces: ['floor', 'ceiling'],
    perks: [
      { name: 'Capacitor Bank', desc: 'Zaps 40% more often.' },
      { name: 'Arc Chain', desc: 'Each zap jumps to two more dummies.' },
    ],
    init(t) {
      t.charge = 0;
    },
    interval(t) {
      return t.level >= 2 ? 1.5 : 2.1;
    },
    update(t, sc, dt) {
      t.charge = Math.min(this.interval(t), t.charge + dt);
      if (t.charge < this.interval(t)) return;
      const top = out(t.m, 80);
      const target = nearestDummy(sc, top.x, top.y, 380);
      if (!target) return;
      t.charge = 0;
      const { d, n } = target;
      sc.fxArc(top.x, top.y, n.x, n.y);
      sc.dealDamage(d, n.seg, 8, 'trap:tesla', { x: n.x, y: n.y });
      sc.addShock(d, 'trap:tesla', n.seg);
      sc.sfx.zap();
      if (t.level >= 3) {
        let from = d.center();
        for (const o of sc.dummies.filter((x) => x !== d && x.alive).slice(0, 2)) {
          const oc = o.center();
          sc.fxArc(from.x, from.y, oc.x, oc.y);
          sc.dealDamage(o, o.segMap.torso, 6, 'trap:tesla', { x: oc.x, y: oc.y });
          sc.addShock(o, 'trap:tesla', o.segMap.torso);
          from = oc;
        }
      }
    },
    draw(t, ctx, sc, layer) {
      if (layer !== 'back') return;
      const ready = t.charge / this.interval(t);
      ctx.save();
      mountFrame(ctx, t.m);
      ctx.fillStyle = '#4b5250';
      ctx.fillRect(0, -18, 12, 36);
      ctx.fillStyle = '#5f6765';
      ctx.fillRect(12, -8, 56, 16);
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 2;
      ctx.strokeRect(12, -8, 56, 16);
      ctx.fillStyle = '#c8803e';
      for (let x = 18; x < 64; x += 9) ctx.fillRect(x, -11, 4, 22);
      ctx.beginPath();
      ctx.arc(80, 0, 13, 0, Math.PI * 2);
      ctx.fillStyle = ready >= 1 ? '#bff8ff' : '#9aa3a1';
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      if (ready >= 1 && sc.state === 'playing' && sc.rng.chance(0.25)) {
        const top = out(t.m, 80);
        sc.fxArc(top.x, top.y, top.x + sc.rng.range(-24, 24), top.y + sc.rng.range(-24, 24));
      }
    },
    icon(ctx) {
      ctx.fillStyle = '#5f6765';
      ctx.fillRect(-10, -10, 20, 46);
      ctx.fillStyle = '#c8803e';
      for (let y = -6; y < 34; y += 9) ctx.fillRect(-14, y, 28, 4);
      ctx.beginPath();
      ctx.arc(0, -24, 16, 0, Math.PI * 2);
      ctx.fillStyle = '#bff8ff';
      ctx.fill();
      ctx.strokeStyle = C.volt;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(14, -30);
      ctx.lineTo(28, -38);
      ctx.lineTo(24, -26);
      ctx.lineTo(40, -32);
      ctx.stroke();
    },
  },

  cryo: {
    name: 'Cryo Sprinkler',
    desc: 'Sprays freezing mist below it. Frozen parts shatter under blunt hits.',
    rarity: 'rare',
    surfaces: ['ceiling'],
    perks: [
      { name: 'Longer Spray', desc: 'Sprays 60% longer.' },
      { name: 'Flash Freeze', desc: 'Freezes twice as fast.' },
    ],
    init(t) {
      t.phase = 'idle';
      t.tt = 1;
      t.acc = 0;
    },
    update(t, sc, dt) {
      t.tt -= dt;
      if (t.phase === 'idle') {
        if (t.tt <= 0) {
          t.phase = 'spray';
          t.tt = t.level >= 2 ? 1.9 : 1.2;
          sc.sfx.freeze();
        }
        return;
      }
      const nz = out(t.m, 18);
      for (let i = 0; i < 2; i++) {
        const a = Math.PI / 2 + sc.rng.range(-0.3, 0.3);
        const sp = sc.rng.range(260, 420);
        sc.particles.spawn({ kind: 'dot', x: nz.x, y: nz.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, size: sc.rng.range(2, 4), color: sc.rng.chance(0.5) ? '#ffffff' : C.ice, life: 1.1, drag: 0.6 });
      }
      t.acc += dt;
      if (t.acc >= 0.1) {
        t.acc = 0;
        for (const d of sc.dummies) {
          if (!d.alive) continue;
          for (const seg of d.segs) {
            const c = d.segCenter(seg);
            const depth = c.y - nz.y;
            if (depth > 0 && Math.abs(c.x - nz.x) < 22 + depth * 0.3 + seg.r) sc.addChill(d, seg, t.level >= 3 ? 0.16 : 0.08, 'trap:cryo');
          }
        }
      }
      if (t.tt <= 0) {
        t.phase = 'idle';
        t.tt = 2.6;
      }
    },
    draw(t, ctx, sc, layer) {
      if (layer !== 'back') return;
      const B = sc.bounds;
      const nz = out(t.m, 18);
      if (t.phase === 'spray') {
        const g = ctx.createLinearGradient(0, nz.y, 0, B.bottom);
        g.addColorStop(0, 'rgba(170,225,255,0.35)');
        g.addColorStop(1, 'rgba(170,225,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(nz.x - 10, nz.y);
        ctx.lineTo(nz.x + 10, nz.y);
        ctx.lineTo(nz.x + 22 + (B.bottom - nz.y) * 0.3, B.bottom);
        ctx.lineTo(nz.x - 22 - (B.bottom - nz.y) * 0.3, B.bottom);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = '#5f6765';
      ctx.fillRect(nz.x - 5, 0, 10, 12);
      ctx.beginPath();
      ctx.moveTo(nz.x - 16, nz.y - 6);
      ctx.lineTo(nz.x + 16, nz.y - 6);
      ctx.lineTo(nz.x + 9, nz.y + 4);
      ctx.lineTo(nz.x - 9, nz.y + 4);
      ctx.closePath();
      ctx.fillStyle = '#d7e3e8';
      ctx.fill();
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = t.phase === 'spray' ? C.ice : '#4a6d80';
      ctx.beginPath();
      ctx.arc(nz.x, nz.y - 1, 3, 0, Math.PI * 2);
      ctx.fill();
    },
    icon(ctx) {
      ctx.beginPath();
      ctx.moveTo(-26, -30);
      ctx.lineTo(26, -30);
      ctx.lineTo(14, -14);
      ctx.lineTo(-14, -14);
      ctx.closePath();
      ctx.fillStyle = '#d7e3e8';
      ctx.fill();
      ctx.fillStyle = C.ice;
      for (const [x, y] of [[-16, 4], [0, 14], [16, 4], [-8, 28], [10, 32]]) {
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  },

  turret: {
    name: 'Nail Turret',
    desc: 'Tracks the nearest dummy and nails it to the wall.',
    rarity: 'rare',
    surfaces: ['wall', 'ceiling'],
    perks: [
      { name: 'Fast Loader', desc: 'Fires 40% faster.' },
      { name: 'Double Barrel', desc: 'Fires two nails at once.' },
    ],
    init(t) {
      t.aim = null;
      t.cd = 1;
    },
    update(t, sc, dt) {
      const m = t.m;
      const base = Math.atan2(m.ny, m.nx);
      if (t.aim === null) t.aim = base;
      const pivot = out(m, 26);
      const target = nearestDummy(sc, pivot.x, pivot.y);
      t.cd -= dt;
      if (!target) return;
      const want = Math.atan2(target.n.y - pivot.y, target.n.x - pivot.x);
      let diff = Math.atan2(Math.sin(want - t.aim), Math.cos(want - t.aim));
      t.aim += Math.max(-3 * dt, Math.min(3 * dt, diff));
      // Stay within 80 degrees of facing straight out from the mount.
      const rel = Math.atan2(Math.sin(t.aim - base), Math.cos(t.aim - base));
      t.aim = base + Math.max(-1.4, Math.min(1.4, rel));
      diff = Math.atan2(Math.sin(want - t.aim), Math.cos(want - t.aim));
      if (t.cd > 0 || Math.abs(diff) > 0.2) return;
      t.cd = t.level >= 2 ? 1 : 1.4;
      const shots = t.level >= 3 ? [-0.06, 0.06] : [0];
      for (const da of shots) {
        const a = t.aim + da;
        const ux = Math.cos(a), uy = Math.sin(a);
        const mx = pivot.x + ux * 30, my = pivot.y + uy * 30;
        let best = null;
        for (const d of sc.dummies) {
          const h = d.hitSwipe(mx, my, mx + ux * 2000, my + uy * 2000, 0);
          if (h && (!best || h.s < best.s)) best = h;
        }
        const end = best ?? sc.rayExit(mx, my, ux, uy);
        sc.particles.spawn({ kind: 'beam', x: mx, y: my, x2: end.x, y2: end.y, size: 1.5, color: C.paperDim, life: 0.07 });
        if (!best) continue;
        const seg = best.seg;
        const point = seg.a === seg.b || best.t < 0.5 ? seg.a : seg.b;
        sc.dealDamage(best.dummy, seg, 5, 'trap:turret', { x: best.x, y: best.y });
        sc.addNail(best.dummy, point, 6);
      }
      sc.sfx.nail();
    },
    draw(t, ctx, sc, layer) {
      if (layer !== 'back') return;
      const m = t.m;
      const pivot = out(m, 26);
      ctx.save();
      mountFrame(ctx, m);
      bracket(ctx, 40);
      ctx.fillStyle = '#5f6765';
      ctx.fillRect(10, -6, 16, 12);
      ctx.restore();
      ctx.save();
      ctx.translate(pivot.x, pivot.y);
      ctx.rotate(t.aim ?? Math.atan2(m.ny, m.nx));
      roundRectPath(ctx, -12, -11, 30, 22, 6);
      ctx.fillStyle = '#e7b931';
      ctx.fill();
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fillStyle = C.iron;
      ctx.fillRect(16, -4, 16, 8);
      ctx.strokeRect(16, -4, 16, 8);
      ctx.restore();
    },
    icon(ctx) {
      roundRectPath(ctx, -30, -20, 46, 40, 8);
      ctx.fillStyle = '#e7b931';
      ctx.fill();
      ctx.fillStyle = C.iron;
      ctx.fillRect(14, -8, 30, 16);
      ctx.fillStyle = C.paperDim;
      ctx.fillRect(-44, -26, 10, 52);
    },
  },

  crusher: {
    name: 'Crusher',
    desc: 'Slams down on anything that passes beneath it. Blunt: shatters ice.',
    rarity: 'epic',
    surfaces: ['ceiling'],
    perks: [
      { name: 'Hydraulics', desc: 'Hits 50% harder and resets faster.' },
      { name: 'Shockwave', desc: 'Each slam knocks back everything nearby.' },
    ],
    init(t) {
      t.ext = 0;
      t.phase = 'idle';
      t.tt = 0.5;
      t.hit = new Set();
    },
    update(t, sc, dt) {
      const m = t.m;
      const B = sc.bounds;
      const reach = B.bottom - 34 - 30;
      const head = () => 30 + t.ext;
      t.tt -= dt;
      if (t.phase === 'idle') {
        if (t.tt > 0) return;
        const below = sc.dummies.some((d) => d.alive && !d.entering && d.segs.some((s) => Math.abs(d.segCenter(s).x - m.x) < 50 && d.segCenter(s).y > 70));
        if (below) {
          t.phase = 'slam';
          t.hit.clear();
          sc.sfx.whoosh();
        }
        return;
      }
      if (t.phase === 'slam') {
        t.ext = Math.min(reach, t.ext + 2600 * dt);
        const hb = head() + 34;
        for (const d of sc.dummies) {
          if (!d.alive) continue;
          for (const p of d.pointList) {
            if (p.pinned || Math.abs(p.x - m.x) > 58 || p.y - p.r > hb || p.y < hb - 60) continue;
            p.y = Math.min(B.bottom - p.r, hb + p.r);
            p.py = p.y - 26;
            if (!t.hit.has(d)) {
              t.hit.add(d);
              sc.dealDamage(d, d.segForPoint(p), t.level >= 2 ? 45 : 30, 'trap:crusher', { x: p.x, y: hb });
            }
          }
        }
        if (t.ext >= reach) {
          t.phase = 'hold';
          t.tt = 0.25;
          sc.sfx.clang();
          sc.sfx.thud(1);
          sc.shake(0.35);
          sc.fxDust(m.x, B.bottom, 12);
          if (t.level >= 3) {
            for (const p of sc.world.points) {
              const dx = p.x - m.x;
              if (p.pinned || Math.abs(dx) > 240 || Math.abs(dx) < 50 || p.y < B.bottom - 140) continue;
              p.addVelocity(Math.sign(dx) * 1100, -600, sc.dt);
            }
          }
        }
      } else if (t.phase === 'hold' && t.tt <= 0) {
        t.phase = 'retract';
      } else if (t.phase === 'retract') {
        t.ext = Math.max(0, t.ext - 520 * dt);
        if (t.ext <= 0) {
          t.phase = 'idle';
          t.tt = t.level >= 2 ? 1.4 : 2.2;
        }
      }
    },
    draw(t, ctx, sc, layer) {
      if (layer !== 'front') return;
      const x = t.m.x;
      const hy = 30 + t.ext;
      ctx.fillStyle = '#8d9592';
      ctx.fillRect(x - 8, 0, 16, hy);
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 8, 0, 16, hy);
      ctx.fillStyle = '#4b5250';
      ctx.fillRect(x - 30, 0, 60, 18);
      roundRectPath(ctx, x - 56, hy, 112, 34, 4);
      ctx.fillStyle = '#5f6765';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.save();
      roundRectPath(ctx, x - 56, hy + 24, 112, 10, 3);
      ctx.clip();
      ctx.fillStyle = '#f2c230';
      ctx.fillRect(x - 56, hy + 24, 112, 10);
      ctx.fillStyle = C.ink;
      for (let k = x - 70; k < x + 60; k += 14) {
        ctx.beginPath();
        ctx.moveTo(k, hy + 24);
        ctx.lineTo(k + 7, hy + 24);
        ctx.lineTo(k + 17, hy + 34);
        ctx.lineTo(k + 10, hy + 34);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    },
    icon(ctx) {
      ctx.fillStyle = '#8d9592';
      ctx.fillRect(-7, -44, 14, 40);
      ctx.fillStyle = '#5f6765';
      ctx.fillRect(-40, -6, 80, 30);
      ctx.fillStyle = '#f2c230';
      ctx.fillRect(-40, 18, 80, 8);
    },
  },
};

export function drawTrapIcon(ctx, id, x, y, size, { alpha = 1 } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.scale(size / 100, size / 100);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  TRAPS[id].icon(ctx);
  ctx.restore();
}

export function nextTrapUpgrade(id, level) {
  if (level >= MAX_TRAP_LEVEL) return null;
  if (level + 1 <= 3) return TRAPS[id].perks[level - 1];
  return { name: 'Reinforced', desc: `${TRAPS[id].name} damage +30%.` };
}

// A live trap instance; its mount position is refreshed from the bounds so
// resizing never strands it.
export function createTrap(id, mountId, level) {
  const t = { id, mountId, level, m: null };
  TRAPS[id].init(t);
  return t;
}
