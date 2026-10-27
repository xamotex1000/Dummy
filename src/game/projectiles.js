// Thrown, dropped and fired things: grenades, anvils, rockets and vortexes.
// Each is a physics point in the world with a little state machine on top.

import { Point } from '../engine/physics.js';
import { clamp } from '../engine/math.js';
import { drawWeaponIcon } from './icons.js';
import { C } from './theme.js';

function add(sc, p, pr) {
  p.proj = pr;
  sc.world.addPoint(p);
  sc.projectiles.push(pr);
  return pr;
}

export function spawnGrenade(sc, x, y, { cluster = false, radius = 1, fuse = 1.3, mini = false } = {}) {
  const p = new Point(x, y, { r: mini ? 6 : 9, mass: 0.6, bounce: 0.45, friction: 0.7, group: 'proj' });
  p.setVelocity(sc.rng.range(-60, 60), -200, sc.dt);
  return add(sc, p, { kind: 'grenade', p, fuse, cluster, mini, R: 120 * radius * (mini ? 0.55 : 1), dmg: mini ? 16 : 40, radius });
}

export function spawnAnvil(sc, x) {
  x = clamp(x, 30, sc.bounds.right - 30);
  const p = new Point(x, 30, { r: 24, mass: 12, bounce: 0.08, friction: 0.4, gravityScale: 1.7, group: 'proj' });
  p.setVelocity(0, 400, sc.dt);
  sc.sfx.whoosh();
  return add(sc, p, { kind: 'anvil', p, life: 3.2, hits: {} });
}

export function spawnRocket(sc, m, held, { napalm = false } = {}) {
  const p = new Point(m.x + m.ux * 6, m.y + m.uy * 6, { r: 7, mass: 0.8, bounce: 0, friction: 1, gravityScale: 0.12, group: 'proj' });
  p.setVelocity(m.ux * 980 + held.vx * 0.3, m.uy * 980 + held.vy * 0.3, sc.dt);
  sc.sfx.rocket();
  return add(sc, p, { kind: 'rocket', p, life: 3, napalm });
}

export function spawnVortex(sc, x, y, { R = 250, power = 1 } = {}) {
  const p = new Point(x, y, { r: 9, mass: 1, bounce: 0.3, friction: 0.6, group: 'proj' });
  p.setVelocity(0, -150, sc.dt);
  sc.sfx.tick();
  return add(sc, p, { kind: 'vortex', p, arm: 0.6, active: 0, dur: 2.4, R, power, acc: 0 });
}

// ----------------------------------------------------------------- update

export function updateProjectiles(sc, dt) {
  for (const pr of sc.projectiles.slice()) {
    if (pr.p.dead) continue;
    if (pr.kind === 'grenade') updateGrenade(sc, pr, dt);
    else if (pr.kind === 'anvil') {
      pr.life -= dt;
      if (pr.life <= 0) pr.p.dead = true;
    } else if (pr.kind === 'rocket') updateRocket(sc, pr, dt);
    else if (pr.kind === 'vortex') updateVortex(sc, pr, dt);
  }
  sc.projectiles = sc.projectiles.filter((pr) => !pr.p.dead);
}

function updateGrenade(sc, pr, dt) {
  pr.fuse -= dt;
  if (pr.fuse > 0) return;
  pr.p.dead = true;
  sc.explode(pr.p.x, pr.p.y, pr.R, pr.dmg, 'grenade', { size: pr.mini ? 0.5 : 1 });
  if (pr.cluster && !pr.mini) {
    for (let i = 0; i < 3; i++) {
      const g = spawnGrenade(sc, pr.p.x, pr.p.y - 6, { mini: true, fuse: 0.45 + i * 0.12, radius: pr.radius });
      g.p.setVelocity(sc.rng.range(-420, 420), sc.rng.range(-700, -400), dt);
    }
  }
}

function updateRocket(sc, pr, dt) {
  const p = pr.p;
  pr.life -= dt;
  // Swept check so a fast rocket can't skip through a thin limb.
  for (const d of sc.dummies) {
    if (d.alive && d.hitSwipe(p.px, p.py, p.x, p.y, p.r)) {
      detonateRocket(sc, pr);
      return;
    }
  }
  if (pr.life <= 0) detonateRocket(sc, pr);
  sc.particles.spawn({ kind: 'smoke', x: p.x, y: p.y, vx: sc.rng.range(-20, 20), vy: sc.rng.range(-20, 20), size: 4, grow: 22, color: '#8b8f88', life: 0.5, drag: 2 });
  sc.particles.spawn({ kind: 'fire', x: p.x, y: p.y, vx: -(p.x - p.px) / dt * 0.2, vy: -(p.y - p.py) / dt * 0.2, size: 6, color: C.fire, color2: C.fire2, life: 0.15 });
}

function detonateRocket(sc, pr) {
  if (pr.p.dead) return;
  pr.p.dead = true;
  const { x, y } = pr.p;
  sc.explode(x, y, 115, 42, 'rocket', { size: 1.1 });
  if (pr.napalm) {
    for (const d of sc.dummies) {
      if (!d.alive) continue;
      for (const seg of d.segs) {
        const c = d.segCenter(seg);
        if (Math.hypot(c.x - x, c.y - y) < 130) sc.addBurn(d, seg, 9, 3, 'rocket');
      }
    }
  }
}

function updateVortex(sc, v, dt) {
  const p = v.p;
  if (v.arm > 0) {
    v.arm -= dt;
    if (v.arm <= 0) {
      p.pinned = true;
      sc.sfx.vortex();
    }
    return;
  }
  v.active += dt;
  v.acc += dt;
  const R = v.R;
  for (const q of sc.world.points) {
    if (q === p || q.pinned) continue;
    const dx = p.x - q.x, dy = p.y - q.y;
    const d = Math.hypot(dx, dy);
    if (d > R || d < 1) continue;
    const pull = (2600 * (1 - d / R) + 300) * (q.proj?.kind === 'anvil' ? 0.2 : 1);
    const nx = dx / d, ny = dy / d;
    // Inward pull plus a swirl.
    q.addVelocity((nx * pull - ny * pull * 0.7) * dt, (ny * pull + nx * pull * 0.7) * dt, dt);
  }
  if (v.acc >= 0.25) {
    v.acc -= 0.25;
    for (const d of sc.dummies) {
      if (!d.alive) continue;
      const n = d.nearest(p.x, p.y);
      if (n.d < 60) sc.dealDamage(d, n.seg, 3 * v.power, 'vortex', { kind: 'grind', x: n.x, y: n.y });
    }
  }
  if (sc.rng.chance(0.7)) {
    const a = sc.rng.range(0, Math.PI * 2);
    const r = R * sc.rng.range(0.5, 0.95);
    sc.particles.spawn({ kind: 'dot', x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r, vx: -Math.cos(a) * r * 2.2 - Math.sin(a) * 200, vy: -Math.sin(a) * r * 2.2 + Math.cos(a) * 200, size: 2.5, color: C.vortex, life: 0.4 });
  }
  if (v.active >= v.dur) collapseVortex(sc, v, false);
}

// The vortex ends with an implosion; a Singularity makes it far bigger.
export function collapseVortex(sc, v, singular, weapon = 'vortex') {
  if (v.p.dead) return;
  v.p.dead = true;
  const { x, y } = v.p;
  if (singular) sc.status.announce('singularity', x, y, weapon);
  const mult = singular ? 2.5 * sc.status.reactionMult() : 1;
  sc.explode(x, y, singular ? 210 : 140, 26 * v.power * mult, 'vortex', { fromVortex: true, size: singular ? 1.6 : 0.8 });
}

export function activeVortexes(sc) {
  return sc.projectiles.filter((pr) => pr.kind === 'vortex' && pr.arm <= 0 && !pr.p.dead);
}

// --------------------------------------------------------------- physics

export function projectileImpact(sc, p, speed) {
  const pr = p.proj;
  if (pr.kind === 'anvil' && speed > 400) {
    sc.sfx.clang();
    sc.fxDust(p.x, p.y + p.r, 10);
    sc.shake(0.25);
  } else if (pr.kind === 'grenade' && speed > 200) {
    sc.sfx.tick();
  } else if (pr.kind === 'rocket') {
    detonateRocket(sc, pr);
  }
}

export function projectileContact(sc, projPoint, other, speed) {
  const pr = projPoint.proj;
  const d = other.owner;
  if (pr.kind === 'rocket') {
    detonateRocket(sc, pr);
    return;
  }
  if (pr.kind === 'grenade') {
    if (speed > 200) sc.sfx.tick();
    return;
  }
  if (pr.kind !== 'anvil' || speed < 300 || !d.alive) return;
  if ((pr.hits[d.id] ?? -1) > sc.time) return;
  pr.hits[d.id] = sc.time + 0.5;
  const dmg = (30 + speed * 0.012) * (sc.level('anvil') >= 3 ? 1.8 : 1);
  sc.dealDamage(d, d.segForPoint(other), dmg, 'anvil', { x: other.x, y: other.y });
  other.addVelocity(0, Math.min(1500, speed * 0.6), sc.dt);
  sc.fxFoam(other.x, other.y, 10, 1.2);
  sc.sfx.clang();
  sc.sfx.punch();
  sc.shake(0.35);
}

// ----------------------------------------------------------------- render

export function drawProjectile(sc, ctx, pr) {
  const p = pr.p;
  if (pr.kind === 'grenade') {
    const size = pr.mini ? 18 : 26;
    drawWeaponIcon(ctx, 'grenade', p.x, p.y, size, { angle: (p.x - p.px) * 0.05 });
    const blink = pr.fuse < 0.5 ? Math.floor(pr.fuse * 20) % 2 : Math.floor(pr.fuse * 6) % 2;
    if (blink) {
      ctx.fillStyle = C.bad;
      ctx.beginPath();
      ctx.arc(p.x, p.y - size * 0.35, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (pr.kind === 'anvil') {
    ctx.globalAlpha = clamp(pr.life / 0.4, 0, 1);
    drawWeaponIcon(ctx, 'anvil', p.x, p.y, p.r * 2.4);
    ctx.globalAlpha = 1;
  } else if (pr.kind === 'rocket') {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(Math.atan2(p.y - p.py, p.x - p.px));
    ctx.fillStyle = C.paperDim;
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(4, -5);
    ctx.lineTo(-10, -5);
    ctx.lineTo(-10, 5);
    ctx.lineTo(4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = C.bad;
    ctx.fillRect(-12, -7, 5, 14);
    ctx.restore();
  } else if (pr.kind === 'vortex') {
    const active = pr.arm <= 0;
    if (active) {
      const t = sc.time;
      const fade = clamp((pr.dur - pr.active) / 0.3, 0, 1) * clamp(pr.active / 0.2, 0, 1);
      const g = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, pr.R * 0.5);
      g.addColorStop(0, `rgba(30,10,50,${0.85 * fade})`);
      g.addColorStop(1, 'rgba(60,20,90,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, pr.R * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = C.vortex;
      ctx.lineWidth = 3;
      ctx.globalAlpha = fade;
      for (let i = 0; i < 3; i++) {
        const r = ((t * 120 + i * pr.R * 0.3) % (pr.R * 0.9)) ;
        const rr = pr.R * 0.9 - r;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(2, rr), t * 4 + i, t * 4 + i + 2.2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    drawWeaponIcon(ctx, 'vortex', p.x, p.y, 24, { angle: sc.time * (active ? 12 : 2) });
  }
}
